import express from 'express';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';
import multer from 'multer';

import cloudinary from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import createReviewsTable from '../tables/reviews.js';

const router = express.Router();

cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_CLOUD_KEY,
    api_secret: process.env.CLOUDINARY_CLOUD_SECRET,
});
const storage = new CloudinaryStorage({
    cloudinary: cloudinary.v2,
    params: {
        folder: 'reviews',
        allowedFormats: ['jpg', 'png', 'jpeg', 'webp'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }]
    }
});

const upload = multer({ storage });

const isValidUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
};

router.post('/product/:productId/review', upload.array('images'), async (req, res) => {
    const { productId } = req.params;
    if (!isValidUUID(productId)) {
        return res.status(400).json({ error: 'Invalid id format' });
    }
    const { userId, rating, comment } = req.body;
    const images = req.files;

    if (!userId) {
        return res.status(400).json({ message: 'User ID is missing' });
    }

    try {
        await createReviewsTable();
        const pool = await sql.connect(dbConnect);

        const checkOrderQuery = `
            SELECT o.Id FROM Orders o
            INNER JOIN OrderProducts op ON o.Id = op.OrderId
            WHERE o.UserId = @UserId AND op.ProductId = @ProductId AND o.Status = 'delivered';
        `;
        const checkOrderResult = await pool.request()
            .input('UserId', sql.UniqueIdentifier, userId)
            .input('ProductId', sql.UniqueIdentifier, productId)
            .query(checkOrderQuery);

        if (checkOrderResult.recordset.length === 0) {
            return res.status(403).json({ message: 'Only users who have received the product can review it.' });
        }

        const getShopIdQuery = `
            SELECT ShopId FROM Products WHERE Id = @ProductId;
        `;
        const shopResult = await pool.request()
            .input('ProductId', sql.UniqueIdentifier, productId)
            .query(getShopIdQuery);

        if (shopResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Product not found.' });
        }

        const shopId = shopResult.recordset[0].ShopId;

        const imageUrls = [];
        if (images) {
            for (const image of images) {
                const result = await cloudinary.uploader.upload(image.path);
                imageUrls.push(result.secure_url);
            }
        }

        const insertReviewQuery = `
            INSERT INTO Reviews (ProductId, UserId, ShopId, Rating, Comment, Images)
            VALUES (@ProductId, @UserId, @ShopId, @Rating, @Comment, @Images);
        `;
        await pool.request()
            .input('ProductId', sql.UniqueIdentifier, productId)
            .input('UserId', sql.UniqueIdentifier, userId)
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .input('Rating', sql.Float, rating)
            .input('Comment', sql.NVarChar(sql.MAX), comment)
            .input('Images', sql.NVarChar(sql.MAX), JSON.stringify(imageUrls))
            .query(insertReviewQuery);

        res.status(201).json({ message: 'Review submitted successfully' });
    } catch (error) {
        console.error('Error submitting review:', error);
        res.status(500).json({ message: 'Error submitting review' });
    }
});

router.get('/product/:productId/review/user', async (req, res) => {
    const { productId } = req.params;
    const { userId } = req.query;

    if (!isValidUUID(productId)) {
        return res.status(400).json({ error: 'Invalid product ID format' });
    }

    if (!isValidUUID(userId)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const fetchReviewQuery = `
            SELECT 
                r.Id, 
                r.ProductId, 
                r.UserId, 
                r.ShopId, 
                r.Rating, 
                r.Comment, 
                r.Images, 
                r.CreatedAt, 
                p.Name AS ProductName
            FROM Reviews r
            INNER JOIN Products p ON r.ProductId = p.Id
            WHERE r.ProductId = @ProductId AND r.UserId = @UserId;
        `;

        const reviewResult = await pool.request()
            .input('ProductId', sql.UniqueIdentifier, productId)
            .input('UserId', sql.UniqueIdentifier, userId)
            .query(fetchReviewQuery);

        if (reviewResult.recordset.length === 0) {
            return res.status(404).json({ message: 'No review found for this user and product.' });
        }

        const userReview = reviewResult.recordset[0];
        userReview.Images = JSON.parse(userReview.Images);

        res.status(200).json(userReview);
    } catch (error) {
        console.error('Error fetching user review:', error);
        res.status(500).json({ message: 'Error fetching user review' });
    }
});

router.get('/product/:productId/reviews', async (req, res) => {
    const { productId } = req.params;
    const { userId } = req.query;

    if (!isValidUUID(productId)) {
        return res.status(400).json({ error: 'Invalid id format' });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const getReviewsQuery = `
            SELECT Id, UserId, Rating, Comment, VendorReply, Images, CreatedAt, ShopId
            FROM Reviews
            WHERE ProductId = @ProductId
            ORDER BY CreatedAt DESC;
        `;

        const reviewsResult = await pool.request()
            .input('ProductId', sql.UniqueIdentifier, productId)
            .query(getReviewsQuery);

        const reviews = await Promise.all(
            reviewsResult.recordset.map(async (review) => {
                const countReactionsQuery = `
                    SELECT COUNT(*) as totalLikes FROM ReviewReactions WHERE ReviewId = @ReviewId AND ReactionType = 'like';
                `;
                const countReactionsResult = await pool.request()
                    .input('ReviewId', sql.UniqueIdentifier, review.Id)
                    .query(countReactionsQuery);
                const totalLikes = countReactionsResult.recordset[0].totalLikes;

                let userReacted = false;
                if (userId) {
                    const userReactionQuery = `
                        SELECT Id FROM ReviewReactions WHERE ReviewId = @ReviewId AND UserId = @UserId;
                    `;
                    const userReactionResult = await pool.request()
                        .input('ReviewId', sql.UniqueIdentifier, review.Id)
                        .input('UserId', sql.UniqueIdentifier, userId)
                        .query(userReactionQuery);
                    userReacted = userReactionResult.recordset.length > 0;
                }

                return {
                    Id: review.Id,
                    userId: review.UserId,
                    rating: review.Rating,
                    comment: review.Comment,
                    vendorReply: review.VendorReply,
                    images: JSON.parse(review.Images),
                    createdAt: review.CreatedAt,
                    totalLikes,
                    userReacted,
                };
            })
        );

        res.status(200).json(reviews);
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ message: 'Error fetching reviews' });
    }
});

router.get('/shop/:shopId/reviews', async (req, res) => {
    const { shopId } = req.params;
    const { userId } = req.query;

    if (!isValidUUID(shopId)) {
        return res.status(400).json({ error: 'Invalid ShopId format' });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const getReviewsQuery = `
            SELECT 
                r.Id AS ReviewId,
                r.UserId,
                r.Rating,
                r.Comment,
                r.VendorReply,
                r.Images AS ReviewImages,
                r.CreatedAt AS ReviewCreatedAt,
                p.ProductId,
                p.Name AS ProductName,
                p.Images AS ProductImages
            FROM Reviews r
            INNER JOIN Products p ON r.ProductId = p.ProductId
            WHERE r.ShopId = @ShopId
            ORDER BY r.CreatedAt DESC;
        `;

        const reviewsResult = await pool.request()
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .query(getReviewsQuery);

        const reviews = await Promise.all(
            reviewsResult.recordset.map(async (review) => {
                const countReactionsQuery = `
                    SELECT COUNT(*) AS TotalLikes 
                    FROM ReviewReactions 
                    WHERE ReviewId = @ReviewId AND ReactionType = 'like';
                `;
                const countReactionsResult = await pool.request()
                    .input('ReviewId', sql.UniqueIdentifier, review.ReviewId)
                    .query(countReactionsQuery);
                const totalLikes = countReactionsResult.recordset[0].TotalLikes;

                let userReacted = false;
                if (userId) {
                    const userReactionQuery = `
                        SELECT Id 
                        FROM ReviewReactions 
                        WHERE ReviewId = @ReviewId AND UserId = @UserId;
                    `;
                    const userReactionResult = await pool.request()
                        .input('ReviewId', sql.UniqueIdentifier, review.ReviewId)
                        .input('UserId', sql.UniqueIdentifier, userId)
                        .query(userReactionQuery);
                    userReacted = userReactionResult.recordset.length > 0;
                }

                return {
                    reviewId: review.ReviewId,
                    userId: review.UserId,
                    rating: review.Rating,
                    comment: review.Comment,
                    vendorReply: review.VendorReply,
                    reviewImages: JSON.parse(review.ReviewImages || '[]'),
                    createdAt: review.ReviewCreatedAt,
                    product: {
                        id: review.ProductId,
                        name: review.ProductName,
                        images: JSON.parse(review.ProductImages || '[]'),
                    },
                    totalLikes,
                    userReacted,
                };
            })
        );

        res.status(200).json(reviews);
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ message: 'Error fetching reviews' });
    }
});

router.post('/review/:reviewId/react', async (req, res) => {
    const { reviewId } = req.params;
    const { userId, reactionType } = req.body;

    try {
        const pool = await sql.connect(dbConnect);

        const checkReactionQuery = `
            SELECT Id FROM ReviewReactions WHERE ReviewId = @ReviewId AND UserId = @UserId;
        `;
        const checkReactionResult = await pool.request()
            .input('ReviewId', sql.UniqueIdentifier, reviewId)
            .input('UserId', sql.UniqueIdentifier, userId)
            .query(checkReactionQuery);

        if (checkReactionResult.recordset.length > 0) {
            const deleteReactionQuery = `
                DELETE FROM ReviewReactions WHERE ReviewId = @ReviewId AND UserId = @UserId;
            `;
            await pool.request()
                .input('ReviewId', sql.UniqueIdentifier, reviewId)
                .input('UserId', sql.UniqueIdentifier, userId)
                .query(deleteReactionQuery);
        } else {
            const insertReactionQuery = `
                INSERT INTO ReviewReactions (ReviewId, UserId, ReactionType)
                VALUES (@ReviewId, @UserId, @ReactionType);
            `;
            await pool.request()
                .input('ReviewId', sql.UniqueIdentifier, reviewId)
                .input('UserId', sql.UniqueIdentifier, userId)
                .input('ReactionType', sql.NVarChar(10), reactionType)
                .query(insertReactionQuery);
        }

        // Count the total reactions
        const countReactionsQuery = `
            SELECT COUNT(*) as totalLikes FROM ReviewReactions WHERE ReviewId = @ReviewId AND ReactionType = @ReactionType;
        `;
        const countReactionsResult = await pool.request()
            .input('ReviewId', sql.UniqueIdentifier, reviewId)
            .input('ReactionType', sql.NVarChar(10), reactionType)
            .query(countReactionsQuery);

        const totalLikes = countReactionsResult.recordset[0].totalLikes;

        res.status(200).json({ message: `Review reaction updated`, totalLikes, userReacted: checkReactionResult.recordset.length === 0 });
    } catch (error) {
        console.error('Error reacting to review:', error);
        res.status(500).json({ message: 'Error reacting to review' });
    }
});

router.get('/review/:reviewId/reactions', async (req, res) => {
    const { reviewId } = req.params;
    const { userId } = req.query;

    try {
        const pool = await sql.connect(dbConnect);

        const countReactionsQuery = `
            SELECT COUNT(*) as totalLikes FROM ReviewReactions WHERE ReviewId = @ReviewId AND ReactionType = 'like';
        `;
        const countReactionsResult = await pool.request()
            .input('ReviewId', sql.UniqueIdentifier, reviewId)
            .query(countReactionsQuery);

        const totalLikes = countReactionsResult.recordset[0].totalLikes;

        const userReactionQuery = `
            SELECT Id FROM ReviewReactions WHERE ReviewId = @ReviewId AND UserId = @UserId;
        `;
        const userReactionResult = await pool.request()
            .input('ReviewId', sql.UniqueIdentifier, reviewId)
            .input('UserId', sql.UniqueIdentifier, userId)
            .query(userReactionQuery);

        const userReacted = userReactionResult.recordset.length > 0;

        res.status(200).json({ totalLikes, userReacted });
    } catch (error) {
        console.error('Error fetching reactions:', error);
        res.status(500).json({ message: 'Error fetching reactions' });
    }
});

router.post('/review/:reviewId/reply', async (req, res) => {
    const { reviewId } = req.params;
    const { vendorReply, shopId } = req.body;

    if (!shopId) {
        return res.status(401).json({ message: 'Shop ID is required' });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const verifyProductOwnershipQuery = `
            SELECT p.Id
            FROM Products p
            JOIN Reviews r ON p.Id = r.ProductId
            WHERE r.Id = @ReviewId AND p.ShopId = @ShopId;
        `;
        const verifyProductOwnershipResult = await pool.request()
            .input('ReviewId', sql.UniqueIdentifier, reviewId)
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .query(verifyProductOwnershipQuery);

        // if (verifyProductOwnershipResult.recordset.length === 0) {
        //     return res.status(403).json({ message: 'Only the vendor can reply to this review.' });
        // }

        const updateReplyQuery = `
            UPDATE Reviews SET VendorReply = @VendorReply WHERE Id = @ReviewId;
        `;
        await pool.request()
            .input('ReviewId', sql.UniqueIdentifier, reviewId)
            .input('VendorReply', sql.NVarChar(sql.MAX), vendorReply)
            .query(updateReplyQuery);

        res.status(200).json({ message: 'Reply added successfully' });
    } catch (error) {
        console.error('Error adding reply to review:', error);
        res.status(500).json({ message: 'Error adding reply' });
    }
});

router.put('/review/:reviewId/edit-reply', async (req, res) => {
    const { reviewId } = req.params;
    const { vendorReply, shopId } = req.body;

    if (!shopId) {
        return res.status(401).json({ message: 'Shop ID is required' });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const verifyProductOwnershipQuery = `
            SELECT p.Id
            FROM Products p
            JOIN Reviews r ON p.Id = r.ProductId
            WHERE r.Id = @ReviewId AND p.ShopId = @ShopId;
        `;
        const verifyProductOwnershipResult = await pool.request()
            .input('ReviewId', sql.UniqueIdentifier, reviewId)
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .query(verifyProductOwnershipQuery);

        // if (verifyProductOwnershipResult.recordset.length === 0) {
        //     return res.status(403).json({ message: 'Only the vendor can edit this reply.' });
        // }

        const updateReplyQuery = `
            UPDATE Reviews SET VendorReply = @VendorReply WHERE Id = @ReviewId;
        `;
        await pool.request()
            .input('ReviewId', sql.UniqueIdentifier, reviewId)
            .input('VendorReply', sql.NVarChar(sql.MAX), vendorReply)
            .query(updateReplyQuery);

        res.status(200).json({ message: 'Reply edited successfully' });
    } catch (error) {
        console.error('Error editing reply:', error);
        res.status(500).json({ message: 'Error editing reply' });
    }
});

router.get('/shop/:shopId/shopreviews', async (req, res) => {
    const { shopId } = req.params;
    if (!shopId || !isValidUUID(shopId)) {
        return res.status(400).json({ message: 'Invalid ShopId format' });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const query = `
            SELECT 
                r.Id AS ReviewId, 
                r.ProductId, 
                r.UserId, 
                r.ShopId, 
                r.Rating, 
                r.Comment, 
                r.Images, 
                r.CreatedAt,
                p.Name AS ProductName,
                u.Name AS UserName,
                u.Email AS UserEmail
            FROM Reviews r
            INNER JOIN Products p ON r.ProductId = p.Id
            INNER JOIN Users u ON r.UserId = u.Id
            WHERE r.ShopId = @ShopId
            ORDER BY r.CreatedAt DESC;
        `;

        const reviewsResult = await pool.request()
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .query(query);

        let reviews = reviewsResult.recordset;

        if (reviews.length === 0) {
            return res.status(404).json({ message: 'No reviews found for this ShopId' });
        }

        reviews = reviews.map((review) => ({
            ...review,
            Images: review.Images ? JSON.parse(review.Images) : [],
        }));

        res.status(200).json({ success: true, reviews });
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ message: 'Error fetching reviews' });
    }
});


export default router;

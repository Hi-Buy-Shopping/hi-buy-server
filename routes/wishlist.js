import express from 'express';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

const router = express.Router();

router.post('/add', async (req, res) => {
    const { userId, productId, color, size } = req.body;
    try {
        const pool = await sql.connect(dbConnect);
        const existingItem = await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('productId', sql.UniqueIdentifier, productId)
            .input('color', sql.NVarChar, color)
            .input('size', sql.NVarChar, size)
            .query(`
                SELECT * FROM Wishlist 
                WHERE UserId = @userId 
                AND ProductId = @productId 
                AND Color = @color 
                AND Size = @size
            `);

        if (existingItem.recordset.length > 0) {
            return res.status(400).json({ message: 'Item already in wishlist' });
        }

        await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('productId', sql.UniqueIdentifier, productId)
            .input('color', sql.NVarChar, color)
            .input('size', sql.NVarChar, size)
            .query(`
                INSERT INTO Wishlist (UserId, ProductId, Color, Size)
                VALUES (@userId, @productId, @color, @size)
            `);

        res.status(200).json({ message: 'Item added to wishlist successfully' });
    } catch (error) {
        console.error("Error while adding wishlist", error);
        res.status(500).json({ message: 'Server error' });
    }
});

// router.get('/:userId', async (req, res) => {
//     const { userId } = req.params;

//     try {
//         const pool = await sql.connect(dbConnect);

//         const result = await pool.request()
//             .input('userId', sql.UniqueIdentifier, userId)
//             .query(`
//                 SELECT 
//                     Wishlist.Id as WishlistId,
//                     Wishlist.Color,
//                     Wishlist.Size,
//                     Wishlist.CreatedAt,
//                     Products.Id as ProductId,
//                     Products.Name,
//                     Products.Description,
//                     Products.Images,
//                     Products.Brand,
//                     Products.Rating,
//                     ProductColorVariants.Price AS ColorPrice,
//                     ProductColorVariants.OldPrice AS ColorOldPrice,
//                     ProductVariants.Sizes AS VariantSizes
//                 FROM Wishlist
//                 INNER JOIN Products ON Wishlist.ProductId = Products.Id
//                 LEFT JOIN ProductColorVariants ON 
//                     ProductColorVariants.ProductId = Products.Id AND 
//                     ProductColorVariants.Color = Wishlist.Color
//                 LEFT JOIN ProductVariants ON 
//                     ProductVariants.ProductId = Products.Id AND 
//                     ProductVariants.VariantColor = Wishlist.Color
//                 WHERE Wishlist.UserId = @userId
//             `);

//         const wishlistItems = result.recordset.map(item => {
//             let price = item.ColorPrice || null;
//             let oldPrice = item.ColorOldPrice || null;

//             if (!price && !oldPrice && item.VariantSizes) {
//                 try {
//                     const sizes = JSON.parse(item.VariantSizes);
//                     const sizeMatch = sizes.find(size => size.size === item.Size);
//                     if (sizeMatch) {
//                         price = sizeMatch.price || null;
//                         oldPrice = sizeMatch.oldPrice || null;
//                     }
//                 } catch (error) {
//                     console.error('Error parsing VariantSizes:', error);
//                 }
//             }

//             return {
//                 WishlistId: item.WishlistId,
//                 ProductId: item.ProductId,
//                 Name: item.Name,
//                 Description: item.Description,
//                 Images: JSON.parse(item.Images),
//                 Brand: item.Brand,
//                 Color: item.Color,
//                 Rating: item.Rating,
//                 Size: item.Size,
//                 Price: price,
//                 OldPrice: oldPrice,
//                 CreatedAt: item.CreatedAt,
//             };
//         });

//         res.status(200).json(wishlistItems);
//     } catch (error) {
//         console.error("Error while fetching wishlist", error);
//         res.status(500).json({ message: 'Server error' });
//     }
// });
router.get('/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const pool = await sql.connect(dbConnect);

        const result = await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .query(`
                SELECT 
                    Wishlist.Id AS WishlistId,
                    Wishlist.Color,
                    Wishlist.Size,
                    Wishlist.CreatedAt,
                    Products.Id AS ProductId,
                    Products.Name,
                    Products.Description,
                    Products.Images,
                    Products.Brand,
                    ISNULL(r.AverageRating, 0) AS AverageRating,
                    ISNULL(r.RatingsCount, 0) AS RatingsCount,
                    ProductColorVariants.Price AS ColorPrice,
                    ProductColorVariants.OldPrice AS ColorOldPrice,
                    ProductVariants.Sizes AS VariantSizes
                FROM Wishlist
                INNER JOIN Products ON Wishlist.ProductId = Products.Id
                LEFT JOIN ProductColorVariants ON 
                    ProductColorVariants.ProductId = Products.Id AND 
                    ProductColorVariants.Color = Wishlist.Color
                LEFT JOIN ProductVariants ON 
                    ProductVariants.ProductId = Products.Id AND 
                    ProductVariants.VariantColor = Wishlist.Color
                LEFT JOIN (
                    SELECT 
                        ProductId, 
                        AVG(Rating) AS AverageRating, 
                        COUNT(Rating) AS RatingsCount
                    FROM Reviews
                    GROUP BY ProductId
                ) r ON r.ProductId = Products.Id
                WHERE Wishlist.UserId = @userId
            `);

        const wishlistItems = result.recordset.map(item => {
            let price = item.ColorPrice || null;
            let oldPrice = item.ColorOldPrice || null;

            if (!price && !oldPrice && item.VariantSizes) {
                try {
                    const sizes = JSON.parse(item.VariantSizes);
                    const sizeMatch = sizes.find(size => size.size === item.Size);
                    if (sizeMatch) {
                        price = sizeMatch.price || null;
                        oldPrice = sizeMatch.oldPrice || null;
                    }
                } catch (error) {
                    console.error('Error parsing VariantSizes:', error);
                }
            }

            return {
                WishlistId: item.WishlistId,
                ProductId: item.ProductId,
                Name: item.Name,
                Description: item.Description,
                Images: item.Images ? JSON.parse(item.Images) : [],
                Brand: item.Brand,
                Color: item.Color,
                Rating: item.AverageRating, 
                RatingsCount: item.RatingsCount, 
                Size: item.Size,
                Price: price,
                OldPrice: oldPrice,
                CreatedAt: item.CreatedAt,
            };
        });

        res.status(200).json(wishlistItems);
    } catch (error) {
        console.error("Error while fetching wishlist", error);
        res.status(500).json({ message: 'Server error' });
    }
});


router.post('/remove', async (req, res) => {
    const { userId, productId, color, size } = req.body;

    try {
        const pool = await sql.connect(dbConnect);

        let query = `
            DELETE FROM Wishlist 
            WHERE UserId = @userId 
            AND ProductId = @productId
        `;

        if (color) {
            query += ` AND Color = @color`;
        }

        if (size) {
            query += ` AND Size = @size`;
        }

        const request = pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('productId', sql.UniqueIdentifier, productId);

        if (color) {
            request.input('color', sql.NVarChar, color);
        }

        if (size) {
            request.input('size', sql.NVarChar, size);
        }

        await request.query(query);

        res.status(200).json({ message: 'Item removed from wishlist successfully' });
    } catch (error) {
        console.error("Error while removing wishlist item", error)
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
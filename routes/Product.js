import express from 'express';
import { sql, dbConnect } from '../database/dbConfig.js';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from 'cloudinary';
import createTables from '../tables/Product.js';
const router = express.Router();

cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_CLOUD_KEY,
    api_secret: process.env.CLOUDINARY_CLOUD_SECRET,
});

/**
 * Function to extract the public ID from a Cloudinary URL.
 * @param {string} url - The Cloudinary URL of the image/video.
 * @returns {string} - The public ID of the file.
 */
function extractPublicId(url) {
    const parts = url.split('/');
    const lastPart = parts[parts.length - 1];
    return lastPart.split('.')[0]; 
}

const isValidUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
};

const storage = new CloudinaryStorage({
    cloudinary: cloudinary.v2,
    params: {
        folder: 'products',
        allowedFormats: ['jpg', 'png', 'jpeg', 'webp', 'mp4'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }],
    },
});

const upload = multer({ storage });


function extractPublicIdFromUrl(url) {
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    const publicId = filename.split('.')[0];
    return publicId;
}

const isJsonString = (str) => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
};

router.post('/create', upload.fields([
    { name: 'images', maxCount: 10 },
    { name: 'video', maxCount: 1 },
    { name: 'variants[0][image]', maxCount: 1 },
    { name: 'variants[1][image]', maxCount: 1 },
    { name: 'variants[2][image]', maxCount: 1 },
    { name: 'variants[3][image]', maxCount: 1 },
    { name: 'variants[4][image]', maxCount: 1 },
    { name: 'colorVariants[0][image]', maxCount: 1 },
    { name: 'colorVariants[1][image]', maxCount: 1 },
    { name: 'colorVariants[2][image]', maxCount: 1 },
    { name: 'colorVariants[3][image]', maxCount: 1 },
    { name: 'colorVariants[4][image]', maxCount: 1 },
]), async (req, res) => {
    try {
        const {
            shopId, name, description, occasionName, brand, expense,
            categoryId, subCategoryId, season, dedicatedFor, stock,
            productRam, productRom, productSimSlots, productModel, sizes, colors, productDetails,
            variants, colorVariants, weight, catName, subCatName, subSubCategoryId, itemsCategoryId
        } = req.body;
        console.log(req.body)
        const Parsedbrand = Array.isArray(brand) ? brand[0] : brand;

        if (!Parsedbrand || typeof Parsedbrand !== 'string' || Parsedbrand.trim() === '') {
            throw new Error('Brand must be a valid string');
        }
        console.log('Parsed Brand:', Parsedbrand);


        const parsedProductDetails = Array.isArray(productDetails)
            ? productDetails
            : isJsonString(productDetails)
                ? JSON.parse(productDetails)
                : productDetails;

        console.log("Parsed Product Details:", parsedProductDetails);


        let imageUrls = [];
        let videoUrl = '';
        let variantIds = [];

        if (req.files['images']) {
            for (const file of req.files['images']) {
                const result = await cloudinary.v2.uploader.upload(file.path);
                imageUrls.push(result.secure_url);
            }
        }

        const imagesJsonString = JSON.stringify(imageUrls);

        if (req.files['video']) {
            const videoFile = req.files['video'][0];
            try {
                const result = await cloudinary.v2.uploader.upload(videoFile.path, {
                    resource_type: 'video'
                });
                videoUrl = result.secure_url;
            } catch (uploadError) {
                return res.status(500).send({ success: false, message: 'Failed to upload video to Cloudinary' });
            }
        }

        const productSizes = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
        const productColors = typeof colors === 'string' ? JSON.parse(colors) : colors;

        await createTables();
        const pool = await sql.connect(dbConnect);
        const productRequest = pool.request();

        productRequest.input('ShopId', sql.UniqueIdentifier, shopId);
        productRequest.input('Name', sql.NVarChar, name);
        productRequest.input('Description', sql.NVarChar, description);
        productRequest.input('Images', sql.NVarChar, imagesJsonString);
        productRequest.input('Video', sql.NVarChar, videoUrl);
        productRequest.input('OccasionName', sql.NVarChar, occasionName);
        productRequest.input('Brand', sql.NVarChar, Parsedbrand || 'No Brand');
        productRequest.input('Expense', sql.Decimal(10, 2), expense);
        productRequest.input('CatName', sql.NVarChar, catName);
        productRequest.input('SubCatName', sql.NVarChar, subCatName);
        productRequest.input('CategoryId', sql.UniqueIdentifier, categoryId);
        productRequest.input('SubCategoryId', sql.UniqueIdentifier, subCategoryId);
        productRequest.input('SubSubCategoryId', sql.UniqueIdentifier, subSubCategoryId);
        productRequest.input('ItemsCategoryId', sql.UniqueIdentifier, itemsCategoryId);
        productRequest.input('Season', sql.NVarChar, season);
        productRequest.input('DedicatedFor', sql.NVarChar, dedicatedFor);
        productRequest.input('Stock', sql.Int, stock);
        productRequest.input('ProductRam', sql.NVarChar, JSON.stringify(productRam));
        productRequest.input('ProductRom', sql.NVarChar, JSON.stringify(productRom));
        productRequest.input('ProductSimSlots', sql.NVarChar, JSON.stringify(productSimSlots));
        productRequest.input('ProductModel', sql.NVarChar, productModel);
        productRequest.input('Size', sql.NVarChar, JSON.stringify(productSizes));
        productRequest.input('Color', sql.NVarChar, JSON.stringify(productColors));
        productRequest.input('Detail', sql.NVarChar, JSON.stringify(parsedProductDetails)); // Store as JSON string
        productRequest.input('Weight', sql.Decimal(4, 2), weight);

        const productResult = await productRequest.query(`
            INSERT INTO Products 
            (ShopId, Name, Description, Images, Video, OccasionName, Brand, CategoryId, 
            SubCategoryId, Season, DedicatedFor, Stock, ProductRam, ProductRom, ProductSimSlots, ProductModel, 
            Size, Color, Detail, Weight, CatName, SubCatName, SubSubCategoryId, ItemsCategoryId) 
            OUTPUT INSERTED.Id
            VALUES 
            (@ShopId, @Name, @Description, @Images, @Video, @OccasionName, @Brand,
            @CategoryId, @SubCategoryId, @Season, @DedicatedFor, @Stock,  @ProductRam, @ProductRom, @ProductSimSlots, 
            @ProductModel, @Size, @Color, @Detail, @Weight, @CatName, @SubCatName, @SubSubCategoryId, @ItemsCategoryId);
        `);

        const productId = productResult.recordset[0].Id;

        if (Array.isArray(variants)) {
            for (const [index, variant] of variants.entries()) {
                let variantImageUrl = '';
                if (req.files[`variants[${index}][image]`]) {
                    const variantImage = req.files[`variants[${index}][image]`][0];
                    const result = await cloudinary.v2.uploader.upload(variantImage.path);
                    variantImageUrl = result.secure_url;
                }

                const sizes = typeof variant.sizes === 'string'
                    ? JSON.parse(variant.sizes)
                    : variant.sizes;

                if (!Array.isArray(sizes)) {
                    return res.status(400).json({ success: false, message: 'Sizes must be an array.' });
                }

                const variantRequest = pool.request();
                variantRequest.input('ProductId', sql.UniqueIdentifier, productId);
                variantRequest.input('VariantColor', sql.NVarChar, variant.color);
                variantRequest.input('VariantImage', sql.NVarChar, variantImageUrl);
                variantRequest.input('Sizes', sql.NVarChar, JSON.stringify(sizes));
                variantRequest.input('Expense', sql.Decimal(10, 2), variant.expense);

                await variantRequest.query(`
                    INSERT INTO ProductVariants (ProductId, VariantColor, VariantImage, Sizes, Expense)
                    VALUES (@ProductId, @VariantColor, @VariantImage, @Sizes, @Expense);
                `);
            }
        }

        if (Array.isArray(colorVariants)) {
            for (const [index, colorVariant] of colorVariants.entries()) {
                let colorVariantImageUrl = '';

                if (req.files[`colorVariants[${index}][image]`]) {
                    const colorVariantImage = req.files[`colorVariants[${index}][image]`][0];
                    const result = await cloudinary.v2.uploader.upload(colorVariantImage.path);
                    colorVariantImageUrl = result.secure_url;
                }

                const colorVariantRequest = pool.request();
                colorVariantRequest.input('ProductId', sql.UniqueIdentifier, productId);
                colorVariantRequest.input('Color', sql.NVarChar, colorVariant.color);
                colorVariantRequest.input('Image', sql.NVarChar, colorVariantImageUrl);
                colorVariantRequest.input('Price', sql.Decimal(10, 2), colorVariant.price);
                colorVariantRequest.input('OldPrice', sql.Decimal(10, 2), colorVariant.oldprice);
                colorVariantRequest.input('Discount', sql.Decimal(10, 2), colorVariant.discount);
                colorVariantRequest.input('Expense', sql.Decimal(10, 2), colorVariant.expense);
                colorVariantRequest.input('Stock', sql.Decimal(10, 2), colorVariant.expense);

                await colorVariantRequest.query(`
                    INSERT INTO ProductColorVariants (ProductId, Color, Image, Price, OldPrice, Discount, Expense, Stock)
                    VALUES (@ProductId, @Color, @Image, @Price, @OldPrice, @Discount, @Expense, @Stock);
                `);
            }
        }

        res.status(201).send({ success: true, message: 'Product and variants created successfully' });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).send({ success: false, message: 'Server error' });
    }
});

router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 10;
        const skip = (page - 1) * perPage;

        const status = req.query.status || '';
        const brand = req.query.brand ? req.query.brand.split(',') : [];
        const color = req.query.color ? req.query.color.split(',') : [];
        const minPrice = req.query.minPrice || null;
        const maxPrice = req.query.maxPrice || null;
        const rating = req.query.rating || null;
        const categoryId = req.query.categoryId && isValidUUID(req.query.categoryId) ? req.query.categoryId : null;
        const subCategoryId =
            req.query.subCategoryId && isValidUUID(req.query.subCategoryId) ? req.query.subCategoryId : null;
        const subSubCategoryId =
            req.query.subSubCategoryId && isValidUUID(req.query.subSubCategoryId) ? req.query.subSubCategoryId : null;
        const itemsCategoryId =
            req.query.itemsCategoryId && isValidUUID(req.query.itemsCategoryId) ? req.query.itemsCategoryId : null;
        const shopId = req.query.shopId && isValidUUID(req.query.shopId) ? req.query.shopId : null;

        const pool = await sql.connect(dbConnect);

        let queryConditions = '';
        const queryParams = [];
        let hasWhereClause = false;

        if (status) {
            queryConditions += 'WHERE status = @status ';
            queryParams.push({ key: 'status', value: status });
            hasWhereClause = true;
        }

        if (brand.length > 0) {
            queryConditions += hasWhereClause ? 'AND ' : 'WHERE ';
            queryConditions += `Brand IN (${brand.map((_, idx) => `@brand${idx}`).join(',')}) `;
            brand.forEach((b, idx) => queryParams.push({ key: `brand${idx}`, value: b }));
            hasWhereClause = true;
        }

        if (color.length > 0) {
            queryConditions += hasWhereClause ? 'AND ' : 'WHERE ';
            queryConditions += `Color IN (${color.map((_, idx) => `@color${idx}`).join(',')}) `;
            color.forEach((c, idx) => queryParams.push({ key: `color${idx}`, value: c }));
            hasWhereClause = true;
        }

        if (minPrice || maxPrice) {
            queryConditions += hasWhereClause ? 'AND ' : 'WHERE ';
            if (minPrice) {
                queryConditions += `Price >= @minPrice `;
                queryParams.push({ key: 'minPrice', value: minPrice });
            }
            if (maxPrice) {
                queryConditions += `${minPrice ? 'AND ' : ''}Price <= @maxPrice `;
                queryParams.push({ key: 'maxPrice', value: maxPrice });
            }
            hasWhereClause = true;
        }

        if (rating) {
            queryConditions += hasWhereClause ? 'AND ' : 'WHERE ';
            queryConditions += `Rating >= @rating `;
            queryParams.push({ key: 'rating', value: rating });
            hasWhereClause = true;
        }

        if (categoryId) {
            queryConditions += hasWhereClause ? 'AND ' : 'WHERE ';
            queryConditions += `CategoryId = @categoryId `;
            queryParams.push({ key: 'categoryId', value: categoryId });
            hasWhereClause = true;
        }

        if (subCategoryId) {
            queryConditions += hasWhereClause ? 'AND ' : 'WHERE ';
            queryConditions += `SubCategoryId = @subCategoryId `;
            queryParams.push({ key: 'subCategoryId', value: subCategoryId });
            hasWhereClause = true;
        }

        if (subSubCategoryId) {
            queryConditions += hasWhereClause ? 'AND ' : 'WHERE ';
            queryConditions += `SubSubCategoryId = @subSubCategoryId `;
            queryParams.push({ key: 'subSubCategoryId', value: subSubCategoryId });
            hasWhereClause = true;
        }

        if (itemsCategoryId) {
            queryConditions += hasWhereClause ? 'AND ' : 'WHERE ';
            queryConditions += `ItemsCategoryId = @itemsCategoryId `;
            queryParams.push({ key: 'itemsCategoryId', value: itemsCategoryId });
            hasWhereClause = true;
        }

        if (shopId) {
            queryConditions += hasWhereClause ? 'AND ' : 'WHERE ';
            queryConditions += `ShopId = @shopId `;
            queryParams.push({ key: 'shopId', value: shopId });
            hasWhereClause = true;
        }

        const totalProductsQuery = `
            SELECT COUNT(*) AS total 
            FROM Products 
            ${queryConditions}
        `;
        const totalProductsRequest = pool.request();
        queryParams.forEach((param) => totalProductsRequest.input(param.key, sql.NVarChar, param.value));

        const totalProductsResult = await totalProductsRequest.query(totalProductsQuery);
        const totalProducts = totalProductsResult.recordset[0].total;
        const totalPages = Math.ceil(totalProducts / perPage);

        if (page > totalPages) {
            return res.status(404).json({ message: 'Page Not Found' });
        }
    
    const productsQuery = `
            SELECT 
                p.*, 
                s.Name AS ShopName,
                ISNULL(r.AverageRating, 0) AS AverageRating,
                ISNULL(r.RatingsCount, 0) AS RatingsCount
            FROM Products p
            LEFT JOIN Shops s ON p.ShopId = s.Id
            LEFT JOIN (
                SELECT 
                    ProductId, 
                    AVG(Rating) AS AverageRating, 
                    COUNT(Rating) AS RatingsCount
                FROM Reviews
                GROUP BY ProductId
            ) r ON r.ProductId = p.Id
            ${queryConditions}
            ORDER BY p.CreatedAt DESC
            OFFSET @skip ROWS 
            FETCH NEXT @perPage ROWS ONLY;
        `;
        const productsRequest = pool.request()
            .input('skip', sql.Int, skip)
            .input('perPage', sql.Int, perPage);

        queryParams.forEach((param) => productsRequest.input(param.key, sql.NVarChar, param.value));

        const productsResult = await productsRequest.query(productsQuery);
        const products = productsResult.recordset;
        products.forEach(product => {
            product.RatingsCount = Array.isArray(product.RatingsCount)
                ? product.RatingsCount.find(count => count !== null) || 0
                : product.RatingsCount;
        });
        for (const product of products) {
            try {
                product.Images = product.Images ? JSON.parse(product.Images) : [];
            } catch {
                product.Images = [];
            }

            try {
                product.Detail = product.Detail ? JSON.parse(product.Detail) : [];
            } catch {
                product.Detail = [];
            }

            product.averageRating = product.AverageRating;
            product.ratingsCount = product.RatingsCount;

            if (isValidUUID(product.Id)) {
                const variantsResult = await pool.request()
                    .input('ProductId', sql.UniqueIdentifier, product.Id)
                    .query('SELECT * FROM ProductVariants WHERE ProductId = @ProductId');
                product.variants = variantsResult.recordset;

                for (const variant of product.variants) {
                    try {
                        variant.Sizes = variant.Sizes ? JSON.parse(variant.Sizes) : [];
                    } catch {
                        variant.Sizes = [];
                    }
                }

                if (product.variants.length === 0) {
                    const colorVariantsResult = await pool.request()
                        .input('ProductId', sql.UniqueIdentifier, product.Id)
                        .query('SELECT * FROM ProductColorVariants WHERE ProductId = @ProductId');
                    product.colorVariants = colorVariantsResult.recordset.map((variant) =>
                        Object.fromEntries(Object.entries(variant).map(([key, value]) => [key.toLowerCase(), value]))
                    );
                } else {
                    product.colorVariants = [];
                }
            } else {
                product.variants = [];
                product.colorVariants = [];
            }
        }

        res.status(200).json({
            products,
            totalPages,
            currentPage: page,
            perPage,
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.put('/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, violationReason } = req.body;

    if (!status) {
        return res.status(400).json({ success: false, message: "Status is required." });
    }

    try {
        const pool = await sql.connect(dbConnect);

        // Check if the product exists
        const productResult = await pool
            .request()
            .input('productId', sql.UniqueIdentifier, id)
            .query('SELECT * FROM Products WHERE Id = @productId');

        if (productResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        // Construct the query to update the product status
        let updateQuery = `
        UPDATE Products
        SET status = @status`;

        if (status === 'violation') {
            if (!violationReason) {
                return res.status(400).json({ success: false, message: "Violation reason is required when status is violation." });
            }
            updateQuery += `, violation_reason = @violationReason`;
        }

        updateQuery += ` WHERE Id = @productId`;

        // Execute the query
        await pool.request()
            .input('status', sql.NVarChar, status)
            .input('violationReason', sql.NVarChar, violationReason || null)
            .input('productId', sql.UniqueIdentifier, id)
            .query(updateQuery);

        res.status(200).json({ success: true, message: "Product status updated successfully." });
    } catch (error) {
        console.error('Error updating product status:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// router.get('/:id', async (req, res) => {
//     const { id } = req.params;

//     if (!isValidUUID(id)) {
//         return res.status(400).json({ error: 'Invalid id format' });
//     }

//     try {
//         const pool = await sql.connect(dbConnect);

//         const productResult = await pool.request()
//             .input('Id', sql.UniqueIdentifier, id)
//             .query(`
//                 SELECT p.*, s.Name AS ShopName
//                 FROM Products p
//                 LEFT JOIN Shops s ON p.ShopId = s.Id
//                 WHERE p.Id = @Id
//             `);

//         if (productResult.recordset.length === 0) {
//             return res.status(404).send({ success: false, message: 'Product not found' });
//         }

//         let product = productResult.recordset[0];

//         const fieldsToParse = ['Images', 'Detail', 'Size', 'Color'];
//         fieldsToParse.forEach(field => {
//             if (product[field]) {
//                 try {
//                     product[field] = JSON.parse(product[field]);
//                 } catch (error) {
//                     console.error(`Error parsing product ${field}:`, error);
//                     product[field] = [];
//                 }
//             }
//         });

//         const variantsResult = await pool.request()
//             .input('ProductId', sql.UniqueIdentifier, product.Id)
//             .query('SELECT * FROM ProductVariants WHERE ProductId = @ProductId');

//         product.variants = variantsResult.recordset;

//         product.variants.forEach(variant => {
//             if (variant.Sizes) {
//                 try {
//                     variant.Sizes = JSON.parse(variant.Sizes);

//                     if (!Array.isArray(variant.Sizes)) {
//                         throw new Error('Sizes is not an array');
//                     }
//                 } catch (error) {
//                     console.error('Error parsing variant Sizes:', error);
//                     variant.Sizes = [];
//                 }
//             }
//         });

//         if (product.variants.length === 0) {
//             const colorVariantsResult = await pool.request()
//                 .input('ProductId', sql.UniqueIdentifier, product.Id)
//                 .query('SELECT * FROM ProductColorVariants WHERE ProductId = @ProductId');

//             product.colorVariants = colorVariantsResult.recordset.map(variant =>
//                 Object.fromEntries(
//                     Object.entries(variant).map(([key, value]) => [key.toLowerCase(), value])
//                 )
//             );
//         }

//         return res.status(200).json(product);
//     } catch (error) {
//         console.error('Error fetching product:', error);
//         res.status(500).send({ success: false, message: 'Server error' });
//     }
// });

router.get('/:id', async (req, res) => {
    const { id } = req.params;

    if (!isValidUUID(id)) {
        return res.status(400).json({ error: 'Invalid id format' });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const productResult = await pool.request()
            .input('Id', sql.UniqueIdentifier, id)
            .query(`
                SELECT 
                    p.*, 
                    s.Name AS ShopName,
                    ISNULL(r.AverageRating, 0) AS AverageRating,
                    ISNULL(r.RatingsCount, 0) AS RatingsCount,
                    ISNULL(q.QuestionCount, 0) AS QuestionCount
                FROM Products p
                LEFT JOIN Shops s ON p.ShopId = s.Id
                LEFT JOIN (
                    SELECT 
                        ProductId, 
                        AVG(Rating) AS AverageRating, 
                        COUNT(Rating) AS RatingsCount
                    FROM Reviews
                    WHERE ProductId = @Id
                    GROUP BY ProductId
                ) r ON r.ProductId = p.Id
                  LEFT JOIN (
                    SELECT 
                        ProductId, 
                        COUNT(*) AS QuestionCount
                    FROM Questions
                    WHERE ProductId = @Id
                    GROUP BY ProductId
                ) q ON q.ProductId = p.Id
                WHERE p.Id = @Id
            `);

        if (productResult.recordset.length === 0) {
            return res.status(404).send({ success: false, message: 'Product not found' });
        }

        let product = productResult.recordset[0];

        product.RatingsCount = Array.isArray(product.RatingsCount)
                ? product.RatingsCount.find(count => count !== null) || 0
                : product.RatingsCount;
        const fieldsToParse = ['Images', 'Detail', 'Size', 'Color'];
        fieldsToParse.forEach(field => {
            if (product[field]) {
                try {
                    product[field] = JSON.parse(product[field]);
                } catch (error) {
                    console.error(`Error parsing product ${field}:`, error);
                    product[field] = [];
                }
            }
        });

        const variantsResult = await pool.request()
            .input('ProductId', sql.UniqueIdentifier, product.Id)
            .query('SELECT * FROM ProductVariants WHERE ProductId = @ProductId');

        product.variants = variantsResult.recordset;

        product.variants.forEach(variant => {
            if (variant.Sizes) {
                try {
                    variant.Sizes = JSON.parse(variant.Sizes);

                    if (!Array.isArray(variant.Sizes)) {
                        throw new Error('Sizes is not an array');
                    }
                } catch (error) {
                    console.error('Error parsing variant Sizes:', error);
                    variant.Sizes = [];
                }
            }
        });

        // Fetch color variants if no size variants exist
        if (product.variants.length === 0) {
            const colorVariantsResult = await pool.request()
                .input('ProductId', sql.UniqueIdentifier, product.Id)
                .query('SELECT * FROM ProductColorVariants WHERE ProductId = @ProductId');

            product.colorVariants = colorVariantsResult.recordset.map(variant =>
                Object.fromEntries(
                    Object.entries(variant).map(([key, value]) => [key.toLowerCase(), value])
                )
            );
        }

        return res.status(200).json(product);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).send({ success: false, message: 'Server error' });
    }
});

// router.put('/:id', upload.fields([
//     { name: 'images', maxCount: 5 },
//     { name: 'video', maxCount: 1 },
//     { name: 'variants[0][image]', maxCount: 1 },
//     { name: 'variants[1][image]', maxCount: 1 },
//     { name: 'variants[2][image]', maxCount: 1 },
//     { name: 'variants[3][image]', maxCount: 1 },
//     { name: 'variants[4][image]', maxCount: 1 },
//     { name: 'colorVariants[0][image]', maxCount: 1 },
//     { name: 'colorVariants[1][image]', maxCount: 1 },
//     { name: 'colorVariants[2][image]', maxCount: 1 },
//     { name: 'colorVariants[3][image]', maxCount: 1 },
//     { name: 'colorVariants[4][image]', maxCount: 1 },
// ]), async (req, res) => {
//     try {
//         const { id } = req.params;
//         const {
//             shopId, name, description, occasionName, brand,
//             categoryId, subCategoryId, season, dedicatedFor, stock, productRam, productRom,
//             productSimSlots, productModel, sizes, colors, productDetails, variants, colorVariants, weight,
//             catName, subCatName, subSubCategoryId, itemsCategoryId, retainedImages = [], retainedVideo = null,
//             retainedVariantImages = [], retainedColorVariantImages = []
//         } = req.body;
//         console.log(req.body)
//         const safeVariants = Array.isArray(variants) ? variants : [];
//         const safeColorVariants = Array.isArray(colorVariants) ? colorVariants : [];
//         const pool = await sql.connect(dbConnect);

//         let imageUrls = [...retainedImages];
//         if (req.files['images']) {
//             for (const file of req.files['images']) {
//                 const result = await cloudinary.v2.uploader.upload(file.path);
//                 imageUrls.push(result.secure_url);
//             }
//         }

//         const imagesToDelete = retainedImages.filter(img => !imageUrls.includes(img));
//         for (const img of imagesToDelete) {
//             await cloudinary.v2.uploader.destroy(img);
//         }
//         let videoUrl = retainedVideo;
//         if (req.files['video']) {
//             const videoFile = req.files['video'][0];
//             const result = await cloudinary.v2.uploader.upload(videoFile.path, { resource_type: 'video' });
//             videoUrl = result.secure_url;

//             if (retainedVideo) {
//                 await cloudinary.v2.uploader.destroy(retainedVideo, { resource_type: 'video' });
//             }
//         }
//         const productRequest = pool.request();
//         productRequest.input('Id', sql.UniqueIdentifier, id);
//         productRequest.input('ShopId', sql.UniqueIdentifier, shopId);
//         productRequest.input('Name', sql.NVarChar, name);
//         productRequest.input('Description', sql.NVarChar, description);
//         productRequest.input('Images', sql.NVarChar, JSON.stringify(imageUrls));
//         productRequest.input('Video', sql.NVarChar, videoUrl);
//         productRequest.input('OccasionName', sql.NVarChar, occasionName);
//         productRequest.input('Brand', sql.NVarChar, brand);
//         productRequest.input('CatName', sql.NVarChar, catName);
//         productRequest.input('SubCatName', sql.NVarChar, subCatName);
//         productRequest.input('CategoryId', sql.UniqueIdentifier, categoryId);
//         productRequest.input('SubCategoryId', sql.UniqueIdentifier, subCategoryId);
//         productRequest.input('SubSubCategoryId', sql.UniqueIdentifier, subSubCategoryId);
//         productRequest.input('ItemsCategoryId', sql.UniqueIdentifier, itemsCategoryId);
//         productRequest.input('Season', sql.NVarChar, season);
//         productRequest.input('DedicatedFor', sql.NVarChar, dedicatedFor);
//         productRequest.input('Stock', sql.Int, stock);
//         productRequest.input('ProductRam', sql.NVarChar, JSON.stringify(productRam));
//         productRequest.input('ProductRom', sql.NVarChar, JSON.stringify(productRom));
//         productRequest.input('ProductSimSlots', sql.NVarChar, JSON.stringify(productSimSlots));
//         productRequest.input('ProductModel', sql.NVarChar, productModel);
//         productRequest.input('Size', sql.NVarChar, JSON.stringify(sizes));
//         productRequest.input('Color', sql.NVarChar, JSON.stringify(colors));
//         productRequest.input('Detail', sql.NVarChar, JSON.stringify(productDetails));
//         productRequest.input('Weight', sql.Decimal(4, 2), weight);

//         await productRequest.query(`
//             UPDATE Products SET 
//                 ShopId = @ShopId, Name = @Name, Description = @Description, Images = @Images, 
//                 Video = @Video, OccasionName = @OccasionName, Brand = @Brand,
//                  CatName = @CatName, SubCatName = @SubCatName,
//                 CategoryId = @CategoryId, SubCategoryId = @SubCategoryId, SubSubCategoryId = @SubSubCategoryId,
//                 ItemsCategoryId = @ItemsCategoryId, Season = @Season, DedicatedFor = @DedicatedFor, 
//                 Stock = @Stock, ProductRam = @ProductRam, ProductRom = @ProductRom,
//                 ProductSimSlots = @ProductSimSlots, ProductModel = @ProductModel, Size = @Size, 
//                 Color = @Color, Detail = @Detail, Weight = @Weight WHERE Id = @Id;
//         `);
//         if (safeVariants.length > 0) {
//             for (const [index, variant] of safeVariants.entries()) {
//                 let variantImageUrl = variant.retainedImage || ''; 
        
//                 if (req.files[`variants[${index}][image]`]) {
//                     const variantImage = req.files[`variants[${index}][image]`][0];
//                     const result = await cloudinary.v2.uploader.upload(variantImage.path);
//                     variantImageUrl = result.secure_url;
//                     if (variant.retainedImage) {
//                         await cloudinary.v2.uploader.destroy(variant.retainedImage);
//                     }
//                 }
//                 const sizes = typeof variant.sizes === 'string'
//                     ? JSON.parse(variant.sizes)
//                     : variant.sizes;
        
//                 if (!Array.isArray(sizes)) {
//                     return res.status(400).json({ success: false, message: 'Sizes must be an array.' });
//                 }
        
//                 const variantRequest = pool.request();
//                 variantRequest.input('ProductId', sql.UniqueIdentifier, id);
//                 variantRequest.input('VariantColor', sql.NVarChar, variant.color);
//                 variantRequest.input('VariantImage', sql.NVarChar, variantImageUrl);
//                 variantRequest.input('Sizes', sql.NVarChar, JSON.stringify(sizes));
//                 variantRequest.input('Expense', sql.Decimal(10, 2), variant.expense);
//                 await variantRequest.query(`
//                     IF EXISTS (
//                         SELECT 1 FROM ProductVariants
//                         WHERE ProductId = @ProductId AND VariantColor = @VariantColor
//                     )
//                     BEGIN
//                         UPDATE ProductVariants
//                         SET VariantImage = @VariantImage, Sizes = @Sizes, Expense = @Expense
//                         WHERE ProductId = @ProductId AND VariantColor = @VariantColor;
//                     END
//                     ELSE
//                     BEGIN
//                         INSERT INTO ProductVariants
//                         (ProductId, VariantColor, VariantImage, Sizes, Expense)
//                         VALUES (@ProductId, @VariantColor, @VariantImage, @Sizes, @Expense);
//                     END
//                 `);
//             }
//         }
//         if (safeColorVariants.length > 0) {
//             for (const [index, colorVariant] of safeColorVariants.entries()) {
//                 let colorVariantImageUrl = colorVariant.retainedImage || '';
        
//                 if (req.files[`colorVariants[${index}][image]`]) {
//                     const colorVariantImage = req.files[`colorVariants[${index}][image]`][0];
//                     const result = await cloudinary.v2.uploader.upload(colorVariantImage.path);
//                     colorVariantImageUrl = result.secure_url;
        
//                     if (colorVariant.retainedImage) {
//                         await cloudinary.v2.uploader.destroy(colorVariant.retainedImage);
//                     }
//                 }
        
//                 if (!colorVariantImageUrl) {
//                     continue;
//                 }
//                 const colorVariantRequest = pool.request();
//                 colorVariantRequest.input('ProductId', sql.UniqueIdentifier, id);
//                 colorVariantRequest.input('Color', sql.NVarChar, colorVariant.color);
//                 colorVariantRequest.input('Image', sql.NVarChar, colorVariantImageUrl);
//                 colorVariantRequest.input('Price', sql.Decimal(10, 2), colorVariant.price);
//                 colorVariantRequest.input('OldPrice', sql.Decimal(10, 2), colorVariant.oldPrice);
//                 colorVariantRequest.input('Discount', sql.Decimal(10, 2), colorVariant.discount);
//                 colorVariantRequest.input('Expense', sql.Decimal(10, 2), colorVariant.expense);
//                 colorVariantRequest.input('Stock', sql.Int, colorVariant.stock);
        
//                 await colorVariantRequest.query(`
//                     IF EXISTS (
//                         SELECT 1 FROM ProductColorVariants
//                         WHERE ProductId = @ProductId AND Color = @Color
//                     )
//                     BEGIN
//                         UPDATE ProductColorVariants
//                         SET Image = @Image, Price = @Price, OldPrice = @OldPrice, Discount = @Discount,
//                             Expense = @Expense, Stock = @Stock
//                         WHERE ProductId = @ProductId AND Color = @Color;
//                     END
//                     ELSE
//                     BEGIN
//                         INSERT INTO ProductColorVariants
//                         (ProductId, Color, Image, Price, OldPrice, Discount, Expense, Stock)
//                         VALUES (@ProductId, @Color, @Image, @Price, @OldPrice, @Discount, @Expense, @Stock);
//                     END
//                 `);
//             }
//         }
        
//         res.status(200).send({ success: true, message: 'Product and variants updated successfully.' });
//     } catch (error) {
//         console.error('Error updating product:', error);
//         res.status(500).send({ success: false, message: 'Server error.' });
//     }
// });

router.put('/:id', upload.fields([
    { name: 'images', maxCount: 5 },
    { name: 'video', maxCount: 1 },
    { name: 'variants[0][image]', maxCount: 1 },
    { name: 'variants[1][image]', maxCount: 1 },
    { name: 'variants[2][image]', maxCount: 1 },
    { name: 'variants[3][image]', maxCount: 1 },
    { name: 'variants[4][image]', maxCount: 1 },
    { name: 'colorVariants[0][image]', maxCount: 1 },
    { name: 'colorVariants[1][image]', maxCount: 1 },
    { name: 'colorVariants[2][image]', maxCount: 1 },
    { name: 'colorVariants[3][image]', maxCount: 1 },
    { name: 'colorVariants[4][image]', maxCount: 1 },
]), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            shopId, name, description, occasionName, brand,
            categoryId, subCategoryId, season, dedicatedFor, stock, productRam, productRom,
            productSimSlots, productModel, sizes, colors, productDetails, variants, colorVariants, weight,
            catName, subCatName, subSubCategoryId, itemsCategoryId, retainedImages = [], retainedVideo = null,
            retainedVariantImages = [], retainedColorVariantImages = []
        } = req.body;
        console.log(req.body)
        const safeVariants = Array.isArray(variants) ? variants : [];
        const safeColorVariants = Array.isArray(colorVariants) ? colorVariants : [];
        const pool = await sql.connect(dbConnect);

        let imageUrls = [...retainedImages];
        if (req.files['images']) {
            for (const file of req.files['images']) {
                const result = await cloudinary.v2.uploader.upload(file.path);
                imageUrls.push(result.secure_url);
            }
        }

        const imagesToDelete = retainedImages.filter(img => !imageUrls.includes(img));
        for (const img of imagesToDelete) {
            await cloudinary.v2.uploader.destroy(img);
        }
        let videoUrl = retainedVideo;
        if (req.files['video']) {
            const videoFile = req.files['video'][0];
            const result = await cloudinary.v2.uploader.upload(videoFile.path, { resource_type: 'video' });
            videoUrl = result.secure_url;

            if (retainedVideo) {
                await cloudinary.v2.uploader.destroy(retainedVideo, { resource_type: 'video' });
            }
        }
        const productRequest = pool.request();
        productRequest.input('Id', sql.UniqueIdentifier, id);
        productRequest.input('ShopId', sql.UniqueIdentifier, shopId);
        productRequest.input('Name', sql.NVarChar, name);
        productRequest.input('Description', sql.NVarChar, description);
        productRequest.input('Images', sql.NVarChar, JSON.stringify(imageUrls));
        productRequest.input('Video', sql.NVarChar, videoUrl);
        productRequest.input('OccasionName', sql.NVarChar, occasionName);
        productRequest.input('Brand', sql.NVarChar, brand);
        productRequest.input('CatName', sql.NVarChar, catName);
        productRequest.input('SubCatName', sql.NVarChar, subCatName);
        productRequest.input('CategoryId', sql.UniqueIdentifier, categoryId);
        productRequest.input('SubCategoryId', sql.UniqueIdentifier, subCategoryId);
        productRequest.input('SubSubCategoryId', sql.UniqueIdentifier, subSubCategoryId);
        productRequest.input('ItemsCategoryId', sql.UniqueIdentifier, itemsCategoryId);
        productRequest.input('Season', sql.NVarChar, season);
        productRequest.input('DedicatedFor', sql.NVarChar, dedicatedFor);
        productRequest.input('Stock', sql.Int, stock);
        productRequest.input('ProductRam', sql.NVarChar, JSON.stringify(productRam));
        productRequest.input('ProductRom', sql.NVarChar, JSON.stringify(productRom));
        productRequest.input('ProductSimSlots', sql.NVarChar, JSON.stringify(productSimSlots));
        productRequest.input('ProductModel', sql.NVarChar, productModel);
        productRequest.input('Size', sql.NVarChar, JSON.stringify(sizes));
        productRequest.input('Color', sql.NVarChar, JSON.stringify(colors));
        productRequest.input('Detail', sql.NVarChar, JSON.stringify(productDetails));
        productRequest.input('Weight', sql.Decimal(4, 2), weight);

        await productRequest.query(`
            UPDATE Products SET 
                ShopId = @ShopId, Name = @Name, Description = @Description, Images = @Images, 
                Video = @Video, OccasionName = @OccasionName, Brand = @Brand,
                 CatName = @CatName, SubCatName = @SubCatName,
                CategoryId = @CategoryId, SubCategoryId = @SubCategoryId, SubSubCategoryId = @SubSubCategoryId,
                ItemsCategoryId = @ItemsCategoryId, Season = @Season, DedicatedFor = @DedicatedFor, 
                Stock = @Stock, ProductRam = @ProductRam, ProductRom = @ProductRom,
                ProductSimSlots = @ProductSimSlots, ProductModel = @ProductModel, Size = @Size, 
                Color = @Color, Detail = @Detail, Weight = @Weight WHERE Id = @Id;
        `);
        // if (safeVariants.length > 0) {
        //     for (const [index, variant] of safeVariants.entries()) {
        //         let variantImageUrl = variant.retainedImage || ''; 
        
        //         if (req.files[`variants[${index}][image]`]) {
        //             const variantImage = req.files[`variants[${index}][image]`][0];
        //             const result = await cloudinary.v2.uploader.upload(variantImage.path);
        //             variantImageUrl = result.secure_url;
        //             if (variant.retainedImage) {
        //                 await cloudinary.v2.uploader.destroy(variant.retainedImage);
        //             }
        //         }
        //         const sizes = typeof variant.sizes === 'string'
        //             ? JSON.parse(variant.sizes)
        //             : variant.sizes;
        
        //         if (!Array.isArray(sizes)) {
        //             return res.status(400).json({ success: false, message: 'Sizes must be an array.' });
        //         }
        
        //         const variantRequest = pool.request();
        //         variantRequest.input('ProductId', sql.UniqueIdentifier, id);
        //         variantRequest.input('VariantColor', sql.NVarChar, variant.color);
        //         variantRequest.input('VariantImage', sql.NVarChar, variantImageUrl);
        //         variantRequest.input('Sizes', sql.NVarChar, JSON.stringify(sizes));
        //         variantRequest.input('Expense', sql.Decimal(10, 2), variant.expense);
        //         await variantRequest.query(`
        //             IF EXISTS (
        //                 SELECT 1 FROM ProductVariants
        //                 WHERE ProductId = @ProductId AND VariantColor = @VariantColor
        //             )
        //             BEGIN
        //                 UPDATE ProductVariants
        //                 SET VariantImage = @VariantImage, Sizes = @Sizes, Expense = @Expense
        //                 WHERE ProductId = @ProductId AND VariantColor = @VariantColor;
        //             END
        //             ELSE
        //             BEGIN
        //                 INSERT INTO ProductVariants
        //                 (ProductId, VariantColor, VariantImage, Sizes, Expense)
        //                 VALUES (@ProductId, @VariantColor, @VariantImage, @Sizes, @Expense);
        //             END
        //         `);
        //     }
        // }
          // Handle variants: Update, Delete, or Insert
          const currentVariants = await pool.request()
          .input('ProductId', sql.UniqueIdentifier, id)
          .query(`
              SELECT VariantColor FROM ProductVariants WHERE ProductId = @ProductId;
          `);

      const existingVariantColors = currentVariants.recordset.map(v => v.VariantColor);
      for (const color of existingVariantColors) {
          if (!safeVariants.some(variant => variant.color === color)) {
              await pool.request()
                  .input('ProductId', sql.UniqueIdentifier, id)
                  .input('VariantColor', sql.NVarChar, color)
                  .query(`
                      DELETE FROM ProductVariants WHERE ProductId = @ProductId AND VariantColor = @VariantColor;
                  `);
          }
      }

      for (const variant of safeVariants) {
          const variantImageUrl = variant.retainedImage || (req.files[`variants[${variant.color}]image`] && await cloudinary.v2.uploader.upload(req.files[`variants[${variant.color}]image`][0].path));

          const existingVariant = existingVariantColors.includes(variant.color);
          const sizes = Array.isArray(variant.sizes) ? variant.sizes : JSON.parse(variant.sizes);

          if (existingVariant) {
              await pool.request()
                  .input('ProductId', sql.UniqueIdentifier, id)
                  .input('VariantColor', sql.NVarChar, variant.color)
                  .input('VariantImage', sql.NVarChar, variantImageUrl)
                  .input('Sizes', sql.NVarChar, JSON.stringify(sizes))
                  .input('Expense', sql.Decimal(10, 2), variant.expense)
                  .query(`
                      UPDATE ProductVariants
                      SET VariantImage = @VariantImage, Sizes = @Sizes, Expense = @Expense
                      WHERE ProductId = @ProductId AND VariantColor = @VariantColor;
                  `);
          } else {
              await pool.request()
                  .input('ProductId', sql.UniqueIdentifier, id)
                  .input('VariantColor', sql.NVarChar, variant.color)
                  .input('VariantImage', sql.NVarChar, variantImageUrl)
                  .input('Sizes', sql.NVarChar, JSON.stringify(sizes))
                  .input('Expense', sql.Decimal(10, 2), variant.expense)
                  .query(`
                      INSERT INTO ProductVariants (ProductId, VariantColor, VariantImage, Sizes, Expense)
                      VALUES (@ProductId, @VariantColor, @VariantImage, @Sizes, @Expense);
                  `);
          }
      }


        if (safeColorVariants.length > 0) {
            for (const [index, colorVariant] of safeColorVariants.entries()) {
                let colorVariantImageUrl = colorVariant.retainedImage || '';
        
                if (req.files[`colorVariants[${index}][image]`]) {
                    const colorVariantImage = req.files[`colorVariants[${index}][image]`][0];
                    const result = await cloudinary.v2.uploader.upload(colorVariantImage.path);
                    colorVariantImageUrl = result.secure_url;
        
                    if (colorVariant.retainedImage) {
                        await cloudinary.v2.uploader.destroy(colorVariant.retainedImage);
                    }
                }
        
                if (!colorVariantImageUrl) {
                    continue;
                }
                const colorVariantRequest = pool.request();
                colorVariantRequest.input('ProductId', sql.UniqueIdentifier, id);
                colorVariantRequest.input('Color', sql.NVarChar, colorVariant.color);
                colorVariantRequest.input('Image', sql.NVarChar, colorVariantImageUrl);
                colorVariantRequest.input('Price', sql.Decimal(10, 2), colorVariant.price);
                colorVariantRequest.input('OldPrice', sql.Decimal(10, 2), colorVariant.oldPrice);
                colorVariantRequest.input('Discount', sql.Decimal(10, 2), colorVariant.discount);
                colorVariantRequest.input('Expense', sql.Decimal(10, 2), colorVariant.expense);
                colorVariantRequest.input('Stock', sql.Int, colorVariant.stock);
        
                await colorVariantRequest.query(`
                    IF EXISTS (
                        SELECT 1 FROM ProductColorVariants
                        WHERE ProductId = @ProductId AND Color = @Color
                    )
                    BEGIN
                        UPDATE ProductColorVariants
                        SET Image = @Image, Price = @Price, OldPrice = @OldPrice, Discount = @Discount,
                            Expense = @Expense, Stock = @Stock
                        WHERE ProductId = @ProductId AND Color = @Color;
                    END
                    ELSE
                    BEGIN
                        INSERT INTO ProductColorVariants
                        (ProductId, Color, Image, Price, OldPrice, Discount, Expense, Stock)
                        VALUES (@ProductId, @Color, @Image, @Price, @OldPrice, @Discount, @Expense, @Stock);
                    END
                `);
            }
        }
        
        res.status(200).send({ success: true, message: 'Product and variants updated successfully.' });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).send({ success: false, message: 'Server error.' });
    }
});

router.delete('/:id', async (req, res) => {
    const { id: productId } = req.params;
    try {
        const pool = await sql.connect(dbConnect);
        const productResult = await pool.request()
            .input('ProductId', sql.UniqueIdentifier, productId)
            .query(`
                SELECT Images, Video 
                FROM Products 
                WHERE Id = @ProductId
            `);

        if (!productResult.recordset.length) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        const product = productResult.recordset[0];
        const images = JSON.parse(product.Images);
        const video = product.Video;
        const variantResults = await pool.request()
            .input('ProductId', sql.UniqueIdentifier, productId)
            .query(`
                SELECT VariantImage 
                FROM ProductVariants 
                WHERE ProductId = @ProductId
            `);

        const variantImages = variantResults.recordset.map(variant => variant.VariantImage);
        const colorVariantResults = await pool.request()
            .input('ProductId', sql.UniqueIdentifier, productId)
            .query(`
                SELECT Image 
                FROM ProductColorVariants 
                WHERE ProductId = @ProductId
            `);

        const colorVariantImages = colorVariantResults.recordset.map(colorVariant => colorVariant.Image);
        const allImages = [...images, ...variantImages, ...colorVariantImages];
        for (const imageUrl of allImages) {
            try {
                const publicId = extractPublicId(imageUrl);
                await cloudinary.v2.uploader.destroy(publicId);
            } catch (cloudinaryError) {
                console.error(`Failed to delete image: ${imageUrl}`, cloudinaryError);
            }
        }
        if (video) {
            try {
                const videoPublicId = extractPublicId(video);
                await cloudinary.v2.uploader.destroy(videoPublicId, { resource_type: 'video' });
            } catch (cloudinaryError) {
                console.error(`Failed to delete video: ${video}`, cloudinaryError);
            }
        }
        await pool.request()
            .input('ProductId', sql.UniqueIdentifier, productId)
            .query(`DELETE FROM Wishlist WHERE ProductId = @ProductId`);

        await pool.request()
            .input('ProductId', sql.UniqueIdentifier, productId)
            .query(`DELETE FROM ProductColorVariants WHERE ProductId = @ProductId`);

        await pool.request()
            .input('ProductId', sql.UniqueIdentifier, productId)
            .query(`DELETE FROM ProductVariants WHERE ProductId = @ProductId`);
        await pool.request()
            .input('ProductId', sql.UniqueIdentifier, productId)
            .query(`DELETE FROM Products WHERE Id = @ProductId`);

        res.status(200).json({ success: true, message: 'Product and its associated data deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});



router.post('/filter-products', async (req, res) => {
    const { brand, color, size, minPrice, maxPrice, rating, sortBy } = req.body;

    let query = `
        SELECT DISTINCT 
            p.Id, 
            p.Name, 
            p.Description, 
            p.Brand, 
            p.Rating, 
            COALESCE(
                JSON_VALUE(v.Sizes, '$[0].price'), 
                c.price
            ) AS Price,
            COALESCE(
                JSON_VALUE(v.Sizes, '$[0].discount'), 
                c.discount
            ) AS Discount,
            COALESCE(
                JSON_VALUE(v.Sizes, '$[0].size'), 
                NULL
            ) AS Size,
            c.color AS Color,
            COALESCE(c.image, v.VariantImage) AS Image
        FROM 
            Products p
        LEFT JOIN 
            ProductVariants v ON p.Id = v.ProductId
        LEFT JOIN 
            ColorVariants c ON p.Id = c.productid
        WHERE 
            1=1
    `;

    if (brand) {
        query += ` AND p.Brand = @brand`;
    }
    if (color) {
        query += ` AND c.color = @color`;
    }
    if (size) {
        query += ` AND JSON_VALUE(v.Sizes, '$[0].size') = @size`;
    }
    if (minPrice) {
        query += ` AND COALESCE(JSON_VALUE(v.Sizes, '$[0].price'), c.price) >= @minPrice`;
    }
    if (maxPrice) {
        query += ` AND COALESCE(JSON_VALUE(v.Sizes, '$[0].price'), c.price) <= @maxPrice`;
    }
    if (rating) {
        query += ` AND p.Rating >= @rating`;
    }

    // Sorting
    if (sortBy) {
        switch (sortBy) {
            case 'lowToHighPrice':
                query += ` ORDER BY COALESCE(JSON_VALUE(v.Sizes, '$[0].price'), c.price) ASC`;
                break;
            case 'highToLowPrice':
                query += ` ORDER BY COALESCE(JSON_VALUE(v.Sizes, '$[0].price'), c.price) DESC`;
                break;
            case 'highToLowDiscount':
                query += ` ORDER BY COALESCE(JSON_VALUE(v.Sizes, '$[0].discount'), c.discount) DESC`;
                break;
            default:
                break;
        }
    }

    try {
        const pool = await sql.connect(dbConfig);

        const result = await pool.request()
            .input('brand', sql.VarChar, brand)
            .input('color', sql.VarChar, color)
            .input('size', sql.VarChar, size)
            .input('minPrice', sql.Int, minPrice)
            .input('maxPrice', sql.Int, maxPrice)
            .input('rating', sql.Int, rating)
            .query(query);

        res.status(200).json(result.recordset);
    } catch (error) {
        console.error('SQL error:', error);
        res.status(500).send('Server error');
    }
});

router.get('/twenty-percent/products-with-discount', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 10;
        const skip = (page - 1) * perPage;

        const pool = await sql.connect(dbConnect);

        const productVariantsQuery = `
            SELECT DISTINCT p.*, s.Name AS ShopName, v.Sizes
            FROM Products p
            LEFT JOIN ProductVariants v ON p.Id = v.ProductId
            LEFT JOIN Shops s ON p.ShopId = s.Id
            WHERE v.Sizes IS NOT NULL
        `;
        const productVariantsResult = await pool.request().query(productVariantsQuery);
        let productsWithVariants = productVariantsResult.recordset;

        // Parse JSON fields and filter for discounts
        productsWithVariants = productsWithVariants
            .map((product) => {
                try {
                    product.Images = product.Images ? JSON.parse(product.Images) : [];
                } catch {
                    product.Images = [];
                }
                try {
                    product.Sizes = product.Sizes ? JSON.parse(product.Sizes) : [];
                } catch {
                    product.Sizes = [];
                }
                try {
                    product.Detail = product.Detail ? JSON.parse(product.Detail) : '';
                } catch {
                    product.Detail = '';
                }
                return product;
            })
            .filter((product) => {
                // Check discount in Sizes array (first element, index 0)
                return product.Sizes.length > 0 && product.Sizes[0].discount >= 20;
            });

        // Fetch products with discount >= 20% from ProductColorVariants table
        const productColorVariantsQuery = `
            SELECT DISTINCT p.*, s.Name AS ShopName
            FROM Products p
            LEFT JOIN Shops s ON p.ShopId = s.Id
            WHERE p.Id IN (
                SELECT ProductId FROM ProductColorVariants WHERE discount >= 20
            )
        `;
        const productColorVariantsResult = await pool.request().query(productColorVariantsQuery);
        let productsWithColorVariants = productColorVariantsResult.recordset;

        // Populate colorVariants for products from ProductColorVariants
        for (const product of productsWithColorVariants) {
            try {
                product.Images = product.Images ? JSON.parse(product.Images) : [];
            } catch {
                product.Images = [];
            }
            try {
                product.Detail = product.Detail ? JSON.parse(product.Detail) : '';
            } catch {
                product.Detail = '';
            }

            // Fetch colorVariants for each product
            const colorVariantsResult = await pool.request()
                .input('ProductId', sql.UniqueIdentifier, product.Id)
                .query(`
                    SELECT * FROM ProductColorVariants WHERE ProductId = @ProductId AND discount >= 20
                `);
            product.colorVariants = colorVariantsResult.recordset.map((variant) =>
                Object.fromEntries(Object.entries(variant).map(([key, value]) => [key.toLowerCase(), value]))
            );
        }

        // Combine products and paginate
        let allProducts = [...productsWithVariants, ...productsWithColorVariants];
        const totalProducts = allProducts.length;
        allProducts = allProducts.slice(skip, skip + perPage);

        res.status(200).json({
            products: allProducts,
            totalPages: Math.ceil(totalProducts / perPage),
            currentPage: page,
            perPage,
        });
    } catch (error) {
        console.error('Error fetching products with discount:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
router.get('/fifty-percent/products-with-discount', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 10;
        const skip = (page - 1) * perPage;

        const pool = await sql.connect(dbConnect);

        const productVariantsQuery = `
            SELECT DISTINCT p.*, s.Name AS ShopName, v.Sizes
            FROM Products p
            LEFT JOIN ProductVariants v ON p.Id = v.ProductId
            LEFT JOIN Shops s ON p.ShopId = s.Id
            WHERE v.Sizes IS NOT NULL
        `;
        const productVariantsResult = await pool.request().query(productVariantsQuery);
        let productsWithVariants = productVariantsResult.recordset;

        // Parse JSON fields and filter for discounts
        productsWithVariants = productsWithVariants
            .map((product) => {
                try {
                    product.Images = product.Images ? JSON.parse(product.Images) : [];
                } catch {
                    product.Images = [];
                }
                try {
                    product.Sizes = product.Sizes ? JSON.parse(product.Sizes) : [];
                } catch {
                    product.Sizes = [];
                }
                try {
                    product.Detail = product.Detail ? JSON.parse(product.Detail) : '';
                } catch {
                    product.Detail = '';
                }
                return product;
            })
            .filter((product) => {
                // Check discount in Sizes array (first element, index 0)
                return product.Sizes.length > 0 && product.Sizes[0].discount >= 50;
            });

        // Fetch products with discount >= 50% from ProductColorVariants table
        const productColorVariantsQuery = `
            SELECT DISTINCT p.*, s.Name AS ShopName
            FROM Products p
            LEFT JOIN Shops s ON p.ShopId = s.Id
            WHERE p.Id IN (
                SELECT ProductId FROM ProductColorVariants WHERE discount >= 50
            )
        `;
        const productColorVariantsResult = await pool.request().query(productColorVariantsQuery);
        let productsWithColorVariants = productColorVariantsResult.recordset;

        // Populate colorVariants for products from ProductColorVariants
        for (const product of productsWithColorVariants) {
            try {
                product.Images = product.Images ? JSON.parse(product.Images) : [];
            } catch {
                product.Images = [];
            }
            try {
                product.Detail = product.Detail ? JSON.parse(product.Detail) : '';
            } catch {
                product.Detail = '';
            }

            // Fetch colorVariants for each product
            const colorVariantsResult = await pool.request()
                .input('ProductId', sql.UniqueIdentifier, product.Id)
                .query(`
                    SELECT * FROM ProductColorVariants WHERE ProductId = @ProductId AND discount >= 50
                `);
            product.colorVariants = colorVariantsResult.recordset.map((variant) =>
                Object.fromEntries(Object.entries(variant).map(([key, value]) => [key.toLowerCase(), value]))
            );
        }

        // Combine products and paginate
        let allProducts = [...productsWithVariants, ...productsWithColorVariants];
        const totalProducts = allProducts.length;
        allProducts = allProducts.slice(skip, skip + perPage);

        res.status(200).json({
            products: allProducts,
            totalPages: Math.ceil(totalProducts / perPage),
            currentPage: page,
            perPage,
        });
    } catch (error) {
        console.error('Error fetching products with 50% or more discount:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
router.get('/under-1000/products', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 10;
        const skip = (page - 1) * perPage;

        const pool = await sql.connect(dbConnect);

        const productVariantsQuery = `
            SELECT DISTINCT p.*, s.Name AS ShopName, v.Sizes
            FROM Products p
            LEFT JOIN ProductVariants v ON p.Id = v.ProductId
            LEFT JOIN Shops s ON p.ShopId = s.Id
            WHERE v.Sizes IS NOT NULL
        `;
        const productVariantsResult = await pool.request().query(productVariantsQuery);
        let productsWithVariants = productVariantsResult.recordset;

        // Parse JSON fields and filter for price < 1000
        productsWithVariants = productsWithVariants
            .map((product) => {
                try {
                    product.Images = product.Images ? JSON.parse(product.Images) : [];
                } catch {
                    product.Images = [];
                }
                try {
                    product.Sizes = product.Sizes ? JSON.parse(product.Sizes) : [];
                } catch {
                    product.Sizes = [];
                }
                try {
                    product.Detail = product.Detail ? JSON.parse(product.Detail) : '';
                } catch {
                    product.Detail = '';
                }
                return product;
            })
            .filter((product) => {
                // Check price in Sizes array (first element, index 0)
                return product.Sizes.length > 0 && product.Sizes[0].price < 1000;
            });

        // Fetch products with price < 1000 from ProductColorVariants
        const productColorVariantsQuery = `
            SELECT DISTINCT p.*, s.Name AS ShopName
            FROM Products p
            LEFT JOIN Shops s ON p.ShopId = s.Id
            WHERE p.Id IN (
                SELECT ProductId FROM ProductColorVariants WHERE price < 1000
            )
        `;
        const productColorVariantsResult = await pool.request().query(productColorVariantsQuery);
        let productsWithColorVariants = productColorVariantsResult.recordset;

        // Populate colorVariants for products from ProductColorVariants
        for (const product of productsWithColorVariants) {
            try {
                product.Images = product.Images ? JSON.parse(product.Images) : [];
            } catch {
                product.Images = [];
            }
            try {
                product.Detail = product.Detail ? JSON.parse(product.Detail) : '';
            } catch {
                product.Detail = '';
            }

            // Fetch colorVariants for each product
            const colorVariantsResult = await pool.request()
                .input('ProductId', sql.UniqueIdentifier, product.Id)
                .query(`
                    SELECT * FROM ProductColorVariants WHERE ProductId = @ProductId AND price < 1000
                `);
            product.colorVariants = colorVariantsResult.recordset.map((variant) =>
                Object.fromEntries(Object.entries(variant).map(([key, value]) => [key.toLowerCase(), value]))
            );
        }

        let allProducts = [...productsWithVariants, ...productsWithColorVariants];
        const totalProducts = allProducts.length;
        allProducts = allProducts.slice(skip, skip + perPage);

        res.status(200).json({
            products: allProducts,
            totalPages: Math.ceil(totalProducts / perPage),
            currentPage: page,
            perPage,
        });
    } catch (error) {
        console.error('Error fetching products with price < 1000:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// router.get('/search/result', async (req, res) => {
//     try {
//         const page = parseInt(req.query.page) || 1;
//         const perPage = parseInt(req.query.perPage) || 10;
//         const skip = (page - 1) * perPage;

//         const searchQuery = req.query.query || '';
//         const pool = await sql.connect(dbConnect);

//         const searchQueryText = `
//             SELECT p.*, 
//                    c.Name AS CategoryName,
//                    sc.Subcategory AS SubCategoryName,
//                    ssc.Name AS SubSubCategoryName,
//                    ic.Name AS ItemsCategoryName,
//                    s.Name AS ShopName
//             FROM Products p
//             LEFT JOIN Categories c ON p.CategoryId = c.Id
//             LEFT JOIN SubCategories sc ON p.SubCategoryId = sc.Id
//             LEFT JOIN SubSubCategories ssc ON p.SubSubCategoryId = ssc.Id
//             LEFT JOIN Items ic ON p.ItemsCategoryId = ic.Id
//             LEFT JOIN Shops s ON p.ShopId = s.Id
//             WHERE 
//                 p.Name LIKE @searchQuery OR
//                 c.Name LIKE @searchQuery OR
//                 sc.Subcategory LIKE @searchQuery OR
//                 ssc.Name LIKE @searchQuery OR
//                 ic.Name LIKE @searchQuery
//             ORDER BY p.CreatedAt DESC
//             OFFSET @skip ROWS
//             FETCH NEXT @perPage ROWS ONLY
//         `;

//         const searchRequest = pool.request()
//             .input('searchQuery', sql.NVarChar, `%${searchQuery}%`)
//             .input('skip', sql.Int, skip)
//             .input('perPage', sql.Int, perPage);

//         const searchResult = await searchRequest.query(searchQueryText);
//         const products = searchResult.recordset;

//         for (const product of products) {
//             try {
//                 product.Images = product.Images ? JSON.parse(product.Images) : [];
//             } catch {
//                 product.Images = [];
//             }

//             try {
//                 product.Detail = product.Detail ? JSON.parse(product.Detail) : [];
//             } catch {
//                 product.Detail = [];
//             }
//         }

//         const countQuery = `
//             SELECT COUNT(*) AS total
//             FROM Products p
//             LEFT JOIN Categories c ON p.CategoryId = c.Id
//             LEFT JOIN SubCategories sc ON p.SubCategoryId = sc.Id
//             LEFT JOIN SubSubCategories ssc ON p.SubSubCategoryId = ssc.Id
//             LEFT JOIN Items ic ON p.ItemsCategoryId = ic.Id
//             WHERE 
//                 p.Name LIKE @searchQuery OR
//                 c.Name LIKE @searchQuery OR
//                 sc.Subcategory LIKE @searchQuery OR
//                 ssc.Name LIKE @searchQuery OR
//                 ic.Name LIKE @searchQuery
//         `;

//         const countRequest = pool.request().input('searchQuery', sql.NVarChar, `%${searchQuery}%`);
//         const countResult = await countRequest.query(countQuery);
//         const totalResults = countResult.recordset[0].total;
//         const totalPages = Math.ceil(totalResults / perPage);

//         if (page > totalPages) {
//             return res.status(404).json({ message: 'Page Not Found' });
//         }

//         res.status(200).json({
//             products,
//             totalResults,
//             totalPages,
//             currentPage: page,
//             perPage,
//         });
//     } catch (error) {
//         console.error('Error fetching search results:', error);
//         res.status(500).json({ success: false, message: 'Server error' });
//     }
// });
router.get('/search/result', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 10;
        const skip = (page - 1) * perPage;

        const searchQuery = req.query.query || '';
        const pool = await sql.connect(dbConnect);

        const searchQueryText = `
            SELECT p.*, 
                   c.Name AS CategoryName,
                   sc.Subcategory AS SubCategoryName,
                   ssc.Name AS SubSubCategoryName,
                   ic.Name AS ItemsCategoryName,
                   s.Name AS ShopName
            FROM Products p
            LEFT JOIN Categories c ON p.CategoryId = c.Id
            LEFT JOIN SubCategories sc ON p.SubCategoryId = sc.Id
            LEFT JOIN SubSubCategories ssc ON p.SubSubCategoryId = ssc.Id
            LEFT JOIN Items ic ON p.ItemsCategoryId = ic.Id
            LEFT JOIN Shops s ON p.ShopId = s.Id
            WHERE 
                p.Name LIKE @searchQuery OR
                c.Name LIKE @searchQuery OR
                sc.Subcategory LIKE @searchQuery OR
                ssc.Name LIKE @searchQuery OR
                ic.Name LIKE @searchQuery
            ORDER BY p.CreatedAt DESC
            OFFSET @skip ROWS
            FETCH NEXT @perPage ROWS ONLY
        `;

        const searchRequest = pool.request()
            .input('searchQuery', sql.NVarChar, `%${searchQuery}%`)
            .input('skip', sql.Int, skip)
            .input('perPage', sql.Int, perPage);

        const searchResult = await searchRequest.query(searchQueryText);
        const products = searchResult.recordset;

        for (const product of products) {
            try {
                product.Images = product.Images ? JSON.parse(product.Images) : [];
            } catch {
                product.Images = [];
            }

            try {
                product.Detail = product.Detail ? JSON.parse(product.Detail) : [];
            } catch {
                product.Detail = [];
            }

            if (isValidUUID(product.Id)) {
                const variantsResult = await pool.request()
                    .input('ProductId', sql.UniqueIdentifier, product.Id)
                    .query('SELECT * FROM ProductVariants WHERE ProductId = @ProductId');
                product.variants = variantsResult.recordset;

                for (const variant of product.variants) {
                    try {
                        variant.Sizes = variant.Sizes ? JSON.parse(variant.Sizes) : [];
                    } catch {
                        variant.Sizes = [];
                    }
                }

                // Fetch color variants if no size variants are found
                if (product.variants.length === 0) {
                    const colorVariantsResult = await pool.request()
                        .input('ProductId', sql.UniqueIdentifier, product.Id)
                        .query('SELECT * FROM ProductColorVariants WHERE ProductId = @ProductId');
                    product.colorVariants = colorVariantsResult.recordset.map((variant) =>
                        Object.fromEntries(Object.entries(variant).map(([key, value]) => [key.toLowerCase(), value]))
                    );
                } else {
                    product.colorVariants = [];
                }
            } else {
                product.variants = [];
                product.colorVariants = [];
            }
        }

        // Count total results for pagination
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM Products p
            LEFT JOIN Categories c ON p.CategoryId = c.Id
            LEFT JOIN SubCategories sc ON p.SubCategoryId = sc.Id
            LEFT JOIN SubSubCategories ssc ON p.SubSubCategoryId = ssc.Id
            LEFT JOIN Items ic ON p.ItemsCategoryId = ic.Id
            WHERE 
                p.Name LIKE @searchQuery OR
                c.Name LIKE @searchQuery OR
                sc.Subcategory LIKE @searchQuery OR
                ssc.Name LIKE @searchQuery OR
                ic.Name LIKE @searchQuery
        `;

        const countRequest = pool.request().input('searchQuery', sql.NVarChar, `%${searchQuery}%`);
        const countResult = await countRequest.query(countQuery);
        const totalResults = countResult.recordset[0].total;
        const totalPages = Math.ceil(totalResults / perPage);

        if (page > totalPages) {
            return res.status(404).json({ message: 'Page Not Found' });
        }

        res.status(200).json({
            products,
            totalResults,
            totalPages,
            currentPage: page,
            perPage,
        });
    } catch (error) {
        console.error('Error fetching search results:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


export default router

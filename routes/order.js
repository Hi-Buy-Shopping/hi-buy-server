import express from 'express';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js'; 
import createOrders from '../tables/order.js';


const router = express.Router();

const isValidUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
};
  

router.post('/create', createOrders);


router.get('/', async (req, res) => {
    try {
        const pool = await sql.connect(dbConnect);
        const query = `SELECT * FROM Orders ORDER BY CreatedAt DESC`;
        const result = await pool.request().query(query);
        res.status(200).json(result.recordset);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Error fetching orders' });
    }
});

router.get('/:id', async (req, res) => {
    const { id } = req.params;

    if (!isValidUUID(id)) {
        return res.status(400).json({ error: 'Invalid id format' });
    }

    try {
        const pool = await sql.connect(dbConnect);
        const result = await pool.request()
            .input('OrderId', sql.UniqueIdentifier, id)
            .query(`
                SELECT 
                    o.Id AS OrderId, 
                    o.FullName, 
                    o.Country, 
                    o.StreetAddressLine1, 
                    o.StreetAddressLine2, 
                    o.Province, 
                    o.City, 
                    o.ZipCode, 
                    o.PhoneNumber, 
                    o.Email, 
                    o.Amount, 
                    o.Status, 
                    o.CreatedAt, 
                    op.ProductId, 
                    p.Name AS ProductName, 
                    ISNULL(
                        CASE 
                            WHEN cv.Price IS NOT NULL THEN cv.Price
                            WHEN pv.SizePrice IS NOT NULL THEN pv.SizePrice
                            ELSE 0 -- Default to 0 if no variant or color price exists
                        END, 0
                    ) AS ProductPrice, 
                    op.Quantity,
                    op.SelectedSize,
                    op.SelectedColor,
                    ISNULL(op.SelectedImage, '') AS SelectedImage, -- Fallback to empty string if SelectedImage is not available
                    p.Images -- Get all product images (JSON array)
                FROM Orders o
                LEFT JOIN OrderProducts op ON o.Id = op.OrderId
                LEFT JOIN Products p ON op.ProductId = p.Id
                LEFT JOIN ProductColorVariants cv ON p.Id = cv.ProductId AND cv.Color = op.SelectedColor
                LEFT JOIN (
                    SELECT 
                        pv.ProductId, 
                        JSON_VALUE(size.value, '$.price') AS SizePrice,
                        JSON_VALUE(size.value, '$.size') AS SizeName
                    FROM ProductVariants pv
                    CROSS APPLY OPENJSON(pv.Sizes) AS size
                ) pv ON p.Id = pv.ProductId AND pv.SizeName = op.SelectedSize
                WHERE o.Id = @OrderId
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        
        const ordersWithParsedImages = result.recordset.map(order => {
            const productImages = JSON.parse(order.Images || '[]');
            const fallbackImage = productImages[0] || 'No image available';

            return {
                ...order,
                Images: productImages,
                SelectedImage: order.SelectedImage || fallbackImage 
            };
        });

        res.status(200).json(ordersWithParsedImages);
    } catch (error) {
        console.error('Error fetching order by Id:', error);
        res.status(500).json({ error: 'Error fetching order by Id' });
    }
});

router.get('/order/:orderGroupId', async (req, res) => {
    const { orderGroupId } = req.params;
    if (!isValidUUID(orderGroupId)) {
        return res.status(400).json({ error: 'Invalid OrderGroupId format' });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const result = await pool.request()
            .input('OrderGroupId', sql.UniqueIdentifier, orderGroupId)
            .query(`
                SELECT 
                    o.Id AS OrderId, 
                    o.OrderGroupId,
                    o.FullName, 
                    o.Country, 
                    o.StreetAddressLine1, 
                    o.StreetAddressLine2, 
                    o.Province, 
                    o.City, 
                    o.ZipCode, 
                    o.PhoneNumber, 
                    o.Email, 
                    o.Amount, 
                    o.Status, 
                    o.CreatedAt, 
                    op.ProductId, 
                    p.Name AS ProductName, 
                    ISNULL(
                        CASE 
                            WHEN cv.Price IS NOT NULL THEN cv.Price
                            WHEN pv.SizePrice IS NOT NULL THEN pv.SizePrice
                            ELSE 0
                        END, 0
                    ) AS ProductPrice, 
                    op.Quantity,
                    op.SelectedSize,
                    op.SelectedColor,
                    ISNULL(op.SelectedImage, '') AS SelectedImage, -- Fallback to empty string if SelectedImage is not available
                    p.Images -- Get all product images (JSON array)
                FROM Orders o
                LEFT JOIN OrderProducts op ON o.OrderGroupId = op.OrderGroupId
                LEFT JOIN Products p ON op.ProductId = p.Id
                LEFT JOIN ProductColorVariants cv ON p.Id = cv.ProductId AND cv.Color = op.SelectedColor
                LEFT JOIN (
                    SELECT 
                        pv.ProductId, 
                        JSON_VALUE(size.value, '$.price') AS SizePrice,
                        JSON_VALUE(size.value, '$.size') AS SizeName
                    FROM ProductVariants pv
                    CROSS APPLY OPENJSON(pv.Sizes) AS size
                ) pv ON p.Id = pv.ProductId AND pv.SizeName = op.SelectedSize
                WHERE o.OrderGroupId = @OrderGroupId
                AND o.ParentOrderId IS NULL -- Ensure ParentOrderId is NULL
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'No orders found for the given OrderGroupId' });
        }

        const ordersWithParsedImages = result.recordset.map(order => {
            const productImages = JSON.parse(order.Images || '[]');
            const fallbackImage = productImages[0] || 'No image available';

            return {
                ...order,
                Images: productImages,
                SelectedImage: order.SelectedImage || fallbackImage 
            };
        });

        res.status(200).json(ordersWithParsedImages);
    } catch (error) {
        console.error('Error fetching order products by OrderGroupId:', error);
        res.status(500).json({ error: 'Error fetching order products by OrderGroupId' });
    }
});


router.get('/user/orders/:userId', async (req, res) => {
    const { userId } = req.params;

    if (!isValidUUID(userId)) {
        return res.status(400).json({ error: 'Invalid UserId format' });
    }

    try {
        const pool = await sql.connect(dbConnect);
        const result = await pool.request()
            .input('UserId', sql.UniqueIdentifier, userId)
            .query(`
                SELECT 
                    o.Id AS OrderId, 
                    o.OrderGroupId, 
                    o.FullName, 
                    o.Country, 
                    o.StreetAddressLine1, 
                    o.StreetAddressLine2, 
                    o.Province, 
                    o.City, 
                    o.ZipCode, 
                    o.PhoneNumber, 
                    o.Email, 
                    o.Amount, 
                    o.Status, 
                    o.CreatedAt, 
                    op.ProductId, 
                    p.Name AS ProductName, 
                    ISNULL(
                        CASE 
                            WHEN cv.Price IS NOT NULL THEN cv.Price
                            WHEN pv.SizePrice IS NOT NULL THEN pv.SizePrice
                            ELSE 0 -- Default to 0 if no variant or color price exists
                        END, 0
                    ) AS ProductPrice, 
                    op.Quantity,
                    op.SelectedSize,
                    op.SelectedColor, 
                    ISNULL(op.SelectedImage, p.Images) AS FinalImage 
                FROM Orders o
                LEFT JOIN OrderProducts op ON o.Id = op.OrderId
                LEFT JOIN Products p ON op.ProductId = p.Id
                LEFT JOIN ProductColorVariants cv ON p.Id = cv.ProductId AND cv.Color = op.SelectedColor
                LEFT JOIN (
                    SELECT 
                        pv.ProductId, 
                        JSON_VALUE(size.value, '$.price') AS SizePrice,
                        JSON_VALUE(size.value, '$.size') AS SizeName
                    FROM ProductVariants pv
                    CROSS APPLY OPENJSON(pv.Sizes) AS size
                ) pv ON p.Id = pv.ProductId AND pv.SizeName = op.SelectedSize
                WHERE o.UserId = @UserId
                AND o.ParentOrderId IS NULL
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'No orders found for this user' });
        }

        const ordersWithParsedImages = result.recordset.map(order => ({
            ...order,
            Images: JSON.parse(order.Images || '[]'),
            SelectedImage: order.FinalImage 
        }));

        res.status(200).json(ordersWithParsedImages);
    } catch (error) {
        console.error('Error fetching orders by UserId:', error);
        res.status(500).json({ error: 'Error fetching orders by UserId' });
    }
});

// router.get('/vendor/:shopId', async (req, res) => {
//     const { shopId } = req.params;

//     try {
//         const pool = await sql.connect(dbConnect);
//         const result = await pool.request()
//             .input('ShopId', sql.UniqueIdentifier, shopId)
//             .query(`
//                 SELECT 
//                     o.Id AS OrderId, 
//                     o.FullName, 
//                     o.Country, 
//                     o.StreetAddressLine1, 
//                     o.StreetAddressLine2, 
//                     o.Province, 
//                     o.City, 
//                     o.ZipCode, 
//                     o.PhoneNumber, 
//                     o.Email, 
//                     o.Amount, 
//                     o.Status, 
//                     o.CreatedAt, 
//                     op.ProductId, 
//                     p.Name AS ProductName, 
//                     ISNULL(
//                         CASE 
//                             WHEN cv.Price IS NOT NULL THEN cv.Price
//                             WHEN pv.SizePrice IS NOT NULL THEN pv.SizePrice
//                             ELSE 0 -- Default to 0 if no variant or color price exists
//                         END, 0
//                     ) AS ProductPrice, 
//                     op.Quantity,
//                     op.SelectedSize,
//                     op.SelectedColor, 
//                     op.SelectedImage
//                 FROM Orders o
//                 LEFT JOIN OrderProducts op ON o.Id = op.OrderId
//                 LEFT JOIN Products p ON op.ProductId = p.Id
//                 LEFT JOIN ProductColorVariants cv ON p.Id = cv.ProductId AND cv.Color = op.SelectedColor
//                 LEFT JOIN (
//                     SELECT 
//                         pv.ProductId, 
//                         JSON_VALUE(size.value, '$.price') AS SizePrice,
//                         JSON_VALUE(size.value, '$.size') AS SizeName
//                     FROM ProductVariants pv
//                     CROSS APPLY OPENJSON(pv.Sizes) AS size
//                 ) pv ON p.Id = pv.ProductId AND pv.SizeName = op.SelectedSize
//                 WHERE o.ShopId = @ShopId
//             `);

//         if (result.recordset.length === 0) {
//             return res.status(404).json({ error: 'No orders found for this shop' });
//         }

//         const ordersWithParsedImages = result.recordset.map(order => ({
//             ...order,
//             Images: JSON.parse(order.Images || '[]'),
//         }));

//         res.status(200).json(ordersWithParsedImages);
//     } catch (error) {
//         console.error('Error fetching orders by ShopId:', error);
//         res.status(500).json({ error: 'Error fetching orders by ShopId' });
//     }
// });
router.get('/vendor/:shopId', async (req, res) => {
    const { shopId } = req.params;

    try {
        const pool = await sql.connect(dbConnect);
        const result = await pool.request()
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .query(`
                SELECT 
                    o.Id AS OrderId, 
                    o.FullName, 
                    o.Country, 
                    o.StreetAddressLine1, 
                    o.StreetAddressLine2, 
                    o.Province, 
                    o.City, 
                    o.ZipCode, 
                    o.PhoneNumber, 
                    o.Email, 
                    o.Amount, 
                    o.Status, 
                    o.CreatedAt, 
                    op.ProductId, 
                    p.Name AS ProductName, 
                    ISNULL(
                        CASE 
                            WHEN cv.Price IS NOT NULL THEN cv.Price
                            WHEN pv.SizePrice IS NOT NULL THEN pv.SizePrice
                            ELSE 0 -- Default to 0 if no variant or color price exists
                        END, 0
                    ) AS ProductPrice, 
                    op.Quantity,
                    op.SelectedSize,
                    op.SelectedColor, 
                    ISNULL(op.SelectedImage, p.Images) AS FinalImage -- Use p.Images if op.SelectedImage is NULL
                FROM Orders o
                LEFT JOIN OrderProducts op ON o.Id = op.OrderId
                LEFT JOIN Products p ON op.ProductId = p.Id
                LEFT JOIN ProductColorVariants cv ON p.Id = cv.ProductId AND cv.Color = op.SelectedColor
                LEFT JOIN (
                    SELECT 
                        pv.ProductId, 
                        JSON_VALUE(size.value, '$.price') AS SizePrice,
                        JSON_VALUE(size.value, '$.size') AS SizeName
                    FROM ProductVariants pv
                    CROSS APPLY OPENJSON(pv.Sizes) AS size
                ) pv ON p.Id = pv.ProductId AND pv.SizeName = op.SelectedSize
                WHERE o.ShopId = @ShopId
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'No orders found for this shop' });
        }

        const ordersWithParsedImages = result.recordset.map(order => ({
            ...order,
            Images: JSON.parse(order.Images || '[]'),
            SelectedImage: order.FinalImage 
        }));

        res.status(200).json(ordersWithParsedImages);
    } catch (error) {
        console.error('Error fetching orders by ShopId:', error);
        res.status(500).json({ error: 'Error fetching orders by ShopId' });
    }
});

// router.get('/vendor/summary/:shopId', async (req, res) => {
//     const { shopId } = req.params;

//     try {
//         const pool = await sql.connect(dbConnect);
//         const result = await pool.request()
//             .input('ShopId', sql.UniqueIdentifier, shopId)
//             .query(`
//                 SELECT 
//                     o.Id AS OrderId,
//                     o.Amount AS OrderAmount,
//                     op.Quantity,
//                     op.SelectedSize,
//                     op.SelectedColor,
//                     p.Name AS ProductName,
//                     ISNULL(cv.Price, ISNULL(pv.SizePrice, 0)) AS ProductPrice,
//                     ISNULL(cv.Expense, ISNULL(pv.SizeExpense, 0)) AS ProductExpense,
//                     p.Images
//                 FROM Orders o
//                 LEFT JOIN OrderProducts op ON o.Id = op.OrderId
//                 LEFT JOIN Products p ON op.ProductId = p.Id
//                 LEFT JOIN ProductColorVariants cv ON p.Id = cv.ProductId AND cv.Color = op.SelectedColor
//                 LEFT JOIN (
//                     SELECT 
//                         pv.ProductId, 
//                         JSON_VALUE(size.value, '$.price') AS SizePrice,
//                         JSON_VALUE(size.value, '$.expense') AS SizeExpense,
//                         JSON_VALUE(size.value, '$.size') AS SizeName
//                     FROM ProductVariants pv
//                     CROSS APPLY OPENJSON(pv.Sizes) AS size
//                 ) pv ON p.Id = pv.ProductId AND pv.SizeName = op.SelectedSize
//                 WHERE o.ShopId = @ShopId AND o.Status = 'delivered'
//             `);

//         if (result.recordset.length === 0) {
//             return res.status(404).json({ error: 'No delivered orders found for this shop' });
//         }

//         let totalRevenue = 0;
//         let totalExpense = 0;

//         result.recordset.forEach(order => {
//             totalRevenue += order.ProductPrice * order.Quantity;
//             totalExpense += order.ProductExpense * order.Quantity;
//         });

//         const summary = {
//             totalRevenue,
//             totalExpense,
//             profit: totalRevenue - totalExpense,
//         };

//         res.status(200).json(summary);
//     } catch (error) {
//         console.error('Error fetching vendor summary:', error);
//         res.status(500).json({ error: 'Error fetching vendor summary' });
//     }
// });
router.get('/vendor/summary/:shopId', async (req, res) => {
    const { shopId } = req.params;

    try {
        const pool = await sql.connect(dbConnect);
        
        const orderDetailsResult = await pool.request()
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .query(`
                SELECT 
                    o.Id AS OrderId,
                    o.Amount AS OrderAmount,
                    op.Quantity,
                    op.SelectedSize,
                    op.SelectedColor,
                    p.Name AS ProductName,
                    ISNULL(cv.Price, ISNULL(pv.SizePrice, 0)) AS ProductPrice,
                    ISNULL(cv.Expense, ISNULL(pv.SizeExpense, 0)) AS ProductExpense,
                    p.Images
                FROM Orders o
                LEFT JOIN OrderProducts op ON o.Id = op.OrderId
                LEFT JOIN Products p ON op.ProductId = p.Id
                LEFT JOIN ProductColorVariants cv ON p.Id = cv.ProductId AND cv.Color = op.SelectedColor
                LEFT JOIN (
                    SELECT 
                        pv.ProductId, 
                        JSON_VALUE(size.value, '$.price') AS SizePrice,
                        JSON_VALUE(size.value, '$.expense') AS SizeExpense,
                        JSON_VALUE(size.value, '$.size') AS SizeName
                    FROM ProductVariants pv
                    CROSS APPLY OPENJSON(pv.Sizes) AS size
                ) pv ON p.Id = pv.ProductId AND pv.SizeName = op.SelectedSize
                WHERE o.ShopId = @ShopId AND o.Status = 'delivered'
            `);

        const totalOrdersResult = await pool.request()
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .query(`
                SELECT COUNT(*) AS TotalOrders
                FROM Orders
                WHERE ShopId = @ShopId AND Status = 'delivered'
            `);

        let totalRevenue = 0;
        let totalExpense = 0;

        orderDetailsResult.recordset.forEach(order => {
            totalRevenue += order.ProductPrice * order.Quantity;
            totalExpense += order.ProductExpense * order.Quantity;
        });

        const summary = {
            totalRevenue,
            totalExpense,
            profit: totalRevenue - totalExpense,
            totalOrders: totalOrdersResult.recordset[0].TotalOrders,
        };

        res.status(200).json(summary);
    } catch (error) {
        console.error('Error fetching vendor summary:', error);
        res.status(500).json({ error: 'Error fetching vendor summary' });
    }
});

router.get('/vendor/daily-weekly-summary/:shopId', async (req, res) => {
    const { shopId } = req.params;
    const { startDate, endDate, type } = req.query;

    try {
        const pool = await sql.connect(dbConnect);
        const getCurrentDate = new Date().toISOString().split('T')[0];

        let currentDayData = [];
        let currentWeekData = [];

        if (type === 'daily') {
            const dateForQuery = startDate || getCurrentDate;

            const dailyResult = await pool.request()
                .input('ShopId', sql.UniqueIdentifier, shopId)
                .input('SelectedDate', sql.Date, dateForQuery)
                .query(`
                    SELECT 
                        CAST(o.CreatedAt AS DATE) AS Date,
                        COUNT(o.Id) AS TotalOrders,
                        SUM(op.Quantity * 
                            ISNULL(cv.Price, ISNULL(pv.SizePrice, 0))
                        ) AS TotalRevenue,
                        SUM(op.Quantity * 
                            ISNULL(cv.Expense, ISNULL(pv.SizeExpense, 0))
                        ) AS TotalExpense
                    FROM Orders o
                    LEFT JOIN OrderProducts op ON o.Id = op.OrderId
                    LEFT JOIN Products p ON op.ProductId = p.Id
                    LEFT JOIN ProductColorVariants cv ON p.Id = cv.ProductId AND cv.Color = op.SelectedColor
                    LEFT JOIN (
                        SELECT 
                            pv.ProductId, 
                            JSON_VALUE(size.value, '$.price') AS SizePrice,
                            JSON_VALUE(size.value, '$.expense') AS SizeExpense,
                            JSON_VALUE(size.value, '$.size') AS SizeName
                        FROM ProductVariants pv
                        CROSS APPLY OPENJSON(pv.Sizes) AS size
                    ) pv ON p.Id = pv.ProductId AND pv.SizeName = op.SelectedSize
                    WHERE o.ShopId = @ShopId AND CAST(o.CreatedAt AS DATE) = @SelectedDate AND o.Status = 'delivered'
                    GROUP BY CAST(o.CreatedAt AS DATE)
                `);

            currentDayData = dailyResult.recordset.map(row => ({
                date: row.Date,
                totalOrders: row.TotalOrders,
                totalRevenue: row.TotalRevenue,
                totalExpense: row.TotalExpense,
                profit: row.TotalRevenue - row.TotalExpense,
            }));
        } else if (type === 'weekly') {
            const startOfWeek = startDate || getCurrentDate;
            const endOfWeek = endDate || getCurrentDate;

            const weeklyResult = await pool.request()
                .input('ShopId', sql.UniqueIdentifier, shopId)
                .input('StartOfWeek', sql.Date, startOfWeek)
                .input('EndOfWeek', sql.Date, endOfWeek)
                .query(`
                    SELECT 
                        DATEPART(WEEK, o.CreatedAt) AS Week,
                        COUNT(o.Id) AS TotalOrders,
                        SUM(op.Quantity * 
                            ISNULL(cv.Price, ISNULL(pv.SizePrice, 0))
                        ) AS TotalRevenue,
                        SUM(op.Quantity * 
                            ISNULL(cv.Expense, ISNULL(pv.SizeExpense, 0))
                        ) AS TotalExpense
                    FROM Orders o
                    LEFT JOIN OrderProducts op ON o.Id = op.OrderId
                    LEFT JOIN Products p ON op.ProductId = p.Id
                    LEFT JOIN ProductColorVariants cv ON p.Id = cv.ProductId AND cv.Color = op.SelectedColor
                    LEFT JOIN (
                        SELECT 
                            pv.ProductId, 
                            JSON_VALUE(size.value, '$.price') AS SizePrice,
                            JSON_VALUE(size.value, '$.expense') AS SizeExpense,
                            JSON_VALUE(size.value, '$.size') AS SizeName
                        FROM ProductVariants pv
                        CROSS APPLY OPENJSON(pv.Sizes) AS size
                    ) pv ON p.Id = pv.ProductId AND pv.SizeName = op.SelectedSize
                    WHERE o.ShopId = @ShopId AND o.CreatedAt BETWEEN @StartOfWeek AND @EndOfWeek AND o.Status = 'delivered'
                    GROUP BY DATEPART(WEEK, o.CreatedAt)
                `);

            currentWeekData = weeklyResult.recordset.map(row => ({
                week: row.Week,
                totalOrders: row.TotalOrders,
                totalRevenue: row.TotalRevenue,
                totalExpense: row.TotalExpense,
                profit: row.TotalRevenue - row.TotalExpense,
            }));
        }

        res.status(200).json({ currentDayData, currentWeekData });
    } catch (error) {
        console.error('Error fetching daily and weekly summary:', error);
        res.status(500).json({ error: 'Error fetching daily and weekly summary' });
    }
});

router.get('/vendor/monthly-summary/:shopId', async (req, res) => {
    const { shopId } = req.params;

    try {
        const pool = await sql.connect(dbConnect);
        const result = await pool.request()
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .query(`
                SELECT 
                    MONTH(o.CreatedAt) AS Month,
                    SUM(op.Quantity * 
                        ISNULL(cv.Price, ISNULL(pv.SizePrice, 0))
                    ) AS TotalIncome,
                    SUM(op.Quantity * 
                        ISNULL(cv.Expense, ISNULL(pv.SizeExpense, 0))
                    ) AS TotalExpense
                FROM Orders o
                LEFT JOIN OrderProducts op ON o.Id = op.OrderId
                LEFT JOIN Products p ON op.ProductId = p.Id
                LEFT JOIN ProductColorVariants cv ON p.Id = cv.ProductId AND cv.Color = op.SelectedColor
                LEFT JOIN (
                    SELECT 
                        pv.ProductId, 
                        JSON_VALUE(size.value, '$.price') AS SizePrice,
                        JSON_VALUE(size.value, '$.expense') AS SizeExpense,
                        JSON_VALUE(size.value, '$.size') AS SizeName
                    FROM ProductVariants pv
                    CROSS APPLY OPENJSON(pv.Sizes) AS size
                ) pv ON p.Id = pv.ProductId AND pv.SizeName = op.SelectedSize
                WHERE o.ShopId = @ShopId AND o.Status = 'delivered'
                GROUP BY MONTH(o.CreatedAt)
                ORDER BY Month
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'No delivered orders found for this shop' });
        }

        const monthlyData = result.recordset.map(row => ({
            name: new Date(0, row.Month - 1).toLocaleString('en', { month: 'short' }),
            Expense: row.TotalExpense,
            Profit: row.TotalIncome - row.TotalExpense,
        }));

        res.status(200).json(monthlyData);
    } catch (error) {
        console.error('Error fetching monthly summary:', error);
        res.status(500).json({ error: 'Error fetching monthly summary' });
    }
});

router.patch('/vendor/order/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid order status' });
    }

    try {
        const pool = await sql.connect(dbConnect);
        const result = await pool.request()
            .input('OrderId', sql.UniqueIdentifier, orderId)
            .input('Status', sql.VarChar, status)
            .input('UpdatedAt', sql.DateTime, new Date())
            .query(`
                UPDATE Orders
                SET Status = @Status, UpdatedAt = @UpdatedAt
                WHERE Id = @OrderId
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.status(200).json({ message: 'Order status and UpdatedAt column updated successfully' });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Error updating order status' });
    }
});

router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await sql.connect(dbConnect);

        const deleteOrderProductsQuery = `DELETE FROM OrderProducts WHERE OrderId = @OrderId`;
        await pool.request().input('OrderId', sql.UniqueIdentifier, id).query(deleteOrderProductsQuery);

        const deleteOrderQuery = `DELETE FROM Orders WHERE Id = @Id`;
        await pool.request().input('Id', sql.UniqueIdentifier, id).query(deleteOrderQuery);

        res.status(200).json({ message: 'Order deleted successfully' });
    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({ error: 'Error deleting order' });
    }
});


export default router;

import express from 'express';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';
import createOrderCancellationsTable from '../tables/ordercancellation.js';

const router = express.Router();
const isValidUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  };

router.post('/orders/:orderId/cancel', async (req, res) => {
    const { orderId } = req.params
    const { userId, reason } = req.body;

    console.log('order id', orderId)
    if (!isValidUUID(orderId)) {
        return res.status(400).json({ error: 'Invalid id format' });
      }
    if (!userId || !reason) {
        return res.status(400).json({ message: 'User ID and reason for cancellation are required.' });
    }

    try {
        const pool = await sql.connect(dbConnect);
        await createOrderCancellationsTable();
        const orderQuery = `
            SELECT Id, Status FROM Orders 
            WHERE Id = @OrderId AND UserId = @UserId AND Status IN ('pending', 'confirmed');
        `;
        const orderResult = await pool.request()
            .input('OrderId', sql.UniqueIdentifier, orderId)
            .input('UserId', sql.UniqueIdentifier, userId)
            .query(orderQuery);

        if (orderResult.recordset.length === 0) {
            return res.status(403).json({ message: 'Order cannot be canceled. Ensure it belongs to you and has a status of pending or confirmed.' });
        }

        // Insert the cancellation request into OrderCancellations table
        const insertCancellationQuery = `
            INSERT INTO OrderCancellations (OrderId, UserId, Reason)
            VALUES (@OrderId, @UserId, @Reason);
        `;
        await pool.request()
            .input('OrderId', sql.UniqueIdentifier, orderId)
            .input('UserId', sql.UniqueIdentifier, userId)
            .input('Reason', sql.NVarChar(500), reason)
            .query(insertCancellationQuery);

        // Update order status to canceled
        const updateOrderQuery = `
            UPDATE Orders
            SET Status = 'canceled'
            WHERE Id = @OrderId;
        `;
        await pool.request()
            .input('OrderId', sql.UniqueIdentifier, orderId)
            .query(updateOrderQuery);

        res.status(200).json({ message: 'Order cancellation requested successfully.' });
    } catch (error) {
        console.error('Error submitting cancellation request:', error);
        res.status(500).json({ message: 'Error submitting cancellation request.' });
    }
});

router.get('/:userId', async (req, res) => {
    const { userId } = req.params;
    const { orderId } = req.query; 

    try {
        const pool = await sql.connect(dbConnect);
        const getCancellationsQuery = `
            SELECT c.Id, c.OrderId, c.UserId, c.Reason, c.CreatedAt, c.Status,
                   o.Amount AS OrderAmount, o.Status AS OrderStatus,
                   u.Name AS UserName, u.Email AS UserEmail
            FROM OrderCancellations c
            JOIN Orders o ON c.OrderId = o.Id
            JOIN Users u ON c.UserId = u.Id
            WHERE c.UserId = @userId
            ${orderId ? "AND c.OrderId = @orderId" : ""}
            ORDER BY c.CreatedAt DESC;
        `;

        const request = pool.request();
        request.input('userId', sql.UniqueIdentifier, userId);

        if (orderId) {
            request.input('orderId', sql.UniqueIdentifier, orderId);
        }

        const cancellationResult = await request.query(getCancellationsQuery);

        const cancellations = cancellationResult.recordset;

        for (const cancellation of cancellations) {
            const getOrderProductsQuery = `
                SELECT op.OrderId, op.ProductId, op.Quantity, op.SelectedSize, 
                       op.SelectedColor, op.ShopId, op.SelectedImage,
                       p.Name AS ProductName
                FROM OrderProducts op
                JOIN Products p ON op.ProductId = p.Id
                WHERE op.OrderId = @orderId;
            `;

            const productRequest = pool.request();
            productRequest.input('orderId', sql.UniqueIdentifier, cancellation.OrderId);

            const productResult = await productRequest.query(getOrderProductsQuery);

            cancellation.Products = productResult.recordset;
        }

        res.status(200).json(cancellations);
    } catch (error) {
        console.error('Error fetching cancellations:', error);
        res.status(500).json({ message: 'Error fetching cancellations.' });
    }
});


export default router;

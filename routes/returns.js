
import express from 'express';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

const router = express.Router();

router.post('/orders/:orderId/return', async (req, res) => {
    const { orderId } = req.params;
    const { userId, reason, otherReason } = req.body;

    if (!userId || !reason) {
        return res.status(400).json({ message: 'User ID and reason for return are required.' });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const orderQuery = `
            SELECT Id, Status, UpdatedAt FROM Orders 
            WHERE Id = @OrderId AND UserId = @UserId AND Status = 'delivered';
        `;
        const orderResult = await pool.request()
            .input('OrderId', sql.UniqueIdentifier, orderId)
            .input('UserId', sql.UniqueIdentifier, userId)
            .query(orderQuery);

        if (orderResult.recordset.length === 0) {
            return res.status(403).json({ message: 'Return request denied. Ensure the order is delivered and belongs to you.' });
        }

        const { UpdatedAt } = orderResult.recordset[0];
        const dayDifference = Math.floor((new Date() - new Date(UpdatedAt)) / (1000 * 60 * 60 * 24));
        if (dayDifference > 7) {
            return res.status(403).json({ message: 'Return request denied. The return period has expired.' });
        }

        const insertReturnQuery = `
            INSERT INTO Returns (OrderId, UserId, Reason, OtherReason, Status)
            VALUES (@OrderId, @UserId, @Reason, @OtherReason, 'Pending');
        `;
        await pool.request()
            .input('OrderId', sql.UniqueIdentifier, orderId)
            .input('UserId', sql.UniqueIdentifier, userId)
            .input('Reason', sql.NVarChar(500), reason)
            .input('OtherReason', sql.NVarChar(500), otherReason || null)
            .query(insertReturnQuery);

        res.status(200).json({ message: 'Return request submitted successfully.' });
    } catch (error) {
        console.error('Error submitting return request:', error);
        res.status(500).json({ message: 'Error submitting return request.' });
    }
});

router.put('/return/:returnId/update', async (req, res) => {
    const { returnId } = req.params;
    const { status, vendorComments } = req.body;

    if (!['Approved', 'Denied'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status. Please provide either "Approved" or "Denied".' });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const updateReturnQuery = `
            UPDATE Returns
            SET Status = @Status, VendorComments = @VendorComments, UpdatedAt = GETDATE()
            WHERE Id = @ReturnId;
        `;
        await pool.request()
            .input('Status', sql.NVarChar(50), status)
            .input('VendorComments', sql.NVarChar(500), vendorComments || null)
            .input('ReturnId', sql.UniqueIdentifier, returnId)
            .query(updateReturnQuery);

        if (status === 'Approved') {
            const updateOrderStatusQuery = `
                UPDATE Orders
                SET Status = 'return', UpdatedAt = GETDATE()
                WHERE Id = (
                    SELECT OrderId FROM Returns WHERE Id = @ReturnId
                ) AND Status = 'delivered';
            `;
            const result = await pool.request()
                .input('ReturnId', sql.UniqueIdentifier, returnId)
                .query(updateOrderStatusQuery);

            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({ message: 'Order not found or not eligible for status update.' });
            }
        }

        res.status(200).json({ message: `Return request ${status.toLowerCase()} successfully.` });
    } catch (error) {
        console.error('Error updating return request status:', error);
        res.status(500).json({ message: 'Error updating return request status.' });
    }
});

router.get('/', async (req, res) => {
    try {
        const pool = await sql.connect(dbConnect);
        
        const getReturnsQuery = `
            SELECT r.Id, r.OrderId, r.UserId, r.Reason, r.OtherReason, r.Status, 
                   r.VendorComments, r.RequestedAt, r.UpdatedAt,
                   o.Amount AS OrderAmount, o.Status AS OrderStatus, 
                   u.Name AS UserName, u.Email AS UserEmail
            FROM Returns r
            JOIN Orders o ON r.OrderId = o.Id
            JOIN Users u ON r.UserId = u.Id
            ORDER BY r.RequestedAt DESC;
        `;

        const result = await pool.request().query(getReturnsQuery);

        const returns = result.recordset.map(returnItem => ({
            Id: returnItem.Id,
            OrderId: returnItem.OrderId,
            UserId: returnItem.UserId,
            Reason: returnItem.Reason,
            OtherReason: returnItem.OtherReason,
            Status: returnItem.Status,
            VendorComments: returnItem.VendorComments,
            RequestedAt: returnItem.RequestedAt,
            UpdatedAt: returnItem.UpdatedAt,
            OrderAmount: returnItem.OrderAmount,
            OrderStatus: returnItem.OrderStatus,
            UserName: returnItem.UserName,
            UserEmail: returnItem.UserEmail
        }));

        res.status(200).json(returns);
    } catch (error) {
        console.error('Error fetching return requests:', error);
        res.status(500).json({ message: 'Error fetching return requests.' });
    }
});

router.get('/:userId', async (req, res) => {
    const { userId } = req.params;
    const { orderId } = req.query; 

    try {
        const pool = await sql.connect(dbConnect);

        const getReturnsQuery = `
            SELECT r.Id, r.OrderId, r.UserId, r.Reason, r.OtherReason, r.Status, 
                   r.VendorComments, r.RequestedAt, r.UpdatedAt,
                   o.Amount AS OrderAmount, o.Status AS OrderStatus, 
                   u.Name AS UserName, u.Email AS UserEmail
            FROM Returns r
            JOIN Orders o ON r.OrderId = o.Id
            JOIN Users u ON r.UserId = u.Id
            WHERE r.UserId = @userId
            ${orderId ? "AND r.OrderId = @orderId" : ""}
            ORDER BY r.RequestedAt DESC;
        `;

        const request = pool.request();
        request.input('userId', sql.UniqueIdentifier, userId);

        if (orderId) {
            request.input('orderId', sql.UniqueIdentifier, orderId);
        }

        const returnResult = await request.query(getReturnsQuery);

        const returns = returnResult.recordset;

        for (const returnItem of returns) {
            const getOrderProductsQuery = `
                SELECT op.OrderId, op.ProductId, op.Quantity, op.SelectedSize, 
                       op.SelectedColor, op.ShopId, op.SelectedImage,
                       p.Name AS ProductName
                FROM OrderProducts op
                JOIN Products p ON op.ProductId = p.Id
                WHERE op.OrderId = @orderId;
            `;

            const productRequest = pool.request();
            productRequest.input('orderId', sql.UniqueIdentifier, returnItem.OrderId);

            const productResult = await productRequest.query(getOrderProductsQuery);

            returnItem.Products = productResult.recordset; 
        }

        res.status(200).json(returns);
    } catch (error) {
        console.error('Error fetching return requests:', error);
        res.status(500).json({ message: 'Error fetching return requests.' });
    }
});


export default router
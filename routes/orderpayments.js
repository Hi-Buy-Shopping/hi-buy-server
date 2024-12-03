import express from 'express';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

const router = express.Router();

const isValidUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
};

router.get('/vendor/:shopId/orders', async (req, res) => {
    const { shopId } = req.params;

    try {
        const pool = await sql.connect(dbConnect);

        const result = await pool.request()
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .query(`
                SELECT 
                    v.ShopId,
                    COALESCE(SUM(o.Amount), 0) AS TotalOrderAmount,  -- Total amount before deduction
                    COALESCE(SUM(o.Amount * 0.92), 0) AS PayableAmount -- Amount after 8% deduction
                FROM 
                    VendorPayments v
                LEFT JOIN 
                    Orders o ON v.ShopId = o.ShopId AND o.Status = 'delivered'
                WHERE 
                    v.ShopId = @ShopId
                GROUP BY 
                    v.ShopId;
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No orders found for this vendor." });
        }

        const paymentDetails = result.recordset[0];

        // Respond with the details
        res.status(200).json({
            shopId: paymentDetails.ShopId,
            totalOrderAmount: paymentDetails.TotalOrderAmount, // Total amount before deduction
            payableAmount: paymentDetails.PayableAmount,       // Amount after deduction
        });
    } catch (err) {
        console.error("Error fetching vendor order details:", err);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

router.post('/admin/vendor-payments', async (req, res) => {
    const { shopId, totalAmount, orderId } = req.body;
    if (!isValidUUID(shopId || orderId)) {
        return res.status(400).json({ message:"Invalid Id format" });
    }

    if (!shopId || !totalAmount || isNaN(totalAmount) || !orderId) {
        return res.status(400).json({ message: "Invalid input. ShopId, OrderId, and TotalAmount are required." });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const orderResult = await pool.request()
            .input('OrderId', sql.UniqueIdentifier, orderId)
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .query(`
                SELECT Amount, PaymentStatus, Status 
                FROM Orders 
                WHERE Id = @OrderId AND ShopId = @ShopId;
            `);

        const order = orderResult.recordset[0];

        if (!order) {
            return res.status(404).json({ message: "Order not found or does not belong to the specified ShopId." });
        }

        if (order.Status !== 'delivered') {
            return res.status(400).json({ message: "Payments can only be added for orders with status 'Delivered'." });
        }

        if (order.Amount !== parseFloat(totalAmount)) {
            return res.status(400).json({ message: "Entered TotalAmount does not match the order amount." });
        }

        if (order.PaymentStatus === 'Assign') {
            return res.status(400).json({ message: "Payment for this order has already been assigned." });
        }

        await pool.request()
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .input('TotalAmount', sql.Decimal(18, 2), totalAmount)
            .query(`
                INSERT INTO VendorPayments (ShopId, TotalAmount, PaidAmount, LastUpdated)
                VALUES (@ShopId, @TotalAmount, 0, GETDATE());
            `);

        await pool.request()
            .input('OrderId', sql.UniqueIdentifier, orderId)
            .query(`
                UPDATE Orders
                SET PaymentStatus = 'Assign'
                WHERE Id = @OrderId;
            `);

        res.status(200).json({ message: "Vendor payment record added successfully, and order payment status updated." });
    } catch (err) {
        console.error("Error processing vendor payment:", err);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

router.get('/admin/unpaid-orders', async (req, res) => {
    try {
        const pool = await sql.connect(dbConnect);

        const result = await pool.request()
            .query(`
                SELECT Id AS OrderId, ShopId, Amount, Status, PaymentStatus
                FROM Orders
                WHERE ShopId IS NOT NULL
                  AND Status = 'delivered'
                  AND PaymentStatus = 'Unpaid';
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No unpaid delivered orders found for any ShopId." });
        }

        res.status(200).json({
            message: "Unpaid delivered orders retrieved successfully.",
            orders: result.recordset,
        });
    } catch (err) {
        console.error("Error fetching orders:", err);
        res.status(500).json({ message: "Internal Server Error" });
    }
});


export default router;

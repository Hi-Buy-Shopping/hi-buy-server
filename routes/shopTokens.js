import express from 'express'
const router = express.Router();
import sql from 'mssql'
import { dbConnect } from '../database/dbConfig.js';

// router.post('/save-token', async (req, res) => {
//     const { shopId, token } = req.body;
//     try {
//         const pool = await sql.connect(dbConnect);
//         const query = `
//       INSERT INTO ShopTokens (ShopId, DeviceToken) 
//       VALUES (@shopId, @token)
//     `;
//         await pool.request()
//             .input('ShopId', sql.UniqueIdentifier, shopId)
//             .input('DeviceToken', sql.NVarChar, token)
//             .query(query);
//         return res.status(201).json({ success: true, message: 'Token saved successfully!' });
//     } catch (error) {
//         console.error(error);
//         res.status(500).send('Error saving token');
//     }
// });
router.post('/save-token', async (req, res) => {
    const { shopId, token } = req.body;

    // Validate inputs
    if (!shopId || !token) {
        return res.status(400).json({ success: false, message: 'ShopId and token are required' });
    }

    try {
        console.log('ShopId:', shopId);
        console.log('DeviceToken:', token);

        const pool = await sql.connect(dbConnect);
        const query = `
          INSERT INTO ShopTokens (ShopId, DeviceToken) 
          VALUES (@ShopId, @DeviceToken)
        `;

        await pool.request()
            .input('ShopId', sql.UniqueIdentifier, shopId) 
            .input('DeviceToken', sql.NVarChar(sql.MAX), token) 
            .query(query);

        return res.status(201).json({ success: true, message: 'Token saved successfully!' });
    } catch (error) {
        console.error('Database Error:', error);
        res.status(500).json({ success: false, message: 'Error saving token' });
    }
});

export default router;

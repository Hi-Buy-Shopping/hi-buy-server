import express from 'express'
const router = express.Router();
import sql from 'mssql'
import { dbConnect } from '../database/dbConfig.js';

router.post('/save-token', async (req, res) => {
    const { shopId, token } = req.body;
    try {
        const pool = await sql.connect(dbConnect);
        const query = `
      INSERT INTO ShopTokens (ShopId, DeviceToken) 
      VALUES (@shopId, @token)
    `;
        await pool.request()
            .input('ShopId', sql.UniqueIdentifier, shopId)
            .input('DeviceToken', sql.NVarChar, token)
            .query(query);
        return res.status(201).json({ success: true, message: 'Token saved successfully!' });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error saving token');
    }
});

export default router;

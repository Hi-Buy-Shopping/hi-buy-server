import express from 'express';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

const router = express.Router();

router.get('/address', async (req, res) => {
    const { email } = req.query;

    if (!email) return res.status(400).json({ message: "Email is required" });

    try {
        const pool = await sql.connect(dbConnect);

        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query(`
                SELECT 
                    u.Name, u.Phone, u.Email,
                    a.streetAddressLine1, a.streetAddressLine2, a.city, a.state, a.zipCode
                FROM Users u
                LEFT JOIN addresses a ON u.Id = a.userId
                WHERE u.Email = @email
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json(result.recordset[0]);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});


router.post('/create', async (req, res) => {
    const { email, streetAddressLine1, streetAddressLine2, city, state, zipCode } = req.body;
    console.log(req.body)

    if (!email || !streetAddressLine1 || !city || !state || !zipCode) {
        return res.status(400).json({ message: "All required fields must be provided" });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const userResult = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT Id FROM Users WHERE Email = @email');

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        const userId = userResult.recordset[0].Id;

        await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('streetAddressLine1', sql.NVarChar, streetAddressLine1)
            .input('streetAddressLine2', sql.NVarChar, streetAddressLine2 || null)
            .input('city', sql.NVarChar, city)
            .input('state', sql.NVarChar, state)
            .input('zipCode', sql.NVarChar, zipCode)
            .query(`
                INSERT INTO addresses (userId, streetAddressLine1, streetAddressLine2, city, state, zipCode)
                VALUES (@userId, @streetAddressLine1, @streetAddressLine2, @city, @state, @zipCode)
            `);

        return res.status(201).json({ message: "Address created successfully" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});


router.put('/edit', async (req, res) => {
    const { email, streetAddressLine1, streetAddressLine2, city, state, zipCode } = req.body;

    if (!email || !streetAddressLine1 || !city || !state || !zipCode) {
        return res.status(400).json({ message: "All required fields must be provided" });
    }

    try {
        const pool = await sql.connect(dbConnect);

        const userResult = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT Id FROM Users WHERE Email = @email');

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        const userId = userResult.recordset[0].Id;

        await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('streetAddressLine1', sql.NVarChar, streetAddressLine1)
            .input('streetAddressLine2', sql.NVarChar, streetAddressLine2 || null)
            .input('city', sql.NVarChar, city)
            .input('state', sql.NVarChar, state)
            .input('zipCode', sql.NVarChar, zipCode)
            .query(`
                UPDATE addresses
                SET streetAddressLine1 = @streetAddressLine1,
                    streetAddressLine2 = @streetAddressLine2,
                    city = @city,
                    state = @state,
                    zipCode = @zipCode
                WHERE userId = @userId
            `);

        return res.status(201).json({ message: "Address updated successfully" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});


export default router
import express from 'express';
import multer from 'multer';
import cloudinary from 'cloudinary';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import createVendorsBankDetailsTable from '../tables/vendorsBankDetails.js';

const router = express.Router();

cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_CLOUD_KEY,
    api_secret: process.env.CLOUDINARY_CLOUD_SECRET,
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary.v2,
    params: {
        folder: 'vendors_bank_details',
        allowedFormats: ['jpg', 'png', 'jpeg'],
    },
});

const upload = multer({ storage });

router.post('/create', upload.single('chequeBookImage'), async (req, res) => {
    try {
        const { shopId, bankName, branchCode, accountNumber, iban, accountTitle } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'Please upload a cheque book image.' });
        }
        createVendorsBankDetailsTable();
        const chequeBookImageUrl = req.file.path;
        const pool = await sql.connect(dbConnect);

        const insertQuery = `
            INSERT INTO VendorsBankDetails (ShopId, BankName, BranchCode, AccountNumber, IBAN, AccountTitle, ChequeBookImage, CreatedAt, UpdatedAt)
            VALUES (@shopId, @bankName, @branchCode, @accountNumber, @iban, @accountTitle, @chequeBookImage, GETDATE(), GETDATE());
        `;

        await pool.request()
            .input('shopId', sql.UniqueIdentifier, shopId)
            .input('bankName', sql.NVarChar, bankName)
            .input('branchCode', sql.NVarChar, branchCode)
            .input('accountNumber', sql.NVarChar, accountNumber)
            .input('iban', sql.NVarChar, iban)
            .input('accountTitle', sql.NVarChar, accountTitle)
            .input('chequeBookImage', sql.NVarChar, chequeBookImageUrl)
            .query(insertQuery);

        res.status(201).json({ success: true, message: 'Vendor bank details created successfully!' });
    } catch (error) {
        console.error('Error creating vendor bank details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/shop/:shopId', async (req, res) => {
    const { shopId } = req.params;

    try {
        const pool = await sql.connect(dbConnect);
        const result = await pool.request()
            .input('shopId', sql.UniqueIdentifier, shopId)
            .query('SELECT * FROM VendorsBankDetails WHERE ShopId = @shopId');

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'No bank details found for the provided Shop ID.' });
        }

        res.status(200).json(result.recordset);
    } catch (error) {
        console.error('Error fetching vendor bank details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await sql.connect(dbConnect);
        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .query('SELECT * FROM VendorsBankDetails WHERE Id = @id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Vendor bank details not found.' });
        }

        res.status(200).json(result.recordset[0]);
    } catch (error) {
        console.error('Error fetching vendor bank details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.put('/:id', upload.single('chequeBookImage'), async (req, res) => {
    const { id } = req.params;
    const { bankName, branchCode, accountNumber, iban, accountTitle } = req.body;

    try {
        const pool = await sql.connect(dbConnect);

        let chequeBookImageUrl = req.body.chequeBookImage;
        if (req.file) {
            chequeBookImageUrl = req.file.path;
        }

        const updateQuery = `
            UPDATE VendorsBankDetails
            SET BankName = @bankName, BranchCode = @branchCode, AccountNumber = @accountNumber,
                IBAN = @iban, AccountTitle = @accountTitle, ChequeBookImage = @chequeBookImage,
                UpdatedAt = GETDATE()
            WHERE Id = @id;
        `;

        await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .input('bankName', sql.NVarChar, bankName)
            .input('branchCode', sql.NVarChar, branchCode)
            .input('accountNumber', sql.NVarChar, accountNumber)
            .input('iban', sql.NVarChar, iban)
            .input('accountTitle', sql.NVarChar, accountTitle)
            .input('chequeBookImage', sql.NVarChar, chequeBookImageUrl)
            .query(updateQuery);

        res.status(200).json({ success: true, message: 'Vendor bank details updated successfully!' });
    } catch (error) {
        console.error('Error updating vendor bank details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await sql.connect(dbConnect);

        const deleteQuery = `
            DELETE FROM VendorsBankDetails WHERE Id = @id;
        `;

        await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .query(deleteQuery);

        res.status(200).json({ success: true, message: 'Vendor bank details deleted successfully!' });
    } catch (error) {
        console.error('Error deleting vendor bank details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;

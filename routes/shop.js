import express from "express";
import { dbConnect, sql } from "../database/dbConfig.js";
import cloudinary from 'cloudinary';
import multer from 'multer';
import { verifyModifyEmail } from "../helper/verifyModifyEmail.js";

const isValidUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
};

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_CLOUD_KEY,
    api_secret: process.env.CLOUDINARY_CLOUD_SECRET
});

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}


function getCloudinaryPublicId(url) {
    const parts = url.split('/');
    const lastPart = parts[parts.length - 1];
    const publicId = lastPart.split('.')[0];
    return `shops/${publicId}`;
}

router.get('/', async (req, res) => {
    try {
        const pool = await sql.connect(dbConnect);
        const selectQueery = `SELECT * FROM Shops`
        const result = await pool.request().query(selectQueery)
        return res.status(200).json(result.recordset[0])
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Internal server error" })
    }
})

router.get('/:id', async (req, res) => {
    try {
        const pool = await sql.connect(dbConnect);
        const { id } = req.params;

        if (!isValidUUID(id)) {
            return res.status(400).json({ error: 'Invalid id format' });
        }

        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .query(`
                SELECT 
                    Shops.*, 
                    Users.Name AS OwnerName,
                    Users.FollowedShops AS FollowedShops
                FROM 
                    Shops
                LEFT JOIN 
                    Users 
                ON 
                    Shops.OwnerId = Users.Id
                WHERE 
                    Shops.Id = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Shop not found' });
        }

        return res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Error fetching shop details by ID:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/:id', upload.fields([{ name: 'logo' }, { name: 'coverImage' }]), async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidUUID(id)) {
            return res.status(400).json({ error: 'Invalid id format' });
        }
        const { shopname } = req.body;
        const logoFile = req.files && req.files['logo'] ? req.files['logo'][0] : null;
        const coverImageFile = req.files && req.files['coverImage'] ? req.files['coverImage'][0] : null;

        const pool = await sql.connect(dbConnect);

        const shopsQuery = `SELECT Name, Logo, CoverImage FROM Shops WHERE Id = @id`;
        const currentUser = await pool.request()
            .input("id", sql.UniqueIdentifier, id)
            .query(shopsQuery);

        if (currentUser.recordset.length === 0) {
            return res.status(404).json({ message: "Shop not found" });
        }

        const existingLogo = currentUser.recordset[0].Logo;
        const existingCoverImage = currentUser.recordset[0].CoverImage;

        if (logoFile && existingLogo) {
            const logoPublicId = getCloudinaryPublicId(existingLogo);
            await cloudinary.uploader.destroy(logoPublicId);
        }

        if (coverImageFile && existingCoverImage) {
            const coverImagePublicId = getCloudinaryPublicId(existingCoverImage);
            await cloudinary.uploader.destroy(coverImagePublicId);
        }

        let newLogoUrl = existingLogo;
        if (logoFile) {
            const logoUpload = await cloudinary.uploader.upload(
                `data:${logoFile.mimetype};base64,${logoFile.buffer.toString('base64')}`,
                { folder: "shops/logos" }
            );
            newLogoUrl = logoUpload.secure_url;
        }

        let newCoverImageUrl = existingCoverImage;
        if (coverImageFile) {
            const coverImageUpload = await cloudinary.uploader.upload(
                `data:${coverImageFile.mimetype};base64,${coverImageFile.buffer.toString('base64')}`,
                { folder: "shops/coverImages" }
            );
            newCoverImageUrl = coverImageUpload.secure_url;
        }

        let updateFields = [];
        if (shopname) updateFields.push("Name = @shopname");
        if (logoFile) updateFields.push("Logo = @logo");
        if (coverImageFile) updateFields.push("CoverImage = @coverImage");

        if (updateFields.length === 0) {
            return res.status(400).json({ message: "No fields provided for update" });
        }

        const updateQuery = `UPDATE Shops SET ${updateFields.join(", ")} WHERE Id = @id`;

        const request = pool.request().input("id", sql.UniqueIdentifier, id);
        if (shopname) request.input("shopname", sql.NVarChar, shopname);
        if (logoFile) request.input("logo", sql.NVarChar, newLogoUrl);
        if (coverImageFile) request.input("coverImage", sql.NVarChar, newCoverImageUrl);

        const result = await request.query(updateQuery);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Shop not found" });
        }

        return res.status(200).json({ message: "Shop details updated successfully" });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

router.post('/verify-modify-email', async (req, res) => {
    const { email } = req.body;

    try {
        const pool = await sql.connect(dbConnect);

        const userResult = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM Shops WHERE Email = @Email');

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }

        const user = userResult.recordset[0];

        const newVerifyCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiryDate = new Date();
        expiryDate.setHours(expiryDate.getHours() + 1); 

        await pool.request()
            .input('verifyCode', sql.NVarChar, newVerifyCode)
            .input('verifyCodeExpiry', sql.DateTime, expiryDate)
            .input('email', sql.NVarChar, email)
            .query('UPDATE Shops SET VerifyCode = @VerifyCode, VerifyCodeExpiry = @VerifyCodeExpiry WHERE Email = @Email');

        
        await verifyModifyEmail(email, user.Name, newVerifyCode);

        return res.status(200).json({
            success: true,
            message: 'A new reset code has been sent to your email.'
        });

    } catch (error) {
        console.error('Error during resend-reset-code:', error);
        return res.status(500).json({ error: true, message: 'Something went wrong.' });
    }
});

router.post('/verify-modify-email-code', async (req, res) => {
    const { email, code } = req.body;

    try {
        const pool = await sql.connect(dbConnect);

        const userResult = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM Shops WHERE Email = @Email');

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }

        const user = userResult.recordset[0];

        const isCodeValid = user.VerifyCode === code;
        const isCodeNotExpired = new Date(user.VerifyCodeExpiry) > new Date();

        if (isCodeValid && isCodeNotExpired) {
            await pool.request()
                .input('email', sql.NVarChar, email)
                .query(`
                    UPDATE Shops
                    SET VerifyCode = NULL, VerifyCodeExpiry = NULL
                    WHERE Email = @Email
                `);

            return res.status(200).json({ success: true, message: 'Verify code is valid. You can now change your email.' });
        } else if (!isCodeNotExpired) {
            return res.status(400).json({ success: false, message: 'Verify code is expired. Please request a new one.' });
        } else {
            return res.status(400).json({ success: false, message: 'Invalid verify code.' });
        }
    } catch (error) {
        console.error('Error during code verification:', error);
        return res.status(500).json({ error: true, msg: "Something went wrong" });
    }
});

router.put('/:id/email', async (req, res) => {
    try {
        const { id } = req.params;
        const { email } = req.body;

        if (!isValidUUID(id)) {
            return res.status(400).json({ success: false, message: 'Invalid id format' });
        }

        if (!email || !validateEmail(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email format' });
        }

        const pool = await sql.connect(dbConnect);

        const shopQuery = `SELECT Email FROM Shops WHERE Id = @id`;
        const shopResult = await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .query(shopQuery);

        if (shopResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: "Shop not found" });
        }

        const currentEmail = shopResult.recordset[0].Email;

        if (email === currentEmail) {
            return res.status(400).json({ success: false, message: 'Use a different email address' });
        }

        const emailQuery = `SELECT Id FROM Shops WHERE Email = @email`;
        const emailResult = await pool.request()
            .input('email', sql.NVarChar, email)
            .query(emailQuery);

        if (emailResult.recordset.length > 0) {
            return res.status(400).json({ success: false,  message: 'Email already exists' });
        }

        const updateQuery = `UPDATE Shops SET Email = @newEmail WHERE Id = @id`;
        const updateResult = await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .input('newEmail', sql.NVarChar, email)
            .query(updateQuery);

        if (updateResult.rowsAffected[0] === 0) {
            return res.status(404).json({ success: false, message: "Shop not found" });
        }

        return res.status(200).json({ message: "Email updated successfully" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

router.put('/:id/phone', async (req, res) => {
    try {
        const { id } = req.params;
        const { phone } = req.body;

        if (!isValidUUID(id)) {
            return res.status(400).json({ success: false, message: 'Invalid id format' });
        }

        if (!phone || !validatePhone(phone)) {
            return res.status(400).json({ success: false, message: 'Invalid phone format' });
        }

        const normalizedPhone = normalizePhone(phone); 

        const pool = await sql.connect(dbConnect);

        const shopQuery = `SELECT Phone FROM Shops WHERE Id = @id`;
        const shopResult = await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .query(shopQuery);

        if (shopResult.recordset.length === 0) {
            return res.status(404).json({ message: "Shop not found" });
        }

        const currentPhone = shopResult.recordset[0].Phone;

        if (normalizedPhone === currentPhone) {
            return res.status(400).json({ success: false, message: 'Use a different phone number' });
        }

        const phoneQuery = `SELECT Id FROM Shops WHERE Phone = @phone`;
        const phoneResult = await pool.request()
            .input('phone', sql.NVarChar, normalizedPhone)
            .query(phoneQuery);

        if (phoneResult.recordset.length > 0) {
            return res.status(400).json({ success: false, message: 'Phone number already exists' });
        }

        const updateQuery = `UPDATE Shops SET Phone = @newPhone WHERE Id = @id`;
        const updateResult = await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .input('newPhone', sql.NVarChar, normalizedPhone)
            .query(updateQuery);

        if (updateResult.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Shop not found" });
        }

        return res.status(200).json({ message: "Phone number updated successfully" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});


function validatePhone(phone) {
    const phoneRegex = /^3[0-9]{9}$/; 
    return phoneRegex.test(phone);
}

function normalizePhone(phone) {
    if (!phone.startsWith('92')) {
        return `92${phone}`;
    }
    return phone;
}




export default router
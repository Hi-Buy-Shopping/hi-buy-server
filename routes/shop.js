import express from "express";
import { dbConnect, sql } from "../database/dbConfig.js";
import cloudinary from 'cloudinary';
import multer from 'multer';

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

// router.get('/:id', async (req, res) => {
//     try {
//         const pool = await sql.connect(dbConnect);
//         const { id } = req.params;

//         if (!isValidUUID(id)) {
//             return res.status(400).json({ error: 'Invalid id format' });
//         }

//         const result = await pool.request()
//             .input('id', sql.UniqueIdentifier, id)
//             .query('SELECT * FROM Shops WHERE Id = @id');

//         if (result.recordset.length === 0) {
//             return res.status(404).json({ message: 'Shop not found' });
//         }

//         return res.status(200).json(result.recordset[0]);
//     } catch (err) {
//         console.error('Error fetching user by ID:', err);
//         return res.status(500).json({ error: 'Internal server error' });
//     }
// })

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

        // Check if the shop exists
        const shopsQuery = `SELECT Name, Logo, CoverImage FROM Shops WHERE Id = @id`;
        const currentUser = await pool.request()
            .input("id", sql.UniqueIdentifier, id)
            .query(shopsQuery);

        if (currentUser.recordset.length === 0) {
            return res.status(404).json({ message: "Shop not found" });
        }

        const existingLogo = currentUser.recordset[0].Logo;
        const existingCoverImage = currentUser.recordset[0].CoverImage;

        // Remove existing logo from Cloudinary if a replacement is provided
        if (logoFile && existingLogo) {
            const logoPublicId = getCloudinaryPublicId(existingLogo);
            await cloudinary.uploader.destroy(logoPublicId);
        }

        // Remove existing cover image from Cloudinary if a replacement is provided
        if (coverImageFile && existingCoverImage) {
            const coverImagePublicId = getCloudinaryPublicId(existingCoverImage);
            await cloudinary.uploader.destroy(coverImagePublicId);
        }

        // Upload the new logo to Cloudinary if provided
        let newLogoUrl = existingLogo;
        if (logoFile) {
            const logoUpload = await cloudinary.uploader.upload(
                `data:${logoFile.mimetype};base64,${logoFile.buffer.toString('base64')}`,
                { folder: "shops/logos" }
            );
            newLogoUrl = logoUpload.secure_url;
        }

        // Upload the new cover image to Cloudinary if provided
        let newCoverImageUrl = existingCoverImage;
        if (coverImageFile) {
            const coverImageUpload = await cloudinary.uploader.upload(
                `data:${coverImageFile.mimetype};base64,${coverImageFile.buffer.toString('base64')}`,
                { folder: "shops/coverImages" }
            );
            newCoverImageUrl = coverImageUpload.secure_url;
        }

        // Build the update query conditionally
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


function getCloudinaryPublicId(url) {
    const parts = url.split('/');
    const lastPart = parts[parts.length - 1];
    const publicId = lastPart.split('.')[0];
    return `shops/${publicId}`;
}

export default router
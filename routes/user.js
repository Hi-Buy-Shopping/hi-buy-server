import express from 'express'
import { dbConnect, sql } from '../database/dbConfig.js';
import multer from 'multer';
import cloudinary from 'cloudinary';
import bcrypt from 'bcryptjs'
import createUserTable from '../tables/user.js';
import { sendVerificationEmail } from '../helper/sendVerificationEmail.js';
import createShopsTable from '../tables/shops.js';
import jwt from 'jsonwebtoken'
import { sendForgetPasswordEmail } from '../helper/sendForgetPasswordEmail.js';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import path from 'path'; 
const isValidUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
};

const router = express.Router()

const storage = new CloudinaryStorage({
  cloudinary: cloudinary.v2,
  params: {
    folder: 'users', 
    allowedFormats: ['jpg', 'png', 'jpeg', 'webp'],
  }
});
// const storage = multer.diskStorage({
//     destination: (req, file, cb) => {
//         cb(null, 'uploads/');
//     },
//     filename: (req, file, cb) => {
//         cb(null, Date.now() + path.extname(file.originalname));
//     }
// });
const upload = multer({ storage });

cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_CLOUD_KEY,
    api_secret: process.env.CLOUDINARY_CLOUD_SECRET
  });

async function uploadImageToCloudinary(imagePath) {
    try {
        const result = await cloudinary.uploader.upload(imagePath, {
            folder: 'userAvatar',
        });
        return result; 
    } catch (err) {
        throw new Error('Image upload failed');
    }
}

async function removeImageFromCloudinary(publicId) {
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (err) {
        console.error('Error removing image from Cloudinary:', err);
    }
}

router.post('/signup', async (req, res) => {
    console.log("api call")
    const { name, phone, email, password, userType, gender } = req.body;

    try {
        await createUserTable();

        const pool = await sql.connect(dbConnect);

        const existingVerifiedUserResult = await pool.request()
            .input('email', sql.NVarChar, email)
            .input('isVerified', sql.Bit, true)
            .query('SELECT * FROM Users WHERE Email = @Email AND IsVerified = @IsVerified');

        if (existingVerifiedUserResult.recordset.length > 0) {
            return res.status(400).json({ error: true, msg: "User already exists!" });
        }

        const existingUserByPhResult = await pool.request()
            .input('phone', sql.NVarChar, phone)
            .query('SELECT * FROM Users WHERE Phone = @Phone');

        if (existingUserByPhResult.recordset.length > 0) {
            return res.status(400).json({ error: true, msg: "Phone number already registered!" });
        }

        const verifyCodeEmail = Math.floor(100000 + Math.random() * 900000).toString();
        let userResult;

        const existingUserByEmailResult = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM Users WHERE Email = @Email');

        if (existingUserByEmailResult.recordset.length > 0) {
            const existingUser = existingUserByEmailResult.recordset[0];

            if (existingUser.IsVerified) {
                return res.status(400).json({ error: true, msg: "User already exists!" });
            } else {
                const hashPassword = await bcrypt.hash(password, 10);
                userResult = await pool.request()
                    .input('userId', sql.UniqueIdentifier, existingUser.Id)
                    .input('password', sql.NVarChar, hashPassword)
                    .input('verifyCode', sql.NVarChar, verifyCodeEmail)
                    .input('verifyCodeExpiry', sql.DateTime, new Date(Date.now() + 3600000))
                    .query(`
                        UPDATE Users 
                        SET Password = @Password, VerifyCode = @VerifyCode, VerifyCodeExpiry = @VerifyCodeExpiry 
                        WHERE Id = @UserId
                    `);
            }
        } else {
            const hashPassword = await bcrypt.hash(password, 10);
            const expiryDate = new Date();
            expiryDate.setHours(expiryDate.getHours() + 1);

            userResult = await pool.request()
                .input('name', sql.NVarChar, name)
                .input('phone', sql.NVarChar, phone)
                .input('email', sql.NVarChar, email)
                .input('password', sql.NVarChar, hashPassword)
                .input('gender', sql.NVarChar, gender)
                .input('verifyCode', sql.NVarChar, verifyCodeEmail)
                .input('verifyCodeExpiry', sql.DateTime, expiryDate)
                .input('isVerified', sql.Bit, false)
                .input('userType', sql.NVarChar, userType)
                .query(`
                    INSERT INTO Users (Name, Phone, Email, Password, VerifyCode, VerifyCodeExpiry, IsVerified, userType, Gender)
                    OUTPUT INSERTED.*
                    VALUES (@Name, @Phone, @Email, @Password, @VerifyCode, @VerifyCodeExpiry, @IsVerified, @userType, @Gender)
                `);
        }

        const createdUser = userResult.recordset[0];
        let shopResult;
        await createShopsTable()

        if (createdUser.userType === 'subAdmin') {
            shopResult = await pool.request()
                .input('name', sql.NVarChar, `${name}'s Shop`)
                .input('email', sql.NVarChar, email)
                .input('phone', sql.NVarChar, `92${phone}`)
                .input('ownerId', sql.UniqueIdentifier, createdUser.Id)
                .query(`
                    INSERT INTO Shops (Name, Email, Phone, OwnerId)
                    OUTPUT INSERTED.*
                    VALUES (@Name, @Email, @Phone, @OwnerId)
                `);
        }

        const token = jwt.sign({ email: createdUser.Email, id: createdUser.Id }, process.env.JSON_WEB_TOKEN_SECRET_KEY);

        await sendVerificationEmail(email, name, verifyCodeEmail);

        return res.status(201).json({
            success: true,
            message: "User registered successfully. Please verify your email.",
            token: token,
            user: createdUser,
            shop: shopResult ? shopResult.recordset[0] : null
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: true, msg: "Something went wrong." });
    }
})

router.post('/signin', async (req, res) => {
    const { email, password } = req.body;

    try {
        const pool = await sql.connect(dbConnect);

        const isEmail = email.includes('@');  

        const userQuery = isEmail
            ? 'SELECT * FROM Users WHERE Email = @EmailOrPhone AND IsVerified = @IsVerified'
            : 'SELECT * FROM Users WHERE Phone = @EmailOrPhone AND IsVerified = @IsVerified';

        const userResult = await pool.request()
            .input('EmailOrPhone', sql.NVarChar, email) 
            .input('IsVerified', sql.Bit, true)
            .query(userQuery);

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ error: true, msg: "User not found or not verified" });
        }

        const existingUser = userResult.recordset[0];

        // Compare the password
        const matchPassword = await bcrypt.compare(password, existingUser.Password);
        if (!matchPassword) {
            return res.status(400).json({ error: true, msg: "Invalid Password" });
        }

        const shopResult = await pool.request()
            .input('ownerId', sql.UniqueIdentifier, existingUser.Id)
            .query('SELECT * FROM Shops WHERE OwnerId = @OwnerId');

        const shop = shopResult.recordset.length > 0 ? shopResult.recordset[0] : null;

        const token = jwt.sign({ email: existingUser.Email, id: existingUser.Id }, process.env.JSON_WEB_TOKEN_SECRET_KEY);

        return res.status(200).json({
            user: existingUser,
            token: token,
            shop: shop,
            msg: "User Authenticated"
        });
    } catch (error) {
        console.error('Error during sign-in:', error);
        return res.status(500).json({ error: true, msg: "Something went wrong" });
    }
});


router.post('/verify', async (req, res) => {
    try {
        const { email, code } = req.body;

        const pool = await sql.connect(dbConnect);

        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM Users WHERE Email = @Email');

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = result.recordset[0];


        const isCodeValid = user.VerifyCode === code;
        const isCodeNotExpired = new Date(user.VerifyCodeExpiry) > new Date();

        if (isCodeValid && isCodeNotExpired) {
            await pool.request()
                .input('userId', sql.UniqueIdentifier, user.Id)
                .query('UPDATE Users SET IsVerified = 1 WHERE Id = @userId');

            return res.status(201).json({ success: true, message: 'User verified successfully' });
        } else if (!isCodeNotExpired) {
            return res.status(401).json({ success: false, message: 'Verification code is expired' });
        } else {
            return res.status(401).json({ success: false, message: 'Verification code is invalid' });
        }
    } catch (error) {
        console.log(`Error while verifying user: ${error}`);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        const pool = await sql.connect(dbConnect);
        
        const userResult = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM Users WHERE Email = @Email AND IsVerified = 1');

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ error: true, msg: "User not found or not verified" });
        }

        const user = userResult.recordset[0];
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiryDate = new Date();
        expiryDate.setHours(expiryDate.getHours() + 1);

        await pool.request()
            .input('userId', sql.UniqueIdentifier, user.Id)
            .input('verifyCode', sql.NVarChar, resetCode)
            .input('verifyCodeExpiry', sql.DateTime, expiryDate)
            .query(`
                UPDATE Users 
                SET VerifyCode = @VerifyCode, VerifyCodeExpiry = @VerifyCodeExpiry 
                WHERE Id = @UserId
            `);

        await sendForgetPasswordEmail(email, user.Name, resetCode);

        return res.status(200).json({ success: true, message: "Reset code sent to email." });
    } catch (error) {
        console.error('Error during forgot password:', error);
        return res.status(500).json({ error: true, msg: "Something went wrong" });
    }
});

router.post('/verify-reset-code', async (req, res) => {
    const { email, code } = req.body;

    try {
        const pool = await sql.connect(dbConnect);

        const userResult = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM Users WHERE Email = @Email');

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = userResult.recordset[0];

        const isCodeValid = user.VerifyCode === code;
        const isCodeNotExpired = new Date(user.VerifyCodeExpiry) > new Date();

        if (isCodeValid && isCodeNotExpired) {
            await pool.request()
            return res.status(200).json({ success: true, message: 'Reset code is valid. You can now reset your password.' });
        } else if (!isCodeNotExpired) {
            return res.status(400).json({ success: false, message: 'Reset code is expired. Please request a new one.' });
        } else {
            return res.status(400).json({ success: false, message: 'Invalid reset code.' });
        }
    } catch (error) {
        console.error('Error during code verification:', error);
        return res.status(500).json({ error: true, msg: "Something went wrong" });
    }
});


router.post('/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;

    try {
        const pool = await sql.connect(dbConnect);

        const userResult = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM Users WHERE Email = @Email');

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = userResult.recordset[0];

        const isCodeValid = user.VerifyCode
        const isCodeNotExpired = new Date(user.VerifyCodeExpiry) > new Date();

        if (!isCodeValid || !isCodeNotExpired) {
            return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.request()
            .input('userId', sql.UniqueIdentifier, user.Id)
            .input('password', sql.NVarChar, hashedPassword)
            .query(`
                UPDATE Users 
                SET Password = @Password
                WHERE Id = @UserId
            `);

        return res.status(200).json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        console.error('Error during password reset:', error);
        return res.status(500).json({ error: true, msg: "Something went wrong" });
    }
});


router.post('/resend-reset-code', async (req, res) => {
    const { email } = req.body;

    try {
        const pool = await sql.connect(dbConnect);

        // Check if the user exists
        const userResult = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM Users WHERE Email = @Email');

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = userResult.recordset[0];

        const newVerifyCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiryDate = new Date();
        expiryDate.setHours(expiryDate.getHours() + 1); 

        await pool.request()
            .input('verifyCode', sql.NVarChar, newVerifyCode)
            .input('verifyCodeExpiry', sql.DateTime, expiryDate)
            .input('email', sql.NVarChar, email)
            .query('UPDATE Users SET VerifyCode = @VerifyCode, VerifyCodeExpiry = @VerifyCodeExpiry WHERE Email = @Email');

        
        await sendForgetPasswordEmail(email, user.Name, newVerifyCode);

        return res.status(200).json({
            success: true,
            message: 'A new reset code has been sent to your email.'
        });

    } catch (error) {
        console.error('Error during resend-reset-code:', error);
        return res.status(500).json({ error: true, message: 'Something went wrong.' });
    }
});

router.get('/', async (req, res) => {
    try {
        const pool = await sql.connect(dbConnect);

        const result = await pool.request().query('SELECT * FROM Users');

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error fetching all users:', err);
        res.status(500).json({ error: 'Internal server error' });
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
            .query('SELECT * FROM Users WHERE Id = @id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Error fetching user by ID:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
})


router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!isValidUUID(id)) {
        return res.status(400).json({ error: 'Invalid id format' });
    }
    const { name, phone, password, gender, userType } = req.body;
    const pool = await sql.connect(dbConnect);
    
    const userQuery = `SELECT Images, Password, userType FROM Users WHERE Id = @id`;
    const currentUser = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query(userQuery);

    const oldImage = currentUser.recordset[0].Images; 
    const existingUserType = currentUser.recordset[0].userType;
    const existingPassword = currentUser.recordset[0].Password;

    let oldImagePublicId = null;
    if (oldImage) {
      oldImagePublicId = oldImage.split('/').pop().split('.')[0];
    }

    let profileImageUrl = null;
    if (req.file) {
      const uploadResult = await uploadImageToCloudinary(req.file.path);
      profileImageUrl = uploadResult.secure_url;

      if (oldImagePublicId) {
        await removeImageFromCloudinary(oldImagePublicId);
      }
    }

    const SALT_ROUNDS = 10;
    let hashedPassword = existingPassword;
    if (password) {
      hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    }

    
    let query = `
      UPDATE Users SET 
          Name = @name, 
          Phone = @phone, 
          Password = @password, 
          Gender = @gender,
          userType = @userType
    `;

    if (profileImageUrl) {
      query += `, Images = @profileImageUrl`;
    }

    query += ` WHERE Id = @id`;

    const request = pool.request();
    request.input('id', sql.UniqueIdentifier, id);
    request.input('name', sql.NVarChar(255), name || currentUser.recordset[0].Name);
    request.input('phone', sql.NVarChar(20), phone || currentUser.recordset[0].Phone);
    request.input('password', sql.NVarChar(255), hashedPassword); 
    request.input('gender', sql.NVarChar(255), gender || currentUser.recordset[0].Gender);
    request.input('userType', sql.NVarChar(255), userType || existingUserType); 

    if (profileImageUrl) {
      request.input('profileImageUrl', sql.NVarChar(sql.MAX), profileImageUrl);
    }

    await request.query(query);

    res.status(200).json({ message: 'User updated successfully' });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/change-password', async (req, res) => {
    const { id, currentPassword, newPassword } = req.body;
    console.log("api call")

    if (!isValidUUID(id)) {
        return res.status(400).json({ error: 'Invalid id format' });
    }
    try {
        const pool = await sql.connect(dbConnect);

        const userResult = await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .query('SELECT * FROM Users WHERE Id = @Id');

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = userResult.recordset[0];
        const storedHashedPassword = user.Password;

        const isPasswordValid = await bcrypt.compare(currentPassword, storedHashedPassword);

        if (!isPasswordValid) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        }

        const saltRounds = 10;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        
        await pool.request()
            .input('newPassword', sql.NVarChar(255), hashedNewPassword)
            .input('id', sql.UniqueIdentifier, id)
            .query('UPDATE Users SET Password = @NewPassword WHERE Id = @Id');

        return res.status(200).json({
            success: true,
            message: 'Password changed successfully.',
        });
        
    } catch (error) {
        console.error('Error during change-password:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
});

router.get("/:userId/follows/:shopId", async (req, res) => {
    const { userId, shopId } = req.params;
  
    if (!isValidUUID(userId) || !isValidUUID(shopId)) {
      return res.status(400).json({ error: "Invalid userId or shopId format" });
    }
  
    try {
      const pool = await sql.connect(dbConnect);
  
      const result = await pool.request()
        .input("userId", sql.UniqueIdentifier, userId)
        .input("shopId", sql.UniqueIdentifier, shopId)
        .query(`
          SELECT 
            CASE 
              WHEN CHARINDEX(CAST(@shopId AS NVARCHAR(MAX)), FollowedShopsId) > 0 THEN 1
              ELSE 0
            END AS isFollowing
          FROM Users
          WHERE Id = @userId
        `);
  
      if (result.recordset.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
  
      return res.status(200).json({
        isFollowing: result.recordset[0].isFollowing === 1,
      });
    } catch (err) {
      console.error("Error checking follow status:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
});
  

router.post("/follow", async (req, res) => {
    const { userId, shopId } = req.body;
  
    if (!isValidUUID(userId) || !isValidUUID(shopId)) {
      return res.status(400).json({ error: "Invalid userId or shopId format" });
    }
  
    try {
      const pool = await sql.connect(dbConnect);
  
      // Check if the user is already following the shop
      const checkFollow = await pool.request()
        .input("userId", sql.UniqueIdentifier, userId)
        .input("shopId", sql.UniqueIdentifier, shopId)
        .query(`
          SELECT FollowedShopsId 
          FROM Users 
          WHERE Id = @userId AND CHARINDEX(CAST(@shopId AS NVARCHAR(MAX)), FollowedShopsId) > 0
        `);
  
      if (checkFollow.recordset.length > 0) {
        return res.status(400).json({ message: "User already follows this shop" });
      }
  
      const transaction = new sql.Transaction(pool);
  
      try {
        await transaction.begin();
  
        // Update the Users table
        await transaction.request()
          .input("userId", sql.UniqueIdentifier, userId)
          .input("shopId", sql.UniqueIdentifier, shopId)
          .query(`
            UPDATE Users 
            SET 
              FollowedShops = FollowedShops + 1, 
              FollowedShopsId = 
                CASE 
                  WHEN FollowedShopsId IS NULL THEN CAST(@shopId AS NVARCHAR(MAX)) 
                  ELSE FollowedShopsId + ',' + CAST(@shopId AS NVARCHAR(MAX)) 
                END
            WHERE Id = @userId
          `);
  
        // Update the Shops table
        const result = await transaction.request()
          .input("shopId", sql.UniqueIdentifier, shopId)
          .query(`
            UPDATE Shops 
            SET FollowersCount = FollowersCount + 1
            WHERE Id = @shopId
          `);
  
        if (result.rowsAffected[0] === 0) {
          throw new Error("Shop not found or FollowersCount update failed.");
        }
  
        await transaction.commit();
  
        return res.status(200).json({ message: "Shop followed successfully" });
      } catch (err) {
        await transaction.rollback();
        console.error("Transaction error:", err);
        return res.status(500).json({ error: "Transaction failed" });
      }
    } catch (err) {
      console.error("Error following shop:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  
  router.post("/unfollow", async (req, res) => {
    const { userId, shopId } = req.body;
  
    if (!isValidUUID(userId) || !isValidUUID(shopId)) {
      return res.status(400).json({ error: "Invalid userId or shopId format" });
    }
  
    try {
      const pool = await sql.connect(dbConnect);
  
      // Check if the user is already following the shop
      const checkFollow = await pool.request()
        .input("userId", sql.UniqueIdentifier, userId)
        .input("shopId", sql.UniqueIdentifier, shopId)
        .query(`
          SELECT FollowedShopsId 
          FROM Users 
          WHERE Id = @userId AND CHARINDEX(CAST(@shopId AS NVARCHAR(MAX)), FollowedShopsId) > 0
        `);
  
      if (checkFollow.recordset.length === 0) {
        return res.status(400).json({ message: "User is not following this shop" });
      }
  
      // Update the Users table to remove the shop ID from FollowedShopsId
      await pool.request()
        .input("userId", sql.UniqueIdentifier, userId)
        .input("shopId", sql.UniqueIdentifier, shopId)
        .query(`
          UPDATE Users 
          SET 
            FollowedShops = FollowedShops - 1, 
            FollowedShopsId = 
              CASE 
                WHEN FollowedShopsId LIKE CAST(@shopId AS NVARCHAR(MAX)) + ',%' THEN 
                  STUFF(FollowedShopsId, 1, LEN(CAST(@shopId AS NVARCHAR(MAX)) + ','), '')
                WHEN FollowedShopsId LIKE '%,' + CAST(@shopId AS NVARCHAR(MAX)) THEN 
                  LEFT(FollowedShopsId, LEN(FollowedShopsId) - LEN(',' + CAST(@shopId AS NVARCHAR(MAX))))
                ELSE 
                  REPLACE(FollowedShopsId, ',' + CAST(@shopId AS NVARCHAR(MAX)), '')
              END
          WHERE Id = @userId
        `);
  
      // Update the Shops table to decrement the FollowersCount
      await pool.request()
        .input("shopId", sql.UniqueIdentifier, shopId)
        .query(`
          UPDATE Shops 
          SET FollowersCount = FollowersCount - 1
          WHERE Id = @shopId
        `);
  
      return res.status(200).json({ message: "Shop unfollowed successfully" });
    } catch (err) {
      console.error("Error unfollowing shop:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/:userId/followed-shops", async (req, res) => {
    const { userId } = req.params;
  
    if (!isValidUUID(userId)) {
      return res.status(400).json({ error: "Invalid userId format" });
    }
  
    try {
      const pool = await sql.connect(dbConnect);
      const userResult = await pool.request()
        .input("userId", sql.UniqueIdentifier, userId)
        .query(`
          SELECT FollowedShopsId 
          FROM Users 
          WHERE Id = @userId
        `);
  
      if (userResult.recordset.length === 0 || !userResult.recordset[0].FollowedShopsId) {
        return res.status(404).json({ message: "No followed shops found" });
      }
  
      const followedShopIds = userResult.recordset[0].FollowedShopsId.split(",");
  
      const shopsResult = await pool.request()
        .input("shopIds", sql.NVarChar, followedShopIds.join(","))
        .query(`
          SELECT Id, Name, Logo, FollowersCount 
          FROM Shops 
          WHERE Id IN (${followedShopIds.map((id) => `'${id}'`).join(",")})
        `);
  
      return res.status(200).json({ followedShops: shopsResult.recordset });
    } catch (err) {
      console.error("Error fetching followed shops:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  
  
export default router

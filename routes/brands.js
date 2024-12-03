import express from 'express';
import multer from 'multer';
import cloudinary from 'cloudinary';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

const router = express.Router();

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_CLOUD_KEY,
  api_secret: process.env.CLOUDINARY_CLOUD_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary.v2,
  params: {
    folder: 'brands',
    allowedFormats: ['jpg', 'png', 'jpeg', 'webp'],
  }
});

const upload = multer({ storage });
const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// router.post('/create', upload.array('documents', 10), async (req, res) => {
//     const { name, categoryId, relationship, authorizationStartDate, authorizationEndDate } = req.body;
//     console.log(req.body);
//     try {
//       const pool = await sql.connect(dbConnect);
//       const imageUrls = req.files.map(file => file.path);
  
//       const insertQuery = `
//         INSERT INTO Brands (Id, Name, CategoryId, Relationship, AuthorizationStartDate, AuthorizationEndDate, AuthenticationDocuments, CreatedAt)
//         VALUES (NEWID(), @name, @categoryId, @relationship, @authorizationStartDate, @authorizationEndDate, @authenticationDocuments, GETDATE());
//       `;
  
//       await pool.request()
//         .input('name', sql.NVarChar, name)
//         .input('categoryId', sql.UniqueIdentifier, categoryId)
//         .input('relationship', sql.NVarChar, relationship)
//         .input('authorizationStartDate', sql.Date, authorizationStartDate)
//         .input('authorizationEndDate', sql.Date, authorizationEndDate)
//         .input('authenticationDocuments', sql.NVarChar(sql.MAX), JSON.stringify(imageUrls))
//         .query(insertQuery);
  
//       return res.status(201).json({
//         success: true,
//         message: 'Brand created successfully!',
//         brand: {
//           name,
//           categoryId,
//           relationship,
//           authorizationStartDate,
//           authorizationEndDate,
//           authenticationDocuments: imageUrls
//         }
//       });
  
//     } catch (error) {
//       console.error('Error creating brand:', error);
//       return res.status(500).json({ message: 'Internal server error' });
//     }
//   });

router.post('/create', upload.array('documents', 10), async (req, res) => {
    const { name, categoryId, relationship, authorizationStartDate, authorizationEndDate, shopId } = req.body;
    
    try {
      const pool = await sql.connect(dbConnect);
      const imageUrls = req.files.map(file => file.path);
  
      const insertQuery = `
        INSERT INTO Brands (Id, Name, CategoryId, Relationship, AuthorizationStartDate, AuthorizationEndDate, AuthenticationDocuments, Status, ShopId, CreatedAt)
        VALUES (NEWID(), @name, @categoryId, @relationship, @authorizationStartDate, @authorizationEndDate, @authenticationDocuments, 'Pending', @shopId, GETDATE());
      `;
  
      await pool.request()
        .input('name', sql.NVarChar, name)
        .input('categoryId', sql.UniqueIdentifier, categoryId)
        .input('relationship', sql.NVarChar, relationship)
        .input('authorizationStartDate', sql.Date, authorizationStartDate)
        .input('authorizationEndDate', sql.Date, authorizationEndDate)
        .input('authenticationDocuments', sql.NVarChar(sql.MAX), JSON.stringify(imageUrls))
        .input('shopId', sql.UniqueIdentifier, shopId)
        .query(insertQuery);
  
      return res.status(201).json({
        success: true,
        message: 'Brand created successfully!',
        brand: {
          name,
          categoryId,
          relationship,
          authorizationStartDate,
          authorizationEndDate,
          status: 'Pending',
          shopId,
          authenticationDocuments: imageUrls
        }
      });
  
    } catch (error) {
      console.error('Error creating brand:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
  

router.get('/', async (req, res) => {
  try {
    const pool = await sql.connect(dbConnect);
    const result = await pool.request().query(`
      SELECT b.Id, b.Name, c.Name AS Category, b.Relationship, b.AuthorizationStartDate, 
             b.AuthorizationEndDate, b.AuthenticationDocuments, b.CreatedAt
      FROM Brands b
      LEFT JOIN Categories c ON b.CategoryId = c.Id
    `);
    res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).json({ error: 'Error fetching brands' });
  }
});


router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await sql.connect(dbConnect);
    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM Brands WHERE Id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    return res.status(200).json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching brand:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
router.get('/category/:categoryId', async (req, res) => {
  const { categoryId } = req.params;
  
  if (!isValidUUID(categoryId)) {
    return res.status(400).json({ error: 'Invalid id format' });
}
  try {
    const pool = await sql.connect(dbConnect);
    const result = await pool.request()
      .input('categoryId', sql.UniqueIdentifier, categoryId)
      .query('SELECT * FROM Brands WHERE CategoryId = @categoryId');

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'No brands found for the given category' });
    }

    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Error fetching brands by category:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});


router.get('/by-shop/:shopId', async (req, res) => {
    const { shopId } = req.params;
  
    try {
      const pool = await sql.connect(dbConnect);
      const result = await pool.request()
        .input('shopId', sql.UniqueIdentifier, shopId)
        .query(`
          SELECT b.Id, b.Name, c.Name AS Category, b.Relationship, b.AuthorizationStartDate, 
                 b.AuthorizationEndDate, b.AuthenticationDocuments, b.Status, b.CreatedAt
          FROM Brands b
          LEFT JOIN Categories c ON b.CategoryId = c.Id
          WHERE b.ShopId = @shopId
        `);
        
      return res.status(200).json(result.recordset);
    } catch (error) {
      console.error('Error fetching brands by shop:', error);
      res.status(500).json({ error: 'Error fetching brands' });
    }
});
  
router.put('/:id', upload.array('documents', 10), async (req, res) => {
    const { id } = req.params;
    const { name, categoryId, relationship, authorizationStartDate, authorizationEndDate } = req.body;
    let imageUrls = req.body.images ? JSON.parse(req.body.images) : [];
  
    try {
      const pool = await sql.connect(dbConnect);
  
      const existingBrandResult = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query('SELECT * FROM Brands WHERE Id = @id');
      
      if (existingBrandResult.recordset.length === 0) {
        return res.status(404).json({ message: 'Brand not found' });
      }
  
      const existingBrand = existingBrandResult.recordset[0];
  
      if (req.files && req.files.length > 0) {
        if (existingBrand.AuthenticationDocuments) {
          const existingImageUrls = JSON.parse(existingBrand.AuthenticationDocuments);
          existingImageUrls.forEach(url => {
            const publicId = url.split('/').pop().split('.')[0];
            cloudinary.v2.uploader.destroy(publicId, (err) => {
              if (err) console.error('Error deleting old image from Cloudinary:', err);
            });
          });
        }
  
        imageUrls = req.files.map(file => file.path);
      }
  
      const updateQuery = `
        UPDATE Brands
        SET Name = @name, CategoryId = @categoryId, Relationship = @relationship,
            AuthorizationStartDate = @authorizationStartDate, AuthorizationEndDate = @authorizationEndDate,
            AuthenticationDocuments = @authenticationDocuments, Status = 'Pending', UpdatedAt = GETDATE()
        WHERE Id = @id
      `;
  
      await pool.request()
        .input('name', sql.NVarChar, name)
        .input('categoryId', sql.UniqueIdentifier, categoryId)
        .input('relationship', sql.NVarChar, relationship)
        .input('authorizationStartDate', sql.Date, authorizationStartDate)
        .input('authorizationEndDate', sql.Date, authorizationEndDate)
        .input('authenticationDocuments', sql.NVarChar(sql.MAX), JSON.stringify(imageUrls))
        .input('id', sql.UniqueIdentifier, id)
        .query(updateQuery);
  
      return res.status(200).json({
        success: true,
        message: 'Brand updated successfully! Status set to Pending.',
        brand: {
          id,
          name,
          categoryId,
          relationship,
          authorizationStartDate,
          authorizationEndDate,
          status: 'Pending',
          authenticationDocuments: imageUrls
        }
      });
    } catch (error) {
      console.error('Error updating brand:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
});
  
router.patch('/:shopId/:id/status', async (req, res) => {
    const { shopId, id } = req.params;
    const { status, reason } = req.body;
  
    if (status !== 'Approved' && status !== 'Denied') {
      return res.status(400).json({ message: 'Invalid status. Allowed values: Approved, Denied' });
    }
  
    if (status === 'Denied' && !reason) {
      return res.status(400).json({ message: 'Reason is required when status is Denied' });
    }
  
    try {
      const pool = await sql.connect(dbConnect);
  
      const updateQuery = `
        UPDATE Brands
        SET Status = @status, DenialReason = @reason, UpdatedAt = GETDATE()
        WHERE Id = @id AND ShopId = @shopId
      `;
  
      await pool.request()
        .input('status', sql.NVarChar, status)
        .input('reason', sql.NVarChar, reason || null)
        .input('id', sql.UniqueIdentifier, id)
        .input('shopId', sql.UniqueIdentifier, shopId)
        .query(updateQuery);
  
      return res.status(200).json({ success: true, message: `Brand status updated to ${status}.` });
    } catch (error) {
      console.error('Error updating brand status:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
});
  

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(dbConnect);

    const brandResult = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM Brands WHERE Id = @id');

    if (brandResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    const brand = brandResult.recordset[0];

    if (brand.AuthenticationDocuments) {
      const imageUrls = JSON.parse(brand.AuthenticationDocuments);
      imageUrls.forEach(url => {
        const publicId = url.split('/').pop().split('.')[0];
        cloudinary.v2.uploader.destroy(publicId, (err) => {
          if (err) console.error('Error deleting image from Cloudinary:', err);
        });
      });
    }

    const deleteQuery = `DELETE FROM Brands WHERE Id = @id`;
    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query(deleteQuery);

    return res.status(200).json({ success: true, message: 'Brand deleted successfully!' });
  } catch (error) {
    console.error('Error deleting brand:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;

import express from 'express';
import multer from 'multer';
import cloudinary from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';
import createItemsTable from '../tables/items.js'; 

const router = express.Router();

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_CLOUD_KEY,
  api_secret: process.env.CLOUDINARY_CLOUD_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary.v2,
  params: {
    folder: 'items',
    allowedFormats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }]
  }
});

const upload = multer({ storage });

router.post('/create', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload an image for the item.' });
    }

    const { subSubCategoryId, name } = req.body;
    const imageUrl = req.file.path;

    await createItemsTable(); 
    const pool = await sql.connect(dbConnect);

    const insertQuery = `
      INSERT INTO Items (SubSubCategoryId, Name, Image, CreatedAt)
      VALUES (@subSubCategoryId, @name, @image, GETDATE());
    `;

    await pool.request()
      .input('subSubCategoryId', sql.UniqueIdentifier, subSubCategoryId)
      .input('name', sql.NVarChar, name)
      .input('image', sql.NVarChar, imageUrl)
      .query(insertQuery);

    return res.status(201).json({
      success: true,
      message: 'Item created successfully!',
      item: {
        subSubCategoryId,
        name,
        image: imageUrl
      }
    });

  } catch (error) {
    console.error('Error creating item:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const subSubCategoryId = req.query.subSubCategoryId;
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 20;
    const skip = (page - 1) * perPage;

    const pool = await sql.connect(dbConnect);

    let totalPostsQuery = 'SELECT COUNT(*) AS total FROM Items';
    let itemListQuery = `
      SELECT * FROM Items
      ORDER BY CreatedAt DESC
      OFFSET @skip ROWS 
      FETCH NEXT @perPage ROWS ONLY;
    `;
    
    if (subSubCategoryId) {
      totalPostsQuery = `
        SELECT COUNT(*) AS total FROM Items 
        WHERE SubSubCategoryId = @subSubCategoryId
      `;
      itemListQuery = `
        SELECT * FROM Items 
        WHERE SubSubCategoryId = @subSubCategoryId
        ORDER BY CreatedAt DESC
        OFFSET @skip ROWS 
        FETCH NEXT @perPage ROWS ONLY;
      `;
    }

    const totalPostsResult = await pool.request()
      .input('subSubCategoryId', sql.UniqueIdentifier, subSubCategoryId)
      .query(totalPostsQuery);
    
    const totalPosts = totalPostsResult.recordset[0].total;
    const totalPages = Math.ceil(totalPosts / perPage);

    if (page > totalPages) {
      return res.status(404).json({ message: 'Page Not Found' });
    }

    
    const itemListResult = await pool.request()
      .input('subSubCategoryId', sql.UniqueIdentifier, subSubCategoryId)
      .input('skip', sql.Int, skip)
      .input('perPage', sql.Int, perPage)
      .query(itemListQuery);

    const itemList = itemListResult.recordset;

    if (!itemList.length) {
      return res.status(404).json({ success: false, message: 'No items found' });
    }

    return res.status(200).json({
      itemList,
      totalPages,
      page
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// 3. Get Item by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await sql.connect(dbConnect);
    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM Items WHERE Id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }

    return res.status(200).json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching item:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// 4. Update Item
router.put('/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { subSubCategoryId, name } = req.body;
  let imageUrl = req.body.image;

  try {
    const pool = await sql.connect(dbConnect);

    // Check if the item exists
    const existingItemResult = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM Items WHERE Id = @id');

    if (existingItemResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const existingItem = existingItemResult.recordset[0];

    // Check if the user uploaded a new image
    if (req.file) {
      imageUrl = req.file.path;

      if (existingItem.Image) {
        const publicId = existingItem.Image.split('/').pop().split('.')[0];
        cloudinary.v2.uploader.destroy(publicId, (err) => {
          if (err) {
            console.error('Error deleting old image from Cloudinary:', err);
          }
        });
      }
    } else {
      imageUrl = existingItem.Image;
    }

    // Update the item with the new data
    const updateQuery = `
      UPDATE Items
      SET SubSubCategoryId = @subSubCategoryId, Name = @name, Image = @image
      WHERE Id = @id
    `;

    await pool.request()
      .input('subSubCategoryId', sql.UniqueIdentifier, subSubCategoryId)
      .input('name', sql.NVarChar, name)
      .input('image', sql.NVarChar, imageUrl)
      .input('id', sql.UniqueIdentifier, id)
      .query(updateQuery);

    return res.status(200).json({
      success: true,
      message: 'Item updated successfully!',
      item: {
        id,
        subSubCategoryId,
        name,
        image: imageUrl
      }
    });
  } catch (error) {
    console.error('Error updating item:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// 5. Delete Item
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(dbConnect);

    const itemResult = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM Items WHERE Id = @id');

    if (itemResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const item = itemResult.recordset[0];

    const publicId = item.Image.split('/').pop().split('.')[0]; 
    cloudinary.v2.uploader.destroy(publicId, (err) => {
      if (err) {
        console.error('Error deleting image from Cloudinary:', err);
      }
    });

    // Delete the item from the database
    const deleteQuery = `
      DELETE FROM Items
      WHERE Id = @id
    `;

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query(deleteQuery);

    return res.status(200).json({ success: true, message: 'Item deleted successfully!' });
  } catch (error) {
    console.error('Error deleting item:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;

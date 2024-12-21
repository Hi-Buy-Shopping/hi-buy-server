import express from 'express';
import multer from 'multer';
import cloudinary from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';
import createSubSubcategoryTable from '../tables/subSubCategory.js'; 
const router = express.Router();

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_CLOUD_KEY,
  api_secret: process.env.CLOUDINARY_CLOUD_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary.v2,
  params: {
    folder: 'subsubcategories',
    allowedFormats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }]
  }
});

const upload = multer({ storage });

// 1. Create SubSubCategory
router.post('/create', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload an image for the sub-subcategory.' });
    }

    const { subCategoryId, name } = req.body;
    const imageUrl = req.file.path;

    await createSubSubcategoryTable();  // Ensure table is created before inserting data
    const pool = await sql.connect(dbConnect);

    const insertQuery = `
      INSERT INTO SubSubCategories (SubCategoryId, Name, Image, CreatedAt)
      VALUES (@subCategoryId, @Name, @image, GETDATE());
    `;

    await pool.request()
      .input('subCategoryId', sql.UniqueIdentifier, subCategoryId)
      .input('name', sql.NVarChar, name)
      .input('image', sql.NVarChar, imageUrl)
      .query(insertQuery);

    return res.status(201).json({
      success: true,
      message: 'Sub-subcategory created successfully!',
      subSubCategory: {
        subCategoryId,
        name,
        image: imageUrl
      }
    });

  } catch (error) {
    console.error('Error creating sub-subcategory:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});


router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page);
    const perPage = parseInt(req.query.perPage) || 40;
    const skip = page ? (page - 1) * perPage : 0;
    const subCategoryId = req.query.subCategoryId; 

    const pool = await sql.connect(dbConnect);

    let totalPostsQuery = 'SELECT COUNT(*) AS total FROM SubSubCategories';
    let subSubCategoryListQuery = `
      SELECT * FROM SubSubCategories
      ORDER BY CreatedAt DESC
    `;

    if (subCategoryId) {
      totalPostsQuery = `
        SELECT COUNT(*) AS total FROM SubSubCategories 
        WHERE SubCategoryId = @subCategoryId
      `;
      subSubCategoryListQuery = `
        SELECT * FROM SubSubCategories 
        WHERE SubCategoryId = @subCategoryId
        ORDER BY CreatedAt DESC
      `;
    }

    if (page && perPage) {
      // Add pagination only if page and perPage are provided
      subSubCategoryListQuery += `
        OFFSET @skip ROWS 
        FETCH NEXT @perPage ROWS ONLY;
      `;
    }

    // Get total count
    const totalPostsResult = await pool.request()
      .input('subCategoryId', sql.UniqueIdentifier, subCategoryId)
      .query(totalPostsQuery);
    
    const totalPosts = totalPostsResult.recordset[0].total;
    const totalPages = page && perPage ? Math.ceil(totalPosts / perPage) : 1;

    if (page && page > totalPages) {
      return res.status(404).json({ message: 'Page Not Found' });
    }

    // Fetch the sub-subcategories (filtered by subCategoryId if provided)
    const subSubCategoryListResult = await pool.request()
      .input('subCategoryId', sql.UniqueIdentifier, subCategoryId)
      .input('skip', sql.Int, skip)
      .input('perPage', sql.Int, perPage)
      .query(subSubCategoryListQuery);

    const subSubCategoryList = subSubCategoryListResult.recordset;

    if (!subSubCategoryList.length) {
      return res.status(404).json({ success: false, message: 'No sub-subcategories found' });
    }

    return res.status(200).json({
      subSubCategoryList,
      totalPages,
      page: page || 1
    });
  } catch (error) {
    console.error('Error fetching sub-subcategories:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});



router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await sql.connect(dbConnect);
    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM SubSubCategories WHERE Id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Sub-subcategory not found' });
    }

    return res.status(200).json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching sub-subcategory:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// 4. Update SubSubCategory
router.put('/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { subCategoryId, name } = req.body;
  let imageUrl = req.body.image;

  try {
    const pool = await sql.connect(dbConnect);

    // Check if the sub-subcategory exists
    const existingSubSubCategoryResult = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM SubSubCategories WHERE Id = @id');

    if (existingSubSubCategoryResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Sub-subcategory not found' });
    }

    const existingSubSubCategory = existingSubSubCategoryResult.recordset[0];

    // Check if the user uploaded a new image
    if (req.file) {
      imageUrl = req.file.path;

      if (existingSubSubCategory.Image) {
        const publicId = existingSubSubCategory.Image.split('/').pop().split('.')[0];
        cloudinary.v2.uploader.destroy(publicId, (err) => {
          if (err) {
            console.error('Error deleting old image from Cloudinary:', err);
          }
        });
      }
    } else {
      imageUrl = existingSubSubCategory.Image;
    }

    // Update the sub-subcategory with the new data
    const updateQuery = `
      UPDATE SubSubCategories
      SET SubCategoryId = @subCategoryId, Name = @name, Image = @image
      WHERE Id = @id
    `;

    await pool.request()
      .input('subCategoryId', sql.UniqueIdentifier, subCategoryId)
      .input('name', sql.NVarChar, name)
      .input('image', sql.NVarChar, imageUrl)
      .input('id', sql.UniqueIdentifier, id)
      .query(updateQuery);

    return res.status(200).json({
      success: true,
      message: 'Sub-subcategory updated successfully!',
      subSubCategory: {
        id,
        subCategoryId,
        name,
        image: imageUrl
      }
    });
  } catch (error) {
    console.error('Error updating sub-subcategory:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// 5. Delete SubSubCategory
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(dbConnect);

    const subSubCategoryResult = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM SubSubCategories WHERE Id = @id');

    if (subSubCategoryResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Sub-subcategory not found' });
    }

    const subSubCategory = subSubCategoryResult.recordset[0];

    const publicId = subSubCategory.Image.split('/').pop().split('.')[0]; 
    cloudinary.v2.uploader.destroy(publicId, (err) => {
      if (err) {
        console.error('Error deleting image from Cloudinary:', err);
      }
    });

    // Delete the sub-subcategory from the database
    const deleteQuery = `
      DELETE FROM SubSubCategories
      WHERE Id = @id
    `;

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query(deleteQuery);

    return res.status(200).json({ success: true, message: 'Sub-subcategory deleted successfully!' });
  } catch (error) {
    console.error('Error deleting sub-subcategory:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;

import express from 'express';
import multer from 'multer';
import cloudinary from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';
import createSubcategoryTable from '../tables/subCategory.js';

const router = express.Router();

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_CLOUD_KEY,
  api_secret: process.env.CLOUDINARY_CLOUD_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary.v2,
  params: {
    folder: 'subcategories',
    allowedFormats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }]
  }
});

const upload = multer({ storage });

router.post('/create', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload an image for the subcategory.' });
    }

    const { categoryId, subCategory } = req.body;
    const imageUrl = req.file.path;
    await createSubcategoryTable()
    const pool = await sql.connect(dbConnect);

    const insertQuery = `
      INSERT INTO Subcategories (CategoryId, Subcategory, Image, CreatedAt)
      VALUES (@categoryId, @subCategory, @image, GETDATE());
    `;

    await pool.request()
      .input('categoryId', sql.UniqueIdentifier, categoryId)
      .input('subCategory', sql.NVarChar, subCategory)
      .input('image', sql.NVarChar, imageUrl)
      .query(insertQuery);

    return res.status(201).json({
      success: true,
      message: 'Subcategory created successfully!',
      subCategory: {
        categoryId,
        subCategory,
        image: imageUrl
      }
    });

  } catch (error) {
    console.error('Error creating subcategory:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    // Get the categoryId from the query parameters (if provided)
    const categoryId = req.query.categoryId;
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const skip = (page - 1) * perPage;

    const pool = await sql.connect(dbConnect);

    let totalPostsQuery = 'SELECT COUNT(*) AS total FROM Subcategories';
    let subCategoryListQuery = `
      SELECT * FROM Subcategories
      ORDER BY CreatedAt DESC
      OFFSET @skip ROWS 
      FETCH NEXT @perPage ROWS ONLY;
    `;
    
    // If categoryId is provided, filter subcategories by categoryId
    if (categoryId) {
      totalPostsQuery = `
        SELECT COUNT(*) AS total FROM Subcategories 
        WHERE CategoryId = @categoryId
      `;
      subCategoryListQuery = `
        SELECT * FROM Subcategories 
        WHERE CategoryId = @categoryId
        ORDER BY CreatedAt DESC
        OFFSET @skip ROWS 
        FETCH NEXT @perPage ROWS ONLY;
      `;
    }

    // Count the total number of subcategories (filtered by categoryId if provided)
    const totalPostsResult = await pool.request()
      .input('categoryId', sql.UniqueIdentifier, categoryId)
      .query(totalPostsQuery);
    
    const totalPosts = totalPostsResult.recordset[0].total;
    const totalPages = Math.ceil(totalPosts / perPage);

    if (page > totalPages) {
      return res.status(404).json({ message: 'Page Not Found' });
    }

    // Fetch the subcategories (filtered by categoryId if provided)
    const subCategoryListResult = await pool.request()
      .input('categoryId', sql.UniqueIdentifier, categoryId)
      .input('skip', sql.Int, skip)
      .input('perPage', sql.Int, perPage)
      .query(subCategoryListQuery);

    const subCategoryList = subCategoryListResult.recordset;

    if (!subCategoryList.length) {
      return res.status(404).json({ success: false, message: 'No subcategories found' });
    }

    return res.status(200).json({
      subCategoryList,
      totalPages,
      page
    });
  } catch (error) {
    console.error('Error fetching subcategories:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});



// router.get('/', async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const perPage = parseInt(req.query.perPage) || 10;
//     const skip = (page - 1) * perPage;

//     const pool = await sql.connect(dbConnect);

//     const totalPostsResult = await pool.request().query('SELECT COUNT(*) AS total FROM Subcategories');
//     const totalPosts = totalPostsResult.recordset[0].total;
//     const totalPages = Math.ceil(totalPosts / perPage);

//     if (page > totalPages) {
//       return res.status(404).json({ message: 'Page Not Found' });
//     }

//     const subCategoryListQuery = `
//       SELECT * FROM Subcategories 
//       ORDER BY CreatedAt DESC
//       OFFSET @skip ROWS 
//       FETCH NEXT @perPage ROWS ONLY;
//     `;

//     const subCategoryListResult = await pool.request()
//       .input('skip', sql.Int, skip)
//       .input('perPage', sql.Int, perPage)
//       .query(subCategoryListQuery);

//     const subCategoryList = subCategoryListResult.recordset;

//     if (!subCategoryList.length) {
//       return res.status(404).json({ success: false, message: 'No subcategories found' });
//     }

//     return res.status(200).json({
//       subCategoryList,
//       totalPages,
//       page
//     });
//   } catch (error) {
//     console.error('Error fetching subcategories:', error);
//     return res.status(500).json({ message: 'Internal server error' });
//   }
// });

// 3. Get Subcategory by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await sql.connect(dbConnect);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Subcategories WHERE Id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }

    return res.status(200).json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching subcategory:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
router.put('/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { categoryId, subCategory } = req.body;
  let imageUrl = req.body.image;

  try {
    const pool = await sql.connect(dbConnect);

    // Check if the subcategory exists
    const existingSubCategoryResult = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT * FROM Subcategories WHERE Id = @id');

    if (existingSubCategoryResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }

    const existingSubCategory = existingSubCategoryResult.recordset[0];

    // Check if the user uploaded a new image
    if (req.file) {
      // If new image is uploaded, update imageUrl and delete the old image from Cloudinary
      imageUrl = req.file.path;

      // Extract the public ID of the old image from Cloudinary and delete it
      if (existingSubCategory.Image) {
        const publicId = existingSubCategory.Image.split('/').pop().split('.')[0];
        cloudinary.v2.uploader.destroy(publicId, (err) => {
          if (err) {
            console.error('Error deleting old image from Cloudinary:', err);
          }
        });
      }
    } else {
      // If no new image is uploaded, retain the existing image
      imageUrl = existingSubCategory.Image;
    }

    // Update the subcategory with the new data
    const updateQuery = `
      UPDATE Subcategories
      SET CategoryId = @categoryId, Subcategory = @subCategory, Image = @image
      WHERE Id = @id
    `;

    await pool.request()
      .input('categoryId', sql.UniqueIdentifier, categoryId)
      .input('subCategory', sql.NVarChar, subCategory)
      .input('image', sql.NVarChar, imageUrl) // Use the correct image URL (updated or existing)
      .input('id', sql.UniqueIdentifier, id)
      .query(updateQuery);

    return res.status(200).json({
      success: true,
      message: 'Subcategory updated successfully!',
      subCategory: {
        id,
        categoryId,
        subCategory,
        image: imageUrl
      }
    });
  } catch (error) {
    console.error('Error updating subcategory:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});


router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(dbConnect);

    const subCategoryResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Subcategories WHERE Id = @id');

    if (subCategoryResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }

    const subCategory = subCategoryResult.recordset[0];

    const publicId = subCategory.Image.split('/').pop().split('.')[0]; 
    cloudinary.v2.uploader.destroy(publicId, (err) => {
      if (err) {
        console.error('Error deleting image from Cloudinary:', err);
      }
    });

    // Delete the subcategory from the database
    const deleteQuery = `
      DELETE FROM Subcategories
      WHERE Id = @id
    `;

    await pool.request()
      .input('id', sql.Int, id)
      .query(deleteQuery);

    return res.status(200).json({ success: true, message: 'Subcategory deleted successfully!' });
  } catch (error) {
    console.error('Error deleting subcategory:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;

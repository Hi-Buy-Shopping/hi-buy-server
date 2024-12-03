import express from 'express';
import multer from 'multer';
import cloudinary from 'cloudinary';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';
import createCategoryTable from '../tables/category.js';

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
    folder: 'categories', 
    allowedFormats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }]
  }
});

const upload = multer({ storage });

router.post('/create', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload an image for the category.' });
    }

    const { name } = req.body;
    const imageUrl = req.file.path; 
    await createCategoryTable()
    const pool = await sql.connect(dbConnect);

    const insertQuery = `
      INSERT INTO Categories (Name, Image, CreatedAt)
      VALUES (@name, @image, GETDATE());
    `;

    await pool.request()
      .input('name', sql.NVarChar, name)
      .input('image', sql.NVarChar, imageUrl) 
      .query(insertQuery);

    return res.status(201).json({
      success: true,
      message: 'Category created successfully!',
      category: {
        name: name,
        image: imageUrl
      }
    });

  } catch (error) {
    console.error('Error creating category:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 10;
      const skip = (page - 1) * perPage;
  
      
      const pool = await sql.connect(dbConnect);
  
      
      const totalPostsResult = await pool.request().query('SELECT COUNT(*) AS total FROM Categories');
      const totalPosts = totalPostsResult.recordset[0].total;
      const totalPages = Math.ceil(totalPosts / perPage);
  
      if (page > totalPages) {
        return res.status(404).json({ message: "Page Not Found" });
      }
  
      let queryConditions = '';
      const queryParams = [];
  
      if (req.query.name) {
        queryConditions += 'WHERE Name LIKE @name ';
        queryParams.push({ name: `%${req.query.name}%` });
      }
  
      const categoryListQuery = `
        SELECT * FROM Categories 
        ${queryConditions}
        ORDER BY CreatedAt DESC
        OFFSET @skip ROWS 
        FETCH NEXT @perPage ROWS ONLY;
      `;
  
      const categoryListRequest = pool.request()
        .input('skip', sql.Int, skip)
        .input('perPage', sql.Int, perPage);
  
      queryParams.forEach(param => {
        Object.keys(param).forEach(key => {
          categoryListRequest.input(key, sql.NVarChar, param[key]);
        });
      });
  
      const categoryListResult = await categoryListRequest.query(categoryListQuery);
      const categoryList = categoryListResult.recordset;
  
      if (!categoryList.length) {
        return res.status(404).json({ success: false, message: 'No categories found' });
      }
  
      return res.status(200).json({
        categoryList: categoryList,
        totalPages: totalPages,
        page: page
      });
    } catch (error) {
      console.error('Error fetching categories:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const pool = await sql.connect(dbConnect);
      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query('SELECT * FROM Categories WHERE Id = @id');
  
      if (result.recordset.length === 0) {
        return res.status(404).json({ message: 'Category not found' });
      }
  
      return res.status(200).json(result.recordset[0]);
    } catch (error) {
      console.error('Error fetching category:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
  
  router.put('/:id', upload.single('image'), async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    let imageUrl = req.body.image;
  
    try {
      const pool = await sql.connect(dbConnect);
  
      const existingCategoryResult = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query('SELECT * FROM Categories WHERE Id = @id');
      
      if (existingCategoryResult.recordset.length === 0) {
        return res.status(404).json({ message: 'Category not found' });
      }
  
      const existingCategory = existingCategoryResult.recordset[0];
  
      if (req.file) {
        imageUrl = req.file.path;
  
        const publicId = existingCategory.Image.split('/').pop().split('.')[0];
        cloudinary.v2.uploader.destroy(publicId, (err, result) => {
          if (err) {
            console.error('Error deleting old image from Cloudinary:', err);
          }
        });
      }
  
      const updateQuery = `
        UPDATE Categories
        SET Name = @name, Image = @image
        WHERE Id = @id
      `;
  
      await pool.request()
        .input('name', sql.NVarChar, name)
        .input('image', sql.NVarChar, imageUrl)
        .input('id', sql.UniqueIdentifier, id)
        .query(updateQuery);
  
      return res.status(200).json({
        success: true,
        message: 'Category updated successfully!',
        category: {
          id,
          name,
          image: imageUrl
        }
      });
    } catch (error) {
      console.error('Error updating category:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
  
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
  
    try {
      const pool = await sql.connect(dbConnect);
  
      const categoryResult = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query('SELECT * FROM Categories WHERE Id = @id');
  
      if (categoryResult.recordset.length === 0) {
        return res.status(404).json({ message: 'Category not found' });
      }
  
      const category = categoryResult.recordset[0];
  
      // Delete the image from Cloudinary
      const publicId = category.Image.split('/').pop().split('.')[0]; // Extract publicId from URL
      cloudinary.v2.uploader.destroy(publicId, (err, result) => {
        if (err) {
          console.error('Error deleting image from Cloudinary:', err);
        }
      });
  

      const deleteQuery = `
        DELETE FROM Categories
        WHERE Id = @id
      `;
  
      await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query(deleteQuery);
  
      return res.status(200).json({ success: true, message: 'Category deleted successfully!' });
    } catch (error) {
      console.error('Error deleting category:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
  

export default router;

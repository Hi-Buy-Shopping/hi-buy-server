import express from 'express';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';
import createColorsTable from '../tables/colors.js'; // Assuming you have a table creation script for Colors

const router = express.Router();

// POST: Create a new color
router.post('/create', async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  try {
    await createColorsTable();
    const pool = await sql.connect(dbConnect);

    const insertQuery = `
      INSERT INTO Colors (Name)
      VALUES (@name);
    `;

    await pool.request()
      .input('name', sql.NVarChar, name)
      .query(insertQuery);

    return res.status(201).json({ success: true, message: 'Color created successfully!' });
  } catch (error) {
    console.error('Error creating color:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// GET: Get all colors
router.get('/', async (req, res) => {
  try {
    const pool = await sql.connect(dbConnect);

    const selectQuery = 'SELECT * FROM Colors;';

    const result = await pool.request().query(selectQuery);

    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Error fetching colors:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// GET: Get color by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(dbConnect);

    const selectQuery = 'SELECT * FROM Colors WHERE Id = @id;';

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(selectQuery);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Color not found.' });
    }

    return res.status(200).json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching color:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// PUT: Update a color
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  try {
    const pool = await sql.connect(dbConnect);

    const updateQuery = `
      UPDATE Colors
      SET Name = @name
      WHERE Id = @id;
    `;

    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('id', sql.Int, id)
      .query(updateQuery);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Color not found.' });
    }

    return res.status(200).json({ success: true, message: 'Color updated successfully!' });
  } catch (error) {
    console.error('Error updating color:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// DELETE: Delete a color
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(dbConnect);

    const deleteQuery = `
      DELETE FROM Colors
      WHERE Id = @id;
    `;

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(deleteQuery);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Color not found.' });
    }

    return res.status(200).json({ success: true, message: 'Color deleted successfully!' });
  } catch (error) {
    console.error('Error deleting color:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

export default router;

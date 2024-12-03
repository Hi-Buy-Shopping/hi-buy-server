import express from 'express';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';
import createSizesTable from '../tables/sizes.js';

const router = express.Router();

// POST: Create a new size
router.post('/create', async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  try {
    await createSizesTable(); // Ensure the table is created if it doesn't exist
    const pool = await sql.connect(dbConnect);

    const insertQuery = `
      INSERT INTO Sizes (Name)
      VALUES (@name);
    `;

    await pool.request()
      .input('name', sql.NVarChar, name)
      .query(insertQuery);

    return res.status(201).json({ success: true, message: 'Size created successfully!' });
  } catch (error) {
    console.error('Error creating size:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});


router.get('/', async (req, res) => {
  try {
    const pool = await sql.connect(dbConnect);

    const selectQuery = 'SELECT * FROM Sizes;';

    const result = await pool.request().query(selectQuery);

    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Error fetching sizes:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// GET: Get size by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(dbConnect);

    const selectQuery = 'SELECT * FROM Sizes WHERE Id = @id;';

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(selectQuery);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Size not found.' });
    }

    return res.status(200).json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching size:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});


router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  try {
    const pool = await sql.connect(dbConnect);

    const updateQuery = `
      UPDATE Sizes
      SET Name = @name
      WHERE Id = @id;
    `;

    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('id', sql.Int, id)
      .query(updateQuery);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Size not found.' });
    }

    return res.status(200).json({ success: true, message: 'Size updated successfully!' });
  } catch (error) {
    console.error('Error updating size:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});


router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(dbConnect);

    const deleteQuery = `
      DELETE FROM Sizes
      WHERE Id = @id;
    `;

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(deleteQuery);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Size not found.' });
    }

    return res.status(200).json({ success: true, message: 'Size deleted successfully!' });
  } catch (error) {
    console.error('Error deleting size:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

export default router;

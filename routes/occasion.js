import express from 'express';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';
import createOccasionTable from '../tables/occasion.js';

const router = express.Router();


router.post('/create', async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  try {
    await createOccasionTable()
    const pool = await sql.connect(dbConnect);

    const insertQuery = `
      INSERT INTO Occasions (Name)
      VALUES (@name);
    `;

    await pool.request()
      .input('name', sql.NVarChar, name)
      .query(insertQuery);

    return res.status(201).json({ success: true, message: 'Occasion created successfully!' });
  } catch (error) {
    console.error('Error creating occasion:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// GET: Get all occasions
router.get('/', async (req, res) => {
  try {
    const pool = await sql.connect(dbConnect);

    const selectQuery = 'SELECT * FROM Occasions;';

    const result = await pool.request().query(selectQuery);

    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Error fetching occasions:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(dbConnect);

    const selectQuery = 'SELECT * FROM Occasions WHERE Id = @id;';

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(selectQuery);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Occasion not found.' });
    }

    return res.status(200).json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching occasion:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// PUT: Update an occasion
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  try {
    const pool = await sql.connect(dbConnect);

    const updateQuery = `
      UPDATE Occasions
      SET Name = @name
      WHERE Id = @id;
    `;

    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('id', sql.Int, id)
      .query(updateQuery);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Occasion not found.' });
    }

    return res.status(200).json({ success: true, message: 'Occasion updated successfully!' });
  } catch (error) {
    console.error('Error updating occasion:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});


router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(dbConnect);

    const deleteQuery = `
      DELETE FROM Occasions
      WHERE Id = @id;
    `;

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(deleteQuery);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Occasion not found.' });
    }

    return res.status(200).json({ success: true, message: 'Occasion deleted successfully!' });
  } catch (error) {
    console.error('Error deleting occasion:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

export default router;

import express from 'express';
import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';
import createSeasonsTable from '../tables/seasons.js'; 

const router = express.Router();

router.post('/create', async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  try {
    await createSeasonsTable(); 
    const pool = await sql.connect(dbConnect);

    const insertQuery = `
      INSERT INTO Seasons (Name)
      VALUES (@name);
    `;

    await pool.request()
      .input('name', sql.NVarChar, name)
      .query(insertQuery);

    return res.status(201).json({ success: true, message: 'Season created successfully!' });
  } catch (error) {
    console.error('Error creating season:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});


router.get('/', async (req, res) => {
  try {
    const pool = await sql.connect(dbConnect);

    const selectQuery = 'SELECT * FROM Seasons;';

    const result = await pool.request().query(selectQuery);

    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Error fetching seasons:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});


router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(dbConnect);

    const selectQuery = 'SELECT * FROM Seasons WHERE Id = @id;';

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(selectQuery);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Season not found.' });
    }

    return res.status(200).json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching season:', error);
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
      UPDATE Seasons
      SET Name = @name
      WHERE Id = @id;
    `;

    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('id', sql.Int, id)
      .query(updateQuery);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Season not found.' });
    }

    return res.status(200).json({ success: true, message: 'Season updated successfully!' });
  } catch (error) {
    console.error('Error updating season:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});


router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(dbConnect);

    const deleteQuery = `
      DELETE FROM Seasons
      WHERE Id = @id;
    `;

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(deleteQuery);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Season not found.' });
    }

    return res.status(200).json({ success: true, message: 'Season deleted successfully!' });
  } catch (error) {
    console.error('Error deleting season:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

export default router;

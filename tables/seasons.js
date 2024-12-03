import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

async function createSeasonsTable() {
  try {
    const pool = await sql.connect(dbConnect);

    const createTableQuery = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Seasons' AND xtype='U')
      CREATE TABLE Seasons (
        Id INT PRIMARY KEY IDENTITY(1,1),
        Name NVARCHAR(255) NOT NULL
      );
    `;

    await pool.request().query(createTableQuery);

    console.log('Seasons table created or already exists.');
  } catch (err) {
    console.error('Error creating Seasons table:', err);
  }
}

createSeasonsTable();

export default createSeasonsTable;

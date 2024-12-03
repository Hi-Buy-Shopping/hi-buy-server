import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

async function createSizesTable() {
  try {
    const pool = await sql.connect(dbConnect);

    const createTableQuery = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Sizes' AND xtype='U')
      CREATE TABLE Sizes (
        Id INT PRIMARY KEY IDENTITY(1,1),
        Name NVARCHAR(255) NOT NULL
      );
    `;

    await pool.request().query(createTableQuery);

    console.log('Sizes table created or already exists.');
  } catch (err) {
    console.error('Error creating Sizes table:', err);
  }
}

createSizesTable();

export default createSizesTable;

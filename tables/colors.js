import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

async function createColorsTable() {
  try {
    const pool = await sql.connect(dbConnect);

    const createTableQuery = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Colors' AND xtype='U')
      CREATE TABLE Colors (
        Id INT PRIMARY KEY IDENTITY(1,1),
        Name NVARCHAR(255) NOT NULL
      );
    `;

    await pool.request().query(createTableQuery);

    console.log('Colors table created or already exists.');
  } catch (err) {
    console.error('Error creating Colors table:', err);
  }
}

createColorsTable();

export default createColorsTable;

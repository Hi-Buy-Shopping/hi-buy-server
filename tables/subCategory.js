import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

async function createSubcategoryTable() {
  try {
    const pool = await sql.connect(dbConnect);

    const query = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Subcategories' AND xtype='U')
      CREATE TABLE Subcategories (
          Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(), 
          CategoryId UNIQUEIDENTIFIER NOT NULL,       
          Subcategory NVARCHAR(255) NOT NULL,
          Image NVARCHAR(MAX) NOT NULL,
          CreatedAt DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_Category FOREIGN KEY (CategoryId) REFERENCES Categories(Id)
      );
    `;

    await pool.request().query(query);
    console.log('Subcategory table created or already exists.');
  } catch (err) {
    console.error('Error creating Subcategory table:', err);
  }
}

createSubcategoryTable();

export default createSubcategoryTable;
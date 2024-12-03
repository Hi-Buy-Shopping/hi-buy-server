import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

async function createSubSubCategoryTable() {
    try {
        const pool = await sql.connect(dbConnect);

        const tableCreationQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SubSubCategories' AND xtype='U')
            CREATE TABLE SubSubCategories (
                Id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
                Name NVARCHAR(255) NOT NULL,
                SubCategoryId UNIQUEIDENTIFIER NOT NULL,  -- Foreign Key to SubCategories
                Image NVARCHAR(255) NOT NULL,
                CreatedAt DATETIME DEFAULT GETDATE(),
                FOREIGN KEY (SubCategoryId) REFERENCES SubCategories(Id)
            );
        `;

        await pool.request().query(tableCreationQuery);

        console.log('SubSubCategories table created or already exists.');
    } catch (err) {
        console.error('Error creating SubSubCategories table:', err);
    }
}

createSubSubCategoryTable();

export default createSubSubCategoryTable;

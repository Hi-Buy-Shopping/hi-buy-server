import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

async function createItemsTable() {
    try {
        const pool = await sql.connect(dbConnect);

        const tableCreationQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Items' AND xtype='U')
            CREATE TABLE Items (
                Id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
                Name NVARCHAR(255) NOT NULL,
                SubSubCategoryId UNIQUEIDENTIFIER NOT NULL,
                Image NVARCHAR(255) NOT NULL,
                CreatedAt DATETIME DEFAULT GETDATE(),
                FOREIGN KEY (SubSubCategoryId) REFERENCES SubSubCategories(Id)
            );
        `;

        await pool.request().query(tableCreationQuery);

        console.log('Items table created or already exists.');
    } catch (err) {
        console.error('Error creating Items table:', err);
    }
}

createItemsTable();

export default createItemsTable;

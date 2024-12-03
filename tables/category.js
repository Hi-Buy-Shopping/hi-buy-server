import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

async function createCategoryTable() {
    try {
        const pool = await sql.connect(dbConnect);

        const tableCreationQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Categories' AND xtype='U')
            CREATE TABLE Categories (
                Id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY, 
                Name NVARCHAR(255) NOT NULL,                      
                Image NVARCHAR(255) NOT NULL,                   
                CreatedAt DATETIME DEFAULT GETDATE()        
            );
        `;

        await pool.request().query(tableCreationQuery);

        console.log('Categories table created or already exists.');
    } catch (err) {
        console.error('Error creating Categories table:', err);
    }
}

createCategoryTable();

export default createCategoryTable;

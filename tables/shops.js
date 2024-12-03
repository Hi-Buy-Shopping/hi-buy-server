import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

async function createShopsTable() {
    try {
        const pool = await sql.connect(dbConnect);
        const tableCreationQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Shops' AND xtype='U')
            CREATE TABLE Shops (
                Id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
                Name NVARCHAR(255) NOT NULL,
                Email NVARCHAR(255) NOT NULL,
                Logo NVARCHAR(MAX) NULL,
                CoverImage NVARCHAR(MAX) NULL,
                Phone NVARCHAR(20) NOT NULL,
                OwnerId UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Users(Id) ON DELETE CASCADE,
                FollowersCount INT DEFAULT 0,
                CreatedAt DATETIME DEFAULT GETDATE()
            );
        `;
        await pool.request().query(tableCreationQuery);
        console.log('Shops table created or already exists.');
    } catch (err) {
        console.error('Error creating Shops table:', err);
    }
}

createShopsTable();

export default createShopsTable;

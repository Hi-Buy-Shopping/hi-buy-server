import sql from 'mssql'
import { dbConnect } from '../database/dbConfig.js';

async function createUserTable() {
    try {
        const pool = await sql.connect(dbConnect);
        const tableCreationQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
            CREATE TABLE Users (
                Id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
                Name NVARCHAR(255) NOT NULL,
                Phone NVARCHAR(20) NOT NULL,
                Email NVARCHAR(255) NOT NULL UNIQUE,
                Password NVARCHAR(255) NOT NULL,
                Images NVARCHAR(MAX) NULL,
                Gender NVARCHAR(255) NULL,
                VerifyCode NVARCHAR(10) NOT NULL,
                VerifyCodeExpiry DATETIME NOT NULL,
                IsVerified BIT DEFAULT 0,
                userType NVARCHAR(255) DEFAULT 0,
                FollowedShopsId NVARCHAR(MAX),
                FollowedShops NVARCHAR(MAX)
            );
        `;
        await pool.request().query(tableCreationQuery);
        console.log('Users table created or already exists.');
    } catch (err) {
        console.error('Error creating Users table:', err);
    }
}

export default createUserTable
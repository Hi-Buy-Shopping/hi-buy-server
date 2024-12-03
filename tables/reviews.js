import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

async function createReviewsTable() {
    try {
        const pool = await sql.connect(dbConnect);
        const tableCreationQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Reviews' AND xtype='U')
            CREATE TABLE Reviews (
                Id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
                ProductId UNIQUEIDENTIFIER NOT NULL,
                UserId UNIQUEIDENTIFIER NOT NULL,
                Rating FLOAT CHECK (Rating BETWEEN 1 AND 5),
                Comment NVARCHAR(MAX),
                Images NVARCHAR(MAX),
                VendorReply NVARCHAR(MAX),
                CreatedAt DATETIME DEFAULT GETDATE(),
                UpdatedAt DATETIME DEFAULT GETDATE()
            );

            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ReviewReactions' AND xtype='U')
            CREATE TABLE ReviewReactions (
                Id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
                ReviewId UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Reviews(Id) ON DELETE CASCADE,
                UserId UNIQUEIDENTIFIER NOT NULL,
                ReactionType NVARCHAR(10) CHECK (ReactionType IN ('like', 'dislike')),
                CreatedAt DATETIME DEFAULT GETDATE()
            );
        `;
        await pool.request().query(tableCreationQuery);
        console.log('Reviews and ReviewReactions tables created or already exist.');
    } catch (err) {
        console.error('Error creating Reviews tables:', err);
    }
}

export default createReviewsTable;

import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

async function createWishlistTables() {
    try {
        const pool = await sql.connect(dbConnect);

        const createWishlistTableQuery = `
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Wishlist' AND xtype='U')
        CREATE TABLE Wishlist (
            Id INT PRIMARY KEY IDENTITY(1,1),
            UserId UNIQUEIDENTIFIER NOT NULL,
            ProductId UNIQUEIDENTIFIER NOT NULL,
            Color NVARCHAR(255) NULL,
            Size NVARCHAR(255) NULL,
            CreatedAt DATETIME DEFAULT GETDATE(),

            FOREIGN KEY (ProductId) REFERENCES Products(Id)
        );
    `;

        await pool.request().query(createWishlistTableQuery);
        console.log('Wishlist table created successfully.');
    } catch (error) {
        console.error('Error creating wishlist tables:', error);
    }
}

createWishlistTables();
export default createWishlistTables;

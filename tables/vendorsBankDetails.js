import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

async function createVendorsBankDetailsTable() {
    try {
        const pool = await sql.connect(dbConnect);

        const tableCreationQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='VendorsBankDetails' AND xtype='U')
            CREATE TABLE VendorsBankDetails (
                Id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
                ShopId UNIQUEIDENTIFIER NOT NULL,
                BankName NVARCHAR(255) NOT NULL,
                BranchCode NVARCHAR(20) NOT NULL,
                AccountNumber NVARCHAR(50) NOT NULL,
                IBAN NVARCHAR(50) NOT NULL,
                AccountTitle NVARCHAR(255) NOT NULL,
                ChequeBookImage NVARCHAR(255) NOT NULL,
                CreatedAt DATETIME DEFAULT GETDATE(),
                UpdatedAt DATETIME DEFAULT GETDATE(),
                FOREIGN KEY (ShopId) REFERENCES Shops(Id)
            );
        `;

        await pool.request().query(tableCreationQuery);
        console.log('VendorsBankDetails table created or already exists.');
    } catch (err) {
        console.error('Error creating VendorsBankDetails table:', err);
    }
}

createVendorsBankDetailsTable();

export default createVendorsBankDetailsTable;

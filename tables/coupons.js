import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

async function createCouponsTable() {
    try {
        const pool = await sql.connect(dbConnect);
        const tableCreationQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Coupons' AND xtype='U')
            CREATE TABLE Coupons (
                CouponId UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
                Code NVARCHAR(50) NOT NULL UNIQUE,
                DiscountType NVARCHAR(50) NOT NULL, -- 'percentage' or 'fixed'
                DiscountValue DECIMAL(10, 2) NOT NULL,
                MinimumOrderValue DECIMAL(10, 2) DEFAULT 0,
                StartDate DATETIME NOT NULL,
                EndDate DATETIME NOT NULL,
                UsageLimit INT DEFAULT NULL, -- NULL means no limit
                UsageCount INT DEFAULT 0,
                VendorId UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Shops(Id) ON DELETE CASCADE,
                CreatedAt DATETIME DEFAULT GETDATE()
            );
        `;
        await pool.request().query(tableCreationQuery);
        console.log('Coupons table created or already exists.');
    } catch (err) {
        console.error('Error creating Coupons table:', err);
    }
}

createCouponsTable();

export default createCouponsTable;

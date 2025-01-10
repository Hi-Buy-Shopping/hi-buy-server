import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

async function createCouponUsageTable() {
    try {
        const pool = await sql.connect(dbConnect);
        const tableCreationQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CouponUsage' AND xtype='U')
            CREATE TABLE CouponUsage (
                UsageId UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
                CouponId UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Coupons(CouponId) ON DELETE CASCADE,
                UserId UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Users(Id) ON DELETE CASCADE,
                OrderId UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Orders(Id) ON DELETE CASCADE,
                UsedAt DATETIME DEFAULT GETDATE()
            );
        `;
        await pool.request().query(tableCreationQuery);
        console.log('CouponUsage table created or already exists.');
    } catch (err) {
        console.error('Error creating CouponUsage table:', err);
    }
}

createCouponUsageTable();

export default createCouponUsageTable;

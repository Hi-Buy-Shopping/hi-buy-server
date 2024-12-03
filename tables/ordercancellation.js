import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

async function createOrderCancellationsTable() {
    try {
        const pool = await sql.connect(dbConnect);

        const tableCreationQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='OrderCancellations' AND xtype='U')
            CREATE TABLE OrderCancellations (
                Id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
                OrderId UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Orders(Id) ON DELETE CASCADE,
                UserId UNIQUEIDENTIFIER NOT NULL,
                Reason NVARCHAR(500) NOT NULL,
                CreatedAt DATETIME DEFAULT GETDATE(),
                Status NVARCHAR(50) DEFAULT 'Pending'  -- Possible statuses: Pending, Processed, Denied
            );
        `;

        await pool.request().query(tableCreationQuery);
        console.log('OrderCancellations table created or already exists.');
    } catch (err) {
        console.error('Error creating OrderCancellations table:', err);
    }
}

createOrderCancellationsTable();

export default createOrderCancellationsTable;

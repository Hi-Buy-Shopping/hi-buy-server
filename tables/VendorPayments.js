// CREATE TABLE VendorPayments (
//     Id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY, -- Unique identifier for the record
//     ShopId UNIQUEIDENTIFIER NOT NULL,              -- Unique identifier for the shop/vendor
//     TotalAmount DECIMAL(18, 2) DEFAULT 0.0,        -- Total amount of delivered orders
//     PaidAmount DECIMAL(18, 2) DEFAULT 0.0,         -- Amount paid to the vendor
//     RemainingAmount AS (TotalAmount - PaidAmount), -- Calculated remaining amount
//     LastUpdated DATETIME DEFAULT GETDATE()         -- Timestamp of last update
// );
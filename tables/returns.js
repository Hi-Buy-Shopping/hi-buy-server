// CREATE TABLE Returns (
//     Id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
//     OrderId UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Orders(Id),
//     UserId UNIQUEIDENTIFIER NOT NULL,
//     Reason NVARCHAR(500) NOT NULL,
//     OtherReason NVARCHAR(500),
//     RequestedAt DATETIME DEFAULT GETDATE(),
//     Status NVARCHAR(50) DEFAULT 'Pending',  -- 'Pending', 'Approved', 'Denied'
//     VendorComments NVARCHAR(500),           -- Optional field for vendor feedback
//     UpdatedAt DATETIME DEFAULT GETDATE()
// );

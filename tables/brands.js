// CREATE TABLE Brands (
//     Id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
//     Name NVARCHAR(100) NOT NULL,
//     CategoryId UNIQUEIDENTIFIER NOT NULL,  -- Foreign key to Categories table
//     Relationship NVARCHAR(50) CHECK (Relationship IN ('Brand Owner', 'Exclusive Distributor', 'Non Exclusive Distributor', 'Reseller')),
//     AuthorizationStartDate DATE NOT NULL,
//     AuthorizationEndDate DATE NOT NULL,
//     AuthenticationDocuments NVARCHAR(MAX),
//     CreatedAt DATETIME DEFAULT GETDATE(),
//     UpdatedAt DATETIME DEFAULT GETDATE()
// );

// -- Add foreign key relationship to Categories table
// ALTER TABLE Brands
// ADD CONSTRAINT FK_Brands_Categories FOREIGN KEY (CategoryId)
// REFERENCES Categories (Id);

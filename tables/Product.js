import sql from 'mssql';
import { dbConnect } from '../database/dbConfig.js';

async function createTables() {
    try {
        const pool = await sql.connect(dbConnect);

        const createProductsTableQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Products' AND xtype='U')
            CREATE TABLE Products (
                Id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
                ShopId UNIQUEIDENTIFIER NOT NULL,
                VariantIds INT NOT NULL,
                Name NVARCHAR(255) NOT NULL,
                Description NVARCHAR(MAX) NOT NULL,
                Images NVARCHAR(MAX), -- JSON array of image URLs
                Video NVARCHAR(MAX) NULL, -- Cloudinary video URL
                OccasionName NVARCHAR(255) NOT NULL,
                Brand NVARCHAR(255) NOT NULL,
                Price DECIMAL(10, 2) DEFAULT 0, 
                OldPrice DECIMAL(10, 2) DEFAULT 0,
                Expense DECIMAL(10, 2) DEFAULT 0,
                CatName NVARCHAR(255) NOT NULL,
                SubCatName NVARCHAR(255) NOT NULL,
                CategoryId UNIQUEIDENTIFIER NOT NULL,
                SubCategoryId UNIQUEIDENTIFIER NOT NULL,
                SubSubCategoryId UNIQUEIDENTIFIER NOT NULL,
                ItemsCategoryId UNIQUEIDENTIFIER NOT NULL,
                Season NVARCHAR(100) NOT NULL,
                DedicatedFor NVARCHAR(255), 
                Stock INT NULL,
                Discount DECIMAL(10, 2) NOT NULL,
                Detail NVARCHAR(MAX),
                isVerified BIT DEFAULT 0,
                Weight DECIMAL(4,2) NOT NULL,
                Rating DECIMAL(2, 1) DEFAULT 0,
                
                ProductRam NVARCHAR(MAX), -- JSON array for electronics (e.g., mobiles)
                ProductRom NVARCHAR(MAX), -- JSON array for electronics (e.g., mobiles)
                ProductSimSlots NVARCHAR(MAX), -- JSON array for electronics (e.g., dual-sim, single-sim)
                ProductModel NVARCHAR(255), -- Model of the product (e.g., for electronics like mobiles)
                Size NVARCHAR(MAX),
                Color NVARCHAR(MAX),

                CreatedAt DATETIME DEFAULT GETDATE(),
                UpdatedAt DATETIME DEFAULT GETDATE(),
                
                FOREIGN KEY (ShopId) REFERENCES Shops(Id),
                FOREIGN KEY (VariantIds) REFERENCES ProductVariants(Id),
                FOREIGN KEY (CategoryId) REFERENCES Categories(Id),
                FOREIGN KEY (SubCategoryId) REFERENCES SubCategories(Id),
                FOREIGN KEY (SubSubCategoryId) REFERENCES SubSubCategories(Id),
                FOREIGN KEY (ItemsCategoryId) REFERENCES Items(Id),
            );
        `;

        await pool.request().query(createProductsTableQuery);
        console.log('Products table created successfully.');

        const createVariantsTableQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ProductVariants' AND xtype='U')
            CREATE TABLE ProductVariants (
                Id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
                ProductId UNIQUEIDENTIFIER NOT NULL,
                VariantColor NVARCHAR(100) NOT NULL,
                VariantImage NVARCHAR(MAX) NOT NULL,
                Sizes NVARCHAR(MAX) NOT NULL, 
                CreatedAt DATETIME DEFAULT GETDATE(),
                UpdatedAt DATETIME DEFAULT GETDATE(),
                FOREIGN KEY (ProductId) REFERENCES Products(Id)
            );
        `;

        await pool.request().query(createVariantsTableQuery);
        console.log('ProductVariants table created successfully.');


        const createColorVariantsTableQuery = `
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ProductColorVariants' AND xtype='U')
    CREATE TABLE ProductColorVariants (
        Id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
        ProductId UNIQUEIDENTIFIER NOT NULL,
        Color NVARCHAR(100) DEFAULT NULL, -- Color of the variant
        Image NVARCHAR(MAX) DEFAULT NULL, -- Image URL specific to this color
        Price DECIMAL(10, 2) DEFAULT NULL, -- Price for this color variant
        OldPrice DECIMAL(10, 2) DEFAULT 0, -- Old price for this color variant
        Discount DECIMAL(10, 2) DEFAULT 0, -- Discount for this color variant
        Expense DECIMAL(10, 2) DEFAULT 0, -- Discount for this color variant
        Stock DECIMAL(10, 2) DEFAULT 0, -- Discount for this color variant
        CreatedAt DATETIME DEFAULT GETDATE(),
        UpdatedAt DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (ProductId) REFERENCES Products(Id)
    );
`;

await pool.request().query(createColorVariantsTableQuery);
console.log('ProductColorVariants table created successfully.');


    } catch (err) {
        console.error('Error creating tables:', err);
    }
}

createTables();
export default createTables;

// CREATE TABLE addresses (
//     id INT IDENTITY(1,1) PRIMARY KEY,
//     userId UniqueIdentifier NOT NULL,
//     streetAddressLine1 NVARCHAR(255) NOT NULL,
//     streetAddressLine2 NVARCHAR(255) NULL,
//     city NVARCHAR(100) NOT NULL,
//     state NVARCHAR(100) NOT NULL,
//     zipCode NVARCHAR(20) NOT NULL,
//     FOREIGN KEY (userId) REFERENCES users(Id) ON DELETE CASCADE
// );
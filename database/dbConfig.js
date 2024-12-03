// database/dbConnect.js
import sql from "mssql";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Configuration for the SQL Server connection
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

// Create a connection pool and export it
const dbConnect = sql.connect(config)
  .then(async (db) => {
    if (db.connected) {
      console.log('Connected to SQL Server');

       // Check if the 'hibuydb' database exists
       const result = await db.request().query("SELECT name FROM sys.databases WHERE name = 'hibuydb'");
       if (result.recordset.length === 0) {
           // Database does not exist, create it
           await db.request().query("CREATE DATABASE hibuydb");
           console.log('Database "hibuydb" created successfully.');
       } else {
           console.log('Database "hibuydb" already exists.');
       }
        // Switch to 'hibuydb' database
        await db.request().query("USE hibuydb");
   
    }else{
      console.log("Can't Connect");
    }

    

    return db;
  })
  .catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });
export { sql, dbConnect };
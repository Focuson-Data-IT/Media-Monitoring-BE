const mysql = require('mysql2/promise');
require('dotenv').config(); // Load environment variables from .env file

// Buat koneksi ke database
const connection = mysql.createPool({
  host: process.env.DB_HOST,            // Host database
  user: process.env.DB_USER,            // User database
  password: process.env.DB_PASSWORD,    // Password database
  database: process.env.DB_NAME,         // Nama database
  waitForConnections: true,
  connectionLimit: 10,                  // Batas jumlah koneksi di pool
  queueLimit: 0  
});

module.exports = connection;

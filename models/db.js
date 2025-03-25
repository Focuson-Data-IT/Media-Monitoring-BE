const mysql = require('mysql2/promise');
require('dotenv').config(); // Load environment variables from .env file

// Buat koneksi ke database
const connection = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 3600000,
  timezone: '+07:00'
});

module.exports = connection;

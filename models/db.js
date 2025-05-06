require('dotenv').config(); // Load environment variables from .env file
const mysql = require('mysql2/promise');

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
  timezone: '+07:00',
  keepAliveInitialDelay: 10000,
  enableKeepAlive: true
});

module.exports = connection;

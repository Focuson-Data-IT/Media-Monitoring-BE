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

// Keep-alive query setiap 5 menit
// setInterval(async () => {
//   try {
//     const [rows] = await connection.query('SELECT 1');
//     console.log('Keep-alive query executed:', rows);
//   } catch (error) {
//     console.error('Keep-alive query error:', error);
//   }
// }, 300000); // 5 menit

module.exports = connection;

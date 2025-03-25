// const { Pool } = require('pg');

// // Konfigurasi untuk Connection Pool
// const pool = new Pool({
//     user: process.env.PG_USER || 'postgres', // Pengguna PostgreSQL
//     host: process.env.PG_HOST || '127.0.0.1', // Host PostgreSQL
//     database: process.env.PG_DATABASE || 'fairscores', // Nama database
//     password: process.env.PG_PASSWORD || '0000', // Password PostgreSQL
//     port: process.env.PG_PORT || 5432, // Port PostgreSQL
// });

// // Fungsi untuk menghubungkan ke PostgreSQL
// const connectDB = async () => {
//     try {
//         const client = await pool.connect();  // Mendapatkan koneksi dari pool
//         console.log('Database connected successfully');
//         client.release(); // Pastikan koneksi dilepaskan setelah digunakan
//     } catch (error) {
//         console.error('Database connection failed:', error.message);
//     }
// };

// // Fungsi untuk menjalankan query
// const fetchData = async () => {
//     const client = await pool.connect();  // Dapatkan koneksi dari pool
//     try {
//         const result = await client.query('SELECT');
//         console.log(result.rows); // Menampilkan hasil query
//     } catch (error) {
//         console.error('Query error:', error.message);
//     } finally {
//         client.release(); // Pastikan koneksi dilepaskan
//     }
// };

// // Fungsi untuk menutup pool
// const closeDB = async () => {
//     try {
//         await pool.end();  // Menutup pool koneksi
//         console.log('Database connection pool closed');
//     } catch (error) {
//         console.error('Error disconnecting from PostgreSQL:', error.message);
//     }
// };

// // Ekspor pool dan fungsi koneksi
// module.exports = { pool, connectDB, closeDB, fetchData };

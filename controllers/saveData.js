const connection = require('../models/db');

// fungsi untuk menyimpan listAkun ke database listAkun

const saveListAkun = async (listAkun) => {
    try {
        const sql = `
        INSERT INTO listAkun (client_account, platform, kategori, username)
        values (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            client_account = VALUES(client_account),
            platform = VALUES(platform),
            kategori = VALUES(kategori),
            username = VALUES(username)
    `;
        connection.query(sql, [
            listAkun.client_account, listAkun.platform, listAkun.kategori, listAkun.username
        ],
            (err, result) => {
                if (err) {
                    console.error(`Error saving listAkun ${listAkun.username} to database:`, err.message);
                }
                else {
                    consoler.log(`Saved listAkun ${listAkun.username} to database`);
                }
            }
        );
    } catch (error) {
        console.error("Error saving listAkun to database:", error);
    }
};

const saveDataUser = async () => {
    try {
        // Ambil semua akun dari tabel listAkun
        const [accounts] = await connection.query('SELECT * FROM listAkun');

        // Tentukan rentang tanggal
        const startDate = new Date('2025-01-01');
        const endDate = new Date();
        const dates = [];

        // Buat array tanggal dari startDate hingga endDate
        for (let dt = startDate; dt <= endDate; dt.setDate(dt.getDate() + 1)) {
            dates.push(new Date(dt).toISOString().split('T')[0]);
        }

        console.log(`Processing ${accounts.length} accounts for ${dates.length} dates.`);

        // Data untuk batch insert
        const batchValues = [];
        for (const account of accounts) {
            for (const date of dates) {
                batchValues.push([
                    account.list_id,
                    account.client_account,
                    account.kategori,
                    account.platform,
                    account.username,
                    date,
                ]);
            }
        }

        const insertSql = `
            INSERT INTO dailyFairScores (list_id, client_account, kategori, platform, username, date)
            VALUES ?
            ON DUPLICATE KEY UPDATE
                client_account = VALUES(client_account),
                kategori = VALUES(kategori),
                platform = VALUES(platform),
                username = VALUES(username),
                date = VALUES(date);
        `;

        // Eksekusi query dengan batch insert
        const [result] = await connection.query(insertSql, [batchValues]);

        console.log(`All data has been saved successfully. Rows affected: ${result.affectedRows}`);
    } catch (error) {
        console.error("Error saving user data to dailyFairScores:", error.message);
    }
};


module.exports = {
    saveListAkun,
    saveDataUser,
};
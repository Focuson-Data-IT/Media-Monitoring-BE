const axios = require('axios');

// Format date ke YYYY-MM-DD
function formatDate(date) {
    return date.toISOString().slice(0, 10);
}

// Hitung range tanggal
const today = new Date();
const startStr = formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
const endStr = formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));

// URL yang akan di-fetch
const urls = [
    `http://localhost:7771/instagram/getDataPostByKeywords?kategori=diskom_medmon`,
    `http://localhost:7772/tiktok/getDataPostByKeywords?kategori=diskom_medmon`,
    `http://localhost:7773/youtube/getDataPostByKeywords?start_date=${startStr}&end_date=${endStr}&kategori=diskom_medmon`,
    `http://localhost:7774/facebook/getDataPostByKeywords?start_date=${startStr}&end_date=${endStr}&kategori=diskom_medmon`,
];

// Fungsi untuk fetch dengan retry
async function fetchWithRetry(url, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await axios.get(url);
            console.log(`✅ Success [${attempt + 1}x]: ${url} (${res.status})`);
            return;
        } catch (err) {
            console.error(`❌ Attempt ${attempt + 1} failed for ${url}: ${err.message}`);
            if (attempt < retries) {
                console.log('🔁 Retrying in 3s...');
                await new Promise((r) => setTimeout(r, 3000)); // delay 3 detik sebelum retry
            } else {
                console.error(`🚨 Failed after ${retries + 1} attempts: ${url}`);
            }
        }
    }
}

(async () => {
    console.log(`=== [${new Date().toLocaleString()}] Starting fetchAll ===`);

    for (const url of urls) {
        await fetchWithRetry(url, 2); // Retry maksimal 2x
        await new Promise((r) => setTimeout(r, 2000)); // Delay antar URL
    }

    console.log(`=== Done at ${new Date().toLocaleString()} ===`);
    process.exit(0); // Biar PM2 tahu script sudah selesai
})();

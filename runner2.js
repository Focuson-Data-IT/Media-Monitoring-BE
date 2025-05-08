const axios = require('axios');

// Fungsi untuk format tanggal ke YYYY-MM-DD
function formatDate(date) {
    return date.toISOString().slice(0, 10);
}

// Hitung start dan end date
const today = new Date();
const startDate = new Date(today);
startDate.setDate(today.getDate() - 1);

const endDate = new Date(today);
endDate.setDate(today.getDate() + 1);

const startStr = formatDate(startDate);
const endStr = formatDate(endDate);

const urls = [
    `http://localhost:7771/instagram/getDataPostByKeywords?kategori=diskom_medmon`,
    `http://localhost:7772/tiktok/getDataPostByKeywords?kategori=diskom_medmon`,
    `http://localhost:7773/youtube/getDataPostByKeywords?start_date=${startStr}&end_date=${endStr}&kategori=diskom_medmon`,
    `http://localhost:7774/facebook/getDataPostByKeywords?start_date=${startStr}&end_date=${endStr}&kategori=diskom_medmon`,
];

(async () => {
    console.log(`=== [${new Date().toLocaleString()}] Starting fetch... ===`);

    for (const url of urls) {
        try {
            const res = await axios.get(url);
            console.log(`✅ Success: ${url} (${res.status})`);
        } catch (err) {
            console.error(`❌ Error on ${url}:`, err.message);
        }
        await new Promise((r) => setTimeout(r, 2000)); // 2 detik jeda antar request
    }

    console.log(`=== Done at ${new Date().toLocaleString()} ===`);
})();

const xlsx = require('xlsx');
const axios = require('axios');
const path = 'link.xlsx';

const workbook = xlsx.readFile(path);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

const run = async () => {
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const kategori = row[0];
        const url = row[1];
        const status = row[2];

        if (!kategori || !url || status === 'done') {
            console.log(`⏭️  Baris ${i + 1} dilewati (sudah done atau kosong)`);
            continue;
        }

        try {
            if (url.includes("tiktok.com")) {
                const requestUrl = `http://localhost:7770/tiktok/getCommentByCode?kategori=${encodeURIComponent(kategori)}&url=${encodeURIComponent(url)}`;
                await axios.get(requestUrl);
                console.log(`✅ Baris ${i + 1}: TikTok sukses ambil ${url}`);
            } else if (url.includes("youtube.com")) {
                const videoId = getYoutubeVideoId(url);
                if (!videoId) throw new Error("Gagal ambil video ID YouTube");

                const payload = {
                    kategori,
                    fromStart: "true",
                    unique_id_post: [videoId]
                };

                await axios.post("http://localhost:7770/youtube/getCommentv2", payload, {
                    headers: { "Content-Type": "application/json" }
                });
                console.log(`✅ Baris ${i + 1}: YouTube sukses ambil video ID ${videoId}`);
            } else {
                console.log(`⚠️  Baris ${i + 1}: Platform tidak dikenali - ${url}`);
                continue;
            }

            const cellRef = `C${i + 1}`;
            sheet[cellRef] = { t: 's', v: 'done' };
        } catch (err) {
            console.error(`❌ Baris ${i + 1}: Gagal ambil ${url} - ${err.message}`);
        }
    }

    xlsx.writeFile(workbook, path);
    console.log('📁 File Excel diperbarui dengan status done ✅');
};

// Ekstrak YouTube Video ID dari URL
function getYoutubeVideoId(url) {
    const regex = /(?:v=|\/)([0-9A-Za-z_-]{11})(?:&|$)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

run();

const xlsx = require('xlsx');
const axios = require('axios');
const fs = require('fs');

const path = 'link.xlsx';
const workbook = xlsx.readFile(path);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const PLATFORM_CONFIG = {
    instagram: { port: 7770, checker: (url) => url.includes("instagram.com") },
    tiktok: { port: 7771, checker: (url) => url.includes("tiktok.com") },
    youtube: { port: 7772, checker: (url) => url.includes("youtube.com") },
    facebook1: {
        port: 7773,
        checker: (url, i) => url.includes("facebook.com") && i % 2 === 1
    },
    facebook2: {
        port: 7774,
        checker: (url, i) => url.includes("facebook.com") && i % 2 === 0
    }
};

const retryUntilAvailable = async (fn, label, retryDelay = 5000) => {
    while (true) {
        try {
            return await fn();
        } catch (err) {
            console.warn(`❌ [${label}] Error: ${err.message}. Menunggu server kembali...`);
            await delay(retryDelay);
        }
    }
};

const saveProgress = (rowIndex) => {
    const cellRef = `C${rowIndex + 1}`;
    sheet[cellRef] = { t: 's', v: 'done' };
    xlsx.writeFile(workbook, path);
};

const getYoutubeVideoId = (url) => {
    const regex = /(?:v=|\/shorts\/|\/)([0-9A-Za-z_-]{11})(?:[?&]|$)/;
    const match = url.match(regex);
    return match ? match[1] : null;
};

const getFacebookPostId = (url) => {
    const match = url.match(/\/posts\/(\d+)|story_fbid=(\d+)/);
    return match ? (match[1] || match[2]) : null;
};

const processRow = async (rowIndex, platform) => {
    const row = data[rowIndex];
    const kategori = row[0];
    let url = String(row[1] || '').trim();
    const status = row[2];

    if (!kategori || !url || status === 'done') return;

    if (!url.startsWith("http")) url = "https://" + url;
    url = url.replace("facebook.comP", "facebook.com/P");

    const label = `Row ${rowIndex + 1} [${platform}]`;
    const port = PLATFORM_CONFIG[platform].port;

    try {
        console.log(`🚀 ${label} - ${url}`);

        if (platform.startsWith("facebook")) {
            const postId = getFacebookPostId(url);
            if (!postId) throw new Error("Gagal ambil post ID Facebook");
            const payload = { kategori, unique_id_post: postId };
            await retryUntilAvailable(() =>
                axios.post(`http://localhost:${port}/facebook/getCommentv2`, payload, {
                    headers: { "Content-Type": "application/json" }
                }), label);
        } else if (platform === 'instagram') {
            const reqUrl = `http://localhost:${port}/instagram/getCommentByCode?kategori=${encodeURIComponent(kategori)}&url=${encodeURIComponent(url)}`;
            await retryUntilAvailable(() => axios.get(reqUrl), label);
        } else if (platform === 'tiktok') {
            const reqUrl = `http://localhost:${port}/tiktok/getCommentByCode?kategori=${encodeURIComponent(kategori)}&url=${encodeURIComponent(url)}`;
            await retryUntilAvailable(() => axios.get(reqUrl), label);
        } else if (platform === 'youtube') {
            const videoId = getYoutubeVideoId(url);
            if (!videoId) throw new Error("Gagal ambil video ID YouTube");
            const payload = { kategori, fromStart: "true", unique_id_post: [videoId] };
            await retryUntilAvailable(() =>
                axios.post(`http://localhost:${port}/youtube/getCommentv3`, payload, {
                    headers: { "Content-Type": "application/json" }
                }), label);
        }

        saveProgress(rowIndex);
        console.log(`✅ ${label} selesai`);
    } catch (err) {
        console.error(`❌ ${label} gagal: ${err.message}`);
    }

    await delay(500);
};

const runPlatform = async (platform) => {
    console.log(`▶️ Mulai platform: ${platform.toUpperCase()}`);
    const checker = PLATFORM_CONFIG[platform].checker;
    const rowIndexes = [];

    for (let i = 1; i < data.length; i++) {
        const url = String(data[i][1] || '');
        if (checker(url, i)) {
            rowIndexes.push(i);
        }
    }

    for (const i of rowIndexes) {
        await processRow(i, platform);
    }

    console.log(`🏁 Platform ${platform.toUpperCase()} selesai!\n`);
};

const main = async () => {
    const platformKeys = Object.keys(PLATFORM_CONFIG);
    await Promise.all(platformKeys.map((platform) => runPlatform(platform)));
    console.log("✅ Semua platform selesai!");
};

main();

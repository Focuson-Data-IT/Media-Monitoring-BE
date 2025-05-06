const axios = require("axios");

const kategoriMap = {
    "opdbekasikab": ["instagram"],
    "prokopim_bekasikab": ["instagram"],
    "disparbud": ["instagram", "tiktok"],
    "disparbud_competitor": ["instagram", "tiktok"],
    "disparbud_ambassador": ["instagram", "tiktok"],
    "opdjabar": ["instagram", "tiktok"],
    "gubernur_jabar": ["instagram", "tiktok"],
    "opdbandung": ["instagram"],
    "parfum": ["tiktok"]
};

const portPool = {
    instagram: [7770, 7771, 7772],
    tiktok: [7773, 7774, 7775]
};

const portStatus = {
    instagram: [false, false, false],
    tiktok: [false, false, false]
};

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const waitForPort = async (platform) => {
    while (true) {
        const index = portStatus[platform].findIndex(status => !status);
        if (index !== -1) {
            portStatus[platform][index] = true;
            return portPool[platform][index];
        } else {
            process.stdout.write(`⏳ Menunggu port kosong untuk ${platform}...\r`);
        }
        await delay(200);
    }
};

const releasePort = (platform, port) => {
    const index = portPool[platform].indexOf(port);
    if (index !== -1) portStatus[platform][index] = false;
};

const runWithPort = async (platform, fn) => {
    const port = await waitForPort(platform);
    try {
        return await fn(port);
    } finally {
        releasePort(platform, port);
    }
};

const log = (msg, port) => console.log(`✅ ${msg} @${port}`);

const addDataUser = async (kategori, platform) =>
    runWithPort(platform, async (port) => {
        await axios.post(`http://localhost:${port}/fair/addDataUser`, { kategori, platform });
        log(`${kategori} ${platform} - addDataUser`, port);
    });

const processData = async (kategori, platform) =>
    runWithPort(platform, async (port) => {
        await axios.post(`http://localhost:${port}/fair/processData`, {
            kategori,
            platform,
            start_date: "2025-04-01",
            end_date: "2025-04-30"
        });
        log(`${kategori} ${platform} - processData`, port);
    });

const runKategori = async (kategori, platforms) => {
    const t0 = Date.now();

    await Promise.all(platforms.map(async (platform) => {
        await addDataUser(kategori, platform);
        await processData(kategori, platform);
    }));

    const t1 = Date.now();
    console.log(`✅ ${kategori} selesai (process fair) dalam ${(t1 - t0) / 1000}s`);
};

const runAll = async () => {
    const entries = Object.entries(kategoriMap);

    console.log("\n🚀 Memulai semua kategori secara paralel...");

    await Promise.all(
        entries.map(([kategori, platforms]) => runKategori(kategori, platforms))
    );

    console.log("\n🎉 Semua kategori selesai (processFair)!");
};

runAll();
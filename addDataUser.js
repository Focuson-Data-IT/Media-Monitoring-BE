const axios = require("axios");
const { DateTime } = require("luxon");

const kategoriMap = {
    "opdbekasikab": ["instagram"],
    "prokopim_bekasikab": ["instagram"],
    "disparbud": ["instagram", "tiktok"],
    "disparbud_competitor2": ["instagram", "tiktok"],
    "disparbud_ambassador": ["instagram", "tiktok"],
    "opdbandung": ["instagram"],
    "parfum": ["tiktok"]
};

const portPool = [7771];
const portStatus = portPool.map(() => false);

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const waitForPort = async () => {
    while (true) {
        const index = portStatus.findIndex(status => !status);
        if (index !== -1) {
            portStatus[index] = true;
            return portPool[index];
        } else {
            process.stdout.write(`⏳ Menunggu port kosong...\r`);
        }
        await delay(200);
    }
};

const releasePort = (port) => {
    const index = portPool.indexOf(port);
    if (index !== -1) {
        portStatus[index] = false;
        console.log(`🔄 Port ${port} dilepas dan siap digunakan kembali.`);
    }
};

const runWithPort = async (fn) => {
    const port = await waitForPort();
    try {
        return await fn(port);
    } finally {
        releasePort(port);
    }
};

const log = (msg, port) => console.log(`✅ ${msg} @${port}`);

const addDataUser = async (kategori, platform, startDate, endDate) =>
    runWithPort(async (port) => {
        await axios.post(`http://localhost:${port}/fair/addDataUser`, {
            kategori, platform, startDate, endDate
        });
        log(`${kategori} ${platform} - addDataUser`, port);
    });

const runAll = async () => {
    const t0 = Date.now();
    console.log("\n🚀 Memulai addDataUser untuk semua kategori dan platform satu per satu...\n");

    // Tanggal bisa diubah sesuai kebutuhan
    const now = DateTime.now().setZone("Asia/Jakarta");
    const startDate = now.minus({ days: 2 }).toISODate();
    const endDate = now.minus({ days: 1 }).toISODate();

    for (const [kategori, platforms] of Object.entries(kategoriMap)) {
        for (const platform of platforms) {
            await addDataUser(kategori, platform, startDate, endDate);
            await delay(1000);
        }
    }

    const t1 = Date.now();
    console.log(`\n🎉 Semua kategori selesai addDataUser dalam total waktu ${(t1 - t0) / 1000}s!`);
};

runAll();
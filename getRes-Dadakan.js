const axios = require("axios");

const kategoriMap = {
    "dpd": ["Instagram"],
};

const portPool = [7773];
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

const calculateResponsiveness = async (kategori) =>
    runWithPort(async (port) => {
        const t0 = Date.now();
        await axios.post(`http://localhost:${port}/api/file/calculateResponsiveness`, { kategori });
        const t1 = Date.now();
        log(`${kategori} - calculateResponsiveness (⏱️ ${(t1 - t0) / 1000}s)`, port);
    });

const runAll = async () => {
    const t0 = Date.now();
    console.log("\n🚀 Memulai semua kategori (addDataUser & calculateResponsiveness) satu per satu...\n");

    // Tanggal bisa diubah sesuai kebutuhan
    const startDate = "2025-07-01";
    const endDate = new Date().toISOString().split('T')[0];

    // 1. addDataUser untuk semua kategori dan platform, satu per satu
    for (const [kategori, platforms] of Object.entries(kategoriMap)) {
        for (const platform of platforms) {
            await addDataUser(kategori, platform, startDate, endDate);
            await delay(1000);
        }
    }

    // 2. calculateResponsiveness untuk semua kategori, satu per satu
    for (const kategori of Object.keys(kategoriMap)) {
        await calculateResponsiveness(kategori);
        await delay(1000);
    }

    const t1 = Date.now();
    console.log(`\n🎉 Semua kategori selesai dalam total waktu ${(t1 - t0) / 1000}s!`);
};

runAll();
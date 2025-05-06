const axios = require("axios");

const kategoriList = [
    "opdbekasikab",
    "prokopim_bekasikab",
    "disparbud",
    "disparbud_competitor",
    "disparbud_ambassador",
    "opdjabar",
    "gubernur_jabar",
    "opdbandung",
    "parfum"
];

// Gabungan semua port, tanpa peduli platform
const portPool = [7770, 7771, 7772, 7773, 7774, 7775];
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

const calculateResponsiveness = async (kategori) =>
    runWithPort(async (port) => {
        const t0 = Date.now();
        await axios.post(`http://localhost:${port}/api/file/calculateResponsiveness`, { kategori });
        const t1 = Date.now();
        log(`${kategori} - calculateResponsiveness (⏱️ ${(t1 - t0) / 1000}s)`, port);
    });

const runAll = async () => {
    const t0 = Date.now();
    console.log("\n🚀 Memulai semua kategori...\n");

    await Promise.all(kategoriList.map(kategori => calculateResponsiveness(kategori)));

    const t1 = Date.now();
    console.log(`\n🎉 Semua kategori selesai dalam total waktu ${(t1 - t0) / 1000}s!`);
};

runAll();
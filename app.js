const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const apiRoutes = require('./routes/api');

// Simpan log untuk SSE
let clients = [];

// Middleware untuk parsing JSON dan URL-encoded form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware untuk file statis
app.use(express.static(path.join(__dirname, 'public'))); // Set folder public

// Konfigurasi EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware untuk logging ke SSE
function sendLogToClients(message) {
    clients.forEach(client => client.res.write(`data: ${message}\n\n`));
}

function logMiddleware(req, res, next) {
    console.log = function (message) {
        process.stdout.write(message + '\n');
        sendLogToClients(message);
    };
    next();
}

// Routes
app.use('/api', logMiddleware, apiRoutes); // API route dengan logMiddleware

// SSE Route
app.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const clientId = Date.now();
    clients.push({ id: clientId, res });

    req.on('close', () => {
        clients = clients.filter(client => client.id !== clientId);
    });
});

// Route untuk semua halaman (SPA)
app.get('/', (req, res) => {
    res.render('index', { title: 'Home' }); // Render satu file saja
});

// Route untuk semua halaman (SPA)
app.get('/consolidated', (req, res) => {
    res.render('consolidatedData', { title: 'Data' }); // Render satu file saja
});

// Jalankan server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});

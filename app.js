const express = require('express');
require('dotenv').config();

const app = express();
const apiRoutes = require('./routes/api');

// Simpan log untuk SSE
let clients = [];

// Middleware untuk parsing JSON dan URL-encoded form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function logMiddleware(req, res, next) {
    console.log = function (message) {
        process.stdout.write(message + '\n');
        sendLogToClients(message);
    };
    next();
}

// Routes
app.use('/api', logMiddleware, apiRoutes); // API route dengan logMiddleware

// Jalankan server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});

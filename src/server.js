// src/server.js
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { PORT } = require('./config/constants');
const walletRoutes = require('./routes/walletRoutes');
const { refreshAllWallets } = require('./services/walletService');

// Initialize Express
const app = express();

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// API Routes
app.use('/api/wallets', walletRoutes);

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // Auto-refresh all wallets on startup
    refreshAllWallets().catch(err => {
        console.error('Failed to refresh wallets on startup:', err);
    });
});
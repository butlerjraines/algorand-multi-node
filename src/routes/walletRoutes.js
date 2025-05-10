// src/routes/walletRoutes.js
const express = require('express');
const walletController = require('../controllers/walletController');
const transactionController = require('../controllers/transactionController');

const router = express.Router();

// Wallet routes
router.get('/', walletController.getAllWallets);
router.post('/', walletController.addWallet);
router.get('/:address', walletController.getWalletDetails);
router.delete('/:address', walletController.deleteWallet);
router.post('/:address/refresh', walletController.refreshWallet);
router.get('/:address/export', walletController.exportWalletTransactions);

// Transaction routes related to wallets
router.get('/:address/transactions', transactionController.getWalletTransactions);
router.get('/:address/daily-rewards', transactionController.getDailyRewards);

module.exports = router;
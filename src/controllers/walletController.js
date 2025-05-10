// src/controllers/walletController.js
const algosdk = require('algosdk');
const walletService = require('../services/walletService');
const transactionService = require('../services/transactionService');
const path = require('path');
const fs = require('fs');

/**
 * Get all wallets
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getAllWallets(req, res) {
    try {
        const wallets = await walletService.getAllWallets();
        res.json(wallets);
    } catch (error) {
        console.error('Error getting wallets:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Get wallet details
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getWalletDetails(req, res) {
    try {
        const address = req.params.address;
        const walletDetails = await walletService.getWalletDetails(address);
        res.json(walletDetails);
    } catch (error) {
        console.error('Error getting wallet details:', error);
        res.status(error.message === 'Wallet not found' ? 404 : 500)
            .json({ error: error.message || 'Internal server error' });
    }
}

/**
 * Add new wallet
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function addWallet(req, res) {
    try {
        const { address, name, initialAmount } = req.body;
        
        // Validate Algorand address
        if (!algosdk.isValidAddress(address)) {
            return res.status(400).json({ error: 'Invalid Algorand address' });
        }
        
        const newWallet = await walletService.addWallet({ address, name, initialAmount });
        
        // Start fetching transactions in background
        transactionService.fetchLatestTransactions(newWallet, require('../config/constants').REWARD_SENDER)
            .catch(error => console.error('Error fetching transactions:', error));
        
        res.status(201).json(newWallet);
    } catch (error) {
        console.error('Error adding wallet:', error);
        res.status(error.message === 'Wallet already exists' ? 400 : 500)
            .json({ error: error.message || 'Internal server error' });
    }
}

/**
 * Delete wallet
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteWallet(req, res) {
    try {
        const address = req.params.address;
        
        // Check if wallet exists
        const wallet = await walletService.getWalletByAddress(address);
        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }
        
        // Delete wallet
        await walletService.deleteWallet(address);
        
        res.json({ message: 'Wallet removed successfully' });
    } catch (error) {
        console.error('Error removing wallet:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Refresh wallet data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function refreshWallet(req, res) {
    try {
        const address = req.params.address;
        
        // Check if wallet exists
        const wallet = await walletService.getWalletByAddress(address);
        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }
        
        // Start refresh in background
        res.json({ message: 'Refresh started' });
        
        // Perform refresh after sending response
        await transactionService.fetchLatestTransactions(wallet, require('../config/constants').REWARD_SENDER);
    } catch (error) {
        console.error('Error refreshing wallet:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Export wallet transactions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function exportWalletTransactions(req, res) {
    try {
        const address = req.params.address;
        
        // Check if wallet exists
        const wallet = await walletService.getWalletByAddress(address);
        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }
        
        // Get export data
        const exportData = await transactionService.exportWalletTransactions(address, wallet);
        
        // Create CSV file
        const tempDir = path.join(__dirname, '../../public/temp');
        
        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const filePath = path.join(tempDir, exportData.filename);
        fs.writeFileSync(filePath, exportData.content);
        
        // Send file
        res.download(filePath, exportData.filename, (err) => {
            if (err) {
                console.error('Error sending file:', err);
            }
            
            // Delete file after sending
            try {
                fs.unlinkSync(filePath);
            } catch (e) {
                console.error('Error deleting temp file:', e);
            }
        });
    } catch (error) {
        console.error('Error exporting transactions:', error);
        res.status(error.message === 'No transactions found' ? 404 : 500)
            .json({ error: error.message || 'Internal server error' });
    }
}

module.exports = {
    getAllWallets,
    getWalletDetails,
    addWallet,
    deleteWallet,
    refreshWallet,
    exportWalletTransactions
};
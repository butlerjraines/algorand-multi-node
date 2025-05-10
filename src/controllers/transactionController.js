// src/controllers/transactionController.js
const transactionService = require('../services/transactionService');
const walletService = require('../services/walletService');
const { REWARD_SENDER } = require('../config/constants');

/**
 * Get wallet transactions with pagination
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getWalletTransactions(req, res) {
    try {
        const address = req.params.address;
        const limit = parseInt(req.query.limit) || 20;
        const skip = parseInt(req.query.skip) || 0;
        
        const data = await transactionService.getWalletTransactions(address, limit, skip);
        res.json(data);
    } catch (error) {
        console.error('Error getting transactions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Get daily rewards for a wallet
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getDailyRewards(req, res) {
    try {
        const address = req.params.address;
        const data = await transactionService.getDailyRewards(address, REWARD_SENDER);
        res.json(data);
    } catch (error) {
        console.error('Error getting daily rewards:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}

module.exports = {
    getWalletTransactions,
    getDailyRewards
};
// src/services/aprService.js
const { connectToDatabase } = require('../config/database');
const { REWARD_SENDER } = require('../config/constants');

/**
 * Calculate Annual Percentage Rate (APR) for a wallet
 * @param {Object} wallet - Wallet configuration
 * @returns {Promise<Object>} APR calculation results
 */
async function calculateAPR(wallet) {
    const { client, collection } = await connectToDatabase();
    const address = wallet.address;

    try {
        const initialAlgoMicroAlgos = BigInt(wallet.initialAlgoAmount * 1_000_000);
        const keyRegTx = await collection.findOne({
            txID: wallet.startingTransactionId,
            wallet: address
        });

        if (!keyRegTx) {
            return {
                address,
                name: wallet.name || address.substring(0, 8),
                initialAmount: wallet.initialAlgoAmount,
                totalRewards: 0,
                timeElapsedDays: 0,
                estimatedAPR: 0
            };
        }

        const startTime = keyRegTx.roundTime;
        console.log(`✅ [${wallet.address}] Starting APR from: ${new Date(startTime * 1000).toUTCString()}`);

        const rewardTxs = await collection.find({
            sender: REWARD_SENDER,
            receiver: address,
            wallet: address,
            roundTime: { $gte: startTime }
        }).sort({ roundTime: 1 }).toArray();

        if (rewardTxs.length === 0) {
            return {
                address,
                name: wallet.name || address.substring(0, 8),
                initialAmount: wallet.initialAlgoAmount,
                totalRewards: 0,
                timeElapsedDays: 0,
                estimatedAPR: 0
            };
        }

        let totalRewards = BigInt(0);
        let balance = initialAlgoMicroAlgos;
        const balanceHistory = [];

        for (const tx of rewardTxs) {
            totalRewards += BigInt(tx.amount);
            balance += BigInt(tx.amount);
            balanceHistory.push({ time: tx.roundTime, balance });
        }

        const lastRewardTime = rewardTxs[rewardTxs.length - 1].roundTime;
        const sumBalances = balanceHistory.reduce((sum, entry) => sum + Number(entry.balance), 0);
        const avgBalance = sumBalances / balanceHistory.length;

        const totalRewardsAlgos = Number(totalRewards) / 1_000_000;
        const avgBalanceAlgos = avgBalance / 1_000_000;
        const timeElapsedDays = (lastRewardTime - startTime) / (60 * 60 * 24);
        const timeElapsedYears = timeElapsedDays / 365;

        const estimatedAPR = timeElapsedYears > 0
            ? ((totalRewardsAlgos / avgBalanceAlgos) / timeElapsedYears) * 100
            : 0;

        return {
            address,
            name: wallet.name || address.substring(0, 8),
            initialAmount: wallet.initialAlgoAmount,
            totalRewards: totalRewardsAlgos,
            timeElapsedDays,
            estimatedAPR
        };
    } catch (error) {
        console.error(`❌ Error calculating APR for ${address}:`, error.message);
        return null;
    } finally {
        await client.close();
    }
}

module.exports = { calculateAPR };
// src/services/walletService.js
const { connectToDatabase } = require('../config/database');
const { REWARD_SENDER } = require('../config/constants');
const axios = require('axios');

/**
 * Get all wallets
 * @returns {Promise<Array>} List of wallets
 */
async function getAllWallets() {
    const { client, walletConfigCollection } = await connectToDatabase();
    
    try {
        return await walletConfigCollection.find({}).toArray();
    } finally {
        await client.close();
    }
}

/**
 * Get wallet by address
 * @param {string} address - Wallet address
 * @returns {Promise<Object>} Wallet data
 */
async function getWalletByAddress(address) {
    const { client, walletConfigCollection } = await connectToDatabase();
    
    try {
        return await walletConfigCollection.findOne({ address });
    } finally {
        await client.close();
    }
}

/**
 * Add new wallet
 * @param {Object} walletData - Wallet data
 * @returns {Promise<Object>} Created wallet
 */
async function addWallet(walletData) {
    const { client, walletConfigCollection } = await connectToDatabase();
    
    try {
        // Check if wallet already exists
        const existingWallet = await walletConfigCollection.findOne({ address: walletData.address });
        if (existingWallet) {
            throw new Error('Wallet already exists');
        }
        
        // Add new wallet
        let initialAlgoAmount = 0;
        // Use hardcoded value for the specific address
        if (walletData.address === 'CZMNXX6Z4EFY2I66O5ZLYJVE3E3WI3FAIGKCGZ7P6ZDTBSXY7BWW7TGS5Y') {
            initialAlgoAmount = 302935.133775;
        } else if (walletData.initialAmount) {
            // Otherwise use the provided initial amount
            initialAlgoAmount = parseFloat(walletData.initialAmount);
        }
        
        const newWallet = {
            address: walletData.address,
            name: walletData.name || `Node-${walletData.address.substring(0, 8)}`,
            initialAlgoAmount: initialAlgoAmount,
            startingTransactionId: '', // Will be identified automatically
            addedAt: new Date()
        };
        
        await walletConfigCollection.insertOne(newWallet);
        return newWallet;
    } finally {
        await client.close();
    }
}

/**
 * Delete wallet
 * @param {string} address - Wallet address
 * @returns {Promise<boolean>} Success status
 */
async function deleteWallet(address) {
    const { client, walletConfigCollection } = await connectToDatabase();
    
    try {
        const result = await walletConfigCollection.deleteOne({ address });
        return result.deletedCount > 0;
    } finally {
        await client.close();
    }
}

/**
 * Calculate wallet balance
 * @param {Object} wallet - Wallet object
 * @returns {Promise<Object>} Balance information
 */
async function calculateWalletBalance(wallet) {
    const { client, collection } = await connectToDatabase();
    const address = wallet.address;
    
    try {
        // Get the initial algo amount (either from config or default to 0)
        let initialAlgoAmount;
        if (address === 'CZMNXX6Z4EFY2I66O5ZLYJVE3E3WI3FAIGKCGZ7P6ZDTBSXY7BWW7TGS5Y') {
            initialAlgoAmount = 302935.133775; // Use the hardcoded value
        } else {
            initialAlgoAmount = wallet.initialAlgoAmount || 0;
        }
        let totalBalance = BigInt(initialAlgoAmount * 1_000_000);
        
        // Find the Key Registration Transaction
        const keyRegTx = await collection.findOne({ 
            wallet: address,
            txID: wallet.startingTransactionId
        });
        
        if (!keyRegTx) {
            // Try to find the first key registration
            const firstKeyReg = await collection.findOne({ 
                wallet: address, 
                type: 'keyreg',
                sender: address,
                fee: 2000000
            }, { sort: { confirmedRound: 1 } });
            
            if (!firstKeyReg) {
                return {
                    address,
                    name: wallet.name || address.substring(0, 8),
                    initialAlgoAmount,
                    totalFeesPaid: 0,
                    totalRewardsReceived: 0,
                    finalBalance: initialAlgoAmount
                };
            }
            
            // Update wallet config with first key reg
            const { walletConfigCollection } = await connectToDatabase();
            await walletConfigCollection.updateOne(
                { address },
                { $set: { startingTransactionId: firstKeyReg.txID } }
            );
            
            wallet.startingTransactionId = firstKeyReg.txID;
        }
        
        const startTime = keyRegTx ? keyRegTx.roundTime : 0;

        // Calculate key registration fees separately
        const keyRegTransactions = await collection.find({ 
            wallet: address, 
            type: 'keyreg',
            sender: address
        }).toArray();
        
        let keyRegFees = BigInt(0);
        keyRegTransactions.forEach(tx => {
            keyRegFees += BigInt(tx.fee || 0);
        });

        // Subtract all fees from transactions sent by this wallet
        const allTransactions = await collection.find({ 
            sender: address,
            wallet: address
        }).toArray();

        let totalFees = BigInt(0);
        allTransactions.forEach((tx) => {
            totalFees += BigInt(tx.fee || 0);
        });

        totalBalance -= totalFees;

        // Add rewards received after key registration
        const payTransactions = await collection.find({ 
            type: "pay", 
            receiver: address,
            wallet: address,
            roundTime: { $gte: startTime } 
        }).toArray();

        let totalReceived = BigInt(0);

        payTransactions.forEach((tx) => {
            if (tx.note && tx.note.includes("ProposerPayout")) {
                totalReceived += BigInt(tx.amount);
            }
        });

        let finalWalletBalance = totalBalance + totalReceived;

        // Convert to Algos for display only
        const keyRegFeesAlgos = Number(keyRegFees) / 1_000_000;
        const totalFeesAlgos = Number(totalFees) / 1_000_000;
        const totalReceivedAlgos = Number(totalReceived) / 1_000_000;
        const finalWalletBalanceAlgos = Number(finalWalletBalance) / 1_000_000;

        return {
            address,
            name: wallet.name || address.substring(0, 8),
            initialAlgoAmount,
            keyRegFees: keyRegFeesAlgos,
            totalFeesPaid: totalFeesAlgos,
            totalRewardsReceived: totalReceivedAlgos,
            finalBalance: finalWalletBalanceAlgos
        };
    } catch (error) {
        console.error(`Error calculating wallet balance for ${address}:`, error.message);
        return null;
    } finally {
        await client.close();
    }
}

/**
 * Calculate wallet rewards
 * @param {Object} wallet - Wallet object
 * @returns {Promise<Object>} Rewards information
 */
async function calculateRewards(wallet) {
    const { client, collection } = await connectToDatabase();
    const address = wallet.address;
    
    try {
        // Find transactions from reward sender to this wallet
        const transactions = await collection.find({ 
            sender: REWARD_SENDER,
            receiver: address,
            wallet: address
        }).sort({ roundTime: 1 }).toArray();
        
        if (transactions.length === 0) {
            return {
                address,
                name: wallet.name || address.substring(0, 8),
                totalRewards: 0,
                transactionCount: 0,
                avgRewardsPerDay: 0,
                highestReward: 0,
                lowestReward: 0
            };
        }

        let totalRewards = BigInt(0);
        let rewardsPerDay = {};
        let highestReward = BigInt(0);
        let lowestReward = BigInt(transactions[0].amount);

        transactions.forEach((tx) => {
            const amount = BigInt(tx.amount);
            totalRewards += amount;
            
            // Track highest and lowest rewards
            if (amount > highestReward) {
                highestReward = amount;
            }
            if (amount < lowestReward) {
                lowestReward = amount;
            }
            
            const day = new Date(tx.roundTime * 1000).toISOString().split('T')[0];
            if (!rewardsPerDay[day]) rewardsPerDay[day] = BigInt(0);
            rewardsPerDay[day] += amount;
        });

        const numDays = Object.keys(rewardsPerDay).length;
        const avgRewardsPerDay = numDays > 0 ? Number(totalRewards) / numDays / 1_000_000 : 0;

        // Convert to Algos
        const highestRewardAlgos = Number(highestReward) / 1_000_000;
        const lowestRewardAlgos = Number(lowestReward) / 1_000_000;

        return {
            address,
            name: wallet.name || address.substring(0, 8),
            totalRewards: Number(totalRewards) / 1_000_000,
            transactionCount: transactions.length,
            avgRewardsPerDay,
            highestReward: highestRewardAlgos,
            lowestReward: lowestRewardAlgos
        };
    } catch (error) {
        console.error(`Error calculating rewards for ${address}:`, error.message);
        return null;
    } finally {
        await client.close();
    }
}

/**
 * Get wallet details including balance, rewards, and price data
 * @param {string} address - Wallet address
 * @returns {Promise<Object>} Wallet details
 */
async function getWalletDetails(address) {
    const { client, walletConfigCollection, collection } = await connectToDatabase();
    
    try {
        // Get wallet config
        const wallet = await walletConfigCollection.findOne({ address });
        if (!wallet) {
            throw new Error('Wallet not found');
        }
        
        // Calculate wallet stats
        const balance = await calculateWalletBalance(wallet);
        const rewards = await calculateRewards(wallet);
        
        // Import from external module
        const { calculateAPR } = require('./aprService');
        const apr = await calculateAPR(wallet);
        
        // Get transactions count
        const txCount = await collection.countDocuments({ 
            sender: REWARD_SENDER,
            receiver: address,
            wallet: address 
        });
        
        // Get current ALGO price
        let algoPrice = 0;
        try {
            const response = await axios.get('https://api.coinbase.com/v2/prices/ALGO-USD/spot');
            algoPrice = parseFloat(response.data.data.amount);
        } catch (error) {
            console.error('Error fetching ALGO price:', error.message);
        }
        
        return {
            wallet,
            balance,
            rewards,
            apr,
            transactionCount: txCount,
            algoPrice
        };
    } finally {
        await client.close();
    }
}

/**
 * Refresh all wallets
 * @returns {Promise<void>}
 */
async function refreshAllWallets() {
    try {
        console.log('Auto-refreshing all wallets...');
        
        const { client, walletConfigCollection } = await connectToDatabase();
        
        try {
            const wallets = await walletConfigCollection.find({}).toArray();
            console.log(`Found ${wallets.length} wallets to refresh`);
            
            // Import to avoid circular dependencies
            const { fetchLatestTransactions } = require('./transactionService');
            
            for (const wallet of wallets) {
                console.log(`Refreshing wallet: ${wallet.name || wallet.address}`);
                await fetchLatestTransactions(wallet, REWARD_SENDER);
            }
            
            console.log('All wallets refreshed successfully');
        } finally {
            await client.close();
        }
    } catch (error) {
        console.error('Error auto-refreshing wallets:', error);
        throw error;
    }
}

module.exports = {
    getAllWallets,
    getWalletByAddress,
    addWallet,
    deleteWallet,
    calculateWalletBalance,
    calculateRewards,
    getWalletDetails,
    refreshAllWallets
};
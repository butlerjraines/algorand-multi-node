// src/services/transactionService.js
const algosdk = require('algosdk');
const { connectToDatabase } = require('../config/database');
const { INDEXER_SERVER, INDEXER_TOKEN, PAGINATION } = require('../config/constants');

/**
 * Fetch transactions with pagination
 * @param {string} address - Wallet address
 * @param {number} limit - Number of transactions to return
 * @param {number} skip - Number of transactions to skip
 * @returns {Promise<Object>} Transactions with pagination data
 */
async function getWalletTransactions(address, limit = PAGINATION.DEFAULT_LIMIT, skip = PAGINATION.DEFAULT_SKIP) {
    const { client, collection } = await connectToDatabase();
    
    try {
        // Get transactions
        const transactions = await collection.find({ wallet: address })
            .sort({ confirmedRound: -1 })
            .limit(limit)
            .skip(skip)
            .toArray();
        
        // Get total count
        const total = await collection.countDocuments({ wallet: address });
        
        return {
            transactions,
            total,
            limit,
            skip
        };
    } finally {
        await client.close();
    }
}

/**
 * Fetch daily reward totals for a wallet
 * @param {string} address - Wallet address
 * @returns {Promise<Array>} Daily rewards data
 */
async function getDailyRewards(address, rewardSender) {
    const { client, collection } = await connectToDatabase();
    
    try {
        // Find transactions from reward sender to this wallet
        const transactions = await collection.find({ 
            sender: rewardSender,
            receiver: address,
            wallet: address
        }).sort({ roundTime: 1 }).toArray();
        
        // Group by day
        const dailyRewards = {};
        
        transactions.forEach((tx) => {
            const date = new Date(tx.roundTime * 1000).toISOString().split('T')[0];
            if (!dailyRewards[date]) {
                dailyRewards[date] = {
                    date,
                    totalAmount: 0,
                    count: 0
                };
            }
            
            dailyRewards[date].totalAmount += Number(tx.amount) / 1_000_000;
            dailyRewards[date].count += 1;
        });
        
        // Convert to array and sort by date
        return Object.values(dailyRewards).sort((a, b) => 
            new Date(b.date) - new Date(a.date)
        );
    } finally {
        await client.close();
    }
}

/**
 * Fetch latest transactions for a wallet
 * @param {Object} wallet - Wallet configuration
 * @param {string} rewardSender - Reward sender address
 * @returns {Promise<void>}
 */
async function fetchLatestTransactions(wallet, rewardSender) {
    const { client, collection } = await connectToDatabase();
    const indexerClient = new algosdk.Indexer(INDEXER_TOKEN, INDEXER_SERVER, '');
    const address = wallet.address;
    const walletName = wallet.name || address.substring(0, 8);

    console.log(`Fetching transactions for ${walletName} (${address})`);

    try {
        // Find the last transaction round we have for this wallet
        const lastTx = await collection.find({ wallet: address }).sort({ confirmedRound: -1 }).limit(1).toArray();
        const lastRound = lastTx.length > 0 ? lastTx[0].confirmedRound : 0;

        console.log(`Fetching transactions after round: ${lastRound}`);

        // Fetch transactions with pagination support for first scan
        let transactions = [];
        let nextToken = null;
        const limit = PAGINATION.TRANSACTION_FETCH_LIMIT;
        
        do {
            const searchParams = indexerClient
                .searchForTransactions()
                .address(address)
                .minRound(lastRound + 1)
                .limit(limit);
            
            if (nextToken) {
                searchParams.nextToken(nextToken);
            }
            
            const response = await searchParams.do();
            transactions = transactions.concat(response.transactions);
            nextToken = response['next-token'];
            
            console.log(`Fetched ${response.transactions.length} transactions, total: ${transactions.length}`);
            
            // Continue fetching on first scan (lastRound === 0) if more transactions available
        } while (nextToken && lastRound === 0);

        console.log(`Total fetched: ${transactions.length} new transactions.`);

        // Detect first key registration if needed
        if (lastRound === 0 && !wallet.startingTransactionId) {
            const keyRegTransactions = transactions.filter(tx => 
                tx.txType === 'keyreg' &&
                tx.sender === address &&
                tx.fee >= 2000000
            ).sort((a, b) => a.confirmedRound - b.confirmedRound);
            
            if (keyRegTransactions.length > 0) {
                const firstKeyReg = keyRegTransactions[0];
                console.log(`Found first key registration: ${firstKeyReg.id}`);
                
                // Update wallet config
                const { walletConfigCollection } = await connectToDatabase();
                await walletConfigCollection.updateOne(
                    { address },
                    { $set: { startingTransactionId: firstKeyReg.id } }
                );
                
                wallet.startingTransactionId = firstKeyReg.id;
            }
        }

        // Process transactions
        for (const tx of transactions) {
            const txFee = Number(tx.fee || 0);
            const txNote = tx.note ? Buffer.from(Object.values(tx.note)).toString('utf8') : '';

            // Check if transaction already exists
            const existingTx = await collection.findOne({ txID: tx.id, wallet: address });
            if (existingTx) {
                console.log(`Skipping duplicate transaction: ${tx.id}`);
                continue;
            }

            // Handle Key Registration Transactions
            if (tx.txType === 'keyreg' && tx.sender === address) {
                await collection.insertOne({
                    txID: tx.id,
                    sender: tx.sender,
                    wallet: address,
                    roundTime: tx.roundTime,
                    confirmedRound: tx.confirmedRound,
                    fee: txFee,
                    keyRegDate: new Date(tx.roundTime * 1000).toUTCString(),
                    type: tx.txType
                });
            }

            // Handle Payment Transactions
            if (tx.txType === 'pay') {
                await collection.insertOne({
                    txID: tx.id,
                    amount: Number(BigInt(tx.paymentTransaction?.amount || 0)),
                    sender: tx.sender,
                    receiver: tx.paymentTransaction?.receiver || '',
                    wallet: address,
                    roundTime: tx.roundTime,
                    confirmedRound: tx.confirmedRound,
                    fee: txFee,
                    note: txNote,
                    type: tx.txType
                });
            }
        }
    } catch (error) {
        console.error(`Error fetching transactions for ${walletName}:`, error.message);
        throw error;
    } finally {
        await client.close();
    }
}

/**
 * Export wallet transactions as CSV
 * @param {string} address - Wallet address
 * @param {Object} wallet - Wallet configuration
 * @returns {Promise<Object>} Export data
 */
async function exportWalletTransactions(address, wallet) {
    const { client, collection } = await connectToDatabase();
    
    try {
        // Get transactions
        const transactions = await collection.find({ wallet: address })
            .sort({ confirmedRound: -1 })
            .toArray();
        
        if (transactions.length === 0) {
            throw new Error('No transactions found');
        }
        
        // Create CSV content
        const walletName = wallet.name || address.substring(0, 8);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${walletName}_transactions_${timestamp}.csv`;
        
        const header = 'txID,wallet,amount,sender,receiver,roundTime,confirmedRound,fee,type,note\n';
        const rows = transactions.map(tx => 
            `${tx.txID},${tx.wallet || address},${tx.amount || ''},${tx.sender || ''},${tx.receiver || ''},${tx.roundTime},${tx.confirmedRound},${tx.fee},"${tx.type || 'unknown'}","${tx.note || ''}"`
        ).join('\n');

        return {
            filename,
            content: header + rows
        };
    } finally {
        await client.close();
    }
}

module.exports = {
    getWalletTransactions,
    getDailyRewards,
    fetchLatestTransactions,
    exportWalletTransactions
};
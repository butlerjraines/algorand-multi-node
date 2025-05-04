const express = require('express');
const { MongoClient } = require('mongodb');
const algosdk = require('algosdk');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');

// Configuration
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'algorand';
const COLLECTION_NAME = 'transactions'; // Use your existing collection
const WALLET_CONFIG_COLLECTION = 'wallet_configs';
const INDEXER_SERVER = 'https://mainnet-idx.4160.nodely.dev';
const INDEXER_TOKEN = 'a'.repeat(64);
const REWARD_SENDER = 'Y76M3MSY6DKBRHBL7C3NNDXGS5IIMQVQVUAB6MP4XEMMGVF2QWNPL226CA';
const PORT = process.env.PORT || 3001;

// Initialize Express
const app = express();
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Connect to database
async function connectToDatabase() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    return { 
        client, 
        db: client.db(DB_NAME), 
        collection: client.db(DB_NAME).collection(COLLECTION_NAME),
        walletConfigCollection: client.db(DB_NAME).collection(WALLET_CONFIG_COLLECTION)
    };
}

// API endpoint to add a new node
// API endpoint to add a new node
app.post('/api/wallets', async (req, res) => {
    try {
        const { address, name, initialAmount } = req.body;
        
        // Validate Algorand address
        if (!algosdk.isValidAddress(address)) {
            return res.status(400).json({ error: 'Invalid Algorand address' });
        }
        
        const { client, walletConfigCollection } = await connectToDatabase();
        
        try {
            // Check if node already exists
            const existingWallet = await walletConfigCollection.findOne({ address });
            if (existingWallet) {
                return res.status(400).json({ error: 'Node already exists' });
            }
            
            // Add new node
            let initialAlgoAmount = 0;
            // Use hardcoded value for the specific address
            if (address === 'CZMNXX6Z4EFY2I66O5ZLYJVE3E3WI3FAIGKCGZ7P6ZDTBSXY7BWW7TGS5Y') {
                initialAlgoAmount = 302935.133775;
            } else if (initialAmount) {
                // Otherwise use the provided initial amount
                initialAlgoAmount = parseFloat(initialAmount);
            }
            
            const newWallet = {
                address,
                name: name || `Node-${address.substring(0, 8)}`,
                initialAlgoAmount: initialAlgoAmount,
                startingTransactionId: '', // Will be identified automatically
                addedAt: new Date()
            };
            
            await walletConfigCollection.insertOne(newWallet);
            
            // Start fetching transactions in the background
            fetchLatestTransactions(newWallet).catch(console.error);
            
            res.status(201).json(newWallet);
        } finally {
            await client.close();
        }
    } catch (error) {
        console.error('Error adding node:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to get all nodes
app.get('/api/wallets', async (req, res) => {
    try {
        const { client, walletConfigCollection } = await connectToDatabase();
        
        try {
            const wallets = await walletConfigCollection.find({}).toArray();
            res.json(wallets);
        } finally {
            await client.close();
        }
    } catch (error) {
        console.error('Error getting nodes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to get node details
app.get('/api/wallets/:address', async (req, res) => {
    try {
        const address = req.params.address;
        
        const { client, walletConfigCollection, collection } = await connectToDatabase();
        
        try {
            // Get node config
            const wallet = await walletConfigCollection.findOne({ address });
            if (!wallet) {
                return res.status(404).json({ error: 'Node not found' });
            }
            
            // Calculate node stats
            const balance = await calculateWalletBalance(wallet);
            const rewards = await calculateRewards(wallet);
            const apr = await calculateAPR(wallet);
            
            // Get transactions count
            const txCount = await collection.countDocuments({ 
                sender: REWARD_SENDER,
                receiver: address,
                wallet: address 
            });
            
            res.json({
                wallet,
                balance,
                rewards,
                apr,
                transactionCount: txCount
            });
        } finally {
            await client.close();
        }
    } catch (error) {
        console.error('Error getting node details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to get node transactions
app.get('/api/wallets/:address/transactions', async (req, res) => {
    try {
        const address = req.params.address;
        const limit = parseInt(req.query.limit) || 20;
        const skip = parseInt(req.query.skip) || 0;
        
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
            
            res.json({
                transactions,
                total,
                limit,
                skip
            });
        } finally {
            await client.close();
        }
    } catch (error) {
        console.error('Error getting transactions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to refresh node data
app.post('/api/wallets/:address/refresh', async (req, res) => {
    try {
        const address = req.params.address;
        
        const { client, walletConfigCollection } = await connectToDatabase();
        
        try {
            // Get node config
            const wallet = await walletConfigCollection.findOne({ address });
            if (!wallet) {
                return res.status(404).json({ error: 'Node not found' });
            }
            
            // Start refresh in background
            res.json({ message: 'Refresh started' });
            
            // Perform refresh after sending response
            await fetchLatestTransactions(wallet);
        } finally {
            await client.close();
        }
    } catch (error) {
        console.error('Error refreshing node:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to export node transactions as CSV
app.get('/api/wallets/:address/export', async (req, res) => {
    try {
        const address = req.params.address;
        
        const { client, walletConfigCollection, collection } = await connectToDatabase();
        
        try {
            // Get node config
            const wallet = await walletConfigCollection.findOne({ address });
            if (!wallet) {
                return res.status(404).json({ error: 'Node not found' });
            }
            
            // Get transactions
            const transactions = await collection.find({ wallet: address })
                .sort({ confirmedRound: -1 })
                .toArray();
            
            if (transactions.length === 0) {
                return res.status(404).json({ error: 'No transactions found' });
            }
            
            // Create CSV
            const walletName = wallet.name || address.substring(0, 8);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${walletName}_transactions_${timestamp}.csv`;
            const filePath = path.join(__dirname, 'public', 'temp', filename);
            
            // Ensure temp directory exists
            if (!fs.existsSync(path.join(__dirname, 'public', 'temp'))) {
                fs.mkdirSync(path.join(__dirname, 'public', 'temp'), { recursive: true });
            }
            
            const header = 'txID,wallet,amount,sender,receiver,roundTime,confirmedRound,fee,type,note\n';
            const rows = transactions.map(tx => 
                `${tx.txID},${tx.wallet || address},${tx.amount || ''},${tx.sender || ''},${tx.receiver || ''},${tx.roundTime},${tx.confirmedRound},${tx.fee},"${tx.type || 'unknown'}","${tx.note || ''}"`
            ).join('\n');

            fs.writeFileSync(filePath, header + rows);
            
            // Send file
            res.download(filePath, filename, (err) => {
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
        } finally {
            await client.close();
        }
    } catch (error) {
        console.error('Error exporting transactions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to handle node removal
app.delete('/api/wallets/:address', async (req, res) => {
    try {
        const address = req.params.address;
        
        const { client, walletConfigCollection } = await connectToDatabase();
        
        try {
            // Check if node exists
            const wallet = await walletConfigCollection.findOne({ address });
            if (!wallet) {
                return res.status(404).json({ error: 'Node not found' });
            }
            
            // Delete node from config collection
            await walletConfigCollection.deleteOne({ address });
            
            // Note: We're not deleting transaction data, just the node configuration
            
            res.json({ message: 'Node removed successfully' });
        } finally {
            await client.close();
        }
    } catch (error) {
        console.error('Error removing node:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Fetch latest transactions for a node
async function fetchLatestTransactions(wallet) {
    const { client, collection } = await connectToDatabase();
    const indexerClient = new algosdk.Indexer(INDEXER_TOKEN, INDEXER_SERVER, '');
    const address = wallet.address;
    const walletName = wallet.name || address.substring(0, 8);

    console.log(`Fetching transactions for ${walletName} (${address})`);

    try {
        // Find the last transaction round we have for this node
        const lastTx = await collection.find({ wallet: address }).sort({ confirmedRound: -1 }).limit(1).toArray();
        const lastRound = lastTx.length > 0 ? lastTx[0].confirmedRound : 0;

        console.log(`Fetching transactions after round: ${lastRound}`);

        // Fetch transactions with pagination support for first scan
        let transactions = [];
        let nextToken = null;
        const limit = 500;
        
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
        console.log(`🧪 lastRound = ${lastRound}`);
console.log(`🧪 wallet.startingTransactionId = ${wallet.startingTransactionId}`);
        if (lastRound === 0 && !wallet.startingTransactionId) {
            const keyRegTransactions = transactions.filter(tx => 
                tx.txType === 'keyreg' &&
                tx.sender === address &&
                tx.fee >= 2000000
            ).sort((a, b) => a.confirmedRound - b.confirmedRound);
            
            if (keyRegTransactions.length > 0) {
                const firstKeyReg = keyRegTransactions[0];
                console.log(`Found first key registration: ${firstKeyReg.id}`);
                
                // Update node config
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
    } finally {
        await client.close();
    }
}

// Calculate node balance
async function calculateWalletBalance(wallet) {
    const { client, collection } = await connectToDatabase();
    const address = wallet.address;
    
    try {
        // Get the initial algo amount (either from config or default to 0)
      //  let initialAlgoAmount = wallet.initialAlgoAmount || 0;
        if (address === 'CZMNXX6Z4EFY2I66O5ZLYJVE3E3WI3FAIGKCGZ7P6ZDTBSXY7BWW7TGS5Y') {
            initialAlgoAmount = 302935.133775; // Use the hardcoded value from nodeIndex.js
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
            
            // Update node config with first key reg
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

        // Subtract all fees from transactions sent by this node
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
        console.error(`Error calculating node balance for ${address}:`, error.message);
        return null;
    } finally {
        await client.close();
    }
}

// Calculate rewards
async function calculateRewards(wallet) {
    const { client, collection } = await connectToDatabase();
    const address = wallet.address;
    
    try {
        // Find transactions from reward sender to this node
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

// Calculate APR

const { calculateAPR } = require('./utils/aprCalculator');

// API endpoint to get daily reward totals
// API endpoint to get daily reward totals
app.get('/api/wallets/:address/daily-rewards', async (req, res) => {
    let client;
    try {
        const address = req.params.address;
        
        const dbConnection = await connectToDatabase();
        client = dbConnection.client;
        const collection = dbConnection.collection;
        
        // Find transactions from reward sender to this node
        const transactions = await collection.find({ 
            sender: REWARD_SENDER,
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
        const result = Object.values(dailyRewards).sort((a, b) => 
            new Date(b.date) - new Date(a.date)
        );
        
        res.json(result);
    } catch (error) {
        console.error('Error getting daily rewards:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

async function autoRefreshAllNodes() {
    try {
        console.log('Auto-refreshing all nodes on startup...');
        
        const { client, walletConfigCollection } = await connectToDatabase();
        
        try {
            const wallets = await walletConfigCollection.find({}).toArray();
            console.log(`Found ${wallets.length} nodes to refresh`);
            
            for (const wallet of wallets) {
                console.log(`Refreshing node: ${wallet.name || wallet.address}`);
                await fetchLatestTransactions(wallet);
            }
            
            console.log('All nodes refreshed successfully');
        } finally {
            await client.close();
        }
    } catch (error) {
        console.error('Error auto-refreshing nodes:', error);
    }
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Auto-refresh all nodes on startup
    
    autoRefreshAllNodes();
});
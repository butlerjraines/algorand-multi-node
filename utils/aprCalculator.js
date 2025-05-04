// utils/aprCalculator.js
const { MongoClient } = require('mongodb');

const REWARD_SENDER = 'Y76M3MSY6DKBRHBL7C3NNDXGS5IIMQVQVUAB6MP4XEMMGVF2QWNPL226CA';

async function connectToDatabase() {
    const client = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017');
    await client.connect();
    const db = client.db('algorand');
    return { 
        client, 
        db, 
        collection: db.collection('transactions'),
        walletConfigCollection: db.collection('wallet_configs')
    };
}



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
console.log(`🔍 Raw startTime value: ${startTime}`);

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


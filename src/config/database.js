// src/config/database.js
const { MongoClient } = require('mongodb');

// Configuration
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'algorand';
const COLLECTIONS = {
    TRANSACTIONS: 'transactions',
    WALLET_CONFIGS: 'wallet_configs'
};

/**
 * Connect to MongoDB database
 * @returns {Promise<Object>} Database connection
 */
async function connectToDatabase() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    return {
        client,
        db: client.db(DB_NAME),
        collection: client.db(DB_NAME).collection(COLLECTIONS.TRANSACTIONS),
        walletConfigCollection: client.db(DB_NAME).collection(COLLECTIONS.WALLET_CONFIGS)
    };
}

module.exports = {
    connectToDatabase,
    COLLECTIONS
};
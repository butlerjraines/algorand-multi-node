// utils/db.js
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'algorand';
const COLLECTION_NAME = 'transactions';

async function connectToDatabase() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    return {
        client,
        db: client.db(DB_NAME),
        collection: client.db(DB_NAME).collection(COLLECTION_NAME)
    };
}

module.exports = { connectToDatabase };

// src/config/constants.js

module.exports = {
    // Server
    PORT: process.env.PORT || 3001,
    
    // Algorand
    INDEXER_SERVER: 'https://mainnet-idx.4160.nodely.dev',
    INDEXER_TOKEN: 'a'.repeat(64),
    REWARD_SENDER: 'Y76M3MSY6DKBRHBL7C3NNDXGS5IIMQVQVUAB6MP4XEMMGVF2QWNPL226CA',
    
    // API
    PAGINATION: {
        DEFAULT_LIMIT: 20,
        DEFAULT_SKIP: 0,
        TRANSACTION_FETCH_LIMIT: 500
    }
};
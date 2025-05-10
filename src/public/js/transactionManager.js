// src/public/js/transactionManager.js

// Transaction management functionality
class TransactionManager {
    constructor() {
        // Pagination state
        this.page = 0;
        this.limit = 10;
        this.total = 0;
    }

    // Reset pagination
    resetPagination() {
        this.page = 0;
        this.limit = 10;
        this.total = 0;
    }

    // Load wallet transactions with pagination
    async loadWalletTransactions(address, page = this.page, limit = this.limit) {
        try {
            const skip = page * limit;

            const response = await fetch(`/api/wallets/${address}/transactions?limit=${limit}&skip=${skip}`);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to load transactions');
            }

            const data = await response.json();

            this.total = data.total;
            this.page = page;
            this.limit = limit;

            this.renderTransactions(data.transactions, address);
            this.renderPagination(data.total, page, limit, address);
        } catch (error) {
            console.error('Error loading transactions:', error);
            document.getElementById('transactions-table').innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-danger">
                        Failed to load transactions. ${error.message}
                    </td>
                </tr>
            `;
            document.getElementById('transactions-pagination').innerHTML = '';
        }
    }

    // Load daily rewards
    async loadDailyRewards(address, algoPrice = 0) {
        try {
            const response = await fetch(`/api/wallets/${address}/daily-rewards`);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to load daily rewards');
            }

            const data = await response.json();
            this.renderDailyRewards(data, algoPrice);
        } catch (error) {
            console.error('Error loading daily rewards:', error);
            document.getElementById('daily-rewards-table').innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-danger">
                        Failed to load daily rewards. ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    // Render transactions table
    renderTransactions(transactions, currentWalletAddress) {
        const tableBody = document.getElementById('transactions-table');
        tableBody.innerHTML = '';

        if (transactions.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center">No transactions found</td>
                </tr>
            `;
            return;
        }

        transactions.forEach(tx => {
            const row = document.createElement('tr');

            // Type
            const typeCell = document.createElement('td');
            if (tx.type === 'pay') {
                if (tx.sender === currentWalletAddress) {
                    typeCell.innerHTML = '<span class="badge bg-danger">Sent</span>';
                } else if (tx.receiver === currentWalletAddress) {
                    typeCell.innerHTML = '<span class="badge bg-success">Received</span>';
                } else {
                    typeCell.innerHTML = '<span class="badge bg-secondary">Pay</span>';
                }
            } else if (tx.type === 'keyreg') {
                typeCell.innerHTML = '<span class="badge bg-info">Key Registration</span>';
            } else {
                typeCell.innerHTML = `<span class="badge bg-secondary">${tx.type || 'Unknown'}</span>`;
            }

            // Amount
            const amountCell = document.createElement('td');
            if (tx.type === 'pay') {
                const amount = Number(tx.amount) / 1_000_000;
                if (tx.sender === currentWalletAddress) {
                    amountCell.textContent = `-${amount.toFixed(6)} ALGO`;
                    amountCell.className = 'text-danger';
                } else if (tx.receiver === currentWalletAddress) {
                    amountCell.textContent = `+${amount.toFixed(6)} ALGO`;
                    amountCell.className = 'text-success';
                } else {
                    amountCell.textContent = `${amount.toFixed(6)} ALGO`;
                }
            } else {
                amountCell.textContent = '-';
            }

            // Date
            const dateCell = document.createElement('td');
            const date = new Date(tx.roundTime * 1000);
            dateCell.textContent = date.toLocaleString();

            // Transaction ID
            const txIdCell = document.createElement('td');
            const txLink = document.createElement('a');
            txLink.href = `https://algoexplorer.io/tx/${tx.txID}`;
            txLink.target = '_blank';
            txLink.textContent = `${tx.txID.substring(0, 8)}...${tx.txID.slice(-4)}`;
            txIdCell.appendChild(txLink);

            row.appendChild(typeCell);
            row.appendChild(amountCell);
            row.appendChild(dateCell);
            row.appendChild(txIdCell);

            tableBody.appendChild(row);
        });
    }

    // Render pagination controls
    renderPagination(total, page, limit, address) {
        const paginationElement = document.getElementById('transactions-pagination');
        paginationElement.innerHTML = '';

        const pageCount = Math.ceil(total / limit);

        if (pageCount <= 1) {
            return;
        }

        // Previous button
        const prevItem = document.createElement('li');
        prevItem.className = `page-item ${page === 0 ? 'disabled' : ''}`;
        const prevLink = document.createElement('a');
        prevLink.className = 'page-link';
        prevLink.href = '#';
        prevLink.innerHTML = '&laquo;';
        prevLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (page > 0) {
                this.loadWalletTransactions(address, page - 1, limit);
            }
        });
        prevItem.appendChild(prevLink);
        paginationElement.appendChild(prevItem);

        // Page numbers
        const startPage = Math.max(0, page - 2);
        const endPage = Math.min(pageCount - 1, page + 2);

        for (let i = startPage; i <= endPage; i++) {
            const pageItem = document.createElement('li');
            pageItem.className = `page-item ${i === page ? 'active' : ''}`;
            const pageLink = document.createElement('a');
            pageLink.className = 'page-link';
            pageLink.href = '#';
            pageLink.textContent = i + 1;
            pageLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.loadWalletTransactions(address, i, limit);
            });
            pageItem.appendChild(pageLink);
            paginationElement.appendChild(pageItem);
        }

        // Next button
        const nextItem = document.createElement('li');
        nextItem.className = `page-item ${page === pageCount - 1 ? 'disabled' : ''}`;
        const nextLink = document.createElement('a');
        nextLink.className = 'page-link';
        nextLink.href = '#';
        nextLink.innerHTML = '&raquo;';
        nextLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (page < pageCount - 1) {
                this.loadWalletTransactions(address, page + 1, limit);
            }
        });
        nextItem.appendChild(nextLink);
        paginationElement.appendChild(nextItem);
    }

    // Render daily rewards table
    renderDailyRewards(dailyRewards, algoPrice = 0) {
        const tableBody = document.getElementById('daily-rewards-table');
        tableBody.innerHTML = '';

        if (dailyRewards.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center">No rewards found</td>
                </tr>
            `;
            return;
        }
        
        dailyRewards.forEach(day => {
            const row = document.createElement('tr');

            // Date
            const dateCell = document.createElement('td');
            dateCell.textContent = day.date;

            // Amount
            const amountCell = document.createElement('td');
            const amountAlgo = day.totalAmount.toFixed(6);
            let amountText = `${amountAlgo} ALGO`;
            
            // Add USD value if price is available
            if (algoPrice > 0) {
                const amountUsd = (day.totalAmount * algoPrice).toFixed(2);
                amountText += `<br><small class="text-muted">$${amountUsd} USD</small>`;
            }
            
            amountCell.innerHTML = amountText;
            amountCell.className = 'text-end';

            // Count
            const countCell = document.createElement('td');
            countCell.textContent = day.count;
            countCell.className = 'text-center';

            row.appendChild(dateCell);
            row.appendChild(amountCell);
            row.appendChild(countCell);

            tableBody.appendChild(row);
        });
    }
}

// Singleton instance
const transactionManager = new TransactionManager();
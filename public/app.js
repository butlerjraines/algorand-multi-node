// Global variables
let currentWalletAddress = null;
let transactionsPage = 0;
let transactionsLimit = 10;
let transactionsTotal = 0;
let walletBeingDeleted = null;

// DOM elements
const walletListElement = document.getElementById('wallet-list');
const walletDetailsElement = document.getElementById('wallet-details');
const noWalletSelectedElement = document.getElementById('no-wallet-selected');
const addWalletForm = document.getElementById('add-wallet-form');
const walletAddressInput = document.getElementById('wallet-address');
const walletNameInput = document.getElementById('wallet-name');
const refreshWalletBtn = document.getElementById('refresh-wallet-btn');
const refreshAllWalletsBtn = document.getElementById('refresh-all-wallets-btn');
const exportWalletBtn = document.getElementById('export-wallet-btn');

// Delete wallet modal
const deleteWalletModal = new bootstrap.Modal(document.getElementById('deleteWalletModal'));
const deleteWalletName = document.getElementById('delete-wallet-name');
const deleteWalletAddress = document.getElementById('delete-wallet-address');
const confirmDeleteWalletBtn = document.getElementById('confirm-delete-wallet');

// Loading modal
const loadingModal = new bootstrap.Modal(document.getElementById('loadingModal'));
const loadingMessage = document.getElementById('loading-message');
const loadingDetails = document.getElementById('loading-details');

// Error toast
const errorToast = new bootstrap.Toast(document.getElementById('errorToast'));
const errorMessage = document.getElementById('error-message');

// Success toast
const successToast = new bootstrap.Toast(document.getElementById('successToast'));
const successMessage = document.getElementById('success-message');

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Add event listeners
    addWalletForm.addEventListener('submit', handleAddWallet);
    refreshWalletBtn.addEventListener('click', () => refreshWallet(currentWalletAddress));
    refreshAllWalletsBtn.addEventListener('click', refreshAllWallets);
    exportWalletBtn.addEventListener('click', () => exportWalletTransactions(currentWalletAddress));
    confirmDeleteWalletBtn.addEventListener('click', confirmDeleteWallet);

    // Load wallets
    loadWallets();
});

// Load nodes from API
async function loadWallets() {
    try {
        showLoading('Loading nodes', 'Please wait while we load your nodes');

        const response = await fetch('/api/wallets');
        const wallets = await response.json();

        renderWalletList(wallets);

        // If we have nodes, refresh them all to get latest data
        if (wallets.length > 0) {
            await refreshAllWallets(false); // false means don't show loading UI
        }

        hideLoading();
    } catch (error) {
        console.error('Error loading nodes:', error);
        showError('Failed to load nodes. Please try again later.');
        hideLoading();
    }
}

// Render wallet list
function renderWalletList(wallets) {
    walletListElement.innerHTML = '';

    if (wallets.length === 0) {
        walletListElement.innerHTML = '<li class="list-group-item text-center text-muted">No nodes added yet</li>';
        return;
    }

    wallets.forEach(wallet => {
        const listItem = document.createElement('li');
        listItem.className = 'list-group-item d-flex justify-content-between align-items-center wallet-item';
        if (wallet.address === currentWalletAddress) {
            listItem.classList.add('active');
        }

        const nameSpan = document.createElement('span');
        nameSpan.textContent = wallet.name || `Wallet-${wallet.address.substring(0, 8)}`;

        const addressSpan = document.createElement('small');
        addressSpan.className = 'text-muted d-block';
        addressSpan.textContent = `${wallet.address.substring(0, 10)}...${wallet.address.slice(-4)}`;

        const infoDiv = document.createElement('div');
        infoDiv.appendChild(nameSpan);
        infoDiv.appendChild(addressSpan);

        const actionsDiv = document.createElement('div');

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-outline-danger';
        deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
        deleteBtn.title = 'Remove wallet';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering wallet selection
            showDeleteWalletConfirmation(wallet);
        });

        actionsDiv.appendChild(deleteBtn);

        listItem.appendChild(infoDiv);
        listItem.appendChild(actionsDiv);

        listItem.addEventListener('click', () => loadWalletDetails(wallet.address));

        walletListElement.appendChild(listItem);
    });
}

// Handle add wallet form submission
async function handleAddWallet(event) {
    event.preventDefault();

    const address = walletAddressInput.value.trim();
    const name = walletNameInput.value.trim();
    const initialAmount = document.getElementById('wallet-initial-amount').value.trim();

    if (!address) {
        showError('Please enter a valid Algorand node address');
        return;
    }

    try {
        showLoading('Adding node', 'Please wait while we add your node');

        const response = await fetch('/api/wallets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ address, name, initialAmount })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add node');
        }

        const wallet = await response.json();

        // Clear form
        walletAddressInput.value = '';
        walletNameInput.value = '';

        // Show success message
        showSuccess('Node added successfully');

        // Reload wallets
        await loadWallets();

        // Load details for the new wallet
        loadWalletDetails(wallet.address);

        hideLoading();
    } catch (error) {
        console.error('Error adding wallet:', error);
        showError(error.message || 'Failed to add wallet. Please try again.');
        hideLoading();
    }
}

// Load daily rewards
async function loadDailyRewards(address) {
    try {
        const response = await fetch(`/api/wallets/${address}/daily-rewards`);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to load daily rewards');
        }

        const data = await response.json();
        renderDailyRewards(data);
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

// Render daily rewards table
function renderDailyRewards(dailyRewards) {
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
        amountCell.textContent = `${day.totalAmount.toFixed(6)} ALGO`;
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

// Show delete node confirmation dialog
function showDeleteWalletConfirmation(wallet) {
    walletBeingDeleted = wallet;
    deleteWalletName.textContent = wallet.name || `Node-${wallet.address.substring(0, 8)}`;
    deleteWalletAddress.textContent = wallet.address;
    deleteWalletModal.show();
}

// Confirm delete wallet
async function confirmDeleteWallet() {
    if (!walletBeingDeleted) {
        deleteWalletModal.hide();
        return;
    }

    try {
        deleteWalletModal.hide();
        showLoading('Removing node', 'Please wait while we remove the node');

        const response = await fetch(`/api/wallets/${walletBeingDeleted.address}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to remove node');
        }

        // Show success message
        showSuccess('Node removed successfully');

        // If the deleted wallet was the currently selected one, clear the selection
        if (walletBeingDeleted.address === currentWalletAddress) {
            currentWalletAddress = null;
            walletDetailsElement.classList.add('d-none');
            noWalletSelectedElement.classList.remove('d-none');
        }

        // Reload wallets
        await loadWallets();

        hideLoading();
    } catch (error) {
        console.error('Error removing node:', error);
        showError(error.message || 'Failed to remove node. Please try again.');
        hideLoading();
    } finally {
        walletBeingDeleted = null;
    }
}

// Load wallet details
// Load wallet details
async function loadWalletDetails(address) {
    try {
        showLoading('Loading node details', 'Please wait while we load your node details');
        
        currentWalletAddress = address;
        transactionsPage = 0;
        
        // Update active wallet in the list
        const walletItems = document.querySelectorAll('.wallet-item');
        walletItems.forEach(item => {
            item.classList.remove('active');
            if (item.querySelector('small').textContent.includes(address.substring(0, 10))) {
                item.classList.add('active');
            }
        });
        
        // Show wallet details section
        walletDetailsElement.classList.remove('d-none');
        noWalletSelectedElement.classList.add('d-none');
        
        // Load wallet details
        const response = await fetch(`/api/wallets/${address}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to load wallet details');
        }
        
        const data = await response.json();
        
        // Update wallet details
        document.getElementById('wallet-detail-name').textContent = data.wallet.name || `Node-${address.substring(0, 8)}`;
        document.getElementById('wallet-detail-address').textContent = address;
        
        // Update initial amount
        if (data.balance) {
            document.getElementById('wallet-detail-initial').textContent = `${data.balance.initialAlgoAmount.toFixed(6)} ALGO`;
        } else {
            document.getElementById('wallet-detail-initial').textContent = 'Loading...';
        }
        
        // Update key registration fees
        if (data.balance && data.balance.keyRegFees) {
            document.getElementById('wallet-detail-keyreg-fees').textContent = `${data.balance.keyRegFees.toFixed(6)} ALGO`;
        } else {
            document.getElementById('wallet-detail-keyreg-fees').textContent = 'N/A';
        }
        
        // Update balance
        if (data.balance) {
            document.getElementById('wallet-detail-balance').textContent = `${data.balance.finalBalance.toFixed(6)} ALGO`;
        } else {
            document.getElementById('wallet-detail-balance').textContent = 'Loading...';
        }
        
        // Update rewards
        if (data.rewards) {
            document.getElementById('wallet-detail-rewards').textContent = `${data.rewards.totalRewards.toFixed(6)} ALGO`;
        } else {
            document.getElementById('wallet-detail-rewards').textContent = 'Loading...';
        }
        
        // Update highest reward
        if (data.rewards && data.rewards.highestReward) {
            document.getElementById('wallet-detail-max-reward').textContent = `${data.rewards.highestReward.toFixed(6)} ALGO`;
        } else {
            document.getElementById('wallet-detail-max-reward').textContent = 'N/A';
        }
        
        // Update lowest reward
        if (data.rewards && data.rewards.lowestReward) {
            document.getElementById('wallet-detail-min-reward').textContent = `${data.rewards.lowestReward.toFixed(6)} ALGO`;
        } else {
            document.getElementById('wallet-detail-min-reward').textContent = 'N/A';
        }
        
        // Update APR
        if (data.apr) {
            document.getElementById('wallet-detail-apr').textContent = `${data.apr.estimatedAPR.toFixed(2)}%`;
        } else {
            document.getElementById('wallet-detail-apr').textContent = 'Loading...';
        }
        
        // Update transaction count
        if (data.transactionCount !== undefined) {
            document.getElementById('wallet-detail-transactions').textContent = data.transactionCount;
        } else {
            document.getElementById('wallet-detail-transactions').textContent = 'Loading...';
        }
        
        // Load transactions
        await loadWalletTransactions(address);
        await loadDailyRewards(address);
        hideLoading();
    } catch (error) {
        console.error('Error loading node details:', error);
        showError(error.message || 'Failed to load node details. Please try again.');
        hideLoading();
        
        // Show no node selected
        walletDetailsElement.classList.add('d-none');
        noWalletSelectedElement.classList.remove('d-none');
        currentWalletAddress = null;
    }
}

// Load wallet transactions
async function loadWalletTransactions(address, page = 0, limit = 10) {
    try {
        const skip = page * limit;

        const response = await fetch(`/api/wallets/${address}/transactions?limit=${limit}&skip=${skip}`);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to load transactions');
        }

        const data = await response.json();

        transactionsTotal = data.total;
        transactionsPage = page;
        transactionsLimit = limit;

        renderTransactions(data.transactions);
        renderPagination(data.total, page, limit);
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

// Render transactions
function renderTransactions(transactions) {
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

// Render pagination
function renderPagination(total, page, limit) {
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
            loadWalletTransactions(currentWalletAddress, page - 1, limit);
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
            loadWalletTransactions(currentWalletAddress, i, limit);
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
            loadWalletTransactions(currentWalletAddress, page + 1, limit);
        }
    });
    nextItem.appendChild(nextLink);
    paginationElement.appendChild(nextItem);
}

// Refresh all wallets
async function refreshAllWallets(showUI = true) {
    try {
        if (showUI) {
            showLoading('Refreshing all nodes', 'Please wait while we fetch the latest data for all nodes');
        }

        // Get all nodes
        const response = await fetch('/api/wallets');
        const wallets = await response.json();

        // Refresh each node one by one
        for (const wallet of wallets) {
            if (showUI) {
                loadingDetails.textContent = `Refreshing ${wallet.name || wallet.address.substring(0, 8)}...`;
            }
            await fetch(`/api/wallets/${wallet.address}/refresh`, { method: 'POST' });
        }

        // If a node is currently selected, reload its details
        if (currentWalletAddress) {
            await loadWalletDetails(currentWalletAddress);
        }

        if (showUI) {
            showSuccess('All nodes refreshed successfully');
            hideLoading();
        }
    } catch (error) {
        console.error('Error refreshing all nodes:', error);
        if (showUI) {
            showError('Failed to refresh all nodes. Please try again.');
            hideLoading();
        }
    }
}

// Refresh node data
async function refreshWallet(address) {
    if (!address) return;

    try {
        showLoading('Refreshing node', 'Please wait while we fetch the latest transactions');

        // Call the refresh API
        await fetch(`/api/wallets/${address}/refresh`, { method: 'POST' });

        // Reload node details
        await loadWalletDetails(address);

        showSuccess('Node refreshed successfully');
        hideLoading();
    } catch (error) {
        console.error('Error refreshing node:', error);
        showError('Failed to refresh node. Please try again.');
        hideLoading();
    }
}

// Export wallet transactions as CSV
function exportWalletTransactions(address) {
    if (!address) return;

    showLoading('Exporting transactions', 'Please wait while we prepare your CSV file');

    // Create a download link
    const downloadLink = document.createElement('a');
    downloadLink.href = `/api/wallets/${address}/export`;
    downloadLink.target = '_blank';
    downloadLink.click();

    setTimeout(() => {
        hideLoading();
    }, 1000);
}

// Show loading modal
function showLoading(message, details) {
    loadingMessage.textContent = message || 'Loading...';
    loadingDetails.textContent = details || 'Please wait while we process your request';
    loadingModal.show();
}

// Hide loading modal
function hideLoading() {
    loadingModal.hide();
}

// Show error toast
function showError(message) {
    errorMessage.textContent = message;
    errorToast.show();
}

// Show success toast
function showSuccess(message) {
    successMessage.textContent = message;
    successToast.show();
}
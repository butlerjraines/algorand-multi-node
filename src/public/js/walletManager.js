// src/public/js/walletManager.js

// Wallet management functionality
class WalletManager {
    constructor() {
        // DOM elements
        this.walletListElement = document.getElementById('wallet-list');
        this.walletDetailsElement = document.getElementById('wallet-details');
        this.noWalletSelectedElement = document.getElementById('no-wallet-selected');
        this.addWalletForm = document.getElementById('add-wallet-form');
        this.walletAddressInput = document.getElementById('wallet-address');
        this.walletNameInput = document.getElementById('wallet-name');
        this.walletInitialAmountInput = document.getElementById('wallet-initial-amount');
        this.refreshWalletBtn = document.getElementById('refresh-wallet-btn');
        this.refreshAllWalletsBtn = document.getElementById('refresh-all-wallets-btn');
        this.exportWalletBtn = document.getElementById('export-wallet-btn');
        
        // Delete wallet modal
        this.deleteWalletModal = new bootstrap.Modal(document.getElementById('deleteWalletModal'));
        this.deleteWalletName = document.getElementById('delete-wallet-name');
        this.deleteWalletAddress = document.getElementById('delete-wallet-address');
        this.confirmDeleteWalletBtn = document.getElementById('confirm-delete-wallet');

        // State
        this.currentWalletAddress = null;
        this.walletBeingDeleted = null;
    }

    // Initialize with event handlers
    init() {
        // Add event listeners
        this.addWalletForm.addEventListener('submit', e => this.handleAddWallet(e));
        this.refreshWalletBtn.addEventListener('click', () => this.refreshWallet(this.currentWalletAddress));
        this.refreshAllWalletsBtn.addEventListener('click', () => this.refreshAllWallets());
        this.exportWalletBtn.addEventListener('click', () => this.exportWalletTransactions(this.currentWalletAddress));
        this.confirmDeleteWalletBtn.addEventListener('click', () => this.confirmDeleteWallet());

        // Load wallets on initialization
        this.loadWallets();
    }

    // Load wallets from API
    async loadWallets() {
        try {
            UIManager.showLoading('Loading wallets', 'Please wait while we load your wallets');

            const response = await fetch('/api/wallets');
            const wallets = await response.json();

            this.renderWalletList(wallets);

            // If we have wallets, refresh them all to get latest data
            if (wallets.length > 0) {
                await this.refreshAllWallets(false); // false means don't show loading UI
            }

            UIManager.hideLoading();
        } catch (error) {
            console.error('Error loading wallets:', error);
            UIManager.showError('Failed to load wallets. Please try again later.');
            UIManager.hideLoading();
        }
    }

    // Render wallet list
    renderWalletList(wallets) {
        this.walletListElement.innerHTML = '';

        if (wallets.length === 0) {
            this.walletListElement.innerHTML = '<li class="list-group-item text-center text-muted">No wallets added yet</li>';
            return;
        }

        wallets.forEach(wallet => {
            const listItem = document.createElement('li');
            listItem.className = 'list-group-item d-flex justify-content-between align-items-center wallet-item';
            if (wallet.address === this.currentWalletAddress) {
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
                this.showDeleteWalletConfirmation(wallet);
            });

            actionsDiv.appendChild(deleteBtn);

            listItem.appendChild(infoDiv);
            listItem.appendChild(actionsDiv);

            listItem.addEventListener('click', () => this.loadWalletDetails(wallet.address));

            this.walletListElement.appendChild(listItem);
        });
    }

    // Handle add wallet form submission
    async handleAddWallet(event) {
        event.preventDefault();

        const address = this.walletAddressInput.value.trim();
        const name = this.walletNameInput.value.trim();
        const initialAmount = this.walletInitialAmountInput.value.trim();

        if (!address) {
            UIManager.showError('Please enter a valid Algorand wallet address');
            return;
        }

        try {
            UIManager.showLoading('Adding wallet', 'Please wait while we add your wallet');

            const response = await fetch('/api/wallets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ address, name, initialAmount })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to add wallet');
            }

            const wallet = await response.json();

            // Clear form
            this.walletAddressInput.value = '';
            this.walletNameInput.value = '';
            this.walletInitialAmountInput.value = '';

            // Show success message
            UIManager.showSuccess('Wallet added successfully');

            // Reload wallets
            await this.loadWallets();

            // Load details for the new wallet
            this.loadWalletDetails(wallet.address);

            UIManager.hideLoading();
        } catch (error) {
            console.error('Error adding wallet:', error);
            UIManager.showError(error.message || 'Failed to add wallet. Please try again.');
            UIManager.hideLoading();
        }
    }

    // Load wallet details
    async loadWalletDetails(address) {
        try {
            UIManager.showLoading('Loading wallet details', 'Please wait while we load your wallet details');
            
            this.currentWalletAddress = address;
            transactionManager.resetPagination();
            
            // Update active wallet in the list
            const walletItems = document.querySelectorAll('.wallet-item');
            walletItems.forEach(item => {
                item.classList.remove('active');
                if (item.querySelector('small').textContent.includes(address.substring(0, 10))) {
                    item.classList.add('active');
                }
            });
            
            // Show wallet details section
            this.walletDetailsElement.classList.remove('d-none');
            this.noWalletSelectedElement.classList.add('d-none');
            
            // Load wallet details
            const response = await fetch(`/api/wallets/${address}`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to load wallet details');
            }
            
            const data = await response.json();
            
            // Update wallet details
            document.getElementById('wallet-detail-name').textContent = data.wallet.name || `Wallet-${address.substring(0, 8)}`;
            document.getElementById('wallet-detail-address').textContent = address;
            
            // Get ALGO price
            const algoPrice = data.algoPrice || 0;
            
            // Update ALGO price display
            document.getElementById('wallet-detail-algo-price').textContent = algoPrice > 0 ? 
                `$${algoPrice.toFixed(4)} USD` : 'Price unavailable';
            
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
                const balanceAlgo = data.balance.finalBalance;
                document.getElementById('wallet-detail-balance').textContent = `${balanceAlgo.toFixed(6)} ALGO`;
                // Add USD value
                if (algoPrice > 0) {
                    const balanceUsd = balanceAlgo * algoPrice;
                    document.getElementById('wallet-detail-balance-usd').textContent = `$${balanceUsd.toFixed(2)} USD`;
                } else {
                    document.getElementById('wallet-detail-balance-usd').textContent = '';
                }
            } else {
                document.getElementById('wallet-detail-balance').textContent = 'Loading...';
                document.getElementById('wallet-detail-balance-usd').textContent = '';
            }
            
            // Update rewards
            if (data.rewards) {
                const rewardsAlgo = data.rewards.totalRewards;
                document.getElementById('wallet-detail-rewards').textContent = `${rewardsAlgo.toFixed(6)} ALGO`;
                // Add USD value
                if (algoPrice > 0) {
                    const rewardsUsd = rewardsAlgo * algoPrice;
                    document.getElementById('wallet-detail-rewards-usd').textContent = `$${rewardsUsd.toFixed(2)} USD`;
                } else {
                    document.getElementById('wallet-detail-rewards-usd').textContent = '';
                }
            } else {
                document.getElementById('wallet-detail-rewards').textContent = 'Loading...';
                document.getElementById('wallet-detail-rewards-usd').textContent = '';
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
            
            // Load transactions and daily rewards
            await transactionManager.loadWalletTransactions(address);
            await transactionManager.loadDailyRewards(address, algoPrice);
            UIManager.hideLoading();
        } catch (error) {
            console.error('Error loading wallet details:', error);
            UIManager.showError(error.message || 'Failed to load wallet details. Please try again.');
            UIManager.hideLoading();
            
            // Show no wallet selected
            this.walletDetailsElement.classList.add('d-none');
            this.noWalletSelectedElement.classList.remove('d-none');
            this.currentWalletAddress = null;
        }
    }

    // Show delete wallet confirmation dialog
    showDeleteWalletConfirmation(wallet) {
        this.walletBeingDeleted = wallet;
        this.deleteWalletName.textContent = wallet.name || `Wallet-${wallet.address.substring(0, 8)}`;
        this.deleteWalletAddress.textContent = wallet.address;
        this.deleteWalletModal.show();
    }

    // Confirm delete wallet
    async confirmDeleteWallet() {
        if (!this.walletBeingDeleted) {
            this.deleteWalletModal.hide();
            return;
        }

        try {
            this.deleteWalletModal.hide();
            UIManager.showLoading('Removing wallet', 'Please wait while we remove the wallet');

            const response = await fetch(`/api/wallets/${this.walletBeingDeleted.address}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to remove wallet');
            }

            // Show success message
            UIManager.showSuccess('Wallet removed successfully');

            // If the deleted wallet was the currently selected one, clear the selection
            if (this.walletBeingDeleted.address === this.currentWalletAddress) {
                this.currentWalletAddress = null;
                this.walletDetailsElement.classList.add('d-none');
                this.noWalletSelectedElement.classList.remove('d-none');
            }

            // Reload wallets
            await this.loadWallets();

            UIManager.hideLoading();
        } catch (error) {
            console.error('Error removing wallet:', error);
            UIManager.showError(error.message || 'Failed to remove wallet. Please try again.');
            UIManager.hideLoading();
        } finally {
            this.walletBeingDeleted = null;
        }
    }

    // Refresh all wallets
    async refreshAllWallets(showUI = true) {
        try {
            if (showUI) {
                UIManager.showLoading('Refreshing all wallets', 'Please wait while we fetch the latest data for all wallets');
            }

            // Get all wallets
            const response = await fetch('/api/wallets');
            const wallets = await response.json();

            // Refresh each wallet one by one
            for (const wallet of wallets) {
                if (showUI) {
                    UIManager.updateLoadingDetails(`Refreshing ${wallet.name || wallet.address.substring(0, 8)}...`);
                }
                await fetch(`/api/wallets/${wallet.address}/refresh`, { method: 'POST' });
            }

            // If a wallet is currently selected, reload its details
            if (this.currentWalletAddress) {
                await this.loadWalletDetails(this.currentWalletAddress);
            }

            if (showUI) {
                UIManager.showSuccess('All wallets refreshed successfully');
                UIManager.hideLoading();
            }
        } catch (error) {
            console.error('Error refreshing all wallets:', error);
            if (showUI) {
                UIManager.showError('Failed to refresh all wallets. Please try again.');
                UIManager.hideLoading();
            }
        }
    }

    // Refresh wallet data
    async refreshWallet(address) {
        if (!address) return;

        try {
            UIManager.showLoading('Refreshing wallet', 'Please wait while we fetch the latest transactions');

            // Call the refresh API
            await fetch(`/api/wallets/${address}/refresh`, { method: 'POST' });

            // Reload wallet details
            await this.loadWalletDetails(address);

            UIManager.showSuccess('Wallet refreshed successfully');
            UIManager.hideLoading();
        } catch (error) {
            console.error('Error refreshing wallet:', error);
            UIManager.showError('Failed to refresh wallet. Please try again.');
            UIManager.hideLoading();
        }
    }

    // Export wallet transactions as CSV
    exportWalletTransactions(address) {
        if (!address) return;

        UIManager.showLoading('Exporting transactions', 'Please wait while we prepare your CSV file');

        // Create a download link
        const downloadLink = document.createElement('a');
        downloadLink.href = `/api/wallets/${address}/export`;
        downloadLink.target = '_blank';
        downloadLink.click();

        setTimeout(() => {
            UIManager.hideLoading();
        }, 1000);
    }
}

// Singleton instance
const walletManager = new WalletManager();
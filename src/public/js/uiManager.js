// src/public/js/uiManager.js

// UI management functionality
class UIManager {
    // Loading modal
    static #loadingModal = new bootstrap.Modal(document.getElementById('loadingModal'));
    static #loadingMessage = document.getElementById('loading-message');
    static #loadingDetails = document.getElementById('loading-details');

    // Error toast
    static #errorToast = new bootstrap.Toast(document.getElementById('errorToast'));
    static #errorMessage = document.getElementById('error-message');

    // Success toast
    static #successToast = new bootstrap.Toast(document.getElementById('successToast'));
    static #successMessage = document.getElementById('success-message');

    // Show loading modal
    static showLoading(message, details) {
        this.#loadingMessage.textContent = message || 'Loading...';
        this.#loadingDetails.textContent = details || 'Please wait while we process your request';
        this.#loadingModal.show();
    }

    // Update loading details
    static updateLoadingDetails(details) {
        this.#loadingDetails.textContent = details;
    }

    // Hide loading modal
    static hideLoading() {
        this.#loadingModal.hide();
    }

    // Show error toast
    static showError(message) {
        this.#errorMessage.textContent = message;
        this.#errorToast.show();
    }

    // Show success toast
    static showSuccess(message) {
        this.#successMessage.textContent = message;
        this.#successToast.show();
    }
}

// Export singleton instance
const uiManager = UIManager;
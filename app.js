/**
 * OrangeShield — app.js
 * Wallet connection, network validation, and UI bootstrapping.
 */

// ─── TOAST SYSTEM ──────────────────────────────────────────────────────────

function showToast(title, msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✔', error: '✖', info: '₿', warning: '⚠' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || '₿'}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
    </div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => toast.remove(), 310);
  }, 4000);
}

// ─── ADDRESS UTILS ─────────────────────────────────────────────────────────

function shortAddr(addr) {
  if (!addr) return '';
  return addr.slice(0, 8) + '...' + addr.slice(-6);
}

// ─── WALLET CONNECTION ─────────────────────────────────────────────────────

async function connectWallet() {
  const btn = document.getElementById('connect-btn');
  const errPanel = document.getElementById('error-panel');
  const walletRequired = document.getElementById('wallet-required');

  const setError = (msg) => {
    if (errPanel) {
      document.getElementById('error-msg').textContent = msg;
      errPanel.classList.add('visible');
    }
    showToast('Connection Failed', msg, 'error');
  };

  const clearError = () => {
    if (errPanel) errPanel.classList.remove('visible');
  };

  clearError();

  // Check wallet extension
  if (typeof window.opnet === 'undefined') {
    if (walletRequired) walletRequired.classList.add('visible');
    setError('OP_NET Wallet Extension not detected.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-loading"><span class="spinner visible"></span> Connecting...</span>';
  }

  try {
    // Request accounts
    const accounts = await window.opnet.request({ method: 'requestAccounts' });

    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts returned. Please unlock your OP_NET wallet.');
    }

    const address = accounts[0];

    // Get chain
    let chainId;
    try {
      chainId = await window.opnet.request({ method: 'getChainId' });
    } catch {
      chainId = OPNET_TESTNET.chainId; // Fallback if method not available
    }

    // Validate network
    if (chainId && chainId !== OPNET_TESTNET.chainId) {
      // Try switching
      try {
        await window.opnet.request({
          method: 'switchNetwork',
          params: [{ chainId: OPNET_TESTNET.chainId }]
        });
        showToast('Network Switched', 'Switched to OP_NET Testnet.', 'success');
      } catch {
        setError(`Wrong network detected. Please switch to OP_NET Testnet (${OPNET_TESTNET.chainName}).`);
        if (btn) { btn.disabled = false; btn.textContent = 'Connect Wallet'; }
        return;
      }
    }

    // Save & redirect
    localStorage.setItem('opnet_wallet', address);
    localStorage.setItem('opnet_chainId', OPNET_TESTNET.chainId);

    showToast('Wallet Connected', shortAddr(address), 'success');

    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 600);

  } catch (err) {
    const msg = err.message || 'Connection rejected.';
    setError(msg);
    if (btn) { btn.disabled = false; btn.textContent = 'Connect Wallet'; }
  }
}

// ─── AUTO REDIRECT ─────────────────────────────────────────────────────────

function checkAutoRedirect() {
  const saved = localStorage.getItem('opnet_wallet');
  if (saved && window.location.pathname.includes('index')) {
    window.location.href = 'dashboard.html';
  }
}

// ─── ON LOAD ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  checkAutoRedirect();

  const connectBtn = document.getElementById('connect-btn');
  if (connectBtn) connectBtn.addEventListener('click', connectWallet);

  // Show wallet required if no extension on load
  if (typeof window.opnet === 'undefined') {
    const wr = document.getElementById('wallet-required');
    if (wr) wr.classList.add('visible');
  }
});

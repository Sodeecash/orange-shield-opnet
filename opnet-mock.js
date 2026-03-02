/**
 * OrangeShield v3 — OP_NET Mock Contract Layer
 * Simulates real OP_NET smart contract interactions with:
 * - Async delays (blockchain latency)
 * - LocalStorage persistence (contract state)
 * - Transaction hashes
 * - Full vault state management
 */

const OPNET = (() => {
  const STORAGE_KEY = 'opnet_vault_state';
  const TX_HISTORY_KEY = 'opnet_tx_history';
  const WALLET_KEY = 'opnet_wallet';

  // ─── Utilities ────────────────────────────────────────────────────────────

  function generateTxHash() {
    const chars = 'abcdef0123456789';
    let hash = '0xOPNET';
    for (let i = 0; i < 48; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  }

  function generateWalletAddress() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let addr = 'bc1q';
    for (let i = 0; i < 38; i++) {
      addr += chars[Math.floor(Math.random() * chars.length)];
    }
    return addr;
  }

  function delay(min = 1000, max = 2000) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  function setState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getHistory() {
    const raw = localStorage.getItem(TX_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  function addToHistory(entry) {
    const history = getHistory();
    history.unshift(entry); // newest first
    localStorage.setItem(TX_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
  }

  function defaultState() {
    return {
      deployed: false,
      balance: 0,
      locked: false,
      lockExpiry: null,
      lockDurationDays: null,
      lastTxHash: null,
      contractAddress: null,
    };
  }

  // ─── Contract Methods ──────────────────────────────────────────────────────

  /**
   * deployVault()
   * Deploys the OrangeShield vault contract on OP_NET.
   */
  async function deployVault() {
    await delay(1500, 2500);
    const existing = getState();
    if (existing && existing.deployed) {
      return {
        success: false,
        error: 'Vault already deployed.',
        updatedState: existing,
      };
    }

    const txHash = generateTxHash();
    const contractAddress = '0xOP' + generateTxHash().slice(6, 30);

    const newState = {
      ...defaultState(),
      deployed: true,
      contractAddress,
      lastTxHash: txHash,
    };

    setState(newState);

    addToHistory({
      type: 'Deploy',
      amount: null,
      timestamp: Date.now(),
      txHash,
    });

    return { success: true, txHash, updatedState: newState };
  }

  /**
   * depositBTC(amount)
   * Deposits BTC into the vault.
   */
  async function depositBTC(amount) {
    await delay(1000, 2000);

    const state = getState();
    if (!state || !state.deployed) {
      return { success: false, error: 'Vault not deployed.', updatedState: state };
    }

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      return { success: false, error: 'Invalid deposit amount.', updatedState: state };
    }

    const txHash = generateTxHash();
    const updatedState = {
      ...state,
      balance: parseFloat((state.balance + parsed).toFixed(8)),
      lastTxHash: txHash,
    };

    setState(updatedState);
    addToHistory({
      type: 'Deposit',
      amount: parsed,
      timestamp: Date.now(),
      txHash,
    });

    return { success: true, txHash, updatedState };
  }

  /**
   * withdrawBTC(amount)
   * Withdraws BTC from the vault (only if unlocked or expired).
   */
  async function withdrawBTC(amount) {
    await delay(1000, 2000);

    const state = getState();
    if (!state || !state.deployed) {
      return { success: false, error: 'Vault not deployed.', updatedState: state };
    }

    // Check lock status
    if (state.locked && state.lockExpiry && Date.now() < state.lockExpiry) {
      const remaining = state.lockExpiry - Date.now();
      const days = Math.ceil(remaining / 86400000);
      return {
        success: false,
        error: `Vault is locked. ${days} day(s) remaining.`,
        updatedState: state,
      };
    }

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      return { success: false, error: 'Invalid withdrawal amount.', updatedState: state };
    }

    if (parsed > state.balance) {
      return { success: false, error: 'Insufficient vault balance.', updatedState: state };
    }

    const txHash = generateTxHash();
    const updatedState = {
      ...state,
      balance: parseFloat((state.balance - parsed).toFixed(8)),
      locked: false,
      lastTxHash: txHash,
    };

    setState(updatedState);
    addToHistory({
      type: 'Withdraw',
      amount: parsed,
      timestamp: Date.now(),
      txHash,
    });

    return { success: true, txHash, updatedState };
  }

  /**
   * lockVault(durationInDays)
   * Time-locks the vault for the specified duration.
   */
  async function lockVault(durationInDays) {
    await delay(1200, 2000);

    const state = getState();
    if (!state || !state.deployed) {
      return { success: false, error: 'Vault not deployed.', updatedState: state };
    }

    if (state.locked && state.lockExpiry && Date.now() < state.lockExpiry) {
      return { success: false, error: 'Vault is already locked.', updatedState: state };
    }

    if (state.balance <= 0) {
      return { success: false, error: 'Cannot lock an empty vault.', updatedState: state };
    }

    const days = parseInt(durationInDays, 10);
    if (isNaN(days) || days <= 0) {
      return { success: false, error: 'Invalid lock duration.', updatedState: state };
    }

    const txHash = generateTxHash();
    const lockExpiry = Date.now() + days * 86400000;

    const updatedState = {
      ...state,
      locked: true,
      lockExpiry,
      lockDurationDays: days,
      lastTxHash: txHash,
    };

    setState(updatedState);
    addToHistory({
      type: 'Lock',
      amount: null,
      duration: days,
      timestamp: Date.now(),
      txHash,
    });

    return { success: true, txHash, updatedState };
  }

  /**
   * getVaultState()
   * Returns the current contract state.
   */
  async function getVaultState() {
    await delay(300, 700);
    const state = getState() || defaultState();
    return { success: true, updatedState: state };
  }

  // ─── Wallet ────────────────────────────────────────────────────────────────

  function connectWallet() {
    let wallet = localStorage.getItem(WALLET_KEY);
    if (!wallet) {
      wallet = generateWalletAddress();
      localStorage.setItem(WALLET_KEY, wallet);
    }
    return wallet;
  }

  function disconnectWallet() {
    localStorage.removeItem(WALLET_KEY);
  }

  function getWallet() {
    return localStorage.getItem(WALLET_KEY);
  }

  function resetVault() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TX_HISTORY_KEY);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  return {
    deployVault,
    depositBTC,
    withdrawBTC,
    lockVault,
    getVaultState,
    connectWallet,
    disconnectWallet,
    getWallet,
    getHistory,
    resetVault,
  };
})();

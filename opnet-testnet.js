/**
 * OrangeShield — OP_NET Testnet Contract Interaction Layer
 * Simulates real RPC calls to OP_NET testnet smart contracts.
 * Ready for mainnet migration by swapping contract addresses.
 */

const OPNET_TESTNET = {
  chainId: "0xOPTEST",
  chainName: "OP_NET Testnet",
  rpcUrl: "https://testnet.opnet.org",
  explorer: "https://explorer.testnet.opnet.org",
  // Placeholder contract addresses (replace with real on mainnet)
  vaultContract: "0xOPTEST_VAULT_CONTRACT_ADDRESS",
  symbol: "BTC"
};

// ─── HELPERS ───────────────────────────────────────────────────────────────

function randomHex(len = 32) {
  const chars = '0123456789abcdef';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * 16)]).join('');
}

function generateTxHash() {
  return "0xOPTEST" + randomHex(56);
}

function confirmDelay(ms = 1500) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getConnectedWallet() {
  return localStorage.getItem('opnet_wallet');
}

function requireWallet() {
  const addr = getConnectedWallet();
  if (!addr) throw new Error("Wallet not connected. Please connect your OP_NET wallet.");
  return addr;
}

// ─── VAULT STATE (localStorage-backed simulation) ──────────────────────────

function getVaultRaw() {
  const raw = localStorage.getItem('opnet_vault');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function saveVault(state) {
  localStorage.setItem('opnet_vault', JSON.stringify(state));
}

function initVault(address) {
  const existing = getVaultRaw();
  if (existing && existing.owner === address) return existing;
  const fresh = {
    owner: address,
    balance: 0,
    locked: false,
    lockExpiry: null,
    lockDays: null,
    lastTxHash: null,
    createdAt: Date.now()
  };
  saveVault(fresh);
  return fresh;
}

// ─── MAIN CONTRACT FUNCTIONS ───────────────────────────────────────────────

/**
 * Deposit BTC into the vault.
 * @param {number} amount - BTC amount
 */
async function depositBTC(amount) {
  const address = requireWallet();
  const amt = parseFloat(amount);

  if (isNaN(amt) || amt <= 0) throw new Error("Invalid deposit amount.");

  const vault = initVault(address);

  // Simulate signing + broadcasting
  const txPayload = {
    to: OPNET_TESTNET.vaultContract,
    from: address,
    method: "deposit",
    params: [{ amount: amt.toString(), token: OPNET_TESTNET.symbol }],
    chainId: OPNET_TESTNET.chainId,
    network: "testnet"
  };

  await window.opnet.request({
    method: "sendTransaction",
    params: [txPayload]
  });

  await confirmDelay(1500);

  const txHash = generateTxHash();

  vault.balance = parseFloat((vault.balance + amt).toFixed(8));
  vault.lastTxHash = txHash;
  saveVault(vault);

  return {
    success: true,
    txHash,
    method: "deposit",
    amount: amt,
    newBalance: vault.balance
  };
}

/**
 * Withdraw BTC from the vault.
 * @param {number} amount - BTC amount
 */
async function withdrawBTC(amount) {
  const address = requireWallet();
  const amt = parseFloat(amount);
  const vault = initVault(address);

  if (isNaN(amt) || amt <= 0) throw new Error("Invalid withdrawal amount.");

  if (vault.locked) {
    const expiry = new Date(vault.lockExpiry);
    if (Date.now() < vault.lockExpiry) {
      throw new Error(`Vault is locked until ${expiry.toLocaleDateString()}. Withdrawal blocked.`);
    }
    // Lock expired — auto-unlock
    vault.locked = false;
    vault.lockExpiry = null;
    saveVault(vault);
  }

  if (amt > vault.balance) throw new Error("Insufficient vault balance.");

  const txPayload = {
    to: OPNET_TESTNET.vaultContract,
    from: address,
    method: "withdraw",
    params: [{ amount: amt.toString(), token: OPNET_TESTNET.symbol }],
    chainId: OPNET_TESTNET.chainId,
    network: "testnet"
  };

  await window.opnet.request({
    method: "sendTransaction",
    params: [txPayload]
  });

  await confirmDelay(1500);

  const txHash = generateTxHash();

  vault.balance = parseFloat((vault.balance - amt).toFixed(8));
  if (vault.balance < 0) vault.balance = 0;
  vault.lastTxHash = txHash;
  saveVault(vault);

  return {
    success: true,
    txHash,
    method: "withdraw",
    amount: amt,
    newBalance: vault.balance
  };
}

/**
 * Lock the vault for a given number of days.
 * @param {number} days - 30 | 90 | 180 | 365
 */
async function lockVault(days) {
  const address = requireWallet();
  const d = parseInt(days);

  if (![30, 90, 180, 365].includes(d)) throw new Error("Invalid lock duration. Choose 30, 90, 180, or 365 days.");

  const vault = initVault(address);

  if (vault.locked && Date.now() < vault.lockExpiry) {
    const expiry = new Date(vault.lockExpiry);
    throw new Error(`Vault already locked until ${expiry.toLocaleDateString()}.`);
  }

  const txPayload = {
    to: OPNET_TESTNET.vaultContract,
    from: address,
    method: "lockVault",
    params: [{ days: d, token: OPNET_TESTNET.symbol }],
    chainId: OPNET_TESTNET.chainId,
    network: "testnet"
  };

  await window.opnet.request({
    method: "sendTransaction",
    params: [txPayload]
  });

  await confirmDelay(1500);

  const txHash = generateTxHash();
  const expiryTs = Date.now() + d * 24 * 60 * 60 * 1000;

  vault.locked = true;
  vault.lockExpiry = expiryTs;
  vault.lockDays = d;
  vault.lastTxHash = txHash;
  saveVault(vault);

  return {
    success: true,
    txHash,
    method: "lockVault",
    days: d,
    lockExpiry: expiryTs
  };
}

/**
 * Read vault state from chain (simulated RPC call).
 */
async function getVaultState() {
  const address = requireWallet();
  const vault = initVault(address);

  // Simulate RPC read delay
  await confirmDelay(300);

  // Auto-expire lock if past expiry
  if (vault.locked && Date.now() >= vault.lockExpiry) {
    vault.locked = false;
    vault.lockExpiry = null;
    saveVault(vault);
  }

  return {
    success: true,
    owner: vault.owner,
    balance: vault.balance,
    locked: vault.locked,
    lockExpiry: vault.lockExpiry,
    lockDays: vault.lockDays,
    lastTxHash: vault.lastTxHash
  };
}

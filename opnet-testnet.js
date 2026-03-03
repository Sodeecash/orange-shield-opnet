/**
 * OrangeShield — opnet-testnet.js
 * Simulated RPC-style contract interactions for OP_NET Testnet.
 * Structured for easy mainnet migration.
 */

// ─── Config ────────────────────────────────────────────────────────────────

const CONTRACT = {
  vault:      '0xOPTEST_VAULT_001',
  rewards:    '0xOPTEST_REWARDS_001',
  referrals:  '0xOPTEST_REF_001',
  nomination: '0xOPTEST_NOM_001'
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function rndHex(len = 56) {
  return Array.from({ length: len }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
}

function mkTxHash() { return '0xOPTEST' + rndHex(); }

function delay(ms = 1500) { return new Promise(r => setTimeout(r, ms)); }

function requireAddr() {
  const a = WalletManager.getAddress();
  if (!a) throw new Error('Wallet not connected.');
  return a;
}

function fmt8(n) { return parseFloat(parseFloat(n).toFixed(8)); }

// ─── Vault State ───────────────────────────────────────────────────────────

const VaultDB = {
  _key: 'opnet_vault_v2',

  get(address) {
    try {
      const raw = localStorage.getItem(this._key);
      if (!raw) return this._init(address);
      const all = JSON.parse(raw);
      return all[address] || this._init(address);
    } catch { return this._init(address); }
  },

  save(address, state) {
    try {
      const raw = localStorage.getItem(this._key);
      const all = raw ? JSON.parse(raw) : {};
      all[address] = state;
      localStorage.setItem(this._key, JSON.stringify(all));
    } catch {}
  },

  _init(address) {
    return {
      address,
      balance:     0,
      locked:      false,
      lockExpiry:  null,
      lockDays:    null,
      lastTxHash:  null,
      totalDeposited: 0,
      createdAt:   Date.now()
    };
  }
};

// ─── Activity Log ──────────────────────────────────────────────────────────

const ActivityDB = {
  _key: 'opnet_activity_v2',

  all() {
    try { return JSON.parse(localStorage.getItem(this._key) || '[]'); } catch { return []; }
  },

  push(entry) {
    const log = this.all();
    log.unshift({ ...entry, ts: Date.now() });
    if (log.length > 100) log.length = 100;
    localStorage.setItem(this._key, JSON.stringify(log));
  }
};

// ─── Rewards DB ────────────────────────────────────────────────────────────

const RewardsDB = {
  _key: 'opnet_rewards_v2',

  get(address) {
    try {
      const raw = localStorage.getItem(this._key);
      if (!raw) return this._init(address);
      const all = JSON.parse(raw);
      return all[address] || this._init(address);
    } catch { return this._init(address); }
  },

  save(address, state) {
    try {
      const raw = localStorage.getItem(this._key);
      const all = raw ? JSON.parse(raw) : {};
      all[address] = state;
      localStorage.setItem(this._key, JSON.stringify(all));
    } catch {}
  },

  _init(address) {
    return { address, points: 0, depositPts: 0, lockPts: 0, refPts: 0, nomPts: 0 };
  },

  addPoints(address, amount, category = 'deposit') {
    const r = this.get(address);
    r.points += amount;
    const catKey = category + 'Pts';
    if (r[catKey] !== undefined) r[catKey] += amount;
    this.save(address, r);
    return r;
  },

  getTier(points) {
    if (points >= 10000) return { name: 'Diamond', icon: '💎', min: 10000, max: Infinity };
    if (points >= 3000)  return { name: 'Gold',    icon: '🥇', min: 3000,  max: 10000 };
    if (points >= 500)   return { name: 'Silver',  icon: '🥈', min: 500,   max: 3000 };
    return                      { name: 'Bronze',  icon: '🥉', min: 0,     max: 500 };
  }
};

// ─── Referrals DB ──────────────────────────────────────────────────────────

const ReferralDB = {
  _key: 'opnet_refs_v2',

  get(address) {
    try {
      const raw = localStorage.getItem(this._key);
      if (!raw) return this._init(address);
      const all = JSON.parse(raw);
      return all[address] || this._init(address);
    } catch { return this._init(address); }
  },

  save(address, state) {
    try {
      const raw = localStorage.getItem(this._key);
      const all = raw ? JSON.parse(raw) : {};
      all[address] = state;
      localStorage.setItem(this._key, JSON.stringify(all));
    } catch {}
  },

  _init(address) {
    return { address, count: 0, earned: 0, refs: [] };
  },

  addReferral(address, refAddr) {
    const r = this.get(address);
    if (!r.refs.includes(refAddr)) {
      r.refs.push(refAddr);
      r.count++;
      r.earned = fmt8(r.earned + 0.0001);
      this.save(address, r);
      RewardsDB.addPoints(address, 150, 'ref');
    }
    return r;
  }
};

// ─── Nominations DB ────────────────────────────────────────────────────────

const NominationsDB = {
  _key: 'opnet_noms_v2',

  all() {
    try { return JSON.parse(localStorage.getItem(this._key) || '[]'); } catch { return []; }
  },

  save(list) {
    localStorage.setItem(this._key, JSON.stringify(list));
  },

  add(nom) {
    const list = this.all();
    list.unshift({ ...nom, id: rndHex(8), votes: 0, ts: Date.now() });
    this.save(list);
    return list[0];
  },

  vote(id, address) {
    const list = this.all();
    const nom = list.find(n => n.id === id);
    if (!nom) throw new Error('Nomination not found.');
    if (!nom.voters) nom.voters = [];
    if (nom.voters.includes(address)) throw new Error('Already voted on this nomination.');
    nom.voters.push(address);
    nom.votes++;
    this.save(list);
    return nom;
  }
};

// ═══════════════════════════════════════════════════════════
//  CONTRACT FUNCTIONS
// ═══════════════════════════════════════════════════════════

async function depositBTC(amount) {
  const address = requireAddr();
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) throw new Error('Invalid deposit amount.');

  const vault = VaultDB.get(address);

  const txHash = mkTxHash();
  await WalletManager.sendTransaction({
    to: CONTRACT.vault,
    from: address,
    method: 'deposit',
    params: [{ amount: amt.toString() }],
    chainId: OPNET_TESTNET.chainId,
    _simulatedHash: txHash
  }).catch(() => {});

  await delay(1500);

  vault.balance = fmt8(vault.balance + amt);
  vault.totalDeposited = fmt8(vault.totalDeposited + amt);
  vault.lastTxHash = txHash;
  VaultDB.save(address, vault);

  const pts = Math.floor(amt * 1000);
  RewardsDB.addPoints(address, pts, 'deposit');
  ActivityDB.push({ type: 'deposit', txHash, amount: `+${amt} BTC`, address });

  return { success: true, txHash, method: 'deposit', amount: amt, newBalance: vault.balance };
}

async function withdrawBTC(amount) {
  const address = requireAddr();
  const amt = parseFloat(amount);
  const vault = VaultDB.get(address);

  if (isNaN(amt) || amt <= 0) throw new Error('Invalid withdrawal amount.');

  if (vault.locked && Date.now() < vault.lockExpiry) {
    const d = new Date(vault.lockExpiry).toLocaleDateString();
    throw new Error(`Vault locked until ${d}. Withdrawals blocked.`);
  }
  if (vault.locked && Date.now() >= vault.lockExpiry) {
    vault.locked = false; vault.lockExpiry = null;
    VaultDB.save(address, vault);
  }
  if (amt > vault.balance) throw new Error('Insufficient vault balance.');

  const txHash = mkTxHash();
  await WalletManager.sendTransaction({
    to: CONTRACT.vault,
    from: address,
    method: 'withdraw',
    params: [{ amount: amt.toString() }],
    chainId: OPNET_TESTNET.chainId,
    _simulatedHash: txHash
  }).catch(() => {});

  await delay(1500);

  vault.balance = fmt8(vault.balance - amt);
  if (vault.balance < 0) vault.balance = 0;
  vault.lastTxHash = txHash;
  VaultDB.save(address, vault);

  ActivityDB.push({ type: 'withdraw', txHash, amount: `-${amt} BTC`, address });

  return { success: true, txHash, method: 'withdraw', amount: amt, newBalance: vault.balance };
}

async function lockVault(days) {
  const address = requireAddr();
  const d = parseInt(days);
  if (![30, 90, 180, 365].includes(d)) throw new Error('Invalid lock duration.');

  const vault = VaultDB.get(address);
  if (vault.locked && Date.now() < vault.lockExpiry) {
    throw new Error('Vault already locked.');
  }

  const txHash = mkTxHash();
  await WalletManager.sendTransaction({
    to: CONTRACT.vault,
    from: address,
    method: 'lockVault',
    params: [{ days: d }],
    chainId: OPNET_TESTNET.chainId,
    _simulatedHash: txHash
  }).catch(() => {});

  await delay(1500);

  const expiry = Date.now() + d * 86400000;
  vault.locked = true;
  vault.lockExpiry = expiry;
  vault.lockDays = d;
  vault.lastTxHash = txHash;
  VaultDB.save(address, vault);

  const pts = d * 10;
  RewardsDB.addPoints(address, pts, 'lock');
  ActivityDB.push({ type: 'lock', txHash, amount: `${d}d lock`, address });

  return { success: true, txHash, method: 'lockVault', days: d, lockExpiry: expiry };
}

async function getVaultState() {
  const address = requireAddr();
  await delay(250);
  const vault = VaultDB.get(address);
  if (vault.locked && Date.now() >= vault.lockExpiry) {
    vault.locked = false; vault.lockExpiry = null;
    VaultDB.save(address, vault);
  }
  return { success: true, ...vault };
}

async function getRewardsState() {
  const address = requireAddr();
  await delay(200);
  return { success: true, ...RewardsDB.get(address) };
}

async function getReferralState() {
  const address = requireAddr();
  await delay(200);
  return { success: true, ...ReferralDB.get(address) };
}

async function submitNomination(payload) {
  const address = requireAddr();
  const { name, nomAddr, description, stake } = payload;
  if (!name || !nomAddr || !description) throw new Error('All fields required.');
  if (!stake || parseFloat(stake) <= 0) throw new Error('Stake must be > 0.');

  const vault = VaultDB.get(address);
  const stakeAmt = parseFloat(stake);
  if (stakeAmt > vault.balance) throw new Error('Insufficient vault balance for stake.');

  const txHash = mkTxHash();
  await WalletManager.sendTransaction({
    to: CONTRACT.nomination,
    from: address,
    method: 'nominate',
    params: [{ name, nomAddr, description, stake: stakeAmt }],
    chainId: OPNET_TESTNET.chainId,
    _simulatedHash: txHash
  }).catch(() => {});

  await delay(1500);

  vault.balance = fmt8(vault.balance - stakeAmt);
  vault.lastTxHash = txHash;
  VaultDB.save(address, vault);

  const nom = NominationsDB.add({ name, address: nomAddr, description, stake: stakeAmt, nominator: address });
  RewardsDB.addPoints(address, 200, 'nom');
  ActivityDB.push({ type: 'nomination', txHash, amount: `-${stakeAmt} BTC staked`, address });

  return { success: true, txHash, nomination: nom };
}

async function voteNomination(nomId) {
  const address = requireAddr();
  await delay(800);
  const nom = NominationsDB.vote(nomId, address);
  RewardsDB.addPoints(address, 25, 'nom');
  return { success: true, nomination: nom };
}

async function getAllNominations() {
  await delay(200);
  return { success: true, nominations: NominationsDB.all() };
}

async function getActivity() {
  requireAddr();
  await delay(150);
  return { success: true, activity: ActivityDB.all() };
}

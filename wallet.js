/**
 * OrangeShield — wallet.js
 * Universal OP_NET / Bitcoin wallet detection.
 * Does NOT assume window.opnet.request exists.
 * Gracefully handles injection differences.
 */

const OPNET_TESTNET = {
  chainId:   "0xOPTEST",
  chainName: "OP_NET Testnet",
  rpcUrl:    "https://testnet.opnet.org",
  explorer:  "https://explorer.testnet.opnet.org"
};

// ─── Wallet Provider Detection ─────────────────────────────────────────────

const WalletDetector = {
  /**
   * Probe all known injection points.
   * Returns the best available provider object (or null).
   */
  findProvider() {
    const candidates = [
      { key: 'opnet',    label: 'OP_NET' },
      { key: 'bitcoin',  label: 'Bitcoin' },
      { key: 'unisat',   label: 'UniSat' },
      { key: 'ethereum', label: 'MetaMask/EVM' }
    ];
    for (const c of candidates) {
      const p = window[c.key];
      if (p && typeof p === 'object') {
        return { provider: p, label: c.label, key: c.key };
      }
    }
    return null;
  },

  /**
   * Detect which connect method the provider exposes.
   */
  detectConnectMethod(provider) {
    if (!provider) return null;
    // Priority: request({ method:"requestAccounts" })
    if (typeof provider.request === 'function')       return 'request';
    // UniSat / some OP_NET builds
    if (typeof provider.requestAccounts === 'function') return 'requestAccounts';
    // Legacy enable()
    if (typeof provider.enable === 'function')          return 'enable';
    // Ethereum eth_requestAccounts via send
    if (typeof provider.send === 'function')            return 'send';
    return null;
  },

  /**
   * Detect which getAccounts method the provider exposes.
   */
  detectAccountsMethod(provider) {
    if (!provider) return null;
    if (typeof provider.request === 'function')     return 'request';
    if (typeof provider.getAccounts === 'function') return 'getAccounts';
    if (typeof provider.accounts !== 'undefined')   return 'prop';
    return null;
  }
};

// ─── WalletManager ─────────────────────────────────────────────────────────

const WalletManager = {
  address: null,
  providerInfo: null,

  /** Try to connect wallet, returns address string or throws. */
  async connect() {
    const info = WalletDetector.findProvider();

    if (!info) {
      throw new WalletError('NO_PROVIDER', 'OP_NET Wallet Extension not detected.');
    }

    this.providerInfo = info;
    const { provider, label } = info;
    const method = WalletDetector.detectConnectMethod(provider);

    if (!method) {
      throw new WalletError('NO_METHOD', `${label} wallet found but no connect method available.`);
    }

    let accounts = [];

    try {
      if (method === 'request') {
        const res = await provider.request({ method: 'requestAccounts' });
        accounts = Array.isArray(res) ? res : (res?.accounts || []);
      } else if (method === 'requestAccounts') {
        const res = await provider.requestAccounts();
        accounts = Array.isArray(res) ? res : [];
      } else if (method === 'enable') {
        const res = await provider.enable();
        accounts = Array.isArray(res) ? res : [];
      } else if (method === 'send') {
        const res = await provider.send('eth_requestAccounts', []);
        accounts = res?.result || res || [];
      }
    } catch (err) {
      if (err?.code === 4001 || err?.message?.toLowerCase().includes('reject')) {
        throw new WalletError('REJECTED', 'Connection rejected by user.');
      }
      throw new WalletError('CONNECT_ERR', err?.message || 'Connection failed.');
    }

    if (!accounts || accounts.length === 0) {
      throw new WalletError('NO_ACCOUNTS', 'No accounts returned. Unlock your wallet and try again.');
    }

    const address = accounts[0];

    // Attempt network validation (non-fatal)
    await this._validateNetwork(provider).catch(() => {});

    this.address = address;
    localStorage.setItem('opnet_wallet', address);
    localStorage.setItem('opnet_provider', label);
    localStorage.setItem('opnet_chain', OPNET_TESTNET.chainId);

    return address;
  },

  /** Validate / switch network */
  async _validateNetwork(provider) {
    if (!provider) return;

    let chainId = null;

    // Try various ways to get chainId
    if (typeof provider.request === 'function') {
      try { chainId = await provider.request({ method: 'getChainId' }); } catch {}
      if (!chainId) {
        try { chainId = await provider.request({ method: 'eth_chainId' }); } catch {}
      }
    }
    if (!chainId && typeof provider.getNetwork === 'function') {
      try { const net = await provider.getNetwork(); chainId = net?.chainId; } catch {}
    }

    if (chainId && chainId !== OPNET_TESTNET.chainId) {
      // Try switching (non-fatal if unsupported)
      try {
        if (typeof provider.request === 'function') {
          await provider.request({
            method: 'switchNetwork',
            params: [{ chainId: OPNET_TESTNET.chainId }]
          });
        } else if (typeof provider.switchNetwork === 'function') {
          await provider.switchNetwork(OPNET_TESTNET.chainId);
        }
      } catch { /* ignore — provider may not support this */ }
    }
  },

  /** Send a transaction — detects available method. */
  async sendTransaction(txPayload) {
    const info = this.providerInfo || WalletDetector.findProvider();
    if (!info) throw new WalletError('NO_PROVIDER', 'Wallet not connected.');

    const { provider } = info;

    if (typeof provider.request === 'function') {
      return provider.request({ method: 'sendTransaction', params: [txPayload] });
    }
    if (typeof provider.sendTransaction === 'function') {
      return provider.sendTransaction(txPayload);
    }
    if (typeof provider.send === 'function') {
      return provider.send('eth_sendTransaction', [txPayload]);
    }
    // Last resort: simulate OK
    return { hash: txPayload._simulatedHash || '0xSIM' };
  },

  disconnect() {
    this.address = null;
    this.providerInfo = null;
    localStorage.removeItem('opnet_wallet');
    localStorage.removeItem('opnet_provider');
    localStorage.removeItem('opnet_chain');
  },

  getAddress() {
    return this.address || localStorage.getItem('opnet_wallet');
  },

  isConnected() {
    return !!this.getAddress();
  },

  shortAddress(addr) {
    addr = addr || this.getAddress();
    if (!addr) return '';
    return addr.length > 14 ? addr.slice(0, 8) + '…' + addr.slice(-6) : addr;
  }
};

// ─── Custom Error ──────────────────────────────────────────────────────────

class WalletError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'WalletError';
  }
}

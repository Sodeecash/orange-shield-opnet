/**
 * OrangeShield v3 — App Logic
 * Handles UI state, contract calls, toasts, timers
 */

// ─── Toast System ──────────────────────────────────────────────────────────────

const Toast = (() => {
  let container;

  function init() {
    container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
  }

  function show(title, msg, type = 'info', duration = 5000) {
    const icons = { success: '✅', error: '❌', pending: '⏳', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Close">✕</button>
    `;

    el.querySelector('.toast-close').addEventListener('click', () => dismiss(el));
    container.appendChild(el);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add('show'));
    });

    if (duration > 0) setTimeout(() => dismiss(el), duration);
    return el;
  }

  function dismiss(el) {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }

  return { init, show };
})();


// ─── Countdown Timer ───────────────────────────────────────────────────────────

function startCountdown(expiryTs, selector) {
  const container = document.querySelector(selector);
  if (!container) return;

  function tick() {
    const now = Date.now();
    const delta = expiryTs - now;

    if (delta <= 0) {
      container.innerHTML = `<span class="badge badge-unlocked">🔓 Vault Unlocked</span>`;
      return;
    }

    const days    = Math.floor(delta / 86400000);
    const hours   = Math.floor((delta % 86400000) / 3600000);
    const minutes = Math.floor((delta % 3600000) / 60000);
    const seconds = Math.floor((delta % 60000) / 1000);

    container.innerHTML = `
      <div class="countdown-unit"><span class="countdown-num">${String(days).padStart(2,'0')}</span><span class="countdown-label">Days</span></div>
      <span class="countdown-sep">:</span>
      <div class="countdown-unit"><span class="countdown-num">${String(hours).padStart(2,'0')}</span><span class="countdown-label">Hrs</span></div>
      <span class="countdown-sep">:</span>
      <div class="countdown-unit"><span class="countdown-num">${String(minutes).padStart(2,'0')}</span><span class="countdown-label">Min</span></div>
      <span class="countdown-sep">:</span>
      <div class="countdown-unit"><span class="countdown-num">${String(seconds).padStart(2,'0')}</span><span class="countdown-label">Sec</span></div>
    `;
  }

  tick();
  return setInterval(tick, 1000);
}


// ─── Helpers ───────────────────────────────────────────────────────────────────

function truncateHash(hash, start = 10, end = 6) {
  if (!hash) return '—';
  return hash.slice(0, start) + '...' + hash.slice(-end);
}

function truncateAddr(addr, start = 8, end = 6) {
  if (!addr) return '—';
  return addr.slice(0, start) + '...' + addr.slice(-end);
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function formatTimeAgo(ts) {
  const delta = Date.now() - ts;
  if (delta < 60000) return 'just now';
  if (delta < 3600000) return Math.floor(delta / 60000) + 'm ago';
  if (delta < 86400000) return Math.floor(delta / 3600000) + 'h ago';
  return Math.floor(delta / 86400000) + 'd ago';
}

function setPending(btnEl, spinnerEl, isPending) {
  if (btnEl) btnEl.disabled = isPending;
  if (spinnerEl) spinnerEl.style.display = isPending ? 'inline-block' : 'none';
}

function showTxStatus(boxEl, data) {
  if (!boxEl) return;
  boxEl.classList.add('show');
  boxEl.innerHTML = `
    <div class="tx-status-row"><span>Status</span><span class="tx-status-val text-success">✅ Confirmed</span></div>
    <div class="tx-status-row"><span>Tx Hash</span><span class="tx-status-val">${data.txHash}</span></div>
    <div class="tx-status-row"><span>Block</span><span class="tx-status-val">#${Math.floor(Math.random() * 900000 + 100000)}</span></div>
    <div class="tx-status-row"><span>Gas</span><span class="tx-status-val">${(Math.random() * 0.00005 + 0.00001).toFixed(8)} BTC</span></div>
    <div class="tx-status-row"><span>Time</span><span class="tx-status-val">${new Date().toLocaleTimeString()}</span></div>
  `;
}


// ─── Transaction History Renderer ──────────────────────────────────────────────

function renderTxHistory(listEl) {
  if (!listEl) return;
  const history = OPNET.getHistory();

  if (!history.length) {
    listEl.innerHTML = `<div class="tx-empty">🔍 No transactions yet</div>`;
    return;
  }

  const icons = { Deposit: '⬇️', Withdraw: '⬆️', Lock: '🔒', Deploy: '🚀' };
  const classes = { Deposit: 'deposit', Withdraw: 'withdraw', Lock: 'lock', Deploy: 'deploy' };
  const colors  = { Deposit: 'var(--success)', Withdraw: 'var(--error)', Lock: 'var(--orange)', Deploy: '#818cf8' };

  listEl.innerHTML = history.map(tx => `
    <div class="tx-row">
      <div class="tx-left">
        <div class="tx-type-icon ${classes[tx.type] || ''}">${icons[tx.type] || '📄'}</div>
        <div>
          <div class="tx-info-type" style="color:${colors[tx.type] || 'var(--text)'}">${tx.type}</div>
          <div class="tx-info-hash">${truncateHash(tx.txHash)}</div>
        </div>
      </div>
      <div class="tx-right">
        <div class="tx-amount" style="color:${colors[tx.type] || 'var(--text)'}">
          ${tx.amount != null ? (tx.type === 'Withdraw' ? '−' : '+') + tx.amount.toFixed(8) + ' BTC' : (tx.duration ? tx.duration + 'd lock' : '—')}
        </div>
        <div class="tx-time">${formatTimeAgo(tx.timestamp)}</div>
      </div>
    </div>
  `).join('');
}


// ─── Tab System ────────────────────────────────────────────────────────────────

function initTabs(navSelector, panelSelector) {
  const tabs   = document.querySelectorAll(navSelector);
  const panels = document.querySelectorAll(panelSelector);

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}


// ─── Dashboard Page Init ───────────────────────────────────────────────────────

async function initDashboard() {
  Toast.init();

  // Check wallet
  const wallet = OPNET.getWallet();
  if (!wallet) {
    window.location.href = 'index.html';
    return;
  }

  // Elements
  const walletAddressEl    = document.getElementById('wallet-address');
  const vaultBalanceEl     = document.getElementById('vault-balance');
  const lockStatusEl       = document.getElementById('lock-status');
  const expiryDateEl       = document.getElementById('expiry-date');
  const lastTxEl           = document.getElementById('last-tx');
  const countdownEl        = document.getElementById('countdown');
  const contractAddrEl     = document.getElementById('contract-address');
  const deploySection      = document.getElementById('deploy-section');
  const mainContent        = document.getElementById('main-content');
  const pageLoader         = document.getElementById('page-loader');

  // Navbar wallet
  const navWallet = document.getElementById('nav-wallet');
  if (navWallet) navWallet.textContent = truncateAddr(wallet);

  // Load state
  const { updatedState: state } = await OPNET.getVaultState();

  // Hide loader
  if (pageLoader) {
    setTimeout(() => pageLoader.classList.add('hide'), 600);
  }

  if (!state.deployed) {
    if (deploySection) deploySection.style.display = 'block';
    if (mainContent)   mainContent.style.display   = 'none';
  } else {
    if (deploySection) deploySection.style.display = 'none';
    if (mainContent)   mainContent.style.display   = 'block';
    refreshUI(state);
  }

  // Init tabs
  initTabs('.tab-btn', '.tab-panel');

  // ─── Deploy Vault ────────────────────────────────────────
  const deployBtn = document.getElementById('deploy-btn');
  const deploySpinner = document.getElementById('deploy-spinner');

  if (deployBtn) {
    deployBtn.addEventListener('click', async () => {
      setPending(deployBtn, deploySpinner, true);
      Toast.show('Deploying Contract', 'Broadcasting to OP_NET...', 'pending', 8000);

      const result = await OPNET.deployVault();

      setPending(deployBtn, deploySpinner, false);

      if (result.success) {
        Toast.show('Vault Deployed!', result.txHash, 'success');
        if (deploySection) deploySection.style.display = 'none';
        if (mainContent)   mainContent.style.display   = 'block';
        refreshUI(result.updatedState);
        renderTxHistory(document.getElementById('tx-list'));
      } else {
        Toast.show('Deploy Failed', result.error, 'error');
      }
    });
  }

  // ─── Deposit ─────────────────────────────────────────────
  const depositBtn    = document.getElementById('deposit-btn');
  const depositInput  = document.getElementById('deposit-amount');
  const depositStatus = document.getElementById('deposit-status');
  const depositSpinner = document.getElementById('deposit-spinner');

  if (depositBtn) {
    depositBtn.addEventListener('click', async () => {
      const amount = parseFloat(depositInput.value);
      if (!amount || amount <= 0) {
        Toast.show('Invalid Amount', 'Enter a valid BTC amount.', 'error');
        return;
      }

      setPending(depositBtn, depositSpinner, true);
      depositBtn.textContent = 'Broadcasting...';
      Toast.show('Deposit Pending', `Depositing ${amount} BTC...`, 'pending', 8000);

      const result = await OPNET.depositBTC(amount);

      setPending(depositBtn, depositSpinner, false);
      depositBtn.textContent = 'Deposit BTC';

      if (result.success) {
        showTxStatus(depositStatus, result);
        Toast.show('Deposit Confirmed!', result.txHash, 'success');
        depositInput.value = '';
        refreshUI(result.updatedState);
        renderTxHistory(document.getElementById('tx-list'));
      } else {
        Toast.show('Deposit Failed', result.error, 'error');
      }
    });
  }

  // ─── Withdraw ────────────────────────────────────────────
  const withdrawBtn     = document.getElementById('withdraw-btn');
  const withdrawInput   = document.getElementById('withdraw-amount');
  const withdrawStatus  = document.getElementById('withdraw-status');
  const withdrawSpinner = document.getElementById('withdraw-spinner');
  const withdrawBlock   = document.getElementById('withdraw-locked-msg');

  if (withdrawBtn) {
    withdrawBtn.addEventListener('click', async () => {
      const amount = parseFloat(withdrawInput.value);
      if (!amount || amount <= 0) {
        Toast.show('Invalid Amount', 'Enter a valid BTC amount.', 'error');
        return;
      }

      const { updatedState: cur } = await OPNET.getVaultState();
      if (cur.locked && cur.lockExpiry && Date.now() < cur.lockExpiry) {
        Toast.show('Vault Locked', 'Cannot withdraw until lock expires.', 'error');
        return;
      }

      setPending(withdrawBtn, withdrawSpinner, true);
      withdrawBtn.textContent = 'Broadcasting...';
      Toast.show('Withdrawal Pending', `Withdrawing ${amount} BTC...`, 'pending', 8000);

      const result = await OPNET.withdrawBTC(amount);

      setPending(withdrawBtn, withdrawSpinner, false);
      withdrawBtn.textContent = 'Withdraw BTC';

      if (result.success) {
        showTxStatus(withdrawStatus, result);
        Toast.show('Withdrawal Confirmed!', result.txHash, 'success');
        withdrawInput.value = '';
        refreshUI(result.updatedState);
        renderTxHistory(document.getElementById('tx-list'));
      } else {
        Toast.show('Withdrawal Failed', result.error, 'error');
      }
    });
  }

  // ─── Lock Vault ──────────────────────────────────────────
  let selectedDuration = 30;
  const durationOpts = document.querySelectorAll('.duration-option');
  const lockBtn      = document.getElementById('lock-btn');
  const lockSpinner  = document.getElementById('lock-spinner');
  const lockStatus   = document.getElementById('lock-status-box');

  durationOpts.forEach(opt => {
    opt.addEventListener('click', () => {
      durationOpts.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedDuration = parseInt(opt.dataset.days, 10);
    });
  });

  if (lockBtn) {
    lockBtn.addEventListener('click', async () => {
      const { updatedState: cur } = await OPNET.getVaultState();
      if (cur.locked && cur.lockExpiry && Date.now() < cur.lockExpiry) {
        Toast.show('Already Locked', 'Vault is currently locked.', 'error');
        return;
      }

      setPending(lockBtn, lockSpinner, true);
      Toast.show('Locking Vault', `Setting ${selectedDuration}-day timelock...`, 'pending', 8000);

      const result = await OPNET.lockVault(selectedDuration);

      setPending(lockBtn, lockSpinner, false);

      if (result.success) {
        showTxStatus(lockStatus, result);
        Toast.show('Vault Locked!', result.txHash, 'success');
        refreshUI(result.updatedState);
        renderTxHistory(document.getElementById('tx-list'));
      } else {
        Toast.show('Lock Failed', result.error, 'error');
      }
    });
  }

  // ─── Disconnect ──────────────────────────────────────────
  const disconnectBtn = document.getElementById('disconnect-btn');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', () => {
      OPNET.disconnectWallet();
      window.location.href = 'index.html';
    });
  }

  // ─── Reset Vault ─────────────────────────────────────────
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Are you sure? This will wipe the vault state and transaction history.')) {
        OPNET.resetVault();
        window.location.reload();
      }
    });
  }

  // ─── Refresh UI ──────────────────────────────────────────
  let countdownInterval = null;

  function refreshUI(state) {
    if (!state) return;

    if (walletAddressEl) walletAddressEl.textContent = truncateAddr(wallet, 12, 6);
    if (vaultBalanceEl)  vaultBalanceEl.textContent  = state.balance.toFixed(8) + ' BTC';
    if (lastTxEl)        lastTxEl.textContent        = truncateHash(state.lastTxHash);
    if (contractAddrEl)  contractAddrEl.textContent  = truncateAddr(state.contractAddress, 10, 8);

    const isLocked = state.locked && state.lockExpiry && Date.now() < state.lockExpiry;

    if (lockStatusEl) {
      lockStatusEl.innerHTML = isLocked
        ? '<span class="badge badge-locked">🔒 Locked</span>'
        : '<span class="badge badge-unlocked">🔓 Unlocked</span>';
    }

    if (expiryDateEl) {
      expiryDateEl.textContent = state.lockExpiry ? formatDate(state.lockExpiry) : '—';
    }

    // Countdown
    if (countdownEl) {
      if (countdownInterval) clearInterval(countdownInterval);
      if (isLocked) {
        countdownInterval = startCountdown(state.lockExpiry, '#countdown');
      } else {
        countdownEl.innerHTML = `<span class="badge badge-unlocked">🔓 No active lock</span>`;
      }
    }

    // Withdraw block
    if (withdrawBlock) {
      withdrawBlock.style.display = isLocked ? 'flex' : 'none';
    }
    if (withdrawBtn) {
      withdrawBtn.disabled = isLocked;
    }

    // Lock btn
    const lockBtnEl = document.getElementById('lock-btn');
    if (lockBtnEl) {
      lockBtnEl.disabled = isLocked || state.balance <= 0;
    }

    // Overview stats
    const ovBalance = document.getElementById('ov-balance');
    const ovStatus  = document.getElementById('ov-status');
    const ovExpiry  = document.getElementById('ov-expiry');

    if (ovBalance) ovBalance.textContent = state.balance.toFixed(8) + ' BTC';
    if (ovStatus)  ovStatus.innerHTML    = isLocked ? '<span class="badge badge-locked">Locked</span>' : '<span class="badge badge-unlocked">Unlocked</span>';
    if (ovExpiry)  ovExpiry.textContent  = state.lockExpiry ? formatDate(state.lockExpiry) : '—';
  }

  // Initial render of tx history
  renderTxHistory(document.getElementById('tx-list'));
}


// ─── Index Page Init ───────────────────────────────────────────────────────────

function initIndex() {
  Toast.init();

  const connectBtn = document.getElementById('connect-btn');
  const connectBtn2 = document.getElementById('connect-btn-2');
  const walletState = document.getElementById('wallet-state');
  const walletBtnState = document.getElementById('wallet-btn-state');

  const existingWallet = OPNET.getWallet();
  if (existingWallet) {
    updateConnectedState(existingWallet);
  }

  function handleConnect() {
    const wallet = OPNET.connectWallet();
    updateConnectedState(wallet);
    Toast.show('Wallet Connected', wallet, 'success');
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1200);
  }

  function updateConnectedState(addr) {
    if (walletState) walletState.textContent = truncateAddr(addr);
    if (connectBtn)  connectBtn.textContent  = 'Open Dashboard →';
    if (connectBtn)  connectBtn.onclick      = () => window.location.href = 'dashboard.html';
    if (connectBtn2) connectBtn2.textContent = 'Open Dashboard →';
    if (connectBtn2) connectBtn2.onclick     = () => window.location.href = 'dashboard.html';
    if (walletBtnState) walletBtnState.textContent = truncateAddr(addr, 8, 6);
  }

  if (connectBtn && !existingWallet) {
    connectBtn.addEventListener('click', handleConnect);
  }

  if (connectBtn2 && !existingWallet) {
    connectBtn2.addEventListener('click', handleConnect);
  }
}


// ─── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'dashboard') initDashboard();
  if (page === 'index')     initIndex();
});

/**
 * OrangeShield — app.js
 * Core utilities: toast, nav, wallet UI, shared helpers.
 */

// ─── Toast System ──────────────────────────────────────────────────────────

function toast(title, msg = '', type = 'default') {
  const icons = { ok: '✔', err: '✖', info: 'ℹ', default: '₿' };
  const container = document.getElementById('toasts');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="toast-ico">${icons[type] || icons.default}</span>
    <div>
      <div class="toast-ttl">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
    </div>
  `;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 't-out 0.3s ease forwards';
    setTimeout(() => el.remove(), 320);
  }, 4200);
}

// ─── Button State ──────────────────────────────────────────────────────────

function setBtnLoading(btn, label = 'Processing...') {
  if (!btn) return;
  btn._origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spin active"></span> ${label}`;
}

function setBtnDone(btn) {
  if (!btn) return;
  btn.disabled = false;
  if (btn._origText) btn.innerHTML = btn._origText;
}

// ─── TX Box ────────────────────────────────────────────────────────────────

function showTxBox(boxId, txHash) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const url = `${OPNET_TESTNET.explorer}/tx/${txHash}`;
  box.querySelector('.tx-hash').innerHTML =
    `<a href="${url}" target="_blank" rel="noopener">${txHash.slice(0, 44)}…</a>`;
  box.classList.add('show');
}

function hideTxBox(boxId) {
  const box = document.getElementById(boxId);
  if (box) box.classList.remove('show');
}

// ─── Countdown ─────────────────────────────────────────────────────────────

function buildCountdown(ms) {
  if (ms <= 0) return { d: '00', h: '00', m: '00', s: '00', expired: true };
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const p = v => String(v).padStart(2, '0');
  return { d: p(d), h: p(h), m: p(m), s: p(s), expired: false };
}

function renderCountdown(containerId, expiry) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!expiry) { el.innerHTML = '<span style="color:var(--text3);font-family:var(--mono);font-size:13px;">No active lock</span>'; return; }
  const tick = () => {
    const rem = expiry - Date.now();
    const cd = buildCountdown(rem);
    if (cd.expired) {
      el.innerHTML = '<span style="color:var(--green);font-family:var(--mono);">EXPIRED — UNLOCKED</span>';
      return;
    }
    el.innerHTML = `
      <div class="countdown-row">
        <div class="cd-unit"><div class="cd-num">${cd.d}</div><div class="cd-lbl">Days</div></div>
        <div class="cd-unit"><div class="cd-num">${cd.h}</div><div class="cd-lbl">Hours</div></div>
        <div class="cd-unit"><div class="cd-num">${cd.m}</div><div class="cd-lbl">Mins</div></div>
        <div class="cd-unit"><div class="cd-num">${cd.s}</div><div class="cd-lbl">Secs</div></div>
      </div>
    `;
  };
  tick();
  const id = setInterval(tick, 1000);
  el._cdInterval = id;
}

// ─── Wallet UI Updates ─────────────────────────────────────────────────────

function updateWalletUI() {
  const addr = WalletManager.getAddress();
  const short = WalletManager.shortAddress(addr);

  // Topbar chip
  const chip = document.getElementById('wallet-chip');
  if (chip) { chip.textContent = short; chip.classList.toggle('show', !!addr); }

  // Sidebar
  const sAddr = document.getElementById('sb-addr');
  const sAvatar = document.getElementById('sb-avatar');
  if (sAddr) sAddr.textContent = addr ? short : '—';
  if (sAvatar) sAvatar.textContent = addr ? '🛡' : '?';

  // Tier
  if (addr) {
    const r = RewardsDB.get(addr);
    const tier = RewardsDB.getTier(r.points);
    const sbTier = document.getElementById('sb-tier');
    if (sbTier) sbTier.textContent = `${tier.icon} ${tier.name}`;
  }
}

// ─── Section Navigation ────────────────────────────────────────────────────

let _currentSection = null;

function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const sec = document.getElementById('sec-' + id);
  if (sec) sec.classList.add('active');

  const nav = document.getElementById('nav-' + id);
  if (nav) nav.classList.add('active');

  _currentSection = id;

  // Page-specific refresh
  const refreshMap = {
    overview:   refreshOverview,
    vault:      refreshVault,
    rewards:    refreshRewards,
    referrals:  refreshReferrals,
    nomination: refreshNomination,
    activity:   refreshActivity,
    settings:   refreshSettings
  };
  if (refreshMap[id]) refreshMap[id]();

  // Scroll to top on mobile
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Gate Overlay ──────────────────────────────────────────────────────────

function checkGate() {
  const gate = document.getElementById('gate');
  if (!gate) return;
  gate.classList.toggle('hide', WalletManager.isConnected());
}

async function handleConnect() {
  const btn = document.getElementById('gate-connect-btn');
  const reqPanel = document.getElementById('wallet-req-panel');
  const errPanel = document.getElementById('gate-err');
  if (reqPanel) reqPanel.classList.remove('show');
  if (errPanel) errPanel.classList.remove('show');

  setBtnLoading(btn, 'Connecting...');

  try {
    const addr = await WalletManager.connect();
    setBtnDone(btn);
    updateWalletUI();
    checkGate();
    toast('Wallet Connected', WalletManager.shortAddress(addr), 'ok');
    showSection('overview');
  } catch (err) {
    setBtnDone(btn);
    if (err.code === 'NO_PROVIDER') {
      if (reqPanel) reqPanel.classList.add('show');
    } else {
      if (errPanel) {
        errPanel.querySelector('.err-msg').textContent = err.message;
        errPanel.classList.add('show');
      }
    }
    toast('Connection Failed', err.message, 'err');
  }
}

function handleDisconnect() {
  WalletManager.disconnect();
  updateWalletUI();
  toast('Disconnected', 'Wallet session ended.', 'info');
  setTimeout(() => { window.location.href = 'index.html'; }, 600);
}

// ─── Audio Toggle ──────────────────────────────────────────────────────────

let _audioCtx = null;
let _audioPlaying = false;

function toggleAudio(btn) {
  if (!_audioPlaying) {
    // Generate ambient tone via Web Audio API
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const gain = _audioCtx.createGain();
      gain.gain.value = 0.04;
      gain.connect(_audioCtx.destination);

      // Layered soft oscillators
      [[55, 'sine'], [110, 'sine'], [220, 'triangle'], [440, 'sine']].forEach(([freq, type]) => {
        const osc = _audioCtx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        const nodeGain = _audioCtx.createGain();
        nodeGain.gain.value = 0.25;
        osc.connect(nodeGain);
        nodeGain.connect(gain);
        osc.start();
      });

      _audioPlaying = true;
      if (btn) { btn.title = 'Mute ambient'; btn.textContent = '🔊'; }
      toast('Ambient Audio', 'Soft tone playing', 'info');
    } catch {
      toast('Audio unavailable', 'Browser blocked audio context', 'err');
    }
  } else {
    if (_audioCtx) { _audioCtx.close(); _audioCtx = null; }
    _audioPlaying = false;
    if (btn) { btn.title = 'Play ambient'; btn.textContent = '🔇'; }
  }
}

// ─── Boot ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Restore wallet from localStorage
  const savedAddr = localStorage.getItem('opnet_wallet');
  if (savedAddr) WalletManager.address = savedAddr;

  updateWalletUI();
  checkGate();

  // Wire gate connect button
  const gcBtn = document.getElementById('gate-connect-btn');
  if (gcBtn) gcBtn.addEventListener('click', handleConnect);

  // Wire disconnect
  const discBtn = document.getElementById('nav-disconnect');
  if (discBtn) discBtn.addEventListener('click', handleDisconnect);

  // Wire audio button
  const audioBtnEl = document.getElementById('audio-btn');
  if (audioBtnEl) audioBtnEl.addEventListener('click', () => toggleAudio(audioBtnEl));

  // Default section
  if (WalletManager.isConnected()) {
    showSection('overview');
  }

  // Check referral param
  const urlRef = new URLSearchParams(window.location.search).get('ref');
  if (urlRef && WalletManager.isConnected()) {
    ReferralDB.addReferral(urlRef, WalletManager.getAddress());
    toast('Referral Tracked', 'You joined via a referral link!', 'info');
  }
});

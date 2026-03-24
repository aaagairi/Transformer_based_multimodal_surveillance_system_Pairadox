/* =============================================
   SENTINEL AI — SURVEILLANCE DASHBOARD
   app.js — Main Application Logic
   Covers: Video simulation, Audio analysis,
   Waveform/Spectrogram, Fusion scoring, Alerts
============================================= */

'use strict';

// ─── State ───────────────────────────────────────
const state = {
  alerts: 0,
  totalDetections: 0,
  anomalyCount: 0,
  startTime: Date.now(),
  micActive: false,
  audioContext: null,
  analyser: null,
  micStream: null,
  uploadedVideo: null,
  uploadedAudio: null,
  fusionScore: 0.12,
  threatLevel: 'low',   // low | medium | high | critical
  camStates: [
    { conf: 5, badge: 'normal', activity: 'Idle' },
    { conf: 8, badge: 'normal', activity: 'Idle' },
    { conf: 3, badge: 'normal', activity: 'Idle' },
    { conf: 10, badge: 'normal', activity: 'Idle' },
  ],
  videoClasses: { normal: 78, running: 8, fighting: 5, loitering: 9, vandalism: 0 },
  audioClasses: { ambient: 85, talking: 12, screaming: 2, gunshot: 1, explosion: 0, glass: 0 },
};

// ─── DOM refs ─────────────────────────────────────
const $ = id => document.getElementById(id);

// ─── Clock ────────────────────────────────────────
function updateClock() {
  const now = new Date();
  $('clock').textContent = now.toTimeString().slice(0, 8);
  $('date').textContent = now.toDateString().toUpperCase();
}
setInterval(updateClock, 1000);
updateClock();

// ─── Uptime ───────────────────────────────────────
function updateUptime() {
  const s = Math.floor((Date.now() - state.startTime) / 1000);
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  $('uptime-val').textContent = `${m}:${sec}`;
}
setInterval(updateUptime, 1000);

// ─── Canvas Video Simulation ──────────────────────
const CAM_COLORS = ['#040e1e', '#060828', '#08061e', '#04101a'];
const CAM_ACCENT = ['#00d4ff', '#9b6dff', '#4d94ff', '#00ff94'];

const canvases = [0,1,2,3].map(i => ({
  canvas: $(`canvas-${i}`),
  ctx: $(`canvas-${i}`).getContext('2d'),
  particles: [],
  scanY: 0,
  glitchTimer: 0,
}));

function initParticles(cam) {
  cam.particles = [];
  for (let i = 0; i < 12; i++) {
    cam.particles.push({
      x: Math.random() * 320,
      y: Math.random() * 200,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 0.8,
      size: Math.random() * 4 + 2,
      alpha: Math.random() * 0.6 + 0.3,
    });
  }
}

canvases.forEach(initParticles);

function drawFeed(cam, idx) {
  const { ctx, particles } = cam;
  const w = 320, h = 200;
  const bg = CAM_COLORS[idx % CAM_COLORS.length];
  const accent = CAM_ACCENT[idx % CAM_ACCENT.length];

  // Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = `${accent}18`;
  ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Particles (simulated people/objects)
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0 || p.x > w) p.vx *= -1;
    if (p.y < 0 || p.y > h) p.vy *= -1;

    ctx.beginPath();
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
    grad.addColorStop(0, `${accent}cc`);
    grad.addColorStop(1, `${accent}00`);
    ctx.fillStyle = grad;
    ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
    ctx.fill();

    // Bounding boxes on particles (simulated detection)
    const bSize = p.size * 5;
    ctx.strokeStyle = `${accent}55`;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(p.x - bSize / 2, p.y - bSize / 2, bSize, bSize);
  });

  // Scan line
  cam.scanY = (cam.scanY + 1) % h;
  const scanGrad = ctx.createLinearGradient(0, cam.scanY - 4, 0, cam.scanY + 4);
  scanGrad.addColorStop(0, `${accent}00`);
  scanGrad.addColorStop(0.5, `${accent}44`);
  scanGrad.addColorStop(1, `${accent}00`);
  ctx.fillStyle = scanGrad;
  ctx.fillRect(0, cam.scanY - 4, w, 8);

  // Alert state — red overlay flash
  if (state.camStates[idx].badge === 'danger') {
    ctx.fillStyle = `rgba(255,45,85,${0.05 + 0.05 * Math.sin(Date.now() / 200)})`;
    ctx.fillRect(0, 0, w, h);
  }

  // Timestamp
  ctx.fillStyle = `${accent}99`;
  ctx.font = '9px "Share Tech Mono"';
  ctx.fillText(new Date().toISOString().replace('T', ' ').slice(0, 19), 6, h - 6);
}

function animateFeeds() {
  canvases.forEach((cam, i) => drawFeed(cam, i));
  requestAnimationFrame(animateFeeds);
}
animateFeeds();

// ─── Waveform Canvas ──────────────────────────────
const wvCanvas = $('waveform-canvas');
const wvCtx = wvCanvas.getContext('2d');
let wvData = new Array(200).fill(0);
let wvTick = 0;

function drawWaveform(dataArray) {
  const w = wvCanvas.width, h = wvCanvas.height;
  wvCtx.fillStyle = '#040a1c';
  wvCtx.fillRect(0, 0, w, h);

  // Grid
  wvCtx.strokeStyle = '#131d4044';
  wvCtx.lineWidth = 0.5;
  for (let y = 0; y < h; y += 20) {
    wvCtx.beginPath(); wvCtx.moveTo(0, y); wvCtx.lineTo(w, y); wvCtx.stroke();
  }

  const step = Math.floor(dataArray.length / w) || 1;
  wvCtx.beginPath();
  wvCtx.strokeStyle = '#4d94ff';
  wvCtx.lineWidth = 1.5;
  wvCtx.shadowColor = '#4d94ff';
  wvCtx.shadowBlur = 8;

  for (let x = 0; x < w; x++) {
    const idx = Math.min(x * step, dataArray.length - 1);
    const v = dataArray[idx] / 128.0;
    const y = (v * h) / 2;
    if (x === 0) wvCtx.moveTo(x, h / 2 + y);
    else wvCtx.lineTo(x, h / 2 + y);
  }
  wvCtx.stroke();
  wvCtx.shadowBlur = 0;
}

function drawFakeWaveform() {
  wvTick++;
  const fakeData = new Array(256).fill(0).map((_, i) => {
    const base = 128;
    const noise = (Math.random() - 0.5) * 20;
    const wave1 = Math.sin(wvTick * 0.05 + i * 0.1) * 30;
    const wave2 = Math.sin(wvTick * 0.02 + i * 0.05) * 15;
    return Math.max(0, Math.min(255, base + wave1 + wave2 + noise));
  });
  drawWaveform(fakeData);
}

setInterval(drawFakeWaveform, 80);

// ─── Spectrogram Canvas ───────────────────────────
const spCanvas = $('spectrogram-canvas');
const spCtx = spCanvas.getContext('2d');

function drawSpectrogram(freqData) {
  const w = spCanvas.width, h = spCanvas.height;
  // Shift left
  const imgData = spCtx.getImageData(1, 0, w - 1, h);
  spCtx.putImageData(imgData, 0, 0);
  // Draw new column
  const colH = h / freqData.length;
  for (let i = 0; i < freqData.length; i++) {
    const val = freqData[i] / 255;
    const r = Math.floor(val * 80 + 20);
    const g = Math.floor(val * 50);
    const b = Math.floor(100 + val * 155);
    spCtx.fillStyle = `rgb(${r},${g},${b})`;
    spCtx.fillRect(w - 1, h - (i + 1) * colH, 1, colH + 1);
  }
}

function fakeSPData() {
  const bins = 32;
  const data = new Array(bins).fill(0).map((_, i) => {
    const base = Math.max(0, 180 - i * 4);
    return Math.floor(base + (Math.random() - 0.5) * 60);
  });
  drawSpectrogram(data);
}
setInterval(fakeSPData, 120);

// ─── Animated Meter Bars ──────────────────────────
function updateMeterBars(level) {
  const bars = document.querySelectorAll('.meter-bar');
  bars.forEach((bar, i) => {
    const threshold = (i / bars.length) * 100;
    const active = level > threshold;
    bar.style.height = active ? `${8 + Math.random() * level * 0.5}px` : '3px';
    if (threshold > 70) bar.style.background = active ? 'var(--red)' : 'var(--bg-card)';
    else if (threshold > 40) bar.style.background = active ? 'var(--amber)' : 'var(--bg-card)';
    else bar.style.background = active ? 'var(--violet)' : 'var(--bg-card)';
    bar.style.boxShadow = active ? `0 0 5px ${threshold > 70 ? 'var(--red-glow)' : 'var(--violet-glow)'}` : 'none';
  });
}

let fakeMicLevel = 15;
setInterval(() => {
  if (!state.micActive) {
    fakeMicLevel = 15 + Math.sin(Date.now() / 1000) * 10 + Math.random() * 5;
    updateMeterBars(fakeMicLevel);
  }
}, 100);

// ─── Gauge Canvas ─────────────────────────────────
const gaugeCanvas = $('gauge-canvas');
const gaugeCtx = gaugeCanvas.getContext('2d');

function drawGauge(score) {
  const w = 200, h = 120;
  gaugeCtx.clearRect(0, 0, w, h);

  const cx = w / 2, cy = 100;
  const r = 75;
  const startA = Math.PI, endA = 0;

  // Track
  gaugeCtx.beginPath();
  gaugeCtx.arc(cx, cy, r, startA, endA, false);
  gaugeCtx.strokeStyle = '#131d40';
  gaugeCtx.lineWidth = 12;
  gaugeCtx.lineCap = 'round';
  gaugeCtx.stroke();

  // Fill
  const fillEnd = startA + (score * Math.PI);
  let color = '#00ff94';
  if (score > 0.75) color = '#ff3366';
  else if (score > 0.5) color = '#ffc840';
  else if (score > 0.25) color = '#4d94ff';

  gaugeCtx.beginPath();
  gaugeCtx.arc(cx, cy, r, startA, fillEnd, false);
  gaugeCtx.strokeStyle = color;
  gaugeCtx.lineWidth = 12;
  gaugeCtx.lineCap = 'round';
  gaugeCtx.shadowColor = color;
  gaugeCtx.shadowBlur = 15;
  gaugeCtx.stroke();
  gaugeCtx.shadowBlur = 0;

  // Tick marks
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    const ix = cx + (r - 6) * Math.cos(a), iy = cy + (r - 6) * Math.sin(a);
    const ox = cx + (r + 6) * Math.cos(a), oy = cy + (r + 6) * Math.sin(a);
    gaugeCtx.beginPath();
    gaugeCtx.moveTo(ix, iy);
    gaugeCtx.lineTo(ox, oy);
    gaugeCtx.strokeStyle = '#1c2b58';
    gaugeCtx.lineWidth = 1.5;
    gaugeCtx.stroke();
  }

  // Labels
  ['0', '50', '100'].forEach((label, li) => {
    const a = [Math.PI, Math.PI * 1.5, 0][li];
    const tx = cx + (r + 18) * Math.cos(a);
    const ty = cy + (r + 18) * Math.sin(a);
    gaugeCtx.fillStyle = '#2d4080';
    gaugeCtx.font = '9px "Share Tech Mono"';
    gaugeCtx.textAlign = 'center';
    gaugeCtx.fillText(label, tx, ty);
  });
}

function updateGauge() {
  const score = state.fusionScore;
  drawGauge(score);
  const pct = Math.round(score * 100);
  $('gauge-val').textContent = `${pct}%`;

  let label = 'SAFE';
  let color = 'var(--green)';
  if (score > 0.75) { label = 'CRITICAL'; color = 'var(--red)'; }
  else if (score > 0.5) { label = 'HIGH RISK'; color = 'var(--red)'; }
  else if (score > 0.25) { label = 'CAUTION'; color = 'var(--amber)'; }

  $('gauge-label').textContent = label;
  $('gauge-label').style.color = color;
}

setInterval(updateGauge, 500);
updateGauge();

// ─── Confidence Bars ──────────────────────────────
function updateConfBars() {
  state.camStates.forEach((cam, i) => {
    const fill = $(`conf-${i}`);
    const val = $(`confval-${i}`);
    if (!fill || !val) return;
    const pct = cam.conf;
    fill.style.width = `${pct}%`;
    val.textContent = `${pct}%`;
    if (pct > 60) fill.classList.add('threat');
    else fill.classList.remove('threat');
  });
}

// ─── Audio/Video Class UI ─────────────────────────
function updateAudioClasses() {
  const classes = ['ambient', 'talking', 'screaming', 'gunshot', 'explosion', 'glass'];
  const keys = Object.keys(state.audioClasses);
  classes.forEach((cls, i) => {
    const item = document.querySelector(`[data-class="${cls}"]`);
    if (!item) return;
    const bar = item.querySelector('.class-fill');
    const pct = item.querySelector('.class-pct');
    const val = state.audioClasses[keys[i]] || 0;
    bar.style.width = `${val}%`;
    pct.textContent = `${val}%`;
  });
}

function updateVideoClasses() {
  const map = {
    normal: 'vc-normal', running: 'vc-running',
    fighting: 'vc-fighting', loitering: 'vc-loitering', vandalism: 'vc-vandalism',
  };
  Object.entries(state.videoClasses).forEach(([key, val]) => {
    const el = $(map[key]);
    if (!el) return;
    el.style.width = `${val}%`;
    el.closest('.vc-item').querySelector('.vc-pct').textContent = `${val}%`;
  });
}

// ─── Threat Level ─────────────────────────────────
function setThreatLevel(level) {
  state.threatLevel = level;
  const ring = $('threat-ring');
  const text = $('threat-text');
  ring.className = `threat-ring ${level}`;

  const labels = { low: 'LOW', medium: 'MED', high: 'HIGH', critical: 'CRIT' };
  text.textContent = labels[level] || level.toUpperCase();

  const textColors = { low: 'var(--green)', medium: 'var(--amber)', high: 'var(--red)', critical: 'var(--red)' };
  text.style.color = textColors[level] || 'var(--text-primary)';

  document.querySelectorAll('.ts-item').forEach(el => el.classList.remove('active'));
  const active = document.querySelector(`.ts-item.${level}`);
  if (active) active.classList.add('active');
}

// ─── Alert Log ────────────────────────────────────
let alertIdCounter = 0;

function addAlert(msg, camId, confidence, severity = 'low') {
  state.alerts++;
  state.anomalyCount++;
  $('alert-count').textContent = state.alerts;
  $('anomaly-count').textContent = state.anomalyCount;

  const log = $('alert-log');
  const empty = log.querySelector('.log-empty');
  if (empty) empty.remove();

  const now = new Date().toTimeString().slice(0, 8);
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.id = `log-${alertIdCounter++}`;

  const confClass = confidence > 70 ? 'high' : confidence > 40 ? 'med' : 'low';

  entry.innerHTML = `
    <span class="log-time">${now}</span>
    <span class="log-msg">${msg} [${camId}]</span>
    <span class="log-conf ${confClass}">${confidence}%</span>
  `;

  log.insertBefore(entry, log.firstChild);

  // Keep max 20 entries
  const entries = log.querySelectorAll('.log-entry');
  if (entries.length > 20) entries[entries.length - 1].remove();
}

$('clear-alerts').addEventListener('click', () => {
  $('alert-log').innerHTML = '<div class="log-empty">No events detected</div>';
  state.alerts = 0;
  $('alert-count').textContent = '0';
});

// ─── Alert Modal ──────────────────────────────────
function showAlertModal(title, body, cam, conf) {
  const modal = $('alert-modal');
  $('modal-title').textContent = title;
  $('modal-body').textContent = body;
  $('modal-cam').textContent = cam;
  $('modal-conf').textContent = `${conf}%`;
  $('modal-time').textContent = new Date().toTimeString().slice(0, 8);
  modal.style.display = 'flex';
}

$('modal-close').addEventListener('click', () => {
  $('alert-modal').style.display = 'none';
});

// ─── Feed Badge Update ────────────────────────────
function setFeedBadge(idx, type, text) {
  const card = $(`feed-${idx}`);
  const badge = card.querySelector('.feed-badge');
  badge.className = `feed-badge ${type}`;
  badge.textContent = text.toUpperCase();
  if (type === 'danger') {
    card.classList.add('alert-state');
  } else {
    card.classList.remove('alert-state');
  }
}

// ─── Simulate Anomaly Event ───────────────────────
const ANOMALY_SCENARIOS = [
  {
    title: '⚠ FIGHTING DETECTED',
    body: 'Physical altercation identified. Multiple persons involved in aggressive interaction.',
    audioClass: 'screaming',
    videoClass: 'fighting',
    threat: 'high',
    badge: 'danger',
    badgeText: 'FIGHTING',
    audioConf: 78,
    videoConf: 82,
    fusion: 0.81,
  },
  {
    title: '⚠ GUNSHOT AUDIO DETECTED',
    body: 'High-confidence impulse sound matching gunshot signature detected.',
    audioClass: 'gunshot',
    videoClass: 'running',
    threat: 'critical',
    badge: 'danger',
    badgeText: 'GUNSHOT',
    audioConf: 91,
    videoConf: 60,
    fusion: 0.88,
  },
  {
    title: '⚠ LOITERING DETECTED',
    body: 'Stationary subject detected for extended period near restricted area.',
    audioClass: 'talking',
    videoClass: 'loitering',
    threat: 'medium',
    badge: 'warning',
    badgeText: 'LOITERING',
    audioConf: 42,
    videoConf: 67,
    fusion: 0.55,
  },
  {
    title: '⚠ GLASS BREAK DETECTED',
    body: 'Audio signature consistent with breaking glass. Possible forced entry.',
    audioClass: 'glass',
    videoClass: 'vandalism',
    threat: 'high',
    badge: 'danger',
    badgeText: 'BREAK-IN',
    audioConf: 85,
    videoConf: 72,
    fusion: 0.79,
  },
];

let lastAnomaly = -1;

$('simulate-btn').addEventListener('click', () => {
  let idx;
  do { idx = Math.floor(Math.random() * ANOMALY_SCENARIOS.length); }
  while (idx === lastAnomaly);
  lastAnomaly = idx;

  const s = ANOMALY_SCENARIOS[idx];
  const camIdx = Math.floor(Math.random() * 4);
  const camId = `CAM-0${camIdx + 1}`;

  // Update state
  state.fusionScore = s.fusion;
  state.camStates[camIdx].conf = s.audioConf;
  state.camStates[camIdx].badge = s.badge;

  // Anomaly audio classes
  Object.keys(state.audioClasses).forEach(k => {
    state.audioClasses[k] = k === s.audioClass ? s.audioConf : Math.floor(Math.random() * 10);
  });

  // Anomaly video classes
  Object.keys(state.videoClasses).forEach(k => {
    state.videoClasses[k] = k === s.videoClass ? s.videoConf : Math.floor(Math.random() * 15);
  });
  state.videoClasses.normal = 100 - s.videoConf;

  // UI updates
  setFeedBadge(camIdx, s.badge, s.badgeText);
  setThreatLevel(s.threat);
  updateConfBars();
  updateAudioClasses();
  updateVideoClasses();
  state.totalDetections++;
  $('total-detections').textContent = state.totalDetections;

  const fusion = Math.round(s.fusion * 100);
  addAlert(s.title.replace('⚠ ', ''), camId, fusion, s.threat);
  showAlertModal(s.title, s.body, camId, fusion);

  // Reset after 8 seconds
  setTimeout(() => {
    state.camStates[camIdx].conf = Math.floor(Math.random() * 15);
    state.camStates[camIdx].badge = 'normal';
    setFeedBadge(camIdx, 'normal', 'NORMAL');
    setThreatLevel('low');
    state.fusionScore = 0.12 + Math.random() * 0.1;
    state.audioClasses = { ambient: 80 + Math.random() * 15, talking: Math.random() * 15, screaming: 0, gunshot: 0, explosion: 0, glass: 0 };
    state.videoClasses = { normal: 75 + Math.random() * 15, running: Math.random() * 10, fighting: 0, loitering: Math.random() * 8, vandalism: 0 };
    updateAudioClasses();
    updateVideoClasses();
    updateConfBars();
  }, 8000);
});

// ─── Slow background drift ─────────────────────────
setInterval(() => {
  // Drift cam confidences slightly
  state.camStates.forEach((cam, i) => {
    if (cam.badge === 'normal') {
      cam.conf = Math.max(2, Math.min(20, cam.conf + (Math.random() - 0.5) * 4));
    }
  });
  // Drift fusion score
  if (state.threatLevel === 'low') {
    state.fusionScore = Math.max(0.05, Math.min(0.22, state.fusionScore + (Math.random() - 0.5) * 0.02));
  }

  // Drift audio classes slightly
  if (state.threatLevel === 'low') {
    state.audioClasses.ambient = Math.max(70, Math.min(95, state.audioClasses.ambient + (Math.random() - 0.5) * 4));
    state.audioClasses.talking = Math.max(0, Math.min(25, state.audioClasses.talking + (Math.random() - 0.5) * 3));
  }

  updateConfBars();
  updateAudioClasses();
  updateVideoClasses();
  state.totalDetections++;
  $('total-detections').textContent = state.totalDetections;
}, 2000);

// ─── Microphone Input ─────────────────────────────
$('mic-btn').addEventListener('click', async () => {
  if (state.micActive) {
    // Stop mic
    if (state.micStream) {
      state.micStream.getTracks().forEach(t => t.stop());
    }
    if (state.audioContext) {
      state.audioContext.close();
    }
    state.micActive = false;
    state.audioContext = null;
    state.analyser = null;
    $('mic-btn').textContent = '🎤 START MIC INPUT';
    $('mic-btn').classList.remove('active');
    $('audio-status-label').textContent = 'MONITORING';
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.micStream = stream;
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 512;

    const source = state.audioContext.createMediaStreamSource(stream);
    source.connect(state.analyser);

    state.micActive = true;
    $('mic-btn').textContent = '⏹ STOP MIC INPUT';
    $('mic-btn').classList.add('active');
    $('audio-status-label').textContent = 'MIC ACTIVE';

    const bufferLen = state.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLen);
    const freqArray = new Uint8Array(bufferLen);

    function micLoop() {
      if (!state.micActive) return;
      state.analyser.getByteTimeDomainData(dataArray);
      state.analyser.getByteFrequencyData(freqArray);
      drawWaveform(dataArray);
      drawSpectrogram(Array.from(freqArray.slice(0, 32)));

      // Level for meter
      const rms = Math.sqrt(dataArray.reduce((s, v) => s + ((v - 128) / 128) ** 2, 0) / dataArray.length);
      updateMeterBars(Math.min(100, rms * 300));

      requestAnimationFrame(micLoop);
    }
    micLoop();
  } catch (e) {
    alert('Microphone access denied or unavailable.\nPlease allow microphone access in your browser.');
  }
});

// ─── File Uploads ─────────────────────────────────
$('video-upload').addEventListener('change', function () {
  if (this.files[0]) {
    state.uploadedVideo = this.files[0];
    updateUploadStatus();
    const url = URL.createObjectURL(this.files[0]);
    $('video-preview').src = url;
    $('preview-area').style.display = 'flex';
  }
});

$('audio-upload').addEventListener('change', function () {
  if (this.files[0]) {
    state.uploadedAudio = this.files[0];
    updateUploadStatus();
    const url = URL.createObjectURL(this.files[0]);
    $('audio-preview').src = url;
    $('preview-area').style.display = 'flex';
  }
});

function updateUploadStatus() {
  const parts = [];
  if (state.uploadedVideo) parts.push(`Video: ${state.uploadedVideo.name}`);
  if (state.uploadedAudio) parts.push(`Audio: ${state.uploadedAudio.name}`);
  $('upload-status').textContent = parts.join(' | ') || 'No files selected';

  const btn = $('analyze-btn');
  if (state.uploadedVideo || state.uploadedAudio) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'all';
  }
}

// ─── Analyze Button ───────────────────────────────
$('analyze-btn').addEventListener('click', () => {
  // Show analyzing overlay
  const overlay = document.createElement('div');
  overlay.className = 'analyzing-overlay';
  overlay.innerHTML = `
    <div class="analyzing-spinner"></div>
    <div class="analyzing-text">ANALYZING...</div>
    <div class="analyzing-sub" id="analyze-sub-text">Extracting audio features...</div>
  `;
  document.body.appendChild(overlay);

  const steps = [
    'Extracting audio features...',
    'Processing video frames...',
    'Running AudioCNN encoder...',
    'Running VideoCNN encoder...',
    'Computing cross-modal fusion...',
    'Evaluating threat signature...',
    'Generating report...',
  ];

  let step = 0;
  const interval = setInterval(() => {
    step++;
    if (step < steps.length) {
      overlay.querySelector('#analyze-sub-text').textContent = steps[step];
    } else {
      clearInterval(interval);
      document.body.removeChild(overlay);
      runUploadAnalysis();
    }
  }, 500);
});

function runUploadAnalysis() {
  // Simulate analysis result based on uploaded files
  const hasVideo = !!state.uploadedVideo;
  const hasAudio = !!state.uploadedAudio;
  const fakeFusion = 0.3 + Math.random() * 0.5;
  state.fusionScore = fakeFusion;

  const conf = Math.round(fakeFusion * 100);
  let threat = 'low', title = '✅ NO ANOMALY DETECTED', body = 'Analysis complete. No suspicious activity identified in uploaded media.';

  if (fakeFusion > 0.75) {
    threat = 'critical';
    title = '🔴 CRITICAL ANOMALY DETECTED';
    body = 'High-confidence anomaly found in uploaded media. Multimodal fusion confirms suspicious activity.';
    setThreatLevel('critical');
    addAlert('Critical anomaly in uploaded media', 'UPLOAD', conf, 'critical');
  } else if (fakeFusion > 0.55) {
    threat = 'high';
    title = '⚠ SUSPICIOUS ACTIVITY FOUND';
    body = 'Medium-high confidence anomaly pattern detected. Further review recommended.';
    setThreatLevel('high');
    addAlert('Anomaly in uploaded media', 'UPLOAD', conf, 'high');
  } else if (fakeFusion > 0.35) {
    threat = 'medium';
    title = '⚡ MINOR ANOMALY';
    body = 'Low-level anomaly signature detected. Likely non-threatening. System logged for review.';
    setThreatLevel('medium');
    addAlert('Minor anomaly in uploaded media', 'UPLOAD', conf, 'medium');
  } else {
    setThreatLevel('low');
  }

  // Update audio/video classes with fake results
  state.audioClasses = {
    ambient: Math.floor(90 - fakeFusion * 70),
    talking: Math.floor(5 + fakeFusion * 20),
    screaming: Math.floor(fakeFusion * 30),
    gunshot: Math.floor(fakeFusion > 0.7 ? fakeFusion * 40 : 0),
    explosion: 0,
    glass: Math.floor(fakeFusion > 0.6 ? fakeFusion * 20 : 0),
  };
  state.videoClasses = {
    normal: Math.floor(90 - fakeFusion * 70),
    running: Math.floor(5 + fakeFusion * 20),
    fighting: Math.floor(fakeFusion > 0.65 ? fakeFusion * 50 : 0),
    loitering: Math.floor(fakeFusion * 15),
    vandalism: Math.floor(fakeFusion > 0.75 ? fakeFusion * 30 : 0),
  };

  updateAudioClasses();
  updateVideoClasses();
  updateGauge();
  state.totalDetections++;
  $('total-detections').textContent = state.totalDetections;

  showAlertModal(title, body, 'UPLOAD', conf);
}

// ─── View Toggle (Grid / Single) ──────────────────
document.querySelectorAll('.ctrl-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.ctrl-btn[data-view]').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const vg = $('video-grid');
    if (this.dataset.view === 'single') {
      vg.style.gridTemplateColumns = '1fr';
    } else {
      vg.style.gridTemplateColumns = '1fr 1fr';
    }
  });
});

// ─── Feed Card Click → Focus ──────────────────────
document.querySelectorAll('.feed-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.feed-card').forEach(c => c.style.outline = 'none');
    card.style.outline = '2px solid var(--cyan)';
  });
});

// ─── Init ─────────────────────────────────────────
updateAudioClasses();
updateVideoClasses();
updateConfBars();
setThreatLevel('low');
$('total-detections').textContent = '0';
$('anomaly-count').textContent = '0';
console.log('%c SENTINEL AI INITIALIZED ', 'background:#00e5ff;color:#080c10;font-family:monospace;font-size:14px;padding:4px');

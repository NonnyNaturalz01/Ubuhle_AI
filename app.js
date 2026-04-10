/* UBUHLE — app.js */

// ── STATE ──
const API_KEY_STORAGE = 'ubuhle_anthropic_key';
let currentImage = null;
let lastResult = null;
let lastProductName = '';

// ── LOGIN ──
function handleLogin() {
  const first = document.getElementById('firstName').value.trim();
  const last = document.getElementById('lastName').value.trim();
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassword').value.trim();

  if (!first || !last || !email || !pass) {
    showToast('Please fill in all fields ✦');
    return;
  }

  localStorage.setItem('ubuhle_user', JSON.stringify({ first, last, email }));
  initApp();
}

function initApp() {
  const user = JSON.parse(localStorage.getItem('ubuhle_user') || '{}');
  if (!user.first) { showScreen('loginScreen'); return; }

  document.getElementById('heroName').textContent = user.first;
  document.getElementById('userAvatar').textContent = user.first[0].toUpperCase();

  const apiKey = localStorage.getItem(API_KEY_STORAGE);
  if (apiKey) document.getElementById('apiBanner').style.display = 'none';

  showScreen('appShell');
}

function handleLogout() {
  localStorage.removeItem('ubuhle_user');
  showScreen('loginScreen');
  showPage('homePage');
  setNav('home');
}

// ── SCREENS & PAGES ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showPage(id) {
  document.querySelectorAll('.inner-page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'licensesPage') renderLicenses();
}

function setNav(active) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('nav-' + active).classList.add('active');
}

// ── API KEY ──
function openApiModal() {
  const saved = localStorage.getItem(API_KEY_STORAGE) || '';
  document.getElementById('apiKeyInput').value = saved;
  document.getElementById('apiModal').classList.add('show');
}

function closeApiModal() {
  document.getElementById('apiModal').classList.remove('show');
}

function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) { showToast('Please enter a valid API key'); return; }
  localStorage.setItem(API_KEY_STORAGE, key);
  document.getElementById('apiBanner').style.display = 'none';
  closeApiModal();
  showToast('API key saved! ✦');
}

// ── SCAN ──
function previewImage(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    currentImage = ev.target.result;
    const preview = document.getElementById('imagePreview');
    preview.src = currentImage;
    preview.style.display = 'block';
    document.querySelector('.scan-area h3').textContent = 'Image Ready ✓';
    document.querySelector('.scan-area p').textContent = 'Tap to change image';
    document.querySelector('.scan-icon').textContent = '✅';
  };
  reader.readAsDataURL(file);
}

async function analyseProduct() {
  const desc = document.getElementById('productDesc').value.trim();
  const apiKey = localStorage.getItem(API_KEY_STORAGE);

  if (!currentImage) { showToast('Please upload a product photo first'); return; }
  if (!desc) { showToast('Please describe the product'); return; }
  if (!apiKey) { openApiModal(); return; }

  lastProductName = desc;
  document.getElementById('loadingCard').style.display = 'block';
  document.getElementById('resultCard').style.display = 'none';
  document.getElementById('analyseBtn').disabled = true;

  try {
    const base64Data = currentImage.split(',')[1];
    const mediaType  = currentImage.split(';')[0].split(':')[1];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: `You are an expert authenticator of Southern African cultural goods. Analyse this product image: "${desc}". Check for authentic materials like real cowhide, genuine beadwork, hand-stitching, natural dyes vs synthetic fakes. Respond ONLY with this exact JSON (no markdown):
{
  "verdict": "AUTHENTIC" or "NOT AUTHENTIC",
  "confidence": 85,
  "explanation": "3-5 sentence explanation of your findings",
  "indicators": ["indicator 1", "indicator 2", "indicator 3"],
  "recommendation": "recommendation for the buyer"
}` }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'API error');
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';
    let clean = raw.trim();
    clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response: ' + raw.substring(0, 200));
    const result = JSON.parse(jsonMatch[0]);
    lastResult = { ...result, product: desc, timestamp: Date.now() };

    displayResult(result);
    saveToHistory(result, desc);

  } catch (err) {
    const msg = err.message || 'Analysis failed';
    showToast('❌ ' + msg);
    console.error('Ubuhle scan error:', err);
    // Show full error in result area for debugging
    document.getElementById('loadingCard').innerHTML = `<p style="color:var(--terra);font-size:13px;padding:10px;"><strong>Error:</strong> ${msg}<br><br>Check the browser Console (F12) for details.</p>`;
    document.getElementById('loadingCard').style.display = 'block';
  } finally {
    document.getElementById('loadingCard').style.display = 'none';
    document.getElementById('analyseBtn').disabled = false;
  }
}

function displayResult(result) {
  const isAuth = result.verdict === 'AUTHENTIC';
  const card = document.getElementById('resultCard');
  const header = document.getElementById('resultHeader');
  const badge = document.getElementById('verdictBadge');
  const confidence = document.getElementById('confidenceText');
  const explanation = document.getElementById('resultExplanation');
  const indicators = document.getElementById('indicatorsList');
  const recommendation = document.getElementById('resultRecommendation');
  const licenseBtn = document.getElementById('generateLicenseBtn');

  header.className = 'result-header ' + (isAuth ? 'authentic' : 'fake');
  badge.className = 'verdict-badge ' + (isAuth ? 'authentic' : 'fake');
  badge.textContent = result.verdict;
  confidence.textContent = result.confidence + '% confidence';
  explanation.textContent = result.explanation;
  recommendation.textContent = result.recommendation;

  indicators.innerHTML = '';
  (result.indicators || []).forEach(ind => {
    const tag = document.createElement('div');
    tag.className = 'indicator-tag';
    tag.textContent = ind;
    indicators.appendChild(tag);
  });

  licenseBtn.style.display = isAuth ? 'block' : 'none';
  card.style.display = 'block';
}

function saveToHistory(result, product) {
  const history = JSON.parse(localStorage.getItem('ubuhle_history') || '[]');
  history.unshift({
    id: Date.now(),
    product,
    verdict: result.verdict,
    confidence: result.confidence,
    timestamp: Date.now()
  });
  localStorage.setItem('ubuhle_history', JSON.stringify(history));
}

// ── LICENSES ──
function generateLicense() {
  if (!lastResult) return;
  const licenses = JSON.parse(localStorage.getItem('ubuhle_licenses') || '[]');
  const license = {
    id: 'UBH-' + Date.now().toString().slice(-8),
    product: lastResult.product || lastProductName,
    confidence: lastResult.confidence,
    timestamp: Date.now()
  };
  licenses.unshift(license);
  localStorage.setItem('ubuhle_licenses', JSON.stringify(licenses));
  showToast('License generated! ✦');
  document.getElementById('generateLicenseBtn').style.display = 'none';
}

function renderLicenses() {
  const licenses = JSON.parse(localStorage.getItem('ubuhle_licenses') || '[]');
  const container = document.getElementById('licensesList');

  if (licenses.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>📜</p>
        <h3>No Licenses Yet</h3>
        <span>Scan an authentic product and generate your first certificate</span>
      </div>`;
    return;
  }

  container.innerHTML = licenses.map(lic => `
    <div class="certificate-card">
      <div class="cert-header">
        <div class="cert-title">Certificate of Authenticity</div>
        <div class="cert-logo">Ubuhle</div>
      </div>
      <div class="cert-body">
        <div class="cert-product">${lic.product}</div>
        <div class="cert-meta">
          <div class="cert-meta-item">
            <label>License No.</label>
            <span>${lic.id}</span>
          </div>
          <div class="cert-meta-item">
            <label>Confidence</label>
            <span>${lic.confidence}%</span>
          </div>
          <div class="cert-meta-item">
            <label>Date Issued</label>
            <span>${new Date(lic.timestamp).toLocaleDateString('en-ZA', {day:'2-digit',month:'short',year:'numeric'})}</span>
          </div>
          <div class="cert-meta-item">
            <label>Status</label>
            <span style="color:var(--green)">✓ Verified</span>
          </div>
        </div>
      </div>
      <div class="cert-footer">
        <div class="cert-badge">✦ Ubuhle Verified Authentic</div>
        <button class="btn-share" onclick="shareLicense('${lic.id}', '${lic.product.replace(/'/g,"\\'")}', '${lic.confidence}', '${new Date(lic.timestamp).toLocaleDateString()}')">Share ↗</button>
      </div>
    </div>
  `).join('');
}

function shareLicense(id, product, confidence, date) {
  const text = `✦ UBUHLE Certificate of Authenticity ✦\nProduct: ${product}\nLicense: ${id}\nConfidence: ${confidence}%\nIssued: ${date}\n\nVerified by Ubuhle — From her hands to your heart`;
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard! ↗'));
}

// ── STATS ──
function renderStats() {
  const history = JSON.parse(localStorage.getItem('ubuhle_history') || '[]');
  const total = history.length;
  const authentic = history.filter(h => h.verdict === 'AUTHENTIC').length;
  const fake = total - authentic;
  const rate = total > 0 ? Math.round((authentic / total) * 100) : 0;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statAuth').textContent = authentic;
  document.getElementById('statFake').textContent = fake;
  document.getElementById('statRate').textContent = rate + '%';

  drawChart(authentic, fake);
  renderHistory(history);
}

function drawChart(authentic, fake) {
  const canvas = document.getElementById('statsChart');
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth;
  canvas.width = W;
  canvas.height = 160;

  ctx.clearRect(0, 0, W, 160);

  const barW = Math.min(80, (W - 80) / 2);
  const maxVal = Math.max(authentic, fake, 1);
  const maxH = 110;
  const authH = (authentic / maxVal) * maxH;
  const fakeH = (fake / maxVal) * maxH;
  const baseY = 130;
  const gap = W / 3;

  // Authentic bar
  const authX = gap - barW / 2;
  ctx.fillStyle = '#2D7A4F';
  ctx.beginPath();
  ctx.roundRect(authX, baseY - authH, barW, authH, [6, 6, 0, 0]);
  ctx.fill();

  // Not Authentic bar
  const fakeX = gap * 2 - barW / 2;
  ctx.fillStyle = '#C1440E';
  ctx.beginPath();
  ctx.roundRect(fakeX, baseY - fakeH, barW, fakeH, [6, 6, 0, 0]);
  ctx.fill();

  // Labels
  ctx.fillStyle = '#5C3317';
  ctx.font = '600 12px Nunito, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Authentic', authX + barW / 2, baseY + 16);
  ctx.fillText('Not Authentic', fakeX + barW / 2, baseY + 16);

  // Values
  ctx.font = '700 16px Nunito, sans-serif';
  ctx.fillStyle = '#2D7A4F';
  ctx.fillText(authentic, authX + barW / 2, baseY - authH - 8);
  ctx.fillStyle = '#C1440E';
  ctx.fillText(fake, fakeX + barW / 2, baseY - fakeH - 8);
}

function renderHistory(history) {
  const container = document.getElementById('historyList');
  if (history.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-soft);font-size:14px;">No scans yet — start by scanning a product</div>';
    return;
  }

  container.innerHTML = history.map(h => `
    <div class="history-item">
      <div class="history-icon">${h.verdict === 'AUTHENTIC' ? '✅' : '❌'}</div>
      <div class="history-text">
        <strong>${h.product}</strong>
        <span>${new Date(h.timestamp).toLocaleDateString('en-ZA', {day:'2-digit',month:'short',year:'numeric'})} · ${h.confidence}% confidence</span>
      </div>
      <div class="history-badge ${h.verdict === 'AUTHENTIC' ? 'authentic' : 'fake'}">${h.verdict === 'AUTHENTIC' ? 'Authentic' : 'Fake'}</div>
    </div>
  `).join('');
}

function clearHistory() {
  if (!confirm('Clear all scan history? This cannot be undone.')) return;
  localStorage.removeItem('ubuhle_history');
  renderStats();
  showToast('History cleared');
}

// ── TOAST ──
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

// ── INIT ──
window.addEventListener('load', () => {
  const user = localStorage.getItem('ubuhle_user');
  if (user) initApp();
});

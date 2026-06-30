'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';
const PORT = parseInt(process.env.PORT || '3001', 10);
// Mount a Railway volume at /data to persist session across restarts
const SESSION_PATH = process.env.SESSION_DATA_PATH || '/data/.wwebjs_auth';

console.log('🚀 Waheed WhatsApp Service starting...');
console.log(`📡 Python backend: ${PYTHON_API_URL}`);
console.log(`💾 Session path:   ${SESSION_PATH}`);

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_PATH }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  },
});

client.on('qr', (qr) => {
  console.log('\n📱 ======= SCAN THIS QR CODE IN WHATSAPP =======');
  qrcode.generate(qr, { small: true });
  console.log('================================================\n');
});

client.on('loading_screen', (percent, message) => {
  console.log(`⏳ Loading WhatsApp: ${percent}% — ${message}`);
});

client.on('authenticated', () => {
  console.log('🔐 WhatsApp session authenticated — session saved to disk.');
});

client.on('auth_failure', (msg) => {
  console.error('❌ WhatsApp auth failure:', msg);
  process.exit(1);
});

client.on('ready', () => {
  const info = client.info;
  console.log(`✅ WhatsApp connected! Logged in as: ${info?.pushname} (${info?.wid?.user})`);
});

client.on('disconnected', (reason) => {
  console.warn(`⚠️  WhatsApp disconnected: ${reason}. Reconnecting in 5s...`);
  setTimeout(() => client.initialize(), 5000);
});

client.on('message', async (msg) => {
  // Ignore group messages and broadcast status updates
  if (msg.isGroupMsg || msg.from === 'status@broadcast') return;

  const from = msg.from;
  const body = (msg.body || '').trim();
  if (!body) return;

  console.log(`📩 [${new Date().toISOString()}] ${from}: ${body}`);

  try {
    const res = await fetch(`${PYTHON_API_URL}/internal/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: body, from }),
    });

    if (!res.ok) {
      console.error(`❌ Python API returned ${res.status}`);
      return;
    }

    const data = await res.json();
    if (data.reply) {
      await msg.reply(data.reply);
      console.log(`📤 Replied to ${from}: ${data.reply.substring(0, 80)}`);
    }
  } catch (err) {
    console.error(`❌ Error forwarding message to Python API: ${err.message}`);
  }
});

client.initialize();

// ── HTTP server ────────────────────────────────────────────────────────────────
// The Python backend POSTs here when it needs to send a proactive message
// (e.g. fraud alerts to the restaurant owner).

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, connected: client.info != null });
});

app.post('/send', async (req, res) => {
  const { to, message } = req.body ?? {};
  if (!to || !message) {
    return res.status(400).json({ error: 'Missing "to" or "message"' });
  }

  try {
    // Accept international format (+9641XXXXXXXX) or raw digits
    const chatId = to.replace(/\D/g, '') + '@c.us';
    await client.sendMessage(chatId, message);
    console.log(`📤 Proactive message sent to ${chatId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(`❌ Failed to send to ${to}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🌐 WhatsApp HTTP API listening on port ${PORT}`);
});

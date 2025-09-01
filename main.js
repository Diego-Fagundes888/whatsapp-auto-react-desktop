// main.js — versão corrigida e robusta para reações instantâneas
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');

const QRLibName = 'qrcode';
let QRLib = null;
try { QRLib = require(QRLibName); } catch (e) { /* optional */ }

const MAX_REACTIONS_PER_MINUTE = 150;
const REACTION_WINDOW_MS = 60_000; // 1 minuto
const AUDIO_EMOJI = '😂';
const DEFAULT_EMOJI = '😂';

let mainWindow = null;
let whatsappClient = null;
let isClientInitializing = false;

const stats = {
  startedAt: null,
  messagesReceived: 0,
  reactionsSent: 0,
  lastError: null,
  processedGroupsCount: 0,
  totalReactionTime: 0,
  averageReactionTime: 0
};

let reactionTimestamps = [];

const INIT_RETRIES = 2;
const INIT_RETRY_DELAY_MS = 2000;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function sendToUI(channel, payload = {}) {
  if (mainWindow && mainWindow.webContents) mainWindow.webContents.send(channel, payload);
  else console.log(`[UI SEND] ${channel}`, payload);
}

function canSendReaction() {
  const now = Date.now();
  reactionTimestamps = reactionTimestamps.filter(ts => now - ts < REACTION_WINDOW_MS);
  return reactionTimestamps.length < MAX_REACTIONS_PER_MINUTE;
}

// Função otimizada para reagir INSTANTANEAMENTE
async function tryReactViaApis(msg, emoji) {
  if (!msg || !emoji) throw new Error('invalid-params-for-react');

  // Tenta o método mais rápido primeiro, sem fallbacks sequenciais blockantes
  if (typeof msg.react === 'function') {
    return msg.react(emoji);
  }

  if (whatsappClient && typeof whatsappClient.sendReaction === 'function') {
    // sendReaction espera chatId e messageId (algumas versões)
    try {
      return whatsappClient.sendReaction(msg.from, msg.id && msg.id._serialized ? msg.id._serialized : msg.id, emoji);
    } catch (e) {
      // se falhar, caí no fallback abaixo
    }
  }

  // Fallback rápido: enviar emoji como reply (garante algum comportamento)
  if (whatsappClient && typeof whatsappClient.sendMessage === 'function') {
    return whatsappClient.sendMessage(msg.from, emoji, { quotedMessageId: msg.id && msg.id._serialized ? msg.id._serialized : msg.id });
  }

  throw new Error('no-reaction-api-available');
}

async function sendReaction(msg, emoji = DEFAULT_EMOJI) {
  if (!canSendReaction()) {
    sendToUI('rate-limit-reached', { limit: MAX_REACTIONS_PER_MINUTE });
    return false;
  }

  const tsStart = Date.now();

  // Reage IMEDIATAMENTE sem bloquear a thread principal
  const reactionPromise = tryReactViaApis(msg, emoji);

  // Registra timestamp imediatamente
  reactionTimestamps.push(Date.now());

  // Atualiza stats em paralelo (não bloqueia a reação)
  reactionPromise.then(() => {
    const reactionTime = Date.now() - tsStart;
    stats.reactionsSent++;
    stats.totalReactionTime += reactionTime;
    stats.averageReactionTime = stats.totalReactionTime / stats.reactionsSent;

    setImmediate(() => {
      sendToUI('reaction-sent', {
        groupId: msg.from,
        groupName: msg.from,
        timestamp: new Date().toISOString(),
        reactionTime: `${reactionTime}ms`,
        messageType: msg.mimetype || msg.type || 'unknown'
      });
    });
  }).catch(err => {
    stats.lastError = String(err);
    sendToUI('reaction-error', { error: String(err), groupId: msg.from });
  });

  return true;
}

// Detecção RÁPIDA de áudio - menos verificações
function isAudioMessage(msg) {
  if (!msg) return false;

  if (msg.mimetype && msg.mimetype.includes('audio')) return true;
  if (msg.type === 'ptt' || msg.type === 'voice' || msg.type === 'audio') return true;
  if (msg.hasMedia && typeof msg.duration === 'number' && msg.duration > 0) return true;

  return false;
}

// Handler otimizado para áudio
async function handleAudioMessage(msg) {
  return sendReaction(msg, AUDIO_EMOJI);
}

// Handler principal ULTRA RÁPIDO
async function handleIncomingMessage(msg) {
  stats.messagesReceived++;

  if (!msg) return;
  try {
    if (msg.fromMe || msg.isNotification) return;
    if (!msg.from || !msg.from.includes('@g.us')) return;

    if (isAudioMessage(msg)) {
      // Não await para máxima velocidade
      handleAudioMessage(msg);
    } else if (msg.body && msg.body.trim()) {
      sendReaction(msg, DEFAULT_EMOJI);
    }

    setImmediate(() => {
      sendToUI('message-received', {
        from: msg.from,
        body: msg.body,
        mimetype: msg.mimetype,
        hasMedia: !!msg.hasMedia,
        id: msg.id ? (msg.id._serialized || msg.id) : null,
        type: msg.type || null
      });
    });
  } catch (e) {
    stats.lastError = String(e);
    sendToUI('message-handler-error', { error: String(e) });
  }
}

async function loadChatsUntilStable(timeoutMs = 25_000, stableChecks = 2, intervalMs = 1_000) {
  const start = Date.now();
  let lastCount = -1;
  let sameCount = 0;
  while (Date.now() - start < timeoutMs) {
    try {
      const chats = await whatsappClient.getChats();
      const groups = (chats || []).filter(c => c.isGroup);
      stats.processedGroupsCount = groups.length;
      sendToUI('groups-loaded-partial', { count: groups.length });
      if (groups.length === lastCount) {
        sameCount++;
        if (sameCount >= stableChecks) {
          sendToUI('groups-loaded', { count: groups.length });
          return groups.length;
        }
      } else {
        lastCount = groups.length;
        sameCount = 0;
      }
    } catch (e) {
      // ignore and retry
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  try {
    const chats = await whatsappClient.getChats();
    const groups = (chats || []).filter(c => c.isGroup);
    stats.processedGroupsCount = groups.length;
    sendToUI('groups-loaded', { count: groups.length, note: 'timeout' });
    return groups.length;
  } catch (e) {
    sendToUI('groups-loaded', { count: 0, note: 'error' });
    return 0;
  }
}

function findChromeExecutable() {
  const platform = process.platform;
  const candidates = [];

  if (platform === 'win32') {
    if (process.env.PROGRAMFILES) candidates.push(path.join(process.env.PROGRAMFILES, 'Google\\Chrome\\Application\\chrome.exe'));
    if (process.env['PROGRAMFILES(X86)']) candidates.push(path.join(process.env['PROGRAMFILES(X86)'], 'Google\\Chrome\\Application\\chrome.exe'));
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'));
  } else if (platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    candidates.push('/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium');
  }

  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) return c;
    } catch (e) {}
  }

  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  return null;
}

async function startWhatsAppClient(retryCount = 0) {
  if (whatsappClient && whatsappClient.info) return;
  if (isClientInitializing) return;
  isClientInitializing = true;
  stats.startedAt = new Date();
  sendToUI('loading-progress', { message: 'Inicializando cliente', percent: 5 });

  try {
    // Session dir dentro de app.getPath('userData') — mais seguro p/ empacotamento
    const sessionDir = path.join(app.getPath('userData'), 'wwebjs_auth');
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    // configura puppeteer options mais estáveis (remove flags problemáticas)
    const chromePath = findChromeExecutable();
    const puppeteerOpt = {
      headless: process.env.HEADLESS === 'true' ? true : false,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1200,900'
      ]
    };
    if (chromePath) puppeteerOpt.executablePath = chromePath;

    // cria client com LocalAuth apontando para sessionDir
    whatsappClient = new Client({
      authStrategy: new LocalAuth({ clientId: 'auto-react-bot', dataPath: sessionDir }),
      puppeteer: puppeteerOpt,
      takeoverOnConflict: true
    });

    whatsappClient.on('qr', async (qr) => {
      try {
        if (QRLib && typeof QRLib.toDataURL === 'function') {
          // qrcode.toDataURL suporta callback ou promise; usamos callback-like via callback omission
          QRLib.toDataURL(qr, { width: 300 }, (err, url) => {
            if (!err && url) {
              sendToUI('qr-code', url);
              sendToUI('loading-progress', { message: 'QR convertido', percent: 30 });
            } else {
              // fallback texto
              sendToUI('qr-code', qr);
              sendToUI('loading-progress', { message: 'QR recebido (texto)', percent: 30 });
            }
          });
          return;
        }
        sendToUI('qr-code', qr);
        sendToUI('loading-progress', { message: 'QR recebido (texto)', percent: 30 });
      } catch (e) {
        sendToUI('qr-error', { error: String(e) });
      }
    });

    whatsappClient.on('authenticated', () => sendToUI('bot-authenticated', { ok: true }));
    whatsappClient.on('auth_failure', (msg) => { stats.lastError = String(msg); sendToUI('auth-failure', { message: String(msg) }); });
    whatsappClient.on('ready', async () => {
      sendToUI('bot-ready', { message: 'Cliente pronto' });
      sendToUI('loading-progress', { message: 'Cliente pronto', percent: 100 });
      await loadChatsUntilStable(30_000, 2, 1_000);
    });

    whatsappClient.on('message', (msg) => {
      handleIncomingMessage(msg);
    });

    whatsappClient.on('disconnected', (reason) => {
      stats.lastError = String(reason);
      sendToUI('bot-disconnected', { reason: String(reason) });
    });

    whatsappClient.on('error', (err) => {
      stats.lastError = String(err);
      sendToUI('client-error', { error: String(err) });
    });

    await whatsappClient.initialize();
  } catch (err) {
    // Tratamento de erros comuns (Session closed / Protocol error)
    stats.lastError = String(err);
    sendToUI('start-failed', { error: String(err) });

    // tenta retry quando for erro de sessão/protocol
    const msgText = String(err && err.message ? err.message : err);
    if (retryCount < INIT_RETRIES && /Session closed|Protocol error/i.test(msgText)) {
      try { if (whatsappClient) await whatsappClient.destroy(); } catch (e) { /* ignore */ }
      whatsappClient = null;
      await new Promise(r => setTimeout(r, INIT_RETRY_DELAY_MS));
      return startWhatsAppClient(retryCount + 1);
    }

    try { if (whatsappClient) await whatsappClient.destroy(); } catch (e) { /* ignore */ }
    whatsappClient = null;
  } finally {
    isClientInitializing = false;
  }
}

async function stopWhatsAppClient() {
  try {
    if (!whatsappClient) return;
    await whatsappClient.destroy();
    whatsappClient = null;
    sendToUI('bot-stopped', { ok: true });
  } catch (e) {
    stats.lastError = String(e);
    sendToUI('stop-error', { error: String(e) });
  }
}

/* IPC */
app.on('ready', () => {
  createWindow();

  ipcMain.handle('start-bot', async () => {
    try { await startWhatsAppClient(); return { success: true }; }
    catch (e) { return { success: false, error: String(e) }; }
  });

  ipcMain.handle('stop-bot', async () => {
    try { await stopWhatsAppClient(); return { success: true }; }
    catch (e) { return { success: false, error: String(e) }; }
  });

  ipcMain.handle('get-stats', async () => {
    return {
      initialized: !!whatsappClient,
      initializing: isClientInitializing,
      uptime_seconds: stats.startedAt ? Math.floor((Date.now() - stats.startedAt.getTime()) / 1000) : 0,
      messagesReceived: stats.messagesReceived || 0,
      reactionsSent: stats.reactionsSent || 0,
      averageReactionTime: stats.averageReactionTime || 0,
      processedGroupsCount: stats.processedGroupsCount || 0,
      lastError: stats.lastError || null,
      reactionsInWindow: reactionTimestamps.length,
      maxReactionsPerMinute: MAX_REACTIONS_PER_MINUTE,
      info: whatsappClient ? whatsappClient.info : null
    };
  });
});

/* lifecycle */
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', async () => { if (whatsappClient) try { await whatsappClient.destroy(); } catch (e) {} });

// captura erros não tratados e envia para UI
process.on('uncaughtException', (err) => {
  stats.lastError = String(err);
  sendToUI('critical-error', { message: 'uncaughtException', stack: String(err) });
  console.error('uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
  stats.lastError = String(reason);
  sendToUI('critical-error', { message: 'unhandledRejection', stack: String(reason) });
  console.error('unhandledRejection', reason);
});

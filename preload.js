// preload.js (substitua pelo conteúdo abaixo)
const { contextBridge, ipcRenderer } = require('electron');

// tenta carregar a lib 'qrcode' do node; se não existir, fallback será apenas enviar o texto
let QRLib = null;
try {
  QRLib = require('qrcode');
} catch (e) {
  console.warn('Biblioteca qrcode não está disponível em preload. QR será enviado como texto.', e && e.message);
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Controle do bot
  startBot: () => ipcRenderer.invoke('start-bot'),
  stopBot: () => ipcRenderer.invoke('stop-bot'),
  getStats: () => ipcRenderer.invoke('get-stats'),

  // Eventos com pré-processamento do QR (converte texto -> data:image se possível)
  onQrCode: (callback) => {
    ipcRenderer.on('qr-code', async (event, qrData) => {
      try {
        // se já for um data URL, repassa
        if (typeof qrData === 'string' && qrData.startsWith('data:image/')) {
          callback(event, qrData);
          return;
        }

        // se for string e temos a lib qrcode, converte para dataURL
        if (typeof qrData === 'string' && QRLib && typeof QRLib.toDataURL === 'function') {
          try {
            const dataUrl = await QRLib.toDataURL(qrData);
            callback(event, dataUrl);
            return;
          } catch (convErr) {
            console.warn('Falha convertendo QR para dataURL (preload), enviando texto como fallback:', convErr && convErr.message);
            callback(event, qrData);
            return;
          }
        }

        // fallback genérico: repassa o que chegou
        callback(event, qrData);
      } catch (err) {
        console.error('Erro no handler onQrCode (preload):', err && err.message);
        callback(event, qrData);
      }
    });
  },

  onQrError: (callback) => ipcRenderer.on('qr-error', callback),
  onLoadingProgress: (callback) => ipcRenderer.on('loading-progress', callback),
  onBotReady: (callback) => ipcRenderer.on('bot-ready', callback),
  onBotAuthenticated: (callback) => ipcRenderer.on('bot-authenticated', callback),
  onAuthFailure: (callback) => ipcRenderer.on('auth-failure', callback),
  onBotDisconnected: (callback) => ipcRenderer.on('bot-disconnected', callback),
  onReactionSent: (callback) => ipcRenderer.on('reaction-sent', callback),
  onReactionError: (callback) => ipcRenderer.on('reaction-error', callback),
  onRateLimitReached: (callback) => ipcRenderer.on('rate-limit-reached', callback),
  onRetryFailed: (callback) => ipcRenderer.on('retry-failed', callback),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

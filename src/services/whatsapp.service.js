/**
 * Servicio de WhatsApp
 * Ahora funciona como un manager multi-conexion sobre whatsapp-web.js.
 */

const fs = require('fs');
const path = require('path');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');
const inboxSettingsService = require('./clientInboxSettings.service');
const whatsappConnectionService = require('./whatsappConnection.service');
const { createForbiddenError } = require('../middlewares/auth');

const AUTH_BASE_DIR = path.join(__dirname, '../../data/wwebjs_auth');

if (!fs.existsSync(AUTH_BASE_DIR)) {
  fs.mkdirSync(AUTH_BASE_DIR, { recursive: true });
}

const createServiceError = (message, statusCode = 500, code = 'SERVICE_ERROR') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

class WhatsAppRuntime {
  constructor(connection, onEvent) {
    this.connection = connection;
    this.onEvent = onEvent;
    this.client = null;
    this.isReady = false;
    this.qrCode = null;
    this.status = connection?.status || 'disconnected';
    this.initializing = null;
  }

  get authClientId() {
    return `wa_${this.connection.id}`;
  }

  async initialize() {
    if (this.initializing) return this.initializing;

    this.initializing = new Promise((resolve, reject) => {
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: this.authClientId,
          dataPath: AUTH_BASE_DIR,
        }),
        puppeteer: {
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
          headless: process.env.HEADLESS !== 'false',
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

      this.client.on('qr', async (qr) => {
        this.status = 'qr_pending';
        this.qrCode = qr;
        qrcode.generate(qr, { small: true });
        await this.persistState({
          status: 'qr_pending',
          lastQr: await QRCode.toDataURL(qr),
          qrExpiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
          sessionPath: path.join(AUTH_BASE_DIR, `session-${this.authClientId}`),
        });
        this.onEvent('qr', { connectionId: this.connection.id, qr });
      });

      this.client.on('ready', async () => {
        this.isReady = true;
        this.status = 'connected';
        this.qrCode = null;
        await this.persistState({
          status: 'connected',
          lastQr: null,
          qrExpiresAt: null,
          sessionPath: path.join(AUTH_BASE_DIR, `session-${this.authClientId}`),
        });
        logger.info(`✅ WhatsApp conectado: ${this.connection.sessionName} (${this.connection.phone})`);
        this.onEvent('ready', { connectionId: this.connection.id });
        resolve();
      });

      this.client.on('authenticated', async () => {
        this.status = 'authenticated';
        await this.persistState({ status: 'authenticated' });
        this.onEvent('authenticated', { connectionId: this.connection.id });
      });

      this.client.on('auth_failure', async (msg) => {
        this.status = 'auth_failed';
        await this.persistState({ status: 'auth_failed' });
        logger.error(`❌ Error de autenticacion en ${this.connection.sessionName}:`, msg);
        this.onEvent('auth_failure', { connectionId: this.connection.id, message: msg });
        reject(new Error('Fallo de autenticacion'));
      });

      this.client.on('disconnected', async (reason) => {
        const currentClient = this.client;
        this.client = null;
        this.isReady = false;
        this.status = 'disconnected';
        await this.persistState({ status: 'disconnected' });
        if (currentClient) {
          try {
            await currentClient.destroy();
          } catch (error) {
            logger.warn(`No se pudo destruir el cliente al desconectar ${this.connection.sessionName}: ${error.message}`);
          }
        }
        logger.warn(`WhatsApp desconectado (${this.connection.sessionName}): ${reason}`);
        this.onEvent('disconnected', { connectionId: this.connection.id, reason });
      });

      this.client.on('message', async (message) => {
        this.onEvent('message', { connectionId: this.connection.id, message, connection: this.connection });
      });

      this.client.on('message_ack', async (msg, ack) => {
        this.onEvent('message_ack', { connectionId: this.connection.id, msg, ack, connection: this.connection });
      });

      this.client.initialize().catch((error) => {
        logger.error(`Error al inicializar WhatsApp ${this.connection.sessionName}:`, error);
        reject(error);
      });

      setTimeout(() => {
        if (!this.isReady) {
          resolve();
        }
      }, 30000);
    }).finally(() => {
      this.initializing = null;
    });

    return this.initializing;
  }

  async persistState(updates) {
    try {
      const next = await whatsappConnectionService.update(this.connection.id, updates);
      if (next) {
        this.connection = next;
      }
    } catch (error) {
      logger.warn(`No se pudo persistir estado de la conexion ${this.connection.id}: ${error.message}`);
    }
  }

  getStatus() {
    return {
      connectionId: this.connection.id,
      clientId: this.connection.clientId,
      phone: this.connection.phone,
      sessionName: this.connection.sessionName,
      status: this.status,
      isReady: this.isReady,
      hasQR: !!this.qrCode,
    };
  }

  async getQRCode() {
    if (!this.qrCode) return this.connection.lastQr || null;
    return QRCode.toDataURL(this.qrCode);
  }

  formatPhoneNumber(phone) {
    let cleaned = String(phone || '').replace(/\D/g, '');
    if (!cleaned.endsWith('@c.us')) {
      cleaned = `${cleaned}@c.us`;
    }
    return cleaned;
  }

  ensureReady() {
    if (!this.client || !this.isReady) {
      throw new Error('WhatsApp no esta conectado');
    }
  }

  async isRegistered(phone) {
    this.ensureReady();
    return this.client.isRegisteredUser(this.formatPhoneNumber(phone));
  }

  async sendMessage(phone, message, options = {}) {
    this.ensureReady();
    const formattedPhone = this.formatPhoneNumber(phone);
    const messageId = uuidv4();

    const numberId = await this.client.getNumberId(formattedPhone);
    if (!numberId) {
      throw new Error('El numero no esta registrado en WhatsApp');
    }

    const result = await this.client.sendMessage(formattedPhone, message, options);
    return {
      messageId,
      whatsappId: result.id._serialized,
      phone,
      status: 'sent',
      timestamp: new Date().toISOString(),
      connectionId: this.connection.id,
    };
  }

  async sendImage(phone, imageUrl, caption = '') {
    this.ensureReady();
    const media = await MessageMedia.fromUrl(imageUrl);
    const result = await this.client.sendMessage(this.formatPhoneNumber(phone), media, { caption });
    return {
      messageId: uuidv4(),
      whatsappId: result.id._serialized,
      phone,
      type: 'image',
      status: 'sent',
      timestamp: new Date().toISOString(),
      connectionId: this.connection.id,
    };
  }

  async sendMedia(phone, mimeType, base64Data, filename = 'file', options = {}) {
    this.ensureReady();
    const media = new MessageMedia(mimeType, base64Data, filename);
    const result = await this.client.sendMessage(this.formatPhoneNumber(phone), media, {
      sendMediaAsSticker: options.asSticker === true,
    });
    return {
      messageId: uuidv4(),
      whatsappId: result.id._serialized,
      phone,
      type: options.asSticker ? 'sticker' : mimeType.startsWith('image/') ? 'image' : 'document',
      status: 'sent',
      timestamp: new Date().toISOString(),
      connectionId: this.connection.id,
    };
  }

  async sendDocument(phone, documentUrl, filename, caption = '') {
    this.ensureReady();
    const media = await MessageMedia.fromUrl(documentUrl);
    media.filename = filename;
    const result = await this.client.sendMessage(this.formatPhoneNumber(phone), media, { caption });
    return {
      messageId: uuidv4(),
      whatsappId: result.id._serialized,
      phone,
      type: 'document',
      filename,
      status: 'sent',
      timestamp: new Date().toISOString(),
      connectionId: this.connection.id,
    };
  }

  async sendImageBase64(phone, base64Data, mimetype, caption = '') {
    this.ensureReady();
    const media = new MessageMedia(mimetype, base64Data);
    const result = await this.client.sendMessage(this.formatPhoneNumber(phone), media, { caption });
    return {
      messageId: uuidv4(),
      whatsappId: result.id._serialized,
      phone,
      type: 'image',
      status: 'sent',
      timestamp: new Date().toISOString(),
      connectionId: this.connection.id,
    };
  }

  async getContactInfo(phone) {
    this.ensureReady();
    const contact = await this.client.getContactById(this.formatPhoneNumber(phone));
    return {
      id: contact.id._serialized,
      name: contact.name || contact.pushname,
      number: contact.number,
      isUser: contact.isUser,
      isGroup: contact.isGroup,
      isBlocked: contact.isBlocked,
      connectionId: this.connection.id,
    };
  }

  async getProfile() {
    this.ensureReady();
    const info = this.client.info;
    return {
      name: info.pushname,
      phone: info.wid.user,
      platform: info.platform,
      connectionId: this.connection.id,
    };
  }

  async logout() {
    if (this.client) {
      const currentClient = this.client;
      this.client = null;
      await currentClient.logout();
      try {
        await currentClient.destroy();
      } catch (error) {
        logger.warn(`No se pudo destruir el cliente tras logout ${this.connection.sessionName}: ${error.message}`);
      }
      this.isReady = false;
      this.status = 'disconnected';
      await this.persistState({ status: 'disconnected' });
    }
  }

  async destroy() {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
      this.isReady = false;
      this.status = 'disconnected';
      await this.persistState({ status: 'disconnected' });
    }
  }
}

class WhatsAppMultiService {
  constructor() {
    this.runtimes = new Map();
    this.eventHandlers = new Map();
    this.qrGenerationEnabled = String(process.env.QR_GENERATION_ENABLED || 'true').toLowerCase() !== 'false';
  }

  isQrGenerationEnabled() {
    return this.qrGenerationEnabled;
  }

  setQrGenerationEnabled(enabled) {
    this.qrGenerationEnabled = !!enabled;

    if (!this.qrGenerationEnabled) {
      for (const runtime of this.runtimes.values()) {
        runtime.qrCode = null;
      }
    }

    return this.qrGenerationEnabled;
  }

  async initialize() {
    const connections = await whatsappConnectionService.list();
    if (!connections.length) {
      logger.warn('No hay conexiones de WhatsApp registradas. El motor multi-sesion queda en espera.');
      return;
    }

    await Promise.allSettled(
      connections.map(async (connection) => {
        const runtime = this.ensureRuntime(connection);
        await runtime.initialize();
      })
    );
  }

  ensureRuntime(connection) {
    const current = this.runtimes.get(connection.id);
    if (current) {
      current.connection = connection;
      return current;
    }

    const runtime = new WhatsAppRuntime(connection, (event, payload) => this.handleRuntimeEvent(event, payload));
    this.runtimes.set(connection.id, runtime);
    return runtime;
  }

  async initializeConnection(connectionId) {
    const connection = await whatsappConnectionService.getById(connectionId);
    if (!connection) {
      throw new Error('Conexion no encontrada');
    }
    const runtime = this.ensureRuntime(connection);
    await runtime.initialize();
    return runtime.getStatus();
  }

  async removeConnection(connectionId) {
    const runtime = this.runtimes.get(connectionId);
    if (runtime) {
      await runtime.destroy();
      this.runtimes.delete(connectionId);
    }
  }

  async refreshConnections() {
    const connections = await whatsappConnectionService.list();
    for (const connection of connections) {
      this.ensureRuntime(connection);
    }
    return connections;
  }

  normalizeRequestedConnectionId(connectionId = null) {
    const normalized = String(connectionId || '').trim();
    if (!normalized) return null;
    if (normalized.toLowerCase() === 'default') return 'default';
    return normalized;
  }

  async resolveTenantConnections(clientId) {
    const connections = await whatsappConnectionService.list(clientId);
    if (!connections.length) {
      throw createServiceError('No hay conexiones de WhatsApp registradas para este tenant', 404, 'TENANT_CONNECTIONS_NOT_FOUND');
    }
    return connections;
  }

  async resolveConnectionCandidate(options = {}) {
    const { connectionId = null, clientId = null, authClientId = null, isMaster = false } = options;
    const effectiveClientId = isMaster
      ? String(clientId || '').trim() || null
      : String(authClientId || clientId || '').trim() || null;
    const normalizedConnectionId = this.normalizeRequestedConnectionId(connectionId);

    if (normalizedConnectionId && normalizedConnectionId !== 'default') {
      const ownedConnection = isMaster
        ? await whatsappConnectionService.getById(normalizedConnectionId)
        : await whatsappConnectionService.getByIdForClient(normalizedConnectionId, effectiveClientId);

      if (!ownedConnection) {
        throw createForbiddenError('La conexión solicitada no pertenece al tenant autenticado', 'CONNECTION_FORBIDDEN');
      }

      return { connection: ownedConnection, effectiveClientId };
    }

    if (!effectiveClientId) {
      throw createServiceError('No hay un tenant disponible para resolver la conexión de WhatsApp', 400, 'TENANT_REQUIRED');
    }

    const settings = inboxSettingsService.getClientSettings(effectiveClientId);
    const tenantConnections = await this.resolveTenantConnections(effectiveClientId);
    const defaultConnectionId = settings.defaultConnectionId || tenantConnections[0]?.id || null;

    const selectedConnection = normalizedConnectionId === 'default'
      ? tenantConnections.find((connection) => connection.id === defaultConnectionId) || tenantConnections[0]
      : tenantConnections.find((connection) => connection.id === defaultConnectionId)
        || tenantConnections.find((connection) => connection.status === 'connected')
        || tenantConnections[0];

    if (!selectedConnection) {
      throw createServiceError('No hay conexiones disponibles para este tenant', 404, 'TENANT_CONNECTION_NOT_FOUND');
    }

    return { connection: selectedConnection, effectiveClientId };
  }

  async resolveRuntime(options = {}) {
    const { connection, effectiveClientId } = await this.resolveConnectionCandidate(options);
    const normalizedConnectionId = this.normalizeRequestedConnectionId(options.connectionId);

    if (normalizedConnectionId) {
      const direct = this.ensureRuntime(connection);
      if (direct.client || direct.isReady) return direct;
      await direct.initialize();
      return direct;
    }

    const settings = inboxSettingsService.getClientSettings(effectiveClientId);
    const preferredIds = [
      settings.defaultConnectionId,
      ...(settings.groups || []).map((group) => group.connectionId).filter(Boolean),
    ].filter(Boolean);

    for (const preferredId of preferredIds) {
      const runtime = this.runtimes.get(preferredId);
      if (runtime?.isReady) return runtime;
    }

    for (const runtime of this.runtimes.values()) {
      if (runtime.connection.clientId === effectiveClientId && runtime.isReady) return runtime;
    }

    for (const runtime of this.runtimes.values()) {
      if (runtime.connection.clientId === effectiveClientId) {
        if (!runtime.client) {
          await runtime.initialize();
        }
        if (runtime.isReady) return runtime;
      }
    }

    const candidateRuntime = this.ensureRuntime(connection);
    if (!candidateRuntime.client) {
      await candidateRuntime.initialize();
    }

    if (candidateRuntime.isReady) return candidateRuntime;

    throw createServiceError('No hay conexiones de WhatsApp listas para este cliente', 503, 'WHATSAPP_CONNECTION_NOT_READY');
  }

  async getVisibleStatus(options = {}) {
    const { connectionId = null, clientId = null, authClientId = null, isMaster = false } = options;
    const normalizedConnectionId = this.normalizeRequestedConnectionId(connectionId);

    if (normalizedConnectionId) {
      const { connection } = await this.resolveConnectionCandidate({ connectionId, clientId, authClientId, isMaster });
      const runtime = this.ensureRuntime(connection);
      return runtime.getStatus();
    }

    const effectiveClientId = isMaster
      ? String(clientId || '').trim() || null
      : String(authClientId || clientId || '').trim() || null;

    const statuses = Array.from(this.runtimes.values())
      .filter((runtime) => !effectiveClientId || runtime.connection.clientId === effectiveClientId)
      .map((runtime) => runtime.getStatus());

    return {
      totalConnections: statuses.length,
      connected: statuses.filter((status) => status.isReady).length,
      connections: statuses,
    };
  }

  getStatus(connectionId = null) {
    if (connectionId) {
      const runtime = this.runtimes.get(connectionId);
      return runtime ? runtime.getStatus() : { status: 'disconnected', isReady: false, hasQR: false };
    }

    const statuses = Array.from(this.runtimes.values()).map((runtime) => runtime.getStatus());
    return {
      totalConnections: statuses.length,
      connected: statuses.filter((status) => status.isReady).length,
      connections: statuses,
    };
  }

  async getQRCode(options = {}) {
    if (!this.qrGenerationEnabled) {
      return null;
    }

    const { connection } = await this.resolveConnectionCandidate(options);
    const runtime = this.ensureRuntime(connection);
    if (!runtime.client) {
      runtime.initialize().catch((error) => {
        logger.warn(`No se pudo inicializar la conexion ${connection.id} al solicitar QR: ${error.message}`);
      });
    }
    return runtime.getQRCode();
  }

  async isRegistered(phone, options = {}) {
    const runtime = await this.resolveRuntime(options);
    return runtime.isRegistered(phone);
  }

  async sendMessage(phone, message, options = {}) {
    const runtime = await this.resolveRuntime(options);
    return runtime.sendMessage(phone, message, options);
  }

  async sendImage(phone, imageUrl, caption = '', options = {}) {
    const runtime = await this.resolveRuntime(options);
    return runtime.sendImage(phone, imageUrl, caption);
  }

  async sendMedia(phone, mimeType, base64Data, filename = 'file', options = {}) {
    const runtime = await this.resolveRuntime(options);
    return runtime.sendMedia(phone, mimeType, base64Data, filename, options);
  }

  async sendDocument(phone, documentUrl, filename, caption = '', options = {}) {
    const runtime = await this.resolveRuntime(options);
    return runtime.sendDocument(phone, documentUrl, filename, caption);
  }

  async sendImageBase64(phone, base64Data, mimetype, caption = '', options = {}) {
    const runtime = await this.resolveRuntime(options);
    return runtime.sendImageBase64(phone, base64Data, mimetype, caption);
  }

  async sendBulkMessages(recipients, message, options = {}) {
    const results = [];
    const delay = options.delay || 2000;
    for (const phone of recipients) {
      try {
        const result = await this.sendMessage(phone, message, options);
        results.push({ phone, ...result, success: true });
      } catch (error) {
        results.push({ phone, success: false, error: error.message });
      }

      if (recipients.indexOf(phone) < recipients.length - 1) {
        await this.sleep(delay);
      }
    }
    return results;
  }

  async getContactInfo(phone, options = {}) {
    const runtime = await this.resolveRuntime(options);
    return runtime.getContactInfo(phone);
  }

  async getProfile(options = {}) {
    const runtime = await this.resolveRuntime(options);
    return runtime.getProfile();
  }

  async logout(options = {}) {
    const { connectionId = null, clientId = null, authClientId = null, isMaster = false } = options;

    if (connectionId) {
      const runtime = await this.resolveRuntime({ connectionId, clientId, authClientId, isMaster });
      await runtime.logout();
      return;
    }

    const effectiveClientId = isMaster
      ? String(clientId || '').trim() || null
      : String(authClientId || clientId || '').trim() || null;
    const runtimes = Array.from(this.runtimes.values()).filter(
      (runtime) => !effectiveClientId || runtime.connection.clientId === effectiveClientId
    );
    await Promise.all(runtimes.map((runtime) => runtime.logout()));
  }

  async restart(options = {}) {
    const { connectionId = null, clientId = null, authClientId = null, isMaster = false } = options;

    if (connectionId) {
      const runtime = await this.resolveRuntime({ connectionId, clientId, authClientId, isMaster });
      await runtime.destroy();
      await runtime.initialize();
      return runtime.getStatus();
    }

    const effectiveClientId = isMaster
      ? String(clientId || '').trim() || null
      : String(authClientId || clientId || '').trim() || null;
    const connections = await whatsappConnectionService.list(effectiveClientId);

    await this.destroy({ clientId, authClientId, isMaster });
    await Promise.allSettled(
      connections.map(async (connection) => {
        const runtime = this.ensureRuntime(connection);
        await runtime.initialize();
      })
    );
    return this.getVisibleStatus({ clientId, authClientId, isMaster });
  }

  async destroy(options = {}) {
    const { connectionId = null, clientId = null, authClientId = null, isMaster = false } = options;

    if (connectionId) {
      const runtime = await this.resolveRuntime({ connectionId, clientId, authClientId, isMaster });
      if (runtime) {
        await runtime.destroy();
      }
      return;
    }

    const effectiveClientId = isMaster
      ? String(clientId || '').trim() || null
      : String(authClientId || clientId || '').trim() || null;
    const runtimes = Array.from(this.runtimes.values()).filter(
      (runtime) => !effectiveClientId || runtime.connection.clientId === effectiveClientId
    );
    await Promise.all(runtimes.map((runtime) => runtime.destroy()));
  }

  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  emit(event, data) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach((handler) => handler(data));
  }

  async handleRuntimeEvent(event, payload) {
    if (event === 'qr' && !this.qrGenerationEnabled) {
      try {
        const runtime = this.runtimes.get(payload.connectionId);
        if (runtime) {
          runtime.qrCode = null;
          runtime.status = 'qr_pending';
          await runtime.persistState({
            status: 'qr_pending',
            lastQr: null,
            qrExpiresAt: null,
          });
        }
      } catch (error) {
        logger.warn(`No se pudo limpiar QR bloqueado: ${error.message}`);
      }
      this.emit('qr_blocked', payload);
      return;
    }

    if (event === 'message') {
      await this.handleIncomingMessage(payload.message, payload.connection);
      this.emit('message', payload);
      return;
    }

    if (event === 'message_ack') {
      try {
        const chatSessionService = require('./chatSession.service');
        const msg = payload.msg;
        const phone = (msg.to || msg.from || msg.id?.remote || '').replace(/@.+/, '').replace(/\D/g, '');
        chatSessionService.updateMessageAck(msg.id?._serialized, payload.ack, phone, payload.connection?.id || null);
      } catch (error) {
        logger.warn(`No se pudo actualizar ACK: ${error.message}`);
      }
      this.emit('message_ack', payload);
      return;
    }

    this.emit(event, payload);
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async handleIncomingMessage(message, connection) {
    try {
      const chatSessionService = require('./chatSession.service');
      const contact = await message.getContact();
      const rawNumber = contact?.number || message.from || '';
      const phone = rawNumber.replace(/\D/g, '');
      const clientId = connection?.clientId || 'client_1';
      const targetGroup = inboxSettingsService.resolveGroupForConnection(clientId, connection?.id || null);

      if (message.from.includes('@g.us') || message.from.includes('@broadcast')) {
        return;
      }

      const chat = chatSessionService.registerChat(phone, {
        customerName: contact?.pushname || contact?.name || message._data?.notifyName || null,
        connectionId: connection?.id || null,
        groupId: targetGroup?.id || null,
        workflow: targetGroup?.workflow || 'manual',
      });

      if (targetGroup) {
        chatSessionService.updateChatRouting(chat.id, {
          connectionId: connection?.id || targetGroup.connectionId || null,
          groupId: targetGroup.id,
          workflow: targetGroup.workflow || 'manual',
        });

        if (
          chat.status === 'pending' &&
          !chat.sessionId &&
          Array.isArray(targetGroup.sessionIds) &&
          targetGroup.sessionIds.length &&
          targetGroup.workflow &&
          targetGroup.workflow !== 'manual'
        ) {
          chatSessionService.autoAssignChatByWorkflow(chat.id, targetGroup.sessionIds, targetGroup.workflow);
        }
      }

      let messageType = 'text';
      let content = message.body;

      if (message.hasMedia) {
        if (message.type === 'image') messageType = 'image';
        else if (message.type === 'sticker') messageType = 'sticker';
        else if (message.type === 'document') messageType = 'document';
        else if (message.type === 'audio' || message.type === 'ptt') messageType = 'audio';
        else if (message.type === 'video') messageType = 'video';
        else messageType = 'media';

        try {
          const media = await message.downloadMedia();
          if (media?.data && media?.mimetype) {
            content = `data:${media.mimetype};base64,${media.data}`;
          } else {
            throw new Error('downloadMedia returned empty data');
          }
        } catch (error) {
          logger.warn(`No se pudo descargar media entrante (${message.type}): ${error.message}`);
          content = message.body || `[${messageType.toUpperCase()}]`;
        }
      }

      chatSessionService.logMessage(phone, {
        direction: 'incoming',
        content,
        type: messageType,
        whatsappId: message.id._serialized,
        chatId: chat.id,
        connectionId: connection?.id || null,
      });

      await this.handlePreAssignmentBot(phone, message.body || '', connection);
      logger.debug(`📨 Mensaje entrante registrado de ${phone} en conexion ${connection?.id || 'n/a'}`);
    } catch (error) {
      logger.error('Error registrando mensaje entrante:', error);
    }
  }

  async handlePreAssignmentBot(phone, messageText, connection) {
    try {
      const chatSessionService = require('./chatSession.service');
      const clientId = connection?.clientId || 'client_1';
      const chat = chatSessionService.getChatInfo(phone, { connectionId: connection?.id || null });

      if (!chat || chat.status !== 'pending' || chat.sessionId) return;

      const targetGroup = inboxSettingsService.resolveGroupForConnection(clientId, connection?.id || null, chat.groupId || chat.botState?.groupId || null);

      if (!targetGroup || !targetGroup.chatbotEnabled) return;

      const customerName = chat.customerName?.trim() || chat.phone;
      const normalizedText = String(messageText || '').toLowerCase();
      const handoffKeywords = String(settings.handoffKeywords || '')
        .split(',')
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(Boolean);

      const resolveTemplate = (template) =>
        String(template || '')
          .replace(/\[NOMBRE CLIENTE\]/gi, customerName)
          .replace(/\[NOMBRE DEL AGENTE\]/gi, 'Asistente virtual');

      const sendBotMessage = async (contentToSend, statePatch = {}) => {
        const result = await this.sendMessage(phone, contentToSend, {
          connectionId: connection?.id || targetGroup.connectionId || null,
          clientId,
        });
        chatSessionService.logMessage(phone, {
          direction: 'outgoing',
          content: contentToSend,
          type: 'text',
          chatId: chat.id,
          agentName: 'Chatbot',
          whatsappId: result.whatsappId,
          ack: 0,
          connectionId: result.connectionId || null,
        });
        chatSessionService.updateChatBotState(chat.id, {
          groupId: targetGroup.id,
          lastBotReplyAt: new Date().toISOString(),
          ...statePatch,
        });
      };

      if (!chat.botState?.welcomeSentAt) {
        await sendBotMessage(resolveTemplate(targetGroup.welcomeMessage), {
          welcomeSentAt: new Date().toISOString(),
        });
        return;
      }

      if (handoffKeywords.some((keyword) => normalizedText.includes(keyword))) {
        if (!chat.botState?.handoffSentAt) {
          await sendBotMessage(resolveTemplate(targetGroup.handoffMessage), {
            handoffSentAt: new Date().toISOString(),
          });
        }
        if (
          Array.isArray(targetGroup.sessionIds) &&
          targetGroup.sessionIds.length &&
          targetGroup.workflow &&
          targetGroup.workflow !== 'manual'
        ) {
          chatSessionService.autoAssignChatByWorkflow(chat.id, targetGroup.sessionIds, targetGroup.workflow);
        }
        return;
      }

      const matchedRule = (targetGroup.keywordRules || []).find((rule) =>
        String(rule.keywords || '')
          .split(',')
          .map((keyword) => keyword.trim().toLowerCase())
          .filter(Boolean)
          .some((keyword) => normalizedText.includes(keyword))
      );

      if (matchedRule) {
        await sendBotMessage(resolveTemplate(matchedRule.response));
        return;
      }

      const lastBotReplyAt = chat.botState?.lastBotReplyAt ? new Date(chat.botState.lastBotReplyAt).getTime() : 0;
      if (!lastBotReplyAt || Date.now() - lastBotReplyAt > 3 * 60 * 1000) {
        await sendBotMessage(resolveTemplate(targetGroup.fallbackMessage));
      }
    } catch (error) {
      logger.warn(`No se pudo procesar chatbot previo a agente: ${error.message}`);
    }
  }
}

module.exports = new WhatsAppMultiService();

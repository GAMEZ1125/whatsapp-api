/**
 * Servicio de WhatsApp
 * Maneja la conexión y envío de mensajes
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

class WhatsAppService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.qrCode = null;
    this.status = 'disconnected';
    this.messageQueue = [];
    this.eventHandlers = new Map();
  }

  /**
   * Inicializa el cliente de WhatsApp
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: process.env.SESSION_NAME || 'whatsapp-session'
        }),
        puppeteer: {
          headless: process.env.HEADLESS !== 'false',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ]
        }
      });

      // Evento QR
      this.client.on('qr', async (qr) => {
        this.status = 'qr_pending';
        this.qrCode = qr;
        logger.info('Código QR generado. Escanéalo con WhatsApp');
        qrcode.generate(qr, { small: true });
        this.emit('qr', qr);
      });

      // Cliente listo
      this.client.on('ready', () => {
        this.isReady = true;
        this.status = 'connected';
        this.qrCode = null;
        logger.info('✅ WhatsApp conectado y listo');
        this.emit('ready');
        resolve();
      });

      // Autenticado
      this.client.on('authenticated', () => {
        this.status = 'authenticated';
        logger.info('✅ Autenticación exitosa');
        this.emit('authenticated');
      });

      // Fallo de autenticación
      this.client.on('auth_failure', (msg) => {
        this.status = 'auth_failed';
        logger.error('❌ Error de autenticación:', msg);
        this.emit('auth_failure', msg);
        reject(new Error('Fallo de autenticación'));
      });

      // Desconectado
      this.client.on('disconnected', (reason) => {
        this.isReady = false;
        this.status = 'disconnected';
        logger.warn('WhatsApp desconectado:', reason);
        this.emit('disconnected', reason);
      });

      // Mensaje recibido
      this.client.on('message', (message) => {
        this.emit('message', message);
      });

      // Iniciar cliente
      this.client.initialize().catch((error) => {
        logger.error('Error al inicializar WhatsApp:', error);
        reject(error);
      });

      // Timeout para la inicialización
      setTimeout(() => {
        if (!this.isReady && this.status !== 'qr_pending') {
          resolve(); // Resuelve de todas formas para no bloquear el servidor
        }
      }, 30000);
    });
  }

  /**
   * Obtiene el estado actual del servicio
   */
  getStatus() {
    return {
      status: this.status,
      isReady: this.isReady,
      hasQR: !!this.qrCode
    };
  }

  /**
   * Obtiene el código QR como imagen base64
   */
  async getQRCode() {
    if (!this.qrCode) {
      return null;
    }
    return await QRCode.toDataURL(this.qrCode);
  }

  /**
   * Formatea el número de teléfono al formato de WhatsApp
   */
  formatPhoneNumber(phone) {
    // Remover caracteres no numéricos
    let cleaned = phone.toString().replace(/\D/g, '');
    
    // Agregar sufijo de WhatsApp
    if (!cleaned.endsWith('@c.us')) {
      cleaned = `${cleaned}@c.us`;
    }
    
    return cleaned;
  }

  /**
   * Verifica si un número está registrado en WhatsApp
   */
  async isRegistered(phone) {
    if (!this.isReady) {
      throw new Error('WhatsApp no está conectado');
    }

    const formattedPhone = this.formatPhoneNumber(phone);
    const result = await this.client.isRegisteredUser(formattedPhone);
    return result;
  }

  /**
   * Envía un mensaje de texto
   */
  async sendMessage(phone, message, options = {}) {
    if (!this.isReady) {
      throw new Error('WhatsApp no está conectado');
    }

    const formattedPhone = this.formatPhoneNumber(phone);
    const messageId = uuidv4();

    try {
      logger.info(`Enviando mensaje a ${phone}`);
      
      const result = await this.client.sendMessage(formattedPhone, message, options);
      
      logger.info(`✅ Mensaje enviado: ${messageId}`);
      
      return {
        messageId,
        whatsappId: result.id._serialized,
        phone: phone,
        status: 'sent',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`❌ Error al enviar mensaje: ${error.message}`);
      throw error;
    }
  }

  /**
   * Envía un mensaje con imagen
   */
  async sendImage(phone, imageUrl, caption = '') {
    if (!this.isReady) {
      throw new Error('WhatsApp no está conectado');
    }

    const formattedPhone = this.formatPhoneNumber(phone);
    const messageId = uuidv4();

    try {
      logger.info(`Enviando imagen a ${phone}`);
      
      const media = await MessageMedia.fromUrl(imageUrl);
      const result = await this.client.sendMessage(formattedPhone, media, { caption });
      
      logger.info(`✅ Imagen enviada: ${messageId}`);
      
      return {
        messageId,
        whatsappId: result.id._serialized,
        phone: phone,
        type: 'image',
        status: 'sent',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`❌ Error al enviar imagen: ${error.message}`);
      throw error;
    }
  }

  /**
   * Envía un documento
   */
  async sendDocument(phone, documentUrl, filename, caption = '') {
    if (!this.isReady) {
      throw new Error('WhatsApp no está conectado');
    }

    const formattedPhone = this.formatPhoneNumber(phone);
    const messageId = uuidv4();

    try {
      logger.info(`Enviando documento a ${phone}`);
      
      const media = await MessageMedia.fromUrl(documentUrl);
      media.filename = filename;
      
      const result = await this.client.sendMessage(formattedPhone, media, { caption });
      
      logger.info(`✅ Documento enviado: ${messageId}`);
      
      return {
        messageId,
        whatsappId: result.id._serialized,
        phone: phone,
        type: 'document',
        filename,
        status: 'sent',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`❌ Error al enviar documento: ${error.message}`);
      throw error;
    }
  }

  /**
   * Envía imagen desde base64
   */
  async sendImageBase64(phone, base64Data, mimetype, caption = '') {
    if (!this.isReady) {
      throw new Error('WhatsApp no está conectado');
    }

    const formattedPhone = this.formatPhoneNumber(phone);
    const messageId = uuidv4();

    try {
      logger.info(`Enviando imagen base64 a ${phone}`);
      
      const media = new MessageMedia(mimetype, base64Data);
      const result = await this.client.sendMessage(formattedPhone, media, { caption });
      
      return {
        messageId,
        whatsappId: result.id._serialized,
        phone: phone,
        type: 'image',
        status: 'sent',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`❌ Error al enviar imagen base64: ${error.message}`);
      throw error;
    }
  }

  /**
   * Envía mensajes a múltiples destinatarios
   */
  async sendBulkMessages(recipients, message, options = {}) {
    const results = [];
    const delay = options.delay || 2000; // 2 segundos entre mensajes

    for (const phone of recipients) {
      try {
        const result = await this.sendMessage(phone, message, options);
        results.push({ phone, ...result, success: true });
      } catch (error) {
        results.push({ phone, success: false, error: error.message });
      }
      
      // Esperar entre mensajes para evitar bloqueos
      if (recipients.indexOf(phone) < recipients.length - 1) {
        await this.sleep(delay);
      }
    }

    return results;
  }

  /**
   * Obtiene información del contacto
   */
  async getContactInfo(phone) {
    if (!this.isReady) {
      throw new Error('WhatsApp no está conectado');
    }

    const formattedPhone = this.formatPhoneNumber(phone);
    const contact = await this.client.getContactById(formattedPhone);
    
    return {
      id: contact.id._serialized,
      name: contact.name || contact.pushname,
      number: contact.number,
      isUser: contact.isUser,
      isGroup: contact.isGroup,
      isBlocked: contact.isBlocked
    };
  }

  /**
   * Obtiene información del perfil conectado
   */
  async getProfile() {
    if (!this.isReady) {
      throw new Error('WhatsApp no está conectado');
    }

    const info = this.client.info;
    return {
      name: info.pushname,
      phone: info.wid.user,
      platform: info.platform
    };
  }

  /**
   * Cierra la sesión de WhatsApp
   */
  async logout() {
    if (this.client) {
      await this.client.logout();
      this.isReady = false;
      this.status = 'disconnected';
      logger.info('Sesión cerrada correctamente');
    }
  }

  /**
   * Destruye el cliente
   */
  async destroy() {
    if (this.client) {
      await this.client.destroy();
      this.isReady = false;
      this.status = 'disconnected';
      logger.info('Cliente destruido correctamente');
    }
  }

  /**
   * Registra un manejador de eventos
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * Emite un evento
   */
  emit(event, data) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(data));
  }

  /**
   * Función de espera
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton
module.exports = new WhatsAppService();

/**
 * Controlador de Sesión
 * @swagger
 * tags:
 *   name: Session
 *   description: Gestión de la sesión de WhatsApp
 */

const whatsappService = require('../services/whatsapp.service');
const logger = require('../config/logger');

/**
 * @swagger
 * /api/session/status:
 *   get:
 *     summary: Obtiene el estado de la conexión
 *     tags: [Session]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Estado de la sesión
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [disconnected, qr_pending, authenticated, connected]
 *                     isReady:
 *                       type: boolean
 *                     hasQR:
 *                       type: boolean
 */
const getStatus = (req, res) => {
  const status = whatsappService.getStatus();
  
  res.json({
    success: true,
    data: status
  });
};

/**
 * @swagger
 * /api/session/qr:
 *   get:
 *     summary: Obtiene el código QR para escanear
 *     tags: [Session]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Código QR en base64
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     qrCode:
 *                       type: string
 *                       description: Imagen QR en formato data URL (base64)
 *       404:
 *         description: No hay QR disponible
 */
const getQRCode = async (req, res, next) => {
  try {
    const qrCode = await whatsappService.getQRCode();
    
    if (!qrCode) {
      return res.status(404).json({
        success: false,
        error: 'No hay código QR disponible',
        message: 'La sesión ya está autenticada o aún no se ha generado el QR'
      });
    }
    
    res.json({
      success: true,
      data: {
        qrCode
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/session/qr/image:
 *   get:
 *     summary: Obtiene el código QR como imagen
 *     tags: [Session]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Imagen del código QR
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 */
const getQRCodeImage = async (req, res, next) => {
  try {
    const qrCode = await whatsappService.getQRCode();
    
    if (!qrCode) {
      return res.status(404).send('No hay código QR disponible');
    }
    
    // Extraer el base64 del data URL
    const base64Data = qrCode.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': buffer.length
    });
    res.end(buffer);
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/session/profile:
 *   get:
 *     summary: Obtiene información del perfil conectado
 *     tags: [Session]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Información del perfil
 */
const getProfile = async (req, res, next) => {
  try {
    const profile = await whatsappService.getProfile();
    
    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/session/logout:
 *   post:
 *     summary: Cierra la sesión de WhatsApp
 *     tags: [Session]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Sesión cerrada exitosamente
 */
const logout = async (req, res, next) => {
  try {
    await whatsappService.logout();
    
    res.json({
      success: true,
      message: 'Sesión cerrada exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/session/restart:
 *   post:
 *     summary: Reinicia la conexión de WhatsApp
 *     tags: [Session]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Reiniciando conexión
 */
const restart = async (req, res, next) => {
  try {
    logger.info('Reiniciando conexión de WhatsApp...');
    
    await whatsappService.destroy();
    await whatsappService.initialize();
    
    res.json({
      success: true,
      message: 'Conexión reiniciada',
      data: whatsappService.getStatus()
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStatus,
  getQRCode,
  getQRCodeImage,
  getProfile,
  logout,
  restart
};

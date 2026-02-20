/**
 * Controlador de Mensajes
 * @swagger
 * tags:
 *   name: Messages
 *   description: Endpoints para envío de mensajes
 */

const whatsappService = require('../services/whatsapp.service');
const logger = require('../config/logger');

/**
 * @swagger
 * /api/messages/send:
 *   post:
 *     summary: Envía un mensaje de texto
 *     tags: [Messages]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - message
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Número de teléfono con código de país
 *                 example: "573001234567"
 *               message:
 *                 type: string
 *                 description: Contenido del mensaje
 *                 example: "Hola, este es un mensaje de prueba"
 *     responses:
 *       200:
 *         description: Mensaje enviado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     messageId:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     status:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *       400:
 *         description: Error de validación
 *       503:
 *         description: WhatsApp no conectado
 */
const sendMessage = async (req, res, next) => {
  try {
    const { phone, message } = req.body;
    
    const result = await whatsappService.sendMessage(phone, message);
    
    res.json({
      success: true,
      message: 'Mensaje enviado exitosamente',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/messages/send-image:
 *   post:
 *     summary: Envía una imagen
 *     tags: [Messages]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "573001234567"
 *               imageUrl:
 *                 type: string
 *                 description: URL de la imagen
 *                 example: "https://example.com/image.jpg"
 *               base64:
 *                 type: string
 *                 description: Imagen en base64 (alternativa a URL)
 *               mimetype:
 *                 type: string
 *                 description: Tipo MIME (requerido con base64)
 *                 example: "image/jpeg"
 *               caption:
 *                 type: string
 *                 description: Texto que acompaña la imagen
 *                 example: "Mira esta imagen"
 *     responses:
 *       200:
 *         description: Imagen enviada exitosamente
 */
const sendImage = async (req, res, next) => {
  try {
    const { phone, imageUrl, base64, mimetype, caption } = req.body;
    
    let result;
    
    if (base64 && mimetype) {
      result = await whatsappService.sendImageBase64(phone, base64, mimetype, caption);
    } else if (imageUrl) {
      result = await whatsappService.sendImage(phone, imageUrl, caption);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Se requiere imageUrl o base64 con mimetype'
      });
    }
    
    res.json({
      success: true,
      message: 'Imagen enviada exitosamente',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/messages/send-document:
 *   post:
 *     summary: Envía un documento
 *     tags: [Messages]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - documentUrl
 *               - filename
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "573001234567"
 *               documentUrl:
 *                 type: string
 *                 example: "https://example.com/document.pdf"
 *               filename:
 *                 type: string
 *                 example: "documento.pdf"
 *               caption:
 *                 type: string
 *                 example: "Aquí está el documento"
 *     responses:
 *       200:
 *         description: Documento enviado exitosamente
 */
const sendDocument = async (req, res, next) => {
  try {
    const { phone, documentUrl, filename, caption } = req.body;
    
    const result = await whatsappService.sendDocument(phone, documentUrl, filename, caption);
    
    res.json({
      success: true,
      message: 'Documento enviado exitosamente',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/messages/send-bulk:
 *   post:
 *     summary: Envía mensaje a múltiples destinatarios
 *     tags: [Messages]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - recipients
 *               - message
 *             properties:
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["573001234567", "573009876543"]
 *               message:
 *                 type: string
 *                 example: "Mensaje para todos"
 *               delay:
 *                 type: integer
 *                 description: Milisegundos entre cada envío
 *                 example: 2000
 *     responses:
 *       200:
 *         description: Envío masivo completado
 */
const sendBulkMessages = async (req, res, next) => {
  try {
    const { recipients, message, delay } = req.body;
    
    const results = await whatsappService.sendBulkMessages(recipients, message, { delay });
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    res.json({
      success: true,
      message: `Envío completado: ${successful} exitosos, ${failed} fallidos`,
      data: {
        total: recipients.length,
        successful,
        failed,
        results
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendMessage,
  sendImage,
  sendDocument,
  sendBulkMessages
};

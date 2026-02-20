/**
 * Rutas de Mensajes
 */

const express = require('express');
const router = express.Router();

const { apiKeyAuth } = require('../middlewares/auth');
const {
  validateSendMessage,
  validateSendImage,
  validateSendDocument,
  validateBulkMessage
} = require('../middlewares/validators');
const messageController = require('../controllers/message.controller');

// Aplicar autenticación a todas las rutas
router.use(apiKeyAuth);

// Enviar mensaje de texto
router.post('/send', validateSendMessage, messageController.sendMessage);

// Enviar imagen
router.post('/send-image', validateSendImage, messageController.sendImage);

// Enviar documento
router.post('/send-document', validateSendDocument, messageController.sendDocument);

// Envío masivo
router.post('/send-bulk', validateBulkMessage, messageController.sendBulkMessages);

module.exports = router;

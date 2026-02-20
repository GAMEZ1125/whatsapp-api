/**
 * Rutas de Sesión
 */

const express = require('express');
const router = express.Router();

const { apiKeyAuth } = require('../middlewares/auth');
const sessionController = require('../controllers/session.controller');

// Aplicar autenticación a todas las rutas
router.use(apiKeyAuth);

// Estado de la sesión
router.get('/status', sessionController.getStatus);

// Obtener QR code
router.get('/qr', sessionController.getQRCode);

// Obtener QR como imagen
router.get('/qr/image', sessionController.getQRCodeImage);

// Información del perfil
router.get('/profile', sessionController.getProfile);

// Cerrar sesión
router.post('/logout', sessionController.logout);

// Reiniciar conexión
router.post('/restart', sessionController.restart);

module.exports = router;

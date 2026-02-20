/**
 * Rutas de Contactos
 */

const express = require('express');
const router = express.Router();

const { apiKeyAuth } = require('../middlewares/auth');
const { validatePhone } = require('../middlewares/validators');
const contactController = require('../controllers/contact.controller');

// Aplicar autenticación a todas las rutas
router.use(apiKeyAuth);

// Verificar si un número está en WhatsApp
router.get('/check/:phone', validatePhone, contactController.checkNumber);

// Verificar múltiples números
router.post('/check-bulk', contactController.checkBulkNumbers);

// Obtener información de contacto
router.get('/info/:phone', validatePhone, contactController.getContactInfo);

module.exports = router;

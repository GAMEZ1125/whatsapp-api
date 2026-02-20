/**
 * Rutas principales
 */

const express = require('express');
const router = express.Router();

const messageRoutes = require('./message.routes');
const sessionRoutes = require('./session.routes');
const contactRoutes = require('./contact.routes');
const webhookRoutes = require('./webhook.routes');

// Rutas de la API
router.use('/messages', messageRoutes);
router.use('/session', sessionRoutes);
router.use('/contacts', contactRoutes);
router.use('/webhooks', webhookRoutes);

// Información de la API
router.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'WhatsApp API Engine',
    version: '1.0.0',
    documentation: '/api-docs',
    endpoints: {
      messages: '/api/messages',
      session: '/api/session',
      contacts: '/api/contacts',
      webhooks: '/api/webhooks'
    }
  });
});

module.exports = router;

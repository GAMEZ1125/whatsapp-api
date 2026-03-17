/**
 * Rutas principales
 */

const express = require('express');
const router = express.Router();

const messageRoutes = require('./message.routes');
const sessionRoutes = require('./session.routes');
const contactRoutes = require('./contact.routes');
const webhookRoutes = require('./webhook.routes');
const apikeyRoutes = require('./apikey.routes');
const chatSessionRoutes = require('./chatSession.routes');
const whatsappConnectionRoutes = require('./whatsappConnection.routes');
const userRoutes = require('./user.routes');

// Rutas de la API
router.use('/messages', messageRoutes);
router.use('/session', sessionRoutes);
router.use('/contacts', contactRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/auth', apikeyRoutes);
router.use('/chat-sessions', chatSessionRoutes);
router.use('/whatsapp-connections', whatsappConnectionRoutes);
router.use('/users', userRoutes);

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
      webhooks: '/api/webhooks',
      auth: '/api/auth',
      chatSessions: '/api/chat-sessions'
    }
  });
});

module.exports = router;

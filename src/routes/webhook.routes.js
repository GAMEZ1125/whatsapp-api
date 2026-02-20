/**
 * Rutas de Webhooks
 * Permite registrar webhooks para recibir notificaciones de eventos
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const { apiKeyAuth } = require('../middlewares/auth');
const whatsappService = require('../services/whatsapp.service');
const logger = require('../config/logger');

// Almacenamiento en memoria de webhooks (en producción usar base de datos)
const webhooks = new Map();

/**
 * @swagger
 * /api/webhooks/register:
 *   post:
 *     summary: Registra un webhook para recibir eventos
 *     tags: [Webhooks]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *               - events
 *             properties:
 *               url:
 *                 type: string
 *                 description: URL del webhook
 *                 example: "https://tuapp.com/webhook"
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [message, qr, ready, disconnected, authenticated]
 *                 example: ["message", "ready"]
 *               secret:
 *                 type: string
 *                 description: Secreto para firmar las peticiones
 *     responses:
 *       201:
 *         description: Webhook registrado
 */
router.post('/register', 
  apiKeyAuth,
  [
    body('url').isURL().withMessage('URL inválida'),
    body('events').isArray({ min: 1 }).withMessage('Se requiere al menos un evento')
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { url, events, secret } = req.body;
    const webhookId = `wh_${Date.now()}`;

    webhooks.set(webhookId, {
      id: webhookId,
      url,
      events,
      secret,
      createdAt: new Date().toISOString(),
      active: true
    });

    // Registrar listeners para los eventos
    events.forEach(event => {
      whatsappService.on(event, async (data) => {
        try {
          const webhook = webhooks.get(webhookId);
          if (webhook && webhook.active) {
            await sendWebhookNotification(webhook, event, data);
          }
        } catch (error) {
          logger.error(`Error enviando webhook ${webhookId}:`, error);
        }
      });
    });

    res.status(201).json({
      success: true,
      message: 'Webhook registrado exitosamente',
      data: {
        webhookId,
        url,
        events
      }
    });
  }
);

/**
 * @swagger
 * /api/webhooks:
 *   get:
 *     summary: Lista todos los webhooks registrados
 *     tags: [Webhooks]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Lista de webhooks
 */
router.get('/', apiKeyAuth, (req, res) => {
  const webhookList = Array.from(webhooks.values()).map(wh => ({
    id: wh.id,
    url: wh.url,
    events: wh.events,
    active: wh.active,
    createdAt: wh.createdAt
  }));

  res.json({
    success: true,
    data: webhookList
  });
});

/**
 * @swagger
 * /api/webhooks/{id}:
 *   delete:
 *     summary: Elimina un webhook
 *     tags: [Webhooks]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook eliminado
 */
router.delete('/:id', apiKeyAuth, (req, res) => {
  const { id } = req.params;

  if (!webhooks.has(id)) {
    return res.status(404).json({
      success: false,
      error: 'Webhook no encontrado'
    });
  }

  webhooks.delete(id);

  res.json({
    success: true,
    message: 'Webhook eliminado exitosamente'
  });
});

/**
 * @swagger
 * /api/webhooks/{id}/toggle:
 *   post:
 *     summary: Activa o desactiva un webhook
 *     tags: [Webhooks]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado del webhook actualizado
 */
router.post('/:id/toggle', apiKeyAuth, (req, res) => {
  const { id } = req.params;

  if (!webhooks.has(id)) {
    return res.status(404).json({
      success: false,
      error: 'Webhook no encontrado'
    });
  }

  const webhook = webhooks.get(id);
  webhook.active = !webhook.active;
  webhooks.set(id, webhook);

  res.json({
    success: true,
    message: `Webhook ${webhook.active ? 'activado' : 'desactivado'}`,
    data: {
      id,
      active: webhook.active
    }
  });
});

/**
 * Envía una notificación al webhook
 */
async function sendWebhookNotification(webhook, event, data) {
  const fetch = (await import('node-fetch')).default;
  
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    data: serializeData(data)
  };

  const headers = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': event
  };

  // Agregar firma si hay secreto
  if (webhook.secret) {
    const crypto = require('crypto');
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    headers['X-Webhook-Signature'] = signature;
  }

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      timeout: 10000
    });

    logger.info(`Webhook enviado a ${webhook.url}: ${response.status}`);
  } catch (error) {
    logger.error(`Error en webhook ${webhook.url}:`, error.message);
  }
}

/**
 * Serializa los datos para enviar al webhook
 */
function serializeData(data) {
  if (!data) return null;
  
  // Si es un mensaje de WhatsApp
  if (data.body !== undefined && data.from !== undefined) {
    return {
      id: data.id?._serialized,
      from: data.from,
      to: data.to,
      body: data.body,
      timestamp: data.timestamp,
      type: data.type,
      isForwarded: data.isForwarded,
      hasMedia: data.hasMedia
    };
  }
  
  return data;
}

module.exports = router;

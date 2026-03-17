/**
 * Rutas de Gestión de Sesiones de Chat
 * Sistema multiagente con un solo número de WhatsApp
 */

const express = require('express');
const router = express.Router();
const chatSessionController = require('../controllers/chatSession.controller');
const { masterKeyAuth, chatSessionAuth } = require('../middlewares/auth');
const apikeyService = require('../services/apikey.service');
const chatSessionService = require('../services/chatSession.service');
const userService = require('../services/user.service');
const fs = require('fs');
const path = require('path');

/**
 * @swagger
 * tags:
 *   name: Chat Sessions
 *   description: Gestión de sesiones de agentes y asignación de chats
 */

// ==================== RUTAS DE ADMINISTRACIÓN (Master Key) ====================

/**
 * @swagger
 * /api/chat-sessions/sessions:
 *   post:
 *     summary: Crear una nueva sesión de agente
 *     description: Crea una sesión para un agente. Requiere Master Key.
 *     tags: [Chat Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - agentName
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nombre identificador de la sesión
 *                 example: "Soporte Técnico 1"
 *               agentName:
 *                 type: string
 *                 description: Nombre del agente
 *                 example: "Carlos Pérez"
 *               maxChats:
 *                 type: integer
 *                 description: Máximo de chats simultáneos
 *                 default: 10
 *                 example: 5
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["chat:read", "chat:write", "chat:transfer"]
 *     responses:
 *       201:
 *         description: Sesión creada exitosamente
 */
router.post('/sessions', chatSessionAuth, chatSessionController.createSession);

/**
 * @swagger
 * /api/chat-sessions/sessions:
 *   get:
 *     summary: Listar todas las sesiones
 *     tags: [Chat Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Lista de sesiones
 */
router.get('/sessions', chatSessionAuth, chatSessionController.listSessions);

/**
 * @swagger
 * /api/chat-sessions/sessions/{sessionId}:
 *   get:
 *     summary: Obtener una sesión por ID
 *     tags: [Chat Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Información de la sesión
 */
router.get('/sessions/:sessionId', chatSessionAuth, chatSessionController.getSession);

/**
 * @swagger
 * /api/chat-sessions/sessions/{sessionId}:
 *   put:
 *     summary: Actualizar una sesión
 *     tags: [Chat Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               agentName:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive, busy]
 *               maxChats:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Sesión actualizada
 */
router.put('/sessions/:sessionId', chatSessionAuth, chatSessionController.updateSession);

/**
 * @swagger
 * /api/chat-sessions/sessions/{sessionId}:
 *   delete:
 *     summary: Eliminar una sesión
 *     tags: [Chat Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sesión eliminada
 */
router.delete('/sessions/:sessionId', chatSessionAuth, chatSessionController.deleteSession);

/**
 * @swagger
 * /api/chat-sessions/sessions/{sessionId}/regenerate-key:
 *   post:
 *     summary: Regenerar API Key de una sesión
 *     tags: [Chat Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Nueva API Key generada
 */
router.post('/sessions/:sessionId/regenerate-key', chatSessionAuth, chatSessionController.regenerateSessionKey);

// ==================== RUTAS DE GESTIÓN DE CHATS (Master Key) ====================

/**
 * @swagger
 * /api/chat-sessions/chats/pending:
 *   get:
 *     summary: Obtener chats pendientes (sin asignar)
 *     tags: [Chat Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Lista de chats pendientes
 */
router.get('/chats/pending', chatSessionAuth, chatSessionController.getPendingChats);

/**
 * @swagger
 * /api/chat-sessions/chats:
 *   get:
 *     summary: Obtener todos los chats
 *     tags: [Chat Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, assigned, closed]
 *       - in: query
 *         name: sessionId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de chats
 */
router.get('/chats', chatSessionAuth, chatSessionController.getAllChats);

/**
 * @swagger
 * /api/chat-sessions/chats/assign:
 *   post:
 *     summary: Asignar un chat a una sesión
 *     tags: [Chat Sessions]
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
 *               - sessionId
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "573001234567"
 *               sessionId:
 *                 type: string
 *                 example: "ses_abc12345"
 *     responses:
 *       200:
 *         description: Chat asignado
 */
router.post('/chats/assign', chatSessionAuth, chatSessionController.assignChat);

/**
 * @swagger
 * /api/chat-sessions/chats/{phone}:
 *   get:
 *     summary: Obtener información de un chat
 *     tags: [Chat Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Información del chat
 */
router.get('/chats/:phone', chatSessionAuth, chatSessionController.getChatInfo);

/**
 * @swagger
 * /api/chat-sessions/chats/{phone}:
 *   put:
 *     summary: Actualizar información de un chat
 *     tags: [Chat Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               priority:
 *                 type: string
 *                 enum: [low, normal, high, urgent]
 *               customerName:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Chat actualizado
 */
router.put('/chats/:phone', chatSessionAuth, chatSessionController.updateChatInfo);

/**
 * @swagger
 * /api/chat-sessions/chats/{phone}/messages:
 *   get:
 *     summary: Obtener mensajes de un chat
 *     tags: [Chat Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Lista de mensajes
 */
router.get('/chats/:phone/messages', chatSessionAuth, chatSessionController.getChatMessages);

/**
 * @swagger
 * /api/chat-sessions/stats:
 *   get:
 *     summary: Obtener estadísticas generales
 *     tags: [Chat Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas de sesiones y chats
 */
router.get('/stats', chatSessionAuth, chatSessionController.getStats);
router.get('/quick-replies', chatSessionAuth, chatSessionController.getQuickReplies);
router.put('/quick-replies', chatSessionAuth, chatSessionController.updateQuickReplies);
router.get('/auto-chat-rules', chatSessionAuth, chatSessionController.getAutoChatRules);
router.put('/auto-chat-rules', chatSessionAuth, chatSessionController.updateAutoChatRules);
router.get('/stickers', chatSessionAuth, chatSessionController.getStickerPacks);
router.put('/stickers', chatSessionAuth, chatSessionController.updateStickerPacks);
router.post('/stickers/import-package', chatSessionAuth, chatSessionController.importStickerPackage);

// ==================== RUTAS PARA AGENTES (Session Key) ====================

/**
 * @swagger
 * /api/chat-sessions/agent/my-chats:
 *   get:
 *     summary: Obtener mis chats asignados (para agentes)
 *     description: Usa la API Key de sesión para obtener solo los chats asignados a tu sesión
 *     tags: [Chat Sessions - Agent]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [assigned, closed]
 *     responses:
 *       200:
 *         description: Lista de chats de la sesión
 */
router.get('/agent/my-chats', chatSessionAuth, chatSessionController.getMyChats);

/**
 * @swagger
 * /api/chat-sessions/agent/pending:
 *   get:
 *     summary: Ver chats pendientes disponibles (para agentes)
 *     tags: [Chat Sessions - Agent]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Lista de chats pendientes
 */
router.get('/agent/pending', chatSessionAuth, chatSessionController.getPendingChats);

/**
 * @swagger
 * /api/chat-sessions/agent/take:
 *   post:
 *     summary: Tomar un chat pendiente (auto-asignar)
 *     tags: [Chat Sessions - Agent]
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
 *     responses:
 *       200:
 *         description: Chat tomado
 */
router.post('/agent/take', chatSessionAuth, chatSessionController.takeChat);

/**
 * @swagger
 * /api/chat-sessions/agent/transfer:
 *   post:
 *     summary: Transferir chat a otra sesión
 *     tags: [Chat Sessions - Agent]
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
 *               - toSessionId
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "573001234567"
 *               toSessionId:
 *                 type: string
 *                 example: "ses_xyz789"
 *     responses:
 *       200:
 *         description: Chat transferido
 */
router.post('/agent/transfer', chatSessionAuth, chatSessionController.transferChat);

/**
 * @swagger
 * /api/chat-sessions/agent/close/{phone}:
 *   post:
 *     summary: Cerrar un chat
 *     tags: [Chat Sessions - Agent]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chat cerrado
 */
router.post('/agent/close/:phone', chatSessionAuth, chatSessionController.closeChat);

/**
 * @swagger
 * /api/chat-sessions/agent/chat/{phone}:
 *   get:
 *     summary: Obtener información de un chat (con control de acceso)
 *     tags: [Chat Sessions - Agent]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Información del chat
 *       403:
 *         description: No tienes acceso a este chat
 */
router.get('/agent/chat/:phone', chatSessionAuth, chatSessionController.getChatInfo);

/**
 * @swagger
 * /api/chat-sessions/agent/chat/{phone}/messages:
 *   get:
 *     summary: Obtener mensajes de un chat (con control de acceso)
 *     tags: [Chat Sessions - Agent]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Lista de mensajes
 *       403:
 *         description: No tienes acceso a este chat
 */
router.get('/agent/chat/:phone/messages', chatSessionAuth, chatSessionController.getChatMessages);

/**
 * @swagger
 * /api/chat-sessions/agent/send:
 *   post:
 *     summary: Enviar mensaje como agente (con control de acceso)
 *     description: Solo puedes enviar mensajes a chats que tengas asignados
 *     tags: [Chat Sessions - Agent]
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
 *                 example: "573001234567"
 *               message:
 *                 type: string
 *                 example: "Hola, ¿en qué puedo ayudarte?"
 *     responses:
 *       200:
 *         description: Mensaje enviado
 *       403:
 *         description: No tienes acceso a este chat
 */
router.post('/agent/send', chatSessionAuth, chatSessionController.sendMessageAsAgent);
router.post('/agent/send-media', chatSessionAuth, chatSessionController.sendMediaAsAgent);

// SSE stream para cambios en chats y mensajes (acepta apiKey por query o header)
router.get('/events', async (req, res) => {
  const apiKey = req.query.apiKey || req.headers['x-api-key'];
  const masterKey = process.env.API_KEY;

  const isMaster = masterKey && apiKey === masterKey;
  const session = apiKey ? chatSessionService.getSessionByApiKey(apiKey) : null;
  const user = apiKey ? await userService.getUserByApiKey(apiKey) : null;

  if (!apiKey || (!isMaster && !session && !user && !apikeyService.validateApiKey(apiKey))) {
    return res.status(401).end();
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  send({ type: 'hello', ts: Date.now() });

  const handler = (payload) => send(payload);
  chatSessionService.chatEvents.on('change', handler);

  const dataFile = path.join(__dirname, '../../data/chat-sessions.json');
  const watcher = fs.watch(dataFile, { persistent: false }, () => send({ type: 'file-change', ts: Date.now() }));

  const heartbeat = setInterval(() => send({ type: 'heartbeat', ts: Date.now() }), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    watcher.close();
    chatSessionService.chatEvents.off('change', handler);
  });
});

module.exports = router;




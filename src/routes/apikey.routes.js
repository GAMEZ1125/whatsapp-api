/**
 * Rutas de gestión de API Keys
 */

const express = require('express');
const router = express.Router();
const apikeyController = require('../controllers/apikey.controller');
const { apiKeyAuth, masterKeyAuth } = require('../middlewares/auth');

/**
 * @swagger
 * components:
 *   schemas:
 *     ApiKey:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: ID único de la API Key
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *         key:
 *           type: string
 *           description: La API Key (solo visible al crear)
 *           example: "wapi_a1b2c3d4e5f6..."
 *         name:
 *           type: string
 *           description: Nombre descriptivo
 *           example: "App Móvil Producción"
 *         description:
 *           type: string
 *           description: Descripción de uso
 *           example: "Key para la aplicación móvil en producción"
 *         permissions:
 *           type: array
 *           items:
 *             type: string
 *           description: Permisos asignados
 *           example: ["messages:send", "contacts:read"]
 *         active:
 *           type: boolean
 *           description: Estado de la key
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         lastUsedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         usageCount:
 *           type: integer
 *           example: 150
 */

/**
 * @swagger
 * /api/auth/keys:
 *   post:
 *     summary: Crear una nueva API Key
 *     description: |
 *       Genera una nueva API Key para acceder a la API.
 *       **IMPORTANTE**: La key completa solo se muestra una vez al crear. ¡Guárdala de forma segura!
 *     tags: [API Keys]
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
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nombre descriptivo para la key
 *                 example: "App Móvil"
 *               description:
 *                 type: string
 *                 description: Descripción del uso de la key
 *                 example: "API Key para la aplicación móvil"
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 description: Fecha de expiración (opcional)
 *                 example: "2025-12-31T23:59:59Z"
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Lista de permisos
 *                 example: ["*"]
 *     responses:
 *       201:
 *         description: API Key creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/ApiKey'
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 */
router.post('/keys', masterKeyAuth, apikeyController.createApiKey);

/**
 * @swagger
 * /api/auth/keys:
 *   get:
 *     summary: Listar todas las API Keys
 *     description: Obtiene la lista de todas las API Keys (las keys están parcialmente ocultas)
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Lista de API Keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ApiKey'
 *                 total:
 *                   type: integer
 */
router.get('/keys', masterKeyAuth, apikeyController.listApiKeys);

/**
 * @swagger
 * /api/auth/keys/{id}:
 *   get:
 *     summary: Obtener una API Key por ID
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la API Key
 *     responses:
 *       200:
 *         description: Información de la API Key
 *       404:
 *         description: API Key no encontrada
 */
router.get('/keys/:id', masterKeyAuth, apikeyController.getApiKey);

/**
 * @swagger
 * /api/auth/keys/{id}:
 *   put:
 *     summary: Actualizar una API Key
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               description:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: API Key actualizada
 *       404:
 *         description: API Key no encontrada
 */
router.put('/keys/:id', masterKeyAuth, apikeyController.updateApiKey);

/**
 * @swagger
 * /api/auth/keys/{id}/revoke:
 *   post:
 *     summary: Revocar una API Key
 *     description: Desactiva una API Key sin eliminarla
 *     tags: [API Keys]
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
 *         description: API Key revocada
 *       404:
 *         description: API Key no encontrada
 */
router.post('/keys/:id/revoke', masterKeyAuth, apikeyController.revokeApiKey);

/**
 * @swagger
 * /api/auth/keys/{id}/activate:
 *   post:
 *     summary: Activar una API Key
 *     description: Reactiva una API Key previamente revocada
 *     tags: [API Keys]
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
 *         description: API Key activada
 *       404:
 *         description: API Key no encontrada
 */
router.post('/keys/:id/activate', masterKeyAuth, apikeyController.activateApiKey);

/**
 * @swagger
 * /api/auth/keys/{id}/regenerate:
 *   post:
 *     summary: Regenerar una API Key
 *     description: |
 *       Genera una nueva key manteniendo el mismo ID y configuración.
 *       **IMPORTANTE**: La key anterior dejará de funcionar inmediatamente.
 *     tags: [API Keys]
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
 *         description: API Key regenerada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     key:
 *                       type: string
 *                       description: La nueva API Key
 *       404:
 *         description: API Key no encontrada
 */
router.post('/keys/:id/regenerate', masterKeyAuth, apikeyController.regenerateApiKey);

/**
 * @swagger
 * /api/auth/keys/{id}:
 *   delete:
 *     summary: Eliminar una API Key
 *     description: Elimina permanentemente una API Key
 *     tags: [API Keys]
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
 *         description: API Key eliminada
 *       404:
 *         description: API Key no encontrada
 */
router.delete('/keys/:id', masterKeyAuth, apikeyController.deleteApiKey);

module.exports = router;

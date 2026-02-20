/**
 * Controlador de Contactos
 * @swagger
 * tags:
 *   name: Contacts
 *   description: Información de contactos
 */

const whatsappService = require('../services/whatsapp.service');

/**
 * @swagger
 * /api/contacts/check/{phone}:
 *   get:
 *     summary: Verifica si un número está registrado en WhatsApp
 *     tags: [Contacts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *         description: Número de teléfono con código de país
 *         example: "573001234567"
 *     responses:
 *       200:
 *         description: Resultado de la verificación
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
 *                     phone:
 *                       type: string
 *                     isRegistered:
 *                       type: boolean
 */
const checkNumber = async (req, res, next) => {
  try {
    const { phone } = req.params;
    
    const isRegistered = await whatsappService.isRegistered(phone);
    
    res.json({
      success: true,
      data: {
        phone,
        isRegistered
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/contacts/check-bulk:
 *   post:
 *     summary: Verifica múltiples números
 *     tags: [Contacts]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phones:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["573001234567", "573009876543"]
 *     responses:
 *       200:
 *         description: Resultados de verificación
 */
const checkBulkNumbers = async (req, res, next) => {
  try {
    const { phones } = req.body;
    
    const results = [];
    
    for (const phone of phones) {
      try {
        const isRegistered = await whatsappService.isRegistered(phone);
        results.push({ phone, isRegistered });
      } catch (error) {
        results.push({ phone, isRegistered: false, error: error.message });
      }
    }
    
    const registered = results.filter(r => r.isRegistered).length;
    
    res.json({
      success: true,
      data: {
        total: phones.length,
        registered,
        notRegistered: phones.length - registered,
        results
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/contacts/info/{phone}:
 *   get:
 *     summary: Obtiene información de un contacto
 *     tags: [Contacts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *         example: "573001234567"
 *     responses:
 *       200:
 *         description: Información del contacto
 */
const getContactInfo = async (req, res, next) => {
  try {
    const { phone } = req.params;
    
    const info = await whatsappService.getContactInfo(phone);
    
    res.json({
      success: true,
      data: info
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  checkNumber,
  checkBulkNumbers,
  getContactInfo
};

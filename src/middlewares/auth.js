/**
 * Middleware de Autenticación
 */

const logger = require('../config/logger');

/**
 * Verifica la API Key en los headers
 */
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.API_KEY;

  // Si no hay API_KEY configurada, permitir en desarrollo
  if (!validApiKey && process.env.NODE_ENV === 'development') {
    logger.warn('⚠️ API Key no configurada - Modo desarrollo');
    return next();
  }

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API Key requerida',
      code: 'MISSING_API_KEY'
    });
  }

  if (apiKey !== validApiKey) {
    logger.warn(`Intento de acceso con API Key inválida: ${apiKey.substring(0, 8)}...`);
    return res.status(403).json({
      success: false,
      error: 'API Key inválida',
      code: 'INVALID_API_KEY'
    });
  }

  next();
};

/**
 * Middleware opcional para rutas públicas
 */
const optionalAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (apiKey) {
    return apiKeyAuth(req, res, next);
  }
  
  next();
};

module.exports = {
  apiKeyAuth,
  optionalAuth
};

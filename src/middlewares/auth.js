/**
 * Middleware de Autenticación
 * Soporta múltiples API Keys (master key del .env + keys generadas)
 */

const logger = require('../config/logger');
const apikeyService = require('../services/apikey.service');

/**
 * Verifica la API Key en los headers
 * Soporta tanto la master key del .env como las keys generadas
 */
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  // Si no hay API_KEY configurada en .env, permitir en desarrollo
  if (!process.env.API_KEY && process.env.NODE_ENV === 'development') {
    logger.warn('⚠️ API Key no configurada - Modo desarrollo');
    req.apiKeyInfo = { isMaster: true, permissions: ['*'] };
    return next();
  }

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API Key requerida',
      code: 'MISSING_API_KEY'
    });
  }

  // Validar la API Key (master o generada)
  const keyInfo = apikeyService.validateApiKey(apiKey);

  if (!keyInfo) {
    logger.warn(`Intento de acceso con API Key inválida: ${apiKey.substring(0, 8)}...`);
    return res.status(403).json({
      success: false,
      error: 'API Key inválida o expirada',
      code: 'INVALID_API_KEY'
    });
  }

  // Agregar info de la key al request
  req.apiKeyInfo = keyInfo;
  next();
};

/**
 * Middleware que solo permite la Master Key (del .env)
 * Usado para operaciones sensibles como gestión de API Keys
 */
const masterKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const masterKey = process.env.API_KEY;

  // En desarrollo sin master key configurada, permitir
  if (!masterKey && process.env.NODE_ENV === 'development') {
    logger.warn('⚠️ Master Key no configurada - Modo desarrollo');
    req.apiKeyInfo = { isMaster: true, permissions: ['*'] };
    return next();
  }

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API Key requerida',
      code: 'MISSING_API_KEY'
    });
  }

  if (apiKey !== masterKey) {
    logger.warn(`Intento de acceso a ruta protegida sin Master Key`);
    return res.status(403).json({
      success: false,
      error: 'Se requiere la Master Key para esta operación',
      code: 'MASTER_KEY_REQUIRED'
    });
  }

  req.apiKeyInfo = { isMaster: true, permissions: ['*'] };
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

/**
 * Middleware para verificar permisos específicos
 * @param {string|Array} requiredPermissions - Permiso(s) requerido(s)
 */
const requirePermission = (requiredPermissions) => {
  return (req, res, next) => {
    const keyInfo = req.apiKeyInfo;

    if (!keyInfo) {
      return res.status(401).json({
        success: false,
        error: 'No autenticado',
        code: 'NOT_AUTHENTICATED'
      });
    }

    // Master key tiene todos los permisos
    if (keyInfo.isMaster || keyInfo.permissions.includes('*')) {
      return next();
    }

    const permissions = Array.isArray(requiredPermissions) 
      ? requiredPermissions 
      : [requiredPermissions];

    const hasPermission = permissions.some(p => keyInfo.permissions.includes(p));

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'Permisos insuficientes',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: permissions
      });
    }

    next();
  };
};

module.exports = {
  apiKeyAuth,
  masterKeyAuth,
  optionalAuth,
  requirePermission
};

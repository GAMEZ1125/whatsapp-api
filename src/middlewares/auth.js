/**
 * Middleware de Autenticación
 * Soporta múltiples API Keys (master key del .env + keys generadas + sesiones de chat)
 */

const logger = require('../config/logger');
const apikeyService = require('../services/apikey.service');
const chatSessionService = require('../services/chatSession.service');

/**
 * Verifica la API Key en los headers
 * Soporta tanto la master key del .env como las keys generadas y keys de usuarios
 */
const apiKeyAuth = async (req, res, next) => {
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

  // 1. Validar la API Key (master o generada por apikeyService)
  let keyInfo = await apikeyService.validateApiKey(apiKey);

  // 2. Si no es una key del servicio de apikeys, buscar en la tabla de Usuarios
  if (!keyInfo) {
    try {
      const userService = require('../services/user.service');
      const user = await userService.getUserByApiKey(apiKey);

      if (user) {
        keyInfo = {
          id: user.id,
          name: user.name,
          role: user.role,
          clientId: user.clientId,
          permissions: (user.role === 'superadmin' || user.role === 'admin' || user.role === 'supervisor') ? ['*'] : ['chat:read', 'chat:write'],
          isUser: true
        };
      }
    } catch (error) {
      logger.error('Error validando API Key de usuario:', error);
    }
  }

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
  if (keyInfo.clientId) {
    req.user = { role: keyInfo.role || 'admin', clientId: keyInfo.clientId };
  }
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
    logger.warn(`Intento de acceso a ruta protegida sin Master Key: ${req.method} ${req.originalUrl}`);
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
 * Middleware para autenticación de sesiones de chat (agentes)
 * Acepta tanto Master Key como User Key (Supervisor/Admin) como Session Key
 */
const chatSessionAuth = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const masterKey = process.env.API_KEY;

  // En desarrollo sin master key configurada, permitir
  if (!masterKey && process.env.NODE_ENV === 'development') {
    logger.warn('⚠️ Modo desarrollo - Sin autenticación');
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

  // 1. Verificar si es Master Key
  if (apiKey === masterKey) {
    req.apiKeyInfo = { isMaster: true, permissions: ['*'] };
    return next();
  }

  // 2. Verificar si es una Session Key (Agente tradicional)
  const session = chatSessionService.getSessionByApiKey(apiKey);

  if (session) {
    if (session.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'La sesión no está activa',
        code: 'SESSION_INACTIVE'
      });
    }

    req.chatSession = session;
    req.apiKeyInfo = {
      isSession: true,
      sessionId: session.id,
      permissions: session.permissions
    };
    return next();
  }

  // 3. Verificar si es una User Key (Admin/Supervisor)
  try {
    const userService = require('../services/user.service');
    const user = await userService.getUserByApiKey(apiKey);

    if (user) {
      req.apiKeyInfo = {
        id: user.id,
        name: user.name,
        role: user.role,
        clientId: user.clientId,
        permissions: (user.role === 'superadmin' || user.role === 'admin' || user.role === 'supervisor') ? ['*'] : ['chat:read'],
        isUser: true
      };
      req.user = { role: user.role, clientId: user.clientId };
      return next();
    }
  } catch (error) {
    logger.error('Error validando API Key en chatSessionAuth:', error);
  }

  // No es ninguna key válida
  logger.warn(`Intento de acceso con key inválida: ${apiKey.substring(0, 8)}...`);
  return res.status(403).json({
    success: false,
    error: 'API Key o Session Key inválida',
    code: 'INVALID_KEY'
  });
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
  chatSessionAuth,
  optionalAuth,
  requirePermission
};

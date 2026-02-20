/**
 * Middleware de manejo de errores
 */

const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('Error:', err);

  // Error de validación
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Error de validación',
      details: err.message
    });
  }

  // Error de WhatsApp
  if (err.message && err.message.includes('WhatsApp')) {
    return res.status(503).json({
      success: false,
      error: err.message,
      code: 'WHATSAPP_ERROR'
    });
  }

  // Error por defecto
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Error interno del servidor' 
    : err.message;

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

module.exports = errorHandler;

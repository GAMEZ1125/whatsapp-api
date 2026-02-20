/**
 * Validadores de entrada
 */

const { body, param, validationResult } = require('express-validator');

/**
 * Maneja los errores de validación
 */
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Error de validación',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  
  next();
};

/**
 * Validación para envío de mensaje de texto
 */
const validateSendMessage = [
  body('phone')
    .notEmpty().withMessage('El número de teléfono es requerido')
    .isString().withMessage('El número debe ser una cadena')
    .matches(/^\d{10,15}$/).withMessage('Formato de número inválido (10-15 dígitos)'),
  body('message')
    .notEmpty().withMessage('El mensaje es requerido')
    .isString().withMessage('El mensaje debe ser una cadena')
    .isLength({ min: 1, max: 4096 }).withMessage('El mensaje debe tener entre 1 y 4096 caracteres'),
  handleValidation
];

/**
 * Validación para envío de imagen
 */
const validateSendImage = [
  body('phone')
    .notEmpty().withMessage('El número de teléfono es requerido')
    .matches(/^\d{10,15}$/).withMessage('Formato de número inválido'),
  body('imageUrl')
    .optional()
    .isURL().withMessage('URL de imagen inválida'),
  body('base64')
    .optional()
    .isString().withMessage('El base64 debe ser una cadena'),
  body('mimetype')
    .if(body('base64').exists())
    .notEmpty().withMessage('El mimetype es requerido cuando se envía base64'),
  body('caption')
    .optional()
    .isString().withMessage('El caption debe ser una cadena')
    .isLength({ max: 1024 }).withMessage('El caption no puede exceder 1024 caracteres'),
  handleValidation
];

/**
 * Validación para envío de documento
 */
const validateSendDocument = [
  body('phone')
    .notEmpty().withMessage('El número de teléfono es requerido')
    .matches(/^\d{10,15}$/).withMessage('Formato de número inválido'),
  body('documentUrl')
    .notEmpty().withMessage('La URL del documento es requerida')
    .isURL().withMessage('URL de documento inválida'),
  body('filename')
    .notEmpty().withMessage('El nombre del archivo es requerido')
    .isString().withMessage('El nombre debe ser una cadena'),
  body('caption')
    .optional()
    .isString().withMessage('El caption debe ser una cadena'),
  handleValidation
];

/**
 * Validación para envío masivo
 */
const validateBulkMessage = [
  body('recipients')
    .isArray({ min: 1, max: 100 }).withMessage('Se requiere un array de 1 a 100 destinatarios'),
  body('recipients.*')
    .matches(/^\d{10,15}$/).withMessage('Formato de número inválido en destinatarios'),
  body('message')
    .notEmpty().withMessage('El mensaje es requerido')
    .isLength({ min: 1, max: 4096 }).withMessage('Mensaje entre 1 y 4096 caracteres'),
  body('delay')
    .optional()
    .isInt({ min: 1000, max: 10000 }).withMessage('Delay entre 1000 y 10000 ms'),
  handleValidation
];

/**
 * Validación de número de teléfono
 */
const validatePhone = [
  param('phone')
    .matches(/^\d{10,15}$/).withMessage('Formato de número inválido'),
  handleValidation
];

module.exports = {
  validateSendMessage,
  validateSendImage,
  validateSendDocument,
  validateBulkMessage,
  validatePhone,
  handleValidation
};

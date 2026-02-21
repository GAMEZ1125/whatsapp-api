/**
 * WhatsApp API Engine
 * Motor de envío de mensajes por WhatsApp
 * 
 * @author API Engine
 * @version 1.0.0
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const logger = require('./config/logger');
const swaggerSetup = require('./config/swagger');
const whatsappService = require('./services/whatsapp.service');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares de seguridad
// Configuración de Helmet menos restrictiva para HTTP
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  originAgentCluster: false
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    error: 'Demasiadas solicitudes, por favor intenta más tarde'
  }
});
app.use('/api/', limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Documentación Swagger
swaggerSetup(app);

// Rutas
app.use('/api', routes);

// Ruta de salud
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    whatsapp: whatsappService.getStatus()
  });
});

// Manejador de errores
app.use(errorHandler);

// Ruta no encontrada
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Ruta no encontrada'
  });
});

// Iniciar servidor
const startServer = async () => {
  try {
    // Inicializar WhatsApp
    logger.info('Iniciando servicio de WhatsApp...');
    await whatsappService.initialize();

    app.listen(PORT, () => {
      logger.info(`🚀 Servidor corriendo en http://localhost:${PORT}`);
      logger.info(`📚 Documentación disponible en http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    logger.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

// Manejo de señales de cierre
process.on('SIGINT', async () => {
  logger.info('Cerrando servidor...');
  await whatsappService.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Cerrando servidor...');
  await whatsappService.destroy();
  process.exit(0);
});

startServer();

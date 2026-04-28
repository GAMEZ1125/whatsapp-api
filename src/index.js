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
const apikeyService = require('./services/apikey.service');
const userService = require('./services/user.service');
const chatSessionService = require('./services/chatSession.service');
const whatsappConnectionService = require('./services/whatsappConnection.service');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;
const eagerWhatsAppInit = String(process.env.WHATSAPP_EAGER_INIT || 'false').toLowerCase() === 'true';
let autoChatTimer = null;
const allowedOriginsRaw = String(process.env.ALLOWED_ORIGINS || '*').trim();
const allowAnyOrigin = !allowedOriginsRaw || allowedOriginsRaw === '*';
const allowedOrigins = allowAnyOrigin
  ? []
  : allowedOriginsRaw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Permite requests sin Origin, como llamadas servidor-servidor o health checks.
    if (!origin || allowAnyOrigin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
};

// Middlewares de seguridad
// Configuración de Helmet menos restrictiva para HTTP
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  originAgentCluster: false
}));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Rate limiting
const rateLimitExemptPaths = new Set([
  '/api/chat-sessions/events',
  '/api/session/status',
  '/api/session/qr',
  '/api/session/qr/image',
]);

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  skip: (req) => rateLimitExemptPaths.has(req.path),
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
app.get('/health', async (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    whatsapp: await whatsappService.getVisibleStatus({ isMaster: true })
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
    // Inicializar servicios
    logger.info('Iniciando servicio de WhatsApp...');
    await apikeyService.initialize();
    await whatsappConnectionService.initialize();
    if (eagerWhatsAppInit) {
      logger.info('Inicializacion eager de conexiones WhatsApp habilitada por entorno.');
      await whatsappService.initialize();
    } else {
      logger.info('Inicializacion eager de conexiones WhatsApp deshabilitada. Se inicializan bajo demanda.');
    }
    await userService.initialize();
    autoChatTimer = setInterval(async () => {
      try {
        await chatSessionService.runAutoChatRules((phone, message, options = {}) =>
          whatsappService.sendMessage(phone, message, options)
        );
      } catch (automationError) {
        logger.error('Error ejecutando automatizaciones de chat:', automationError);
      }
    }, 60 * 1000);

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
  if (autoChatTimer) clearInterval(autoChatTimer);
  await whatsappService.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Cerrando servidor...');
  if (autoChatTimer) clearInterval(autoChatTimer);
  await whatsappService.destroy();
  process.exit(0);
});

startServer();

/**
 * Configuración de Swagger para documentación de API
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WhatsApp API Engine',
      version: '1.0.0',
      description: `
        Motor de envío de mensajes por WhatsApp.
        
        Esta API permite enviar mensajes de texto, imágenes, documentos y más a través de WhatsApp.
        
        ## Autenticación
        Todas las solicitudes requieren un header \`X-API-Key\` con tu clave de API.
        
        ## Rate Limiting
        - 100 solicitudes por 15 minutos por IP
        
        ## Formato de números
        Los números de teléfono deben incluir el código de país sin el signo '+'.
        Ejemplo: 573001234567 (Colombia)
      `,
      contact: {
        name: 'Soporte API',
        email: 'soporte@tudominio.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Servidor de desarrollo'
      },
      {
        url: 'https://api.tudominio.com',
        description: 'Servidor de producción'
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API Key para autenticación'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string',
              example: 'Descripción del error'
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string'
            },
            data: {
              type: 'object'
            }
          }
        }
      }
    },
    security: [
      {
        ApiKeyAuth: []
      }
    ]
  },
  apis: ['./src/routes/*.js', './src/controllers/*.js']
};

const specs = swaggerJsdoc(options);

module.exports = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'WhatsApp API - Documentación'
  }));
};

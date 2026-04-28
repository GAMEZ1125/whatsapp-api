/**
 * Configuración de Swagger para documentación de API
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const configuredBaseUrl = process.env.APP_BASE_URL?.trim();
const servers = configuredBaseUrl
  ? [
      {
        url: configuredBaseUrl,
        description: 'Servidor desplegado'
      },
      {
        url: 'http://localhost:3000',
        description: 'Servidor local (Desarrollo)'
      }
    ]
  : [
      {
        url: 'http://gamez-solutions.ddns.net:3000',
        description: 'Servidor DDNS (Producción)'
      },
      {
        url: 'http://localhost:3000',
        description: 'Servidor local (Desarrollo)'
      }
    ];

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
        
        ### Tipos de API Keys:
        - **Master Key**: Configurada en el servidor (.env), tiene acceso total incluyendo gestión de otras API Keys.
        - **API Keys generadas**: Creadas desde \`/api/auth/keys\`, pueden tener permisos específicos.
        
        ## Rate Limiting
        - 100 solicitudes por 15 minutos por IP
        
        ## Formato de números
        Los números de teléfono deben incluir el código de país sin el signo '+'.
        Ejemplo: 573001234567 (Colombia)
      `,
      contact: {
        name: 'Soporte API',
        email: 'soporte@gamez-solutions.com'
      }
    },
    servers,
    tags: [
      {
        name: 'Session',
        description: 'Gestión de la sesión de WhatsApp (QR, estado, perfil)'
      },
      {
        name: 'Messages',
        description: 'Envío de mensajes de texto, imágenes y documentos'
      },
      {
        name: 'Contacts',
        description: 'Verificación e información de contactos'
      },
      {
        name: 'Webhooks',
        description: 'Registro y gestión de webhooks para eventos'
      },
      {
        name: 'API Keys',
        description: 'Gestión de API Keys (crear, listar, revocar)'
      },
      {
        name: 'Chat Sessions',
        description: 'Gestión de sesiones de agentes (Admin). Crear sesiones, asignar chats, estadísticas.'
      },
      {
        name: 'Chat Sessions - Agent',
        description: 'Endpoints para agentes. Ver/tomar chats, enviar mensajes, transferir conversaciones.'
      }
      ,
      {
        name: 'Users',
        description: 'Gestión de usuarios, roles, asignaciones y llaves de acceso.'
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API Key para autenticación. Usar la Master Key para gestión de API Keys.'
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
            },
            code: {
              type: 'string',
              example: 'ERROR_CODE'
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
        },
        MessageResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              example: 'Mensaje enviado exitosamente'
            },
            data: {
              type: 'object',
              properties: {
                messageId: {
                  type: 'string',
                  example: '550e8400-e29b-41d4-a716-446655440000'
                },
                whatsappId: {
                  type: 'string',
                  example: 'true_573001234567@c.us_3EB0...'
                },
                phone: {
                  type: 'string',
                  example: '573001234567'
                },
                status: {
                  type: 'string',
                  example: 'sent'
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time'
                }
              }
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            name: {
              type: 'string'
            },
            email: {
              type: 'string',
              format: 'email'
            },
            role: {
              type: 'string'
            },
            status: {
              type: 'string'
            },
            apiKey: {
              type: 'string'
            },
            clientName: {
              type: 'string'
            },
            chatsAssigned: {
              type: 'integer'
            },
            lastActivity: {
              type: 'string',
              format: 'date-time'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        UserList: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/User'
              }
            },
            pagination: {
              type: 'object',
              properties: {
                total: {
                  type: 'integer'
                },
                page: {
                  type: 'integer'
                },
                limit: {
                  type: 'integer'
                }
              }
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
    customSiteTitle: 'WhatsApp API - Documentación',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true
    }
  }));
};

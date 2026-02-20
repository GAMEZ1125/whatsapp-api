# 📱 WhatsApp API Engine

Motor de envío de mensajes por WhatsApp - API REST profesional y escalable.

## 🚀 Características

- ✅ Envío de mensajes de texto
- ✅ Envío de imágenes (URL o Base64)
- ✅ Envío de documentos
- ✅ Envío masivo de mensajes
- ✅ Verificación de números en WhatsApp
- ✅ Gestión de sesión (QR, estado, logout)
- ✅ Sistema de Webhooks para eventos
- ✅ Autenticación por API Key
- ✅ Rate limiting
- ✅ Documentación Swagger
- ✅ Logging completo

## 📋 Requisitos

- Node.js >= 18.0.0
- npm o yarn
- Google Chrome o Chromium (para puppeteer)

## 🛠️ Instalación

```bash
# Clonar o copiar el proyecto
cd whatsapp-api

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env

# Editar .env con tus configuraciones
```

## ⚙️ Configuración

Edita el archivo `.env`:

```env
PORT=3000
NODE_ENV=development
API_KEY=tu-api-key-segura
SESSION_NAME=mi-sesion
```

## 🚀 Ejecución

```bash
# Modo desarrollo (con hot reload)
npm run dev

# Modo producción
npm start
```

## 📖 Documentación API

Una vez iniciado el servidor, accede a:
- **Swagger UI**: http://localhost:3000/api-docs
- **Health Check**: http://localhost:3000/health

## 🔐 Autenticación

Todas las solicitudes requieren el header `X-API-Key`:

```bash
curl -X GET http://localhost:3000/api/session/status \
  -H "X-API-Key: tu-api-key"
```

## 📡 Endpoints Principales

### Sesión

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/session/status` | Estado de la conexión |
| GET | `/api/session/qr` | Obtener código QR (base64) |
| GET | `/api/session/qr/image` | Obtener QR como imagen |
| GET | `/api/session/profile` | Información del perfil |
| POST | `/api/session/logout` | Cerrar sesión |
| POST | `/api/session/restart` | Reiniciar conexión |

### Mensajes

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/messages/send` | Enviar mensaje de texto |
| POST | `/api/messages/send-image` | Enviar imagen |
| POST | `/api/messages/send-document` | Enviar documento |
| POST | `/api/messages/send-bulk` | Envío masivo |

### Contactos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/contacts/check/:phone` | Verificar número |
| POST | `/api/contacts/check-bulk` | Verificar varios números |
| GET | `/api/contacts/info/:phone` | Info de contacto |

### Webhooks

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/webhooks/register` | Registrar webhook |
| GET | `/api/webhooks` | Listar webhooks |
| DELETE | `/api/webhooks/:id` | Eliminar webhook |
| POST | `/api/webhooks/:id/toggle` | Activar/desactivar |

## 📱 Ejemplos de Uso

### Enviar mensaje de texto

```javascript
// JavaScript/Node.js
const response = await fetch('http://localhost:3000/api/messages/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'tu-api-key'
  },
  body: JSON.stringify({
    phone: '573001234567',
    message: 'Hola, este es un mensaje de prueba'
  })
});

const data = await response.json();
console.log(data);
```

### Enviar imagen

```javascript
const response = await fetch('http://localhost:3000/api/messages/send-image', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'tu-api-key'
  },
  body: JSON.stringify({
    phone: '573001234567',
    imageUrl: 'https://ejemplo.com/imagen.jpg',
    caption: 'Mira esta imagen'
  })
});
```

### Python

```python
import requests

url = "http://localhost:3000/api/messages/send"
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "tu-api-key"
}
payload = {
    "phone": "573001234567",
    "message": "Hola desde Python!"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())
```

### PHP

```php
<?php
$url = 'http://localhost:3000/api/messages/send';
$data = [
    'phone' => '573001234567',
    'message' => 'Hola desde PHP!'
];

$options = [
    'http' => [
        'method' => 'POST',
        'header' => [
            'Content-Type: application/json',
            'X-API-Key: tu-api-key'
        ],
        'content' => json_encode($data)
    ]
];

$context = stream_context_create($options);
$response = file_get_contents($url, false, $context);
echo $response;
```

### cURL

```bash
curl -X POST http://localhost:3000/api/messages/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: tu-api-key" \
  -d '{"phone":"573001234567","message":"Hola desde cURL!"}'
```

## 🔔 Webhooks

Registra un webhook para recibir notificaciones:

```javascript
await fetch('http://localhost:3000/api/webhooks/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'tu-api-key'
  },
  body: JSON.stringify({
    url: 'https://tuapp.com/webhook',
    events: ['message', 'ready', 'disconnected'],
    secret: 'mi-secreto-para-firmar'
  })
});
```

Eventos disponibles:
- `qr` - Nuevo código QR generado
- `ready` - Cliente listo
- `authenticated` - Autenticación exitosa
- `disconnected` - Desconectado
- `message` - Mensaje recibido

## 🐳 Docker (Opcional)

```dockerfile
FROM node:18-slim

# Instalar dependencias de Chrome
RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 3000
CMD ["npm", "start"]
```

## 📝 Notas Importantes

1. **Primer inicio**: Al iniciar por primera vez, se generará un código QR. Escanéalo con WhatsApp.

2. **Sesión persistente**: La sesión se guarda en `.wwebjs_auth/`. No borres esta carpeta para mantener la sesión.

3. **Rate limiting**: Por defecto, 100 solicitudes cada 15 minutos por IP.

4. **Envío masivo**: Usa delays entre mensajes para evitar bloqueos de WhatsApp.

5. **Formato de teléfono**: Incluye código de país sin '+' (ej: 573001234567).

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor, abre un issue primero para discutir cambios mayores.

## 📄 Licencia

MIT License

# WhatsApp API Engine

API REST para integrar WhatsApp en multiples proyectos dentro del mismo entorno, con aislamiento por tenant mediante `clientId`, conexiones dedicadas y API keys separadas.

## Que resuelve esta version

- Una sola instancia de la API puede atender varios clientes.
- Cada tenant usa su propia `API Key`.
- Cada tenant puede tener una o varias conexiones de WhatsApp.
- Las operaciones quedan limitadas al `clientId` autenticado.
- La `Master Key` sigue existiendo para aprovisionamiento global.

## Arquitectura multitenant

- `Master Key`:
  administra tenants, API keys y conexiones de cualquier cliente.
- `Tenant API Key`:
  solo puede operar sobre los recursos asociados a su `clientId`.
- `Users API Key`:
  reutiliza el mismo aislamiento por tenant para consola interna, supervisores o agentes.

## Flujo recomendado para integrar un nuevo proyecto

1. Crear o identificar el registro del cliente en la tabla `clients`.
2. Generar una `API Key` dedicada para ese `clientId`.
3. Crear al menos una conexion de WhatsApp para ese mismo `clientId`.
4. Escanear el QR de la conexion.
5. Consumir la API desde el proyecto externo usando solo esa `API Key`.

## Requisitos

- Node.js 18+
- MySQL
- Google Chrome o Chromium

## Instalacion

```bash
npm install
copy .env.example .env
```

## Variables de entorno

```env
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=*

API_KEY=tu-master-key-segura

DB_HOST=localhost
DB_PORT=3306
DB_NAME=api_whatsapp
DB_USER=root
DB_PASSWORD=
DB_POOL_LIMIT=10

HEADLESS=true
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
```

## Ejecucion

```bash
npm run dev
```

Swagger:

- `http://localhost:3000/api-docs`

Health:

- `http://localhost:3000/health`

## Aprovisionar un tenant nuevo

### 1. Crear API key del tenant

Usa la `Master Key`.

```bash
curl -X POST http://localhost:3000/api/auth/keys ^
  -H "Content-Type: application/json" ^
  -H "X-API-Key: TU_MASTER_KEY" ^
  -d "{\"name\":\"ERP Produccion\",\"description\":\"Integracion tenant Acme\",\"clientId\":\"CLIENT_ID_ACME\",\"permissions\":[\"*\"]}"
```

Respuesta esperada:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "key": "wapi_..."
  }
}
```

Guarda esa key. No se debe compartir entre tenants.

### 2. Crear conexion de WhatsApp para ese tenant

Puedes hacerlo con la `Master Key` o con una key autenticada de ese tenant.

```bash
curl -X POST http://localhost:3000/api/whatsapp-connections ^
  -H "Content-Type: application/json" ^
  -H "X-API-Key: TU_MASTER_KEY" ^
  -d "{\"clientId\":\"CLIENT_ID_ACME\",\"phone\":\"573001234567\",\"sessionName\":\"acme-main\"}"
```

### 3. Obtener QR y vincular la cuenta

```bash
curl "http://localhost:3000/api/session/qr?connectionId=CONNECTION_ID_ACME" ^
  -H "X-API-Key: TU_API_KEY_DEL_TENANT"
```

### 4. Verificar estado

```bash
curl "http://localhost:3000/api/session/status?connectionId=CONNECTION_ID_ACME" ^
  -H "X-API-Key: TU_API_KEY_DEL_TENANT"
```

## Integracion desde otros proyectos

Cada proyecto externo solo necesita:

- URL base de esta API
- `X-API-Key` del tenant
- Opcionalmente `connectionId` si el tenant tiene varias lineas

### Ejemplo Node.js

```javascript
const response = await fetch('http://localhost:3000/api/messages/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.WHATSAPP_TENANT_API_KEY
  },
  body: JSON.stringify({
    phone: '573001234567',
    message: 'Hola desde otro sistema',
    connectionId: 'CONNECTION_ID_ACME'
  })
});

const data = await response.json();
console.log(data);
```

### Ejemplo PHP

```php
<?php
$payload = [
  'phone' => '573001234567',
  'message' => 'Hola desde PHP',
  'connectionId' => 'CONNECTION_ID_ACME'
];

$options = [
  'http' => [
    'method' => 'POST',
    'header' => [
      'Content-Type: application/json',
      'X-API-Key: ' . getenv('WHATSAPP_TENANT_API_KEY')
    ],
    'content' => json_encode($payload)
  ]
];

$context = stream_context_create($options);
$response = file_get_contents('http://localhost:3000/api/messages/send', false, $context);
echo $response;
```

### Ejemplo Python

```python
import os
import requests

response = requests.post(
    "http://localhost:3000/api/messages/send",
    headers={
        "Content-Type": "application/json",
        "X-API-Key": os.environ["WHATSAPP_TENANT_API_KEY"],
    },
    json={
        "phone": "573001234567",
        "message": "Hola desde Python",
        "connectionId": "CONNECTION_ID_ACME",
    },
)

print(response.json())
```

## Reglas de aislamiento

- Un tenant no puede consultar conexiones de otro tenant.
- Un tenant no puede usar `clientId` de otro cliente en `query` o `body`.
- Un tenant no puede reiniciar, cerrar sesion o pedir QR de una conexion ajena.
- Las rutas de usuarios quedan filtradas por `clientId`.

## Endpoints clave para integracion

### Sesion

- `GET /api/session/status`
- `GET /api/session/qr`
- `GET /api/session/profile`
- `POST /api/session/logout`
- `POST /api/session/restart`

### Mensajes

- `POST /api/messages/send`
- `POST /api/messages/send-image`
- `POST /api/messages/send-document`
- `POST /api/messages/send-bulk`

### Contactos

- `GET /api/contacts/check/:phone`
- `POST /api/contacts/check-bulk`
- `GET /api/contacts/info/:phone`

### Administracion multitenant

- `POST /api/auth/keys`
- `GET /api/auth/keys`
- `POST /api/whatsapp-connections`
- `GET /api/whatsapp-connections`
- `GET /api/whatsapp-connections/admin-config`

## Recomendaciones para nuevos proyectos

- Guarda la `API Key` del tenant en variables de entorno del proyecto consumidor.
- Si el tenant tiene varias lineas, define un `connectionId` fijo por flujo de negocio.
- No uses la `Master Key` desde apps cliente.
- Si expones esta API por internet, restringe `ALLOWED_ORIGINS` y protege la infraestructura.

## Despliegue en Heroku

Base tecnica del deploy:

- `Procfile`: `web: npm start`
- Node fijado a `24.x`
- Chrome configurable con `PUPPETEER_EXECUTABLE_PATH`

Pasos con Heroku CLI:

```bash
heroku login
heroku create tu-app-whatsapp
heroku buildpacks:add -i 1 heroku-community/chrome-for-testing -a tu-app-whatsapp
heroku buildpacks:add -i 2 heroku/nodejs -a tu-app-whatsapp
heroku config:set NODE_ENV=production -a tu-app-whatsapp
heroku config:set HEADLESS=true -a tu-app-whatsapp
heroku config:set PUPPETEER_EXECUTABLE_PATH=chrome -a tu-app-whatsapp
heroku config:set API_KEY=tu-master-key -a tu-app-whatsapp
heroku config:set DB_HOST=tu-host -a tu-app-whatsapp
heroku config:set DB_PORT=3306 -a tu-app-whatsapp
heroku config:set DB_NAME=tu-base -a tu-app-whatsapp
heroku config:set DB_USER=tu-usuario -a tu-app-whatsapp
heroku config:set DB_PASSWORD=tu-password -a tu-app-whatsapp
git push heroku main
```

Verifica:

```bash
heroku open -a tu-app-whatsapp
heroku logs --tail -a tu-app-whatsapp
```

Limitacion importante:

- Heroku usa filesystem efimero. La carpeta `data/wwebjs_auth` puede perderse entre reinicios o redeploys.
- Eso significa que las sesiones QR de WhatsApp no son confiables en Heroku si sigues usando `LocalAuth`.
- Para produccion real, conviene migrar la persistencia de sesion a almacenamiento externo o mover este servicio a una plataforma con disco persistente.

## Notas operativas

- Las sesiones de WhatsApp se persisten en `data/wwebjs_auth`.
- La base de datos es compartida, pero los recursos se filtran por tenant.
- Si un tenant cambia de numero o de linea, puedes crear una nueva conexion sin desplegar otra instancia.

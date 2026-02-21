/**
 * Servicio de Gestión de API Keys
 * Maneja la creación, validación y revocación de API Keys
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../config/logger');

const API_KEYS_FILE = path.join(__dirname, '../../data/api-keys.json');

// Asegurar que existe el directorio data
const dataDir = path.dirname(API_KEYS_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Cargar API Keys desde archivo
 */
const loadApiKeys = () => {
  try {
    if (fs.existsSync(API_KEYS_FILE)) {
      const data = fs.readFileSync(API_KEYS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error('Error cargando API Keys:', error);
  }
  return { keys: [] };
};

/**
 * Guardar API Keys en archivo
 */
const saveApiKeys = (data) => {
  try {
    fs.writeFileSync(API_KEYS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    logger.error('Error guardando API Keys:', error);
    return false;
  }
};

/**
 * Generar una nueva API Key
 */
const generateKey = () => {
  return `wapi_${crypto.randomBytes(24).toString('hex')}`;
};

/**
 * Crear una nueva API Key
 * @param {Object} options - Opciones de la key
 * @param {string} options.name - Nombre descriptivo
 * @param {string} options.description - Descripción opcional
 * @param {Date} options.expiresAt - Fecha de expiración (opcional)
 * @param {Array} options.permissions - Permisos (opcional)
 */
const createApiKey = (options = {}) => {
  const data = loadApiKeys();
  
  const newKey = {
    id: crypto.randomUUID(),
    key: generateKey(),
    name: options.name || 'API Key',
    description: options.description || '',
    permissions: options.permissions || ['*'],
    active: true,
    createdAt: new Date().toISOString(),
    expiresAt: options.expiresAt || null,
    lastUsedAt: null,
    usageCount: 0
  };

  data.keys.push(newKey);
  saveApiKeys(data);

  logger.info(`🔑 Nueva API Key creada: ${newKey.name} (${newKey.id})`);

  return newKey;
};

/**
 * Validar una API Key
 * @param {string} apiKey - La API Key a validar
 * @returns {Object|null} - Info de la key si es válida, null si no
 */
const validateApiKey = (apiKey) => {
  // Primero verificar la API Key del .env (master key)
  const masterKey = process.env.API_KEY;
  if (masterKey && apiKey === masterKey) {
    return {
      id: 'master',
      name: 'Master Key',
      permissions: ['*'],
      isMaster: true
    };
  }

  // Verificar en las keys generadas
  const data = loadApiKeys();
  const keyInfo = data.keys.find(k => k.key === apiKey && k.active);

  if (!keyInfo) {
    return null;
  }

  // Verificar expiración
  if (keyInfo.expiresAt && new Date(keyInfo.expiresAt) < new Date()) {
    logger.warn(`API Key expirada: ${keyInfo.name}`);
    return null;
  }

  // Actualizar último uso
  keyInfo.lastUsedAt = new Date().toISOString();
  keyInfo.usageCount++;
  saveApiKeys(data);

  return keyInfo;
};

/**
 * Listar todas las API Keys
 * @param {boolean} includeKey - Incluir la key completa (por defecto oculta)
 */
const listApiKeys = (includeKey = false) => {
  const data = loadApiKeys();
  
  return data.keys.map(k => ({
    id: k.id,
    key: includeKey ? k.key : `${k.key.substring(0, 12)}...${k.key.slice(-4)}`,
    name: k.name,
    description: k.description,
    permissions: k.permissions,
    active: k.active,
    createdAt: k.createdAt,
    expiresAt: k.expiresAt,
    lastUsedAt: k.lastUsedAt,
    usageCount: k.usageCount
  }));
};

/**
 * Obtener una API Key por ID
 * @param {string} id - ID de la key
 */
const getApiKeyById = (id) => {
  const data = loadApiKeys();
  return data.keys.find(k => k.id === id);
};

/**
 * Revocar (desactivar) una API Key
 * @param {string} id - ID de la key a revocar
 */
const revokeApiKey = (id) => {
  const data = loadApiKeys();
  const keyIndex = data.keys.findIndex(k => k.id === id);

  if (keyIndex === -1) {
    return { success: false, error: 'API Key no encontrada' };
  }

  data.keys[keyIndex].active = false;
  data.keys[keyIndex].revokedAt = new Date().toISOString();
  saveApiKeys(data);

  logger.info(`🔒 API Key revocada: ${data.keys[keyIndex].name} (${id})`);

  return { success: true, message: 'API Key revocada correctamente' };
};

/**
 * Activar una API Key previamente revocada
 * @param {string} id - ID de la key a activar
 */
const activateApiKey = (id) => {
  const data = loadApiKeys();
  const keyIndex = data.keys.findIndex(k => k.id === id);

  if (keyIndex === -1) {
    return { success: false, error: 'API Key no encontrada' };
  }

  data.keys[keyIndex].active = true;
  delete data.keys[keyIndex].revokedAt;
  saveApiKeys(data);

  logger.info(`🔓 API Key activada: ${data.keys[keyIndex].name} (${id})`);

  return { success: true, message: 'API Key activada correctamente' };
};

/**
 * Eliminar permanentemente una API Key
 * @param {string} id - ID de la key a eliminar
 */
const deleteApiKey = (id) => {
  const data = loadApiKeys();
  const keyIndex = data.keys.findIndex(k => k.id === id);

  if (keyIndex === -1) {
    return { success: false, error: 'API Key no encontrada' };
  }

  const deletedKey = data.keys.splice(keyIndex, 1)[0];
  saveApiKeys(data);

  logger.info(`🗑️ API Key eliminada: ${deletedKey.name} (${id})`);

  return { success: true, message: 'API Key eliminada permanentemente' };
};

/**
 * Actualizar una API Key
 * @param {string} id - ID de la key
 * @param {Object} updates - Campos a actualizar
 */
const updateApiKey = (id, updates) => {
  const data = loadApiKeys();
  const keyIndex = data.keys.findIndex(k => k.id === id);

  if (keyIndex === -1) {
    return { success: false, error: 'API Key no encontrada' };
  }

  // Solo permitir actualizar ciertos campos
  const allowedUpdates = ['name', 'description', 'permissions', 'expiresAt'];
  
  for (const field of allowedUpdates) {
    if (updates[field] !== undefined) {
      data.keys[keyIndex][field] = updates[field];
    }
  }

  data.keys[keyIndex].updatedAt = new Date().toISOString();
  saveApiKeys(data);

  logger.info(`✏️ API Key actualizada: ${data.keys[keyIndex].name} (${id})`);

  return { success: true, data: data.keys[keyIndex] };
};

/**
 * Regenerar una API Key (nueva key, mismo ID)
 * @param {string} id - ID de la key a regenerar
 */
const regenerateApiKey = (id) => {
  const data = loadApiKeys();
  const keyIndex = data.keys.findIndex(k => k.id === id);

  if (keyIndex === -1) {
    return { success: false, error: 'API Key no encontrada' };
  }

  const newKey = generateKey();
  data.keys[keyIndex].key = newKey;
  data.keys[keyIndex].regeneratedAt = new Date().toISOString();
  saveApiKeys(data);

  logger.info(`🔄 API Key regenerada: ${data.keys[keyIndex].name} (${id})`);

  return { 
    success: true, 
    message: 'API Key regenerada correctamente',
    key: newKey  // Mostrar la nueva key una sola vez
  };
};

module.exports = {
  createApiKey,
  validateApiKey,
  listApiKeys,
  getApiKeyById,
  revokeApiKey,
  activateApiKey,
  deleteApiKey,
  updateApiKey,
  regenerateApiKey
};

/**
 * Controlador de API Keys
 * Endpoints para gestión de API Keys
 */

const apikeyService = require('../services/apikey.service');
const logger = require('../config/logger');

/**
 * Crear una nueva API Key
 */
const createApiKey = async (req, res) => {
  try {
    const { name, description, expiresAt, permissions } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'El nombre es requerido'
      });
    }

    const newKey = apikeyService.createApiKey({
      name,
      description,
      expiresAt,
      permissions
    });

    res.status(201).json({
      success: true,
      message: 'API Key creada exitosamente. ¡Guarda la key, no se mostrará de nuevo!',
      data: {
        id: newKey.id,
        key: newKey.key,  // Solo se muestra completa al crear
        name: newKey.name,
        description: newKey.description,
        permissions: newKey.permissions,
        createdAt: newKey.createdAt,
        expiresAt: newKey.expiresAt
      }
    });
  } catch (error) {
    logger.error('Error creando API Key:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear la API Key'
    });
  }
};

/**
 * Listar todas las API Keys
 */
const listApiKeys = async (req, res) => {
  try {
    const keys = apikeyService.listApiKeys(false);

    res.json({
      success: true,
      data: keys,
      total: keys.length
    });
  } catch (error) {
    logger.error('Error listando API Keys:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar las API Keys'
    });
  }
};

/**
 * Obtener una API Key por ID
 */
const getApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const key = apikeyService.getApiKeyById(id);

    if (!key) {
      return res.status(404).json({
        success: false,
        error: 'API Key no encontrada'
      });
    }

    res.json({
      success: true,
      data: {
        id: key.id,
        key: `${key.key.substring(0, 12)}...${key.key.slice(-4)}`,
        name: key.name,
        description: key.description,
        permissions: key.permissions,
        active: key.active,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        usageCount: key.usageCount
      }
    });
  } catch (error) {
    logger.error('Error obteniendo API Key:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener la API Key'
    });
  }
};

/**
 * Actualizar una API Key
 */
const updateApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions, expiresAt } = req.body;

    const result = apikeyService.updateApiKey(id, {
      name,
      description,
      permissions,
      expiresAt
    });

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'API Key actualizada correctamente',
      data: result.data
    });
  } catch (error) {
    logger.error('Error actualizando API Key:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar la API Key'
    });
  }
};

/**
 * Revocar una API Key
 */
const revokeApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const result = apikeyService.revokeApiKey(id);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'API Key revocada correctamente'
    });
  } catch (error) {
    logger.error('Error revocando API Key:', error);
    res.status(500).json({
      success: false,
      error: 'Error al revocar la API Key'
    });
  }
};

/**
 * Activar una API Key
 */
const activateApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const result = apikeyService.activateApiKey(id);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'API Key activada correctamente'
    });
  } catch (error) {
    logger.error('Error activando API Key:', error);
    res.status(500).json({
      success: false,
      error: 'Error al activar la API Key'
    });
  }
};

/**
 * Eliminar una API Key
 */
const deleteApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const result = apikeyService.deleteApiKey(id);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'API Key eliminada permanentemente'
    });
  } catch (error) {
    logger.error('Error eliminando API Key:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar la API Key'
    });
  }
};

/**
 * Regenerar una API Key
 */
const regenerateApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const result = apikeyService.regenerateApiKey(id);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'API Key regenerada. ¡Guarda la nueva key, no se mostrará de nuevo!',
      data: {
        key: result.key
      }
    });
  } catch (error) {
    logger.error('Error regenerando API Key:', error);
    res.status(500).json({
      success: false,
      error: 'Error al regenerar la API Key'
    });
  }
};

module.exports = {
  createApiKey,
  listApiKeys,
  getApiKey,
  updateApiKey,
  revokeApiKey,
  activateApiKey,
  deleteApiKey,
  regenerateApiKey
};

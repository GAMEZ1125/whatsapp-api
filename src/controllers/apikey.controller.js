const apikeyService = require('../services/apikey.service');
const logger = require('../config/logger');
const clientService = require('../services/client.service');

const createApiKey = async (req, res) => {
  try {
    const { name, description, permissions, clientId, plan } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'El nombre es requerido' });
    const resolvedClientId = clientId ? await clientService.resolveClientId(clientId) : null;

    const newKeyRes = await apikeyService.createApiKey({
      name,
      description,
      permissions,
      clientId: resolvedClientId,
      plan: plan || null,
    });
    const newKey = newKeyRes.data;

    res.status(201).json({
      success: true,
      message: 'API Key creada. Guárdala; no se mostrará de nuevo.',
      data: {
        id: newKey.id,
        key: newKey.key,
        name,
        description,
        permissions,
        clientId: resolvedClientId,
        plan: plan || null,
      },
    });
  } catch (error) {
    logger.error('Error creando API Key:', error);
    res.status(500).json({ success: false, error: 'Error al crear la API Key' });
  }
};

const listApiKeys = async (req, res) => {
  try {
    const keysRes = await apikeyService.listApiKeys({ clientId: req.query.clientId || null }, false);
    const keys = keysRes.data || [];
    res.json({ success: true, data: keys, total: keys.length });
  } catch (error) {
    logger.error('Error listando API Keys:', error);
    res.status(500).json({ success: false, error: 'Error al listar las API Keys' });
  }
};

const getApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const key = await apikeyService.getApiKeyById(id, true);
    if (!key) return res.status(404).json({ success: false, error: 'API Key no encontrada' });

    res.json({
      success: true,
      data: {
        id: key.id,
        key: apikeyService.maskApiKey(key.key),
        name: key.name,
        description: key.description,
        permissions: key.permissions,
        active: key.active,
        clientId: key.clientId,
        plan: key.plan,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error obteniendo API Key:', error);
    res.status(500).json({ success: false, error: 'Error al obtener la API Key' });
  }
};

const updateApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions, clientId, plan, active } = req.body;

    const result = await apikeyService.updateApiKey(id, {
      name,
      description,
      permissions,
      clientId,
      plan,
      active,
    });

    if (!result.success) return res.status(404).json({ success: false, error: result.error });

    res.json({ success: true, message: 'API Key actualizada' });
  } catch (error) {
    logger.error('Error actualizando API Key:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar la API Key' });
  }
};

const revokeApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    await apikeyService.updateApiKey(id, { active: false });
    res.json({ success: true, message: 'API Key revocada' });
  } catch (error) {
    logger.error('Error revocando API Key:', error);
    res.status(500).json({ success: false, error: 'Error al revocar la API Key' });
  }
};

const activateApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    await apikeyService.updateApiKey(id, { active: true });
    res.json({ success: true, message: 'API Key activada' });
  } catch (error) {
    logger.error('Error activando API Key:', error);
    res.status(500).json({ success: false, error: 'Error al activar la API Key' });
  }
};

const deleteApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    await apikeyService.deleteApiKey(id);
    res.json({ success: true, message: 'API Key eliminada permanentemente' });
  } catch (error) {
    logger.error('Error eliminando API Key:', error);
    res.status(500).json({ success: false, error: 'Error al eliminar la API Key' });
  }
};

const regenerateApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const newKeyRes = await apikeyService.regenerateApiKey(id);

    res.json({
      success: true,
      message: 'API Key regenerada. Guarda la nueva key, no se mostrará de nuevo.',
      data: { key: newKeyRes.data.key },
    });
  } catch (error) {
    logger.error('Error regenerando API Key:', error);
    res.status(500).json({ success: false, error: 'Error al regenerar la API Key' });
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
  regenerateApiKey,
};

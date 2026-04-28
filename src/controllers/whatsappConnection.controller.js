const connService = require('../services/whatsappConnection.service');
const inboxSettingsService = require('../services/clientInboxSettings.service');
const whatsappService = require('../services/whatsapp.service');
const logger = require('../config/logger');
const { resolveTenantAccess } = require('../middlewares/auth');

const getScopedClientId = (req, requestedClientId = null) =>
  resolveTenantAccess(req, requestedClientId || req.query.clientId || req.body?.clientId || null);

const getOwnedConnection = async (req, connectionId) => {
  if (req.apiKeyInfo?.isMaster) {
    return connService.getById(connectionId);
  }

  const clientId = getScopedClientId(req);
  return connService.getByIdForClient(connectionId, clientId);
};

const list = async (req, res) => {
  try {
    const clientId = req.user?.clientId || null;
    const isSuper = req.user?.role === 'superadmin';
    const filterClient = isSuper ? (req.query.clientId || null) : clientId;
    const data = await connService.list(filterClient);
    res.json({ success: true, data });
  } catch (e) {
    logger.error('Error list connections', e);
    res.status(e.statusCode || 500).json({ success: false, error: e.message || 'Error al listar conexiones' });
  }
};

const getOne = async (req, res) => {
  try {
    const conn = await getOwnedConnection(req, req.params.id);
    if (!conn) return res.status(404).json({ success: false, error: 'No encontrada' });
    res.json({ success: true, data: conn });
  } catch (e) {
    logger.error('Error get connection', e);
    res.status(e.statusCode || 500).json({ success: false, error: e.message || 'Error al obtener conexión' });
  }
};

const create = async (req, res) => {
  try {
    const isSuper = req.user?.role === 'superadmin';
    const clientId = isSuper ? req.body.clientId : req.user?.clientId;
    if (!clientId) return res.status(400).json({ success: false, error: 'clientId requerido' });
    const limits = inboxSettingsService.getLimitsForClient(clientId);
    const currentConnections = await connService.list(clientId);
    if (currentConnections.length >= limits.maxConnections) {
      return res.status(400).json({
        success: false,
        error: `Tu plan ${limits.plan} permite hasta ${limits.maxConnections} conexiones de WhatsApp`,
      });
    }
    const conn = await connService.create({
      clientId,
      phone: req.body.phone,
      sessionName: req.body.sessionName || req.body.phone,
      concurrentLimit: req.body.concurrentLimit,
      status: 'pending',
    });
    whatsappService.initializeConnection(conn.id).catch((error) => {
      logger.warn(`No se pudo iniciar la conexion ${conn.id}: ${error.message}`);
    });
    res.status(201).json({ success: true, data: conn });
  } catch (e) {
    logger.error('Error creando conexión', e);
    const isForeignKey = e?.code === 'ER_NO_REFERENCED_ROW_2';
    res.status(e.statusCode || (isForeignKey ? 400 : 500)).json({
      success: false,
      error: e.message || (isForeignKey ? 'El cliente autenticado no existe en la tabla clients.' : 'Error al crear conexión'),
      detail: process.env.NODE_ENV === 'development' ? e.message : undefined,
    });
  }
};

const update = async (req, res) => {
  try {
    const current = await getOwnedConnection(req, req.params.id);
    if (!current) return res.status(404).json({ success: false, error: 'No encontrada' });
    const conn = await connService.update(req.params.id, req.body);
    await whatsappService.refreshConnections();
    res.json({ success: true, data: conn });
  } catch (e) {
    logger.error('Error actualizando conexión', e);
    res.status(e.statusCode || 500).json({ success: false, error: e.message || 'Error al actualizar conexión' });
  }
};

const remove = async (req, res) => {
  try {
    const current = await getOwnedConnection(req, req.params.id);
    if (!current) return res.status(404).json({ success: false, error: 'No encontrada' });
    await whatsappService.removeConnection(req.params.id);
    const ok = await connService.remove(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: 'No encontrada' });
    res.json({ success: true, message: 'Conexión eliminada' });
  } catch (e) {
    logger.error('Error eliminando conexión', e);
    res.status(e.statusCode || 500).json({ success: false, error: e.message || 'Error al eliminar conexión' });
  }
};

const getAdminConfig = async (req, res) => {
  try {
    const clientId = getScopedClientId(req, req.query.clientId || null);
    if (!clientId) return res.status(400).json({ success: false, error: 'clientId requerido' });
    const connections = await connService.list(clientId);
    const settings = inboxSettingsService.getClientSettings(clientId);
    res.json({
      success: true,
      data: {
        ...settings,
        connections,
      },
    });
  } catch (e) {
    logger.error('Error obteniendo configuracion administrativa', e);
    res.status(e.statusCode || 500).json({ success: false, error: e.message || 'Error al obtener configuracion administrativa' });
  }
};

const updateAdminConfig = async (req, res) => {
  try {
    const clientId = getScopedClientId(req, req.body?.clientId || null);
    if (!clientId) return res.status(400).json({ success: false, error: 'clientId requerido' });
    const connections = await connService.list(clientId);
    const settings = inboxSettingsService.updateClientSettings(clientId, req.body || {}, connections.length);
    res.json({
      success: true,
      data: {
        ...settings,
        connections,
      },
    });
  } catch (e) {
    logger.error('Error actualizando configuracion administrativa', e);
    res.status(e.statusCode || 500).json({ success: false, error: e.message || 'Error al actualizar configuracion administrativa' });
  }
};

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
  getAdminConfig,
  updateAdminConfig,
};

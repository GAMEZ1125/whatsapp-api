const connService = require('../services/whatsappConnection.service');
const logger = require('../config/logger');

const list = async (req, res) => {
  try {
    const clientId = req.user?.clientId || null;
    const isSuper = req.user?.role === 'superadmin';
    const filterClient = isSuper ? (req.query.clientId || null) : clientId;
    const data = await connService.list(filterClient);
    res.json({ success: true, data });
  } catch (e) {
    logger.error('Error list connections', e);
    res.status(500).json({ success: false, error: 'Error al listar conexiones' });
  }
};

const getOne = async (req, res) => {
  try {
    const conn = await connService.getById(req.params.id);
    if (!conn) return res.status(404).json({ success: false, error: 'No encontrada' });
    res.json({ success: true, data: conn });
  } catch (e) {
    logger.error('Error get connection', e);
    res.status(500).json({ success: false, error: 'Error al obtener conexión' });
  }
};

const create = async (req, res) => {
  try {
    const isSuper = req.user?.role === 'superadmin';
    const clientId = isSuper ? req.body.clientId : req.user?.clientId;
    if (!clientId) return res.status(400).json({ success: false, error: 'clientId requerido' });
    const conn = await connService.create({
      clientId,
      phone: req.body.phone,
      sessionName: req.body.sessionName || req.body.phone,
      concurrentLimit: req.body.concurrentLimit,
      status: 'pending',
    });
    res.status(201).json({ success: true, data: conn });
  } catch (e) {
    logger.error('Error creando conexión', e);
    res.status(500).json({ success: false, error: 'Error al crear conexión' });
  }
};

const update = async (req, res) => {
  try {
    const conn = await connService.update(req.params.id, req.body);
    res.json({ success: true, data: conn });
  } catch (e) {
    logger.error('Error actualizando conexión', e);
    res.status(500).json({ success: false, error: 'Error al actualizar conexión' });
  }
};

const remove = async (req, res) => {
  try {
    const ok = await connService.remove(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: 'No encontrada' });
    res.json({ success: true, message: 'Conexión eliminada' });
  } catch (e) {
    logger.error('Error eliminando conexión', e);
    res.status(500).json({ success: false, error: 'Error al eliminar conexión' });
  }
};

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
};

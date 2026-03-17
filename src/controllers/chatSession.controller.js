/**
 * Controlador de Sesiones de Chat
 * Gestión de sesiones de agentes y asignación de chats
 */

const chatSessionService = require('../services/chatSession.service');
const whatsappService = require('../services/whatsapp.service');
const logger = require('../config/logger');

// ==================== GESTIÓN DE SESIONES ====================

/**
 * Crear una nueva sesión de agente
 */
const createSession = async (req, res) => {
  try {
    const { name, agentName, maxChats, permissions } = req.body;

    if (!name || !agentName) {
      return res.status(400).json({
        success: false,
        error: 'Nombre de sesión y nombre de agente son requeridos'
      });
    }

    const session = chatSessionService.createSession({
      name,
      agentName,
      maxChats,
      permissions
    });

    res.status(201).json({
      success: true,
      message: 'Sesión creada exitosamente. ¡Guarda la API Key!',
      data: session
    });
  } catch (error) {
    logger.error('Error creando sesión:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear la sesión'
    });
  }
};

/**
 * Listar todas las sesiones
 */
const listSessions = async (req, res) => {
  try {
    const sessions = chatSessionService.listSessions(false);
    const stats = chatSessionService.getGeneralStats();

    res.json({
      success: true,
      data: sessions,
      stats
    });
  } catch (error) {
    logger.error('Error listando sesiones:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar sesiones'
    });
  }
};

/**
 * Obtener una sesión por ID
 */
const getSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = chatSessionService.getSessionById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }

    const stats = chatSessionService.getSessionStats(sessionId);

    res.json({
      success: true,
      data: {
        ...session,
        apiKey: `${session.apiKey.substring(0, 8)}...`,
        stats
      }
    });
  } catch (error) {
    logger.error('Error obteniendo sesión:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener la sesión'
    });
  }
};

/**
 * Actualizar sesión
 */
const updateSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const updates = req.body;

    const result = chatSessionService.updateSession(sessionId, updates);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json({
      success: true,
      message: 'Sesión actualizada',
      data: result.data
    });
  } catch (error) {
    logger.error('Error actualizando sesión:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar la sesión'
    });
  }
};

/**
 * Eliminar sesión
 */
const deleteSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = chatSessionService.deleteSession(sessionId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('Error eliminando sesión:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar la sesión'
    });
  }
};

/**
 * Regenerar API Key de sesión
 */
const regenerateSessionKey = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = chatSessionService.regenerateSessionKey(sessionId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json({
      success: true,
      message: 'API Key regenerada. ¡Guarda la nueva key!',
      data: { apiKey: result.apiKey }
    });
  } catch (error) {
    logger.error('Error regenerando key:', error);
    res.status(500).json({
      success: false,
      error: 'Error al regenerar la API Key'
    });
  }
};

// ==================== GESTIÓN DE CHATS ====================

/**
 * Obtener chats pendientes (sin asignar)
 */
const getPendingChats = async (req, res) => {
  try {
    const chats = chatSessionService.getPendingChats();

    res.json({
      success: true,
      data: chats,
      total: chats.length
    });
  } catch (error) {
    logger.error('Error obteniendo chats pendientes:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener chats pendientes'
    });
  }
};

/**
 * Obtener todos los chats
 */
const getAllChats = async (req, res) => {
  try {
    const { status, sessionId } = req.query;
    const chats = chatSessionService.getAllChats({ status, sessionId });

    res.json({
      success: true,
      data: chats,
      total: chats.length
    });
  } catch (error) {
    logger.error('Error obteniendo chats:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener chats'
    });
  }
};

/**
 * Obtener chats de la sesión actual (para agentes)
 */
const getMyChats = async (req, res) => {
  try {
    const sessionId = req.chatSession?.id;

    if (!sessionId) {
      return res.status(401).json({
        success: false,
        error: 'Sesión no identificada'
      });
    }

    const { status } = req.query;
    const chats = chatSessionService.getSessionChats(sessionId, { status });
    const stats = chatSessionService.getSessionStats(sessionId);

    res.json({
      success: true,
      data: chats,
      stats
    });
  } catch (error) {
    logger.error('Error obteniendo mis chats:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener chats'
    });
  }
};

/**
 * Asignar chat a una sesión
 */
const assignChat = async (req, res) => {
  try {
    const { phone, sessionId } = req.body;

    if (!phone || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Teléfono y sessionId son requeridos'
      });
    }

    const result = chatSessionService.assignChat(phone, sessionId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: 'Chat asignado correctamente',
      data: result.data
    });
  } catch (error) {
    logger.error('Error asignando chat:', error);
    res.status(500).json({
      success: false,
      error: 'Error al asignar el chat'
    });
  }
};

/**
 * Tomar un chat pendiente (auto-asignar a mi sesión)
 */
const takeChat = async (req, res) => {
  try {
    const { phone } = req.body;
    const sessionId = req.chatSession?.id;

    if (!sessionId) {
      return res.status(401).json({
        success: false,
        error: 'Sesión no identificada'
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Teléfono es requerido'
      });
    }

    const result = chatSessionService.assignChat(phone, sessionId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: 'Chat tomado correctamente',
      data: result.data
    });
  } catch (error) {
    logger.error('Error tomando chat:', error);
    res.status(500).json({
      success: false,
      error: 'Error al tomar el chat'
    });
  }
};

/**
 * Transferir chat a otra sesión
 */
const transferChat = async (req, res) => {
  try {
    const { phone, toSessionId } = req.body;
    const fromSessionId = req.chatSession?.id;

    if (!fromSessionId) {
      return res.status(401).json({
        success: false,
        error: 'Sesión no identificada'
      });
    }

    if (!phone || !toSessionId) {
      return res.status(400).json({
        success: false,
        error: 'Teléfono y sesión destino son requeridos'
      });
    }

    const result = chatSessionService.transferChat(phone, fromSessionId, toSessionId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: 'Chat transferido correctamente',
      data: result.data
    });
  } catch (error) {
    logger.error('Error transfiriendo chat:', error);
    res.status(500).json({
      success: false,
      error: 'Error al transferir el chat'
    });
  }
};

/**
 * Cerrar un chat
 */
const closeChat = async (req, res) => {
  try {
    const { phone } = req.params;
    const sessionId = req.chatSession?.id;

    const result = chatSessionService.closeChat(phone, sessionId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: 'Chat cerrado correctamente',
      data: result.data
    });
  } catch (error) {
    logger.error('Error cerrando chat:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cerrar el chat'
    });
  }
};

/**
 * Obtener información de un chat
 */
const getChatInfo = async (req, res) => {
  try {
    const { phone } = req.params;
    const sessionId = req.chatSession?.id;

    const chat = chatSessionService.getChatInfo(phone);

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: 'Chat no encontrado'
      });
    }

    // Verificar acceso si es una sesión de agente
    if (sessionId && !chatSessionService.hasAccessToChat(sessionId, phone)) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a este chat'
      });
    }

    res.json({
      success: true,
      data: chat
    });
  } catch (error) {
    logger.error('Error obteniendo info del chat:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener información del chat'
    });
  }
};

/**
 * Actualizar información de un chat
 */
const updateChatInfo = async (req, res) => {
  try {
    const { phone } = req.params;
    const updates = req.body;

    const result = chatSessionService.updateChat(phone, updates);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json({
      success: true,
      message: 'Chat actualizado',
      data: result.data
    });
  } catch (error) {
    logger.error('Error actualizando chat:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar el chat'
    });
  }
};

// ==================== MENSAJES ====================

/**
 * Obtener mensajes de un chat
 */
const getChatMessages = async (req, res) => {
  try {
    const { phone } = req.params;
    const { limit, since } = req.query;
    const sessionId = req.chatSession?.id;

    // Verificar acceso si es una sesión de agente
    if (sessionId && !chatSessionService.hasAccessToChat(sessionId, phone)) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a este chat'
      });
    }

    const messages = chatSessionService.getChatMessages(phone, {
      limit: limit ? parseInt(limit) : 50,
      since
    });

    res.json({
      success: true,
      data: messages,
      total: messages.length
    });
  } catch (error) {
    logger.error('Error obteniendo mensajes:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener mensajes'
    });
  }
};

/**
 * Enviar mensaje como agente (con control de acceso)
 */
const sendMessageAsAgent = async (req, res) => {
  try {
    const { phone, message } = req.body;
    const session = req.chatSession;

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Sesión no identificada'
      });
    }

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        error: 'Teléfono y mensaje son requeridos'
      });
    }

    // Verificar acceso al chat
    if (!chatSessionService.hasAccessToChat(session.id, phone)) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a este chat. Primero debes tomarlo.'
      });
    }

    // Enviar mensaje
    const result = await whatsappService.sendMessage(phone, message);

    // Registrar mensaje
    chatSessionService.logMessage(phone, {
      direction: 'outgoing',
      content: message,
      type: 'text',
      sessionId: session.id,
      agentName: session.agentName,
      whatsappId: result.whatsappId,
      ack: 0 // pending until WhatsApp sends real ACK
    });

    res.json({
      success: true,
      message: 'Mensaje enviado',
      data: result
    });
  } catch (error) {
    logger.error('Error enviando mensaje:', error);
    const isNotRegistered = error?.message?.toLowerCase().includes('no está registrado') || error?.message?.toLowerCase().includes('no lid');
    res.status(isNotRegistered ? 400 : 500).json({
      success: false,
      error: error.message || 'Error al enviar el mensaje'
    });
  }
};

/**
 * Enviar media (imagen/documento) como agente
 */
const sendMediaAsAgent = async (req, res) => {
  try {
    const { phone, fileName, mimeType, base64, asSticker } = req.body;
    const session = req.chatSession;

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Sesión no identificada'
      });
    }

    if (!phone || !mimeType || !base64) {
      return res.status(400).json({
        success: false,
        error: 'Teléfono, mimeType y base64 son requeridos'
      });
    }

    if (!chatSessionService.hasAccessToChat(session.id, phone)) {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a este chat. Primero debes tomarlo.'
      });
    }

    const result = await whatsappService.sendMedia(phone, mimeType, base64, fileName || 'file', {
      asSticker: asSticker === true,
    });

    const contentForUI = mimeType.startsWith('image/')
      ? `data:${mimeType};base64,${base64}`
      : (fileName || 'documento');

    chatSessionService.logMessage(phone, {
      direction: 'outgoing',
      content: contentForUI,
      type: asSticker ? 'sticker' : mimeType.startsWith('image/') ? 'image' : 'document',
      sessionId: session.id,
      agentName: session.agentName,
      whatsappId: result.whatsappId,
      ack: 0 // start pending so UI shows check while waiting for ACK
    });

    res.json({
      success: true,
      message: 'Media enviada',
      data: result
    });
  } catch (error) {
    logger.error('Error enviando media:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al enviar el media'
    });
  }
};

// ==================== ESTADÍSTICAS ====================

/**
 * Obtener estadísticas generales
 */
const getStats = async (req, res) => {
  try {
    const stats = chatSessionService.getGeneralStats();
    const sessions = chatSessionService.listSessions(false).map(s => ({
      id: s.id,
      name: s.name,
      agentName: s.agentName,
      status: s.status,
      ...chatSessionService.getSessionStats(s.id)
    }));

    res.json({
      success: true,
      data: {
        general: stats,
        sessions
      }
    });
  } catch (error) {
    logger.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
    });
  }
};

const getQuickReplies = async (_req, res) => {
  try {
    const quickReplies = chatSessionService.getQuickReplies();
    res.json({
      success: true,
      data: quickReplies,
    });
  } catch (error) {
    logger.error('Error obteniendo mensajes rápidos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener mensajes rápidos'
    });
  }
};

const updateQuickReplies = async (req, res) => {
  try {
    const quickReplies = chatSessionService.updateQuickReplies(req.body?.quickReplies || []);
    res.json({
      success: true,
      message: 'Mensajes rápidos actualizados',
      data: quickReplies,
    });
  } catch (error) {
    logger.error('Error actualizando mensajes rápidos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar mensajes rápidos'
    });
  }
};

const getAutoChatRules = async (_req, res) => {
  try {
    const autoChatRules = chatSessionService.getAutoChatRules();
    res.json({
      success: true,
      data: autoChatRules,
    });
  } catch (error) {
    logger.error('Error obteniendo reglas automáticas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener reglas automáticas'
    });
  }
};

const updateAutoChatRules = async (req, res) => {
  try {
    const autoChatRules = chatSessionService.updateAutoChatRules(req.body || {});
    res.json({
      success: true,
      message: 'Automatización actualizada',
      data: autoChatRules,
    });
  } catch (error) {
    logger.error('Error actualizando reglas automáticas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar reglas automáticas'
    });
  }
};

const getStickerPacks = async (_req, res) => {
  try {
    const stickerPacks = chatSessionService.getStickerPacks();
    res.json({
      success: true,
      data: stickerPacks,
    });
  } catch (error) {
    logger.error('Error obteniendo stickers:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener stickers'
    });
  }
};

const updateStickerPacks = async (req, res) => {
  try {
    const stickerPacks = chatSessionService.updateStickerPacks(req.body?.stickerPacks || []);
    res.json({
      success: true,
      message: 'Stickers actualizados',
      data: stickerPacks,
    });
  } catch (error) {
    logger.error('Error actualizando stickers:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar stickers'
    });
  }
};

const importStickerPackage = async (req, res) => {
  try {
    const stickerPack = await chatSessionService.importStickerPackage({
      fileName: req.body?.fileName,
      base64: req.body?.base64,
      packName: req.body?.packName,
    });

    res.status(201).json({
      success: true,
      message: 'Paquete de stickers importado',
      data: stickerPack,
    });
  } catch (error) {
    logger.error('Error importando paquete de stickers:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Error al importar paquete de stickers'
    });
  }
};

module.exports = {
  // Sesiones
  createSession,
  listSessions,
  getSession,
  updateSession,
  deleteSession,
  regenerateSessionKey,

  // Chats
  getPendingChats,
  getAllChats,
  getMyChats,
  assignChat,
  takeChat,
  transferChat,
  closeChat,
  getChatInfo,
  updateChatInfo,

  // Mensajes
  getChatMessages,
  sendMessageAsAgent,
  sendMediaAsAgent,

  // Stats
  getStats,
  getQuickReplies,
  updateQuickReplies,
  getAutoChatRules,
  updateAutoChatRules,
  getStickerPacks,
  updateStickerPacks,
  importStickerPackage
};



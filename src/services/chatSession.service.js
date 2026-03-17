/**
 * Servicio de Gestión de Sesiones de Chat
 * Permite crear sesiones de agentes y asignar chats a cada sesión
 * Un solo número de WhatsApp conectado, múltiples sesiones atendiendo
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const logger = require('../config/logger');

const DATA_FILE = path.join(__dirname, '../../data/chat-sessions.json');
const chatEvents = new EventEmitter();
chatEvents.setMaxListeners(200);

// Asegurar que existe el directorio data
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Estructura de datos:
 * {
 *   sessions: {
 *     "session_id": {
 *       id: string,
 *       name: string,
 *       agentName: string,
 *       apiKey: string (para autenticación de esta sesión),
 *       status: 'active' | 'inactive' | 'busy',
 *       maxChats: number,
 *       createdAt: string,
 *       lastActivity: string
 *     }
 *   },
 *   chats: {
 *     "phone_number": {
 *       phone: string,
 *       sessionId: string | null,
 *       status: 'pending' | 'assigned' | 'closed',
 *       priority: 'low' | 'normal' | 'high' | 'urgent',
 *       tags: string[],
 *       customerName: string,
 *       notes: string,
 *       createdAt: string,
 *       assignedAt: string | null,
 *       closedAt: string | null,
 *       lastMessageAt: string,
 *       messageCount: number
 *     }
 *   },
 *   messages: {
 *     "phone_number": [
 *       {
 *         id: string,
 *         direction: 'incoming' | 'outgoing',
 *         content: string,
 *         type: 'text' | 'image' | 'document' | 'audio',
 *         timestamp: string,
 *         sessionId: string | null,
 *         agentName: string | null
 *       }
 *     ]
 *   }
 * }
 */

/**
 * Cargar datos desde archivo
 */
const loadData = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error('Error cargando datos de sesiones:', error);
  }
  return { sessions: {}, chats: {}, messages: {} };
};

/**
 * Guardar datos en archivo
 */
const saveData = (data) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    chatEvents.emit('change', { type: 'full-sync', ts: Date.now() });
    return true;
  } catch (error) {
    logger.error('Error guardando datos de sesiones:', error);
    return false;
  }
};

/**
 * Generar API Key para sesión
 */
const generateSessionKey = () => {
  return `cs_${crypto.randomBytes(16).toString('hex')}`;
};

// ==================== GESTIÓN DE SESIONES ====================

/**
 * Crear una nueva sesión de agente
 */
const createSession = (options = {}) => {
  const data = loadData();
  
  const sessionId = `ses_${crypto.randomUUID().split('-')[0]}`;
  const sessionKey = generateSessionKey();
  
  const session = {
    id: sessionId,
    name: options.name || `Sesión ${Object.keys(data.sessions).length + 1}`,
    agentName: options.agentName || 'Agente',
    apiKey: sessionKey,
    status: 'active',
    maxChats: options.maxChats || 10,
    permissions: options.permissions || ['chat:read', 'chat:write', 'chat:transfer'],
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    assignedChats: 0
  };

  data.sessions[sessionId] = session;
  saveData(data);

  logger.info(`📱 Nueva sesión creada: ${session.name} (${sessionId})`);
  chatEvents.emit('change', { type: 'session', action: 'create', sessionId, ts: Date.now() });

  return session;
};

/**
 * Listar todas las sesiones
 */
const listSessions = (includeApiKey = false) => {
  const data = loadData();
  
  return Object.values(data.sessions).map(session => {
    const sessionData = { ...session };
    if (!includeApiKey) {
      sessionData.apiKey = `${session.apiKey.substring(0, 8)}...`;
    }
    // Contar chats asignados
    sessionData.assignedChats = Object.values(data.chats)
      .filter(c => c.sessionId === session.id && c.status === 'assigned').length;
    return sessionData;
  });
};

/**
 * Obtener sesión por ID
 */
const getSessionById = (sessionId) => {
  const data = loadData();
  return data.sessions[sessionId] || null;
};

/**
 * Obtener sesión por API Key
 */
const getSessionByApiKey = (apiKey) => {
  const data = loadData();
  return Object.values(data.sessions).find(s => s.apiKey === apiKey) || null;
};

/**
 * Actualizar sesión
 */
const updateSession = (sessionId, updates) => {
  const data = loadData();
  
  if (!data.sessions[sessionId]) {
    return { success: false, error: 'Sesión no encontrada' };
  }

  const allowedUpdates = ['name', 'agentName', 'status', 'maxChats', 'permissions'];
  
  for (const field of allowedUpdates) {
    if (updates[field] !== undefined) {
      data.sessions[sessionId][field] = updates[field];
    }
  }

  data.sessions[sessionId].lastActivity = new Date().toISOString();
  saveData(data);
  chatEvents.emit('change', { type: 'session', action: 'update', sessionId, ts: Date.now() });

  return { success: true, data: data.sessions[sessionId] };
};

/**
 * Eliminar sesión
 */
const deleteSession = (sessionId) => {
  const data = loadData();
  
  if (!data.sessions[sessionId]) {
    return { success: false, error: 'Sesión no encontrada' };
  }

  // Desasignar todos los chats de esta sesión
  Object.keys(data.chats).forEach(phone => {
    if (data.chats[phone].sessionId === sessionId) {
      data.chats[phone].sessionId = null;
      data.chats[phone].status = 'pending';
    }
  });

  const deletedSession = data.sessions[sessionId];
  delete data.sessions[sessionId];
  saveData(data);

  logger.info(`🗑️ Sesión eliminada: ${deletedSession.name} (${sessionId})`);
  chatEvents.emit('change', { type: 'session', action: 'delete', sessionId, ts: Date.now() });

  return { success: true, message: 'Sesión eliminada' };
};

/**
 * Regenerar API Key de sesión
 */
const regenerateSessionKey = (sessionId) => {
  const data = loadData();
  
  if (!data.sessions[sessionId]) {
    return { success: false, error: 'Sesión no encontrada' };
  }

  const newKey = generateSessionKey();
  data.sessions[sessionId].apiKey = newKey;
  data.sessions[sessionId].lastActivity = new Date().toISOString();
  saveData(data);
  chatEvents.emit('change', { type: 'session', action: 'regen_key', sessionId, ts: Date.now() });

  return { success: true, apiKey: newKey };
};

// ==================== GESTIÓN DE CHATS ====================

/**
 * Registrar o actualizar un chat
 */
const registerChat = (phone, options = {}) => {
  const data = loadData();
  
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (data.chats[cleanPhone]) {
    // Actualizar último mensaje
    data.chats[cleanPhone].lastMessageAt = new Date().toISOString();
    data.chats[cleanPhone].messageCount = (data.chats[cleanPhone].messageCount || 0) + 1;
  } else {
    // Crear nuevo chat
    data.chats[cleanPhone] = {
      phone: cleanPhone,
      sessionId: null,
      status: 'pending',
      priority: options.priority || 'normal',
      tags: options.tags || [],
      customerName: options.customerName || null,
      notes: '',
      createdAt: new Date().toISOString(),
      assignedAt: null,
      closedAt: null,
      lastMessageAt: new Date().toISOString(),
      messageCount: 1
    };
    
    logger.info(`💬 Nuevo chat registrado: ${cleanPhone}`);
  }

  saveData(data);
  chatEvents.emit('change', { type: 'chat', action: 'upsert', phone: cleanPhone, ts: Date.now() });
  return data.chats[cleanPhone];
};

/**
 * Asignar chat a una sesión
 */
const assignChat = (phone, sessionId) => {
  const data = loadData();
  
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (!data.chats[cleanPhone]) {
    return { success: false, error: 'Chat no encontrado' };
  }

  if (sessionId && !data.sessions[sessionId]) {
    return { success: false, error: 'Sesión no encontrada' };
  }

  // Verificar límite de chats de la sesión
  if (sessionId) {
    const session = data.sessions[sessionId];
    const currentChats = Object.values(data.chats)
      .filter(c => c.sessionId === sessionId && c.status === 'assigned').length;
    
    if (currentChats >= session.maxChats) {
      return { success: false, error: 'La sesión ha alcanzado el límite de chats' };
    }
  }

  const previousSession = data.chats[cleanPhone].sessionId;
  
  data.chats[cleanPhone].sessionId = sessionId;
  data.chats[cleanPhone].status = sessionId ? 'assigned' : 'pending';
  data.chats[cleanPhone].assignedAt = sessionId ? new Date().toISOString() : null;

  if (sessionId) {
    data.sessions[sessionId].lastActivity = new Date().toISOString();
  }

  saveData(data);

  logger.info(`🔄 Chat ${cleanPhone} ${sessionId ? `asignado a sesión ${sessionId}` : 'desasignado'}`);
  chatEvents.emit('change', { type: 'chat', action: 'assign', phone: cleanPhone, sessionId, ts: Date.now() });

  return { 
    success: true, 
    data: data.chats[cleanPhone],
    previousSession
  };
};

/**
 * Transferir chat a otra sesión
 */
const transferChat = (phone, fromSessionId, toSessionId) => {
  const data = loadData();
  
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (!data.chats[cleanPhone]) {
    return { success: false, error: 'Chat no encontrado' };
  }

  if (data.chats[cleanPhone].sessionId !== fromSessionId) {
    return { success: false, error: 'El chat no está asignado a la sesión de origen' };
  }

  if (!data.sessions[toSessionId]) {
    return { success: false, error: 'Sesión destino no encontrada' };
  }

  // Verificar límite de la sesión destino
  const targetSession = data.sessions[toSessionId];
  const currentChats = Object.values(data.chats)
    .filter(c => c.sessionId === toSessionId && c.status === 'assigned').length;
  
  if (currentChats >= targetSession.maxChats) {
    return { success: false, error: 'La sesión destino ha alcanzado el límite de chats' };
  }

  data.chats[cleanPhone].sessionId = toSessionId;
  data.chats[cleanPhone].assignedAt = new Date().toISOString();
  
  // Registrar transferencia en notas
  const fromName = data.sessions[fromSessionId]?.agentName || 'Desconocido';
  const toName = data.sessions[toSessionId].agentName;
  data.chats[cleanPhone].notes += `\n[${new Date().toISOString()}] Transferido de ${fromName} a ${toName}`;

  saveData(data);

  logger.info(`↔️ Chat ${cleanPhone} transferido de ${fromSessionId} a ${toSessionId}`);
  chatEvents.emit('change', { type: 'chat', action: 'transfer', phone: cleanPhone, fromSessionId, toSessionId, ts: Date.now() });

  return { success: true, data: data.chats[cleanPhone] };
};

/**
 * Cerrar un chat
 */
const closeChat = (phone, sessionId = null) => {
  const data = loadData();
  
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (!data.chats[cleanPhone]) {
    return { success: false, error: 'Chat no encontrado' };
  }

  // Verificar que la sesión tiene permiso para cerrar este chat
  if (sessionId && data.chats[cleanPhone].sessionId !== sessionId) {
    return { success: false, error: 'No tienes permiso para cerrar este chat' };
  }

  data.chats[cleanPhone].status = 'closed';
  data.chats[cleanPhone].closedAt = new Date().toISOString();

  saveData(data);

  logger.info(`✅ Chat cerrado: ${cleanPhone}`);
  chatEvents.emit('change', { type: 'chat', action: 'close', phone: cleanPhone, ts: Date.now() });

  return { success: true, data: data.chats[cleanPhone] };
};

/**
 * Reabrir un chat
 */
const reopenChat = (phone) => {
  const data = loadData();
  
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (!data.chats[cleanPhone]) {
    return { success: false, error: 'Chat no encontrado' };
  }

  data.chats[cleanPhone].status = data.chats[cleanPhone].sessionId ? 'assigned' : 'pending';
  data.chats[cleanPhone].closedAt = null;

  saveData(data);

  chatEvents.emit('change', { type: 'chat', action: 'reopen', phone: cleanPhone, ts: Date.now() });
  return { success: true, data: data.chats[cleanPhone] };
};

/**
 * Obtener chats de una sesión
 */
const getSessionChats = (sessionId, filters = {}) => {
  const data = loadData();
  
  let chats = Object.values(data.chats)
    .filter(chat => chat.sessionId === sessionId);

  // Filtrar por estado
  if (filters.status) {
    chats = chats.filter(c => c.status === filters.status);
  }

  // Filtrar por prioridad
  if (filters.priority) {
    chats = chats.filter(c => c.priority === filters.priority);
  }

  // Ordenar por último mensaje
  chats.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

  return chats;
};

/**
 * Obtener chats pendientes (sin asignar)
 */
const getPendingChats = () => {
  const data = loadData();
  
  return Object.values(data.chats)
    .filter(chat => chat.status === 'pending')
    .sort((a, b) => {
      // Ordenar por prioridad y luego por fecha
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
};

/**
 * Obtener todos los chats
 */
const getAllChats = (filters = {}) => {
  const data = loadData();
  
  let chats = Object.values(data.chats);

  if (filters.status) {
    chats = chats.filter(c => c.status === filters.status);
  }

  if (filters.sessionId) {
    chats = chats.filter(c => c.sessionId === filters.sessionId);
  }

  return chats.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
};

/**
 * Obtener información de un chat específico
 */
const getChatInfo = (phone) => {
  const data = loadData();
  const cleanPhone = phone.replace(/\D/g, '');
  return data.chats[cleanPhone] || null;
};

/**
 * Actualizar información de un chat
 */
const updateChat = (phone, updates) => {
  const data = loadData();
  
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (!data.chats[cleanPhone]) {
    return { success: false, error: 'Chat no encontrado' };
  }

  const allowedUpdates = ['priority', 'tags', 'customerName', 'notes'];
  
  for (const field of allowedUpdates) {
    if (updates[field] !== undefined) {
      data.chats[cleanPhone][field] = updates[field];
    }
  }

  saveData(data);

  return { success: true, data: data.chats[cleanPhone] };
};

// ==================== GESTIÓN DE MENSAJES ====================

/**
 * Registrar un mensaje
 */
const logMessage = (phone, message) => {
  const data = loadData();
  
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (!data.messages[cleanPhone]) {
    data.messages[cleanPhone] = [];
  }

  const messageRecord = {
    id: crypto.randomUUID(),
    direction: message.direction || 'incoming',
    content: message.content || message.body,
    type: message.type || 'text',
    timestamp: new Date().toISOString(),
    sessionId: message.sessionId || null,
    agentName: message.agentName || null,
    whatsappId: message.whatsappId || null
  };

  data.messages[cleanPhone].push(messageRecord);

  // Limitar historial a últimos 500 mensajes por chat
  if (data.messages[cleanPhone].length > 500) {
    data.messages[cleanPhone] = data.messages[cleanPhone].slice(-500);
  }

  // Actualizar info del chat
  if (data.chats[cleanPhone]) {
    data.chats[cleanPhone].lastMessageAt = messageRecord.timestamp;
    data.chats[cleanPhone].messageCount = (data.chats[cleanPhone].messageCount || 0) + 1;
  }

  saveData(data);
  chatEvents.emit('change', { type: 'message', action: 'new', phone: cleanPhone, ts: Date.now() });

  return messageRecord;
};

/**
 * Obtener mensajes de un chat
 */
const getChatMessages = (phone, options = {}) => {
  const data = loadData();
  
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (!data.messages[cleanPhone]) {
    return [];
  }

  let messages = [...data.messages[cleanPhone]];

  // Filtrar por fecha
  if (options.since) {
    const sinceDate = new Date(options.since);
    messages = messages.filter(m => new Date(m.timestamp) >= sinceDate);
  }

  // Limitar cantidad
  if (options.limit) {
    messages = messages.slice(-options.limit);
  }

  return messages;
};

// ==================== VALIDACIÓN DE ACCESO ====================

/**
 * Verificar si una sesión tiene acceso a un chat
 */
const hasAccessToChat = (sessionId, phone) => {
  const data = loadData();
  
  const cleanPhone = phone.replace(/\D/g, '');
  const chat = data.chats[cleanPhone];

  if (!chat) return false;
  
  // El chat está asignado a esta sesión
  if (chat.sessionId === sessionId) return true;
  
  // El chat está pendiente (cualquier sesión puede verlo)
  if (chat.status === 'pending') return true;

  return false;
};

/**
 * Verificar permisos de sesión
 */
const hasPermission = (sessionId, permission) => {
  const data = loadData();
  const session = data.sessions[sessionId];
  
  if (!session) return false;
  
  return session.permissions.includes(permission) || session.permissions.includes('*');
};

// ==================== ESTADÍSTICAS ====================

/**
 * Obtener estadísticas de una sesión
 */
const getSessionStats = (sessionId) => {
  const data = loadData();
  
  const session = data.sessions[sessionId];
  if (!session) return null;

  const sessionChats = Object.values(data.chats)
    .filter(c => c.sessionId === sessionId);

  return {
    sessionId,
    agentName: session.agentName,
    status: session.status,
    activeChats: sessionChats.filter(c => c.status === 'assigned').length,
    closedChats: sessionChats.filter(c => c.status === 'closed').length,
    totalChats: sessionChats.length,
    maxChats: session.maxChats,
    lastActivity: session.lastActivity
  };
};

/**
 * Obtener estadísticas generales
 */
const getGeneralStats = () => {
  const data = loadData();
  
  const chats = Object.values(data.chats);
  const sessions = Object.values(data.sessions);

  return {
    totalSessions: sessions.length,
    activeSessions: sessions.filter(s => s.status === 'active').length,
    totalChats: chats.length,
    pendingChats: chats.filter(c => c.status === 'pending').length,
    assignedChats: chats.filter(c => c.status === 'assigned').length,
    closedChats: chats.filter(c => c.status === 'closed').length,
    urgentChats: chats.filter(c => c.priority === 'urgent' && c.status !== 'closed').length
  };
};

module.exports = {
  // Sesiones
  createSession,
  listSessions,
  getSessionById,
  getSessionByApiKey,
  updateSession,
  deleteSession,
  regenerateSessionKey,
  
  // Chats
  registerChat,
  assignChat,
  transferChat,
  closeChat,
  reopenChat,
  getSessionChats,
  getPendingChats,
  getAllChats,
  getChatInfo,
  updateChat,
  
  // Mensajes
  logMessage,
  getChatMessages,
  
  // Validación
  hasAccessToChat,
  hasPermission,
  
  // Estadísticas
  getSessionStats,
  getGeneralStats,

  // Eventos
  chatEvents
};


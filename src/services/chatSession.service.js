/**
 * Servicio de Gestión de Sesiones de Chat
 * Permite crear sesiones de agentes y asignar chats a cada sesión
 * Un solo número de WhatsApp conectado, múltiples sesiones atendiendo
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const unzipper = require('unzipper');
const logger = require('../config/logger');
const inboxSettingsService = require('./clientInboxSettings.service');

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
const normalizePhone = (phone = '') => String(phone).replace(/\D/g, '');
const normalizeConnectionId = (connectionId = null) => {
  const normalized = String(connectionId || '').trim();
  return normalized || null;
};

const generateChatId = () => `chat_${crypto.randomUUID().split('-')[0]}`;

const DEFAULT_QUICK_REPLIES = [
  {
    id: 'welcome',
    title: 'Bienvenida',
    content: 'Hola [NOMBRE CLIENTE], Soy [NOMBRE DEL AGENTE] En que Te puedo ayudar',
    active: true,
  },
];

const DEFAULT_AUTO_CHAT_RULES = {
  enabled: false,
  reminderEnabled: true,
  reminderDelayMinutes: 5,
  reminderMessage: 'Hola [NOMBRE CLIENTE], ¿sigues en el chat? Estoy atento para ayudarte.',
  autoCloseEnabled: true,
  autoCloseDelayMinutes: 5,
  autoCloseMessage: 'Hola [NOMBRE CLIENTE], cerraré este chat por inactividad. Si nos escribes de nuevo, abriremos una nueva conversación.',
  automationAgentName: 'Sistema',
};

const sanitizeAutoChatRules = (rules = {}) => ({
  enabled: rules?.enabled === true,
  reminderEnabled: rules?.reminderEnabled !== false,
  reminderDelayMinutes: Math.max(1, Number(rules?.reminderDelayMinutes || DEFAULT_AUTO_CHAT_RULES.reminderDelayMinutes)),
  reminderMessage: String(rules?.reminderMessage || DEFAULT_AUTO_CHAT_RULES.reminderMessage).trim() || DEFAULT_AUTO_CHAT_RULES.reminderMessage,
  autoCloseEnabled: rules?.autoCloseEnabled !== false,
  autoCloseDelayMinutes: Math.max(1, Number(rules?.autoCloseDelayMinutes || DEFAULT_AUTO_CHAT_RULES.autoCloseDelayMinutes)),
  autoCloseMessage: String(rules?.autoCloseMessage || DEFAULT_AUTO_CHAT_RULES.autoCloseMessage).trim() || DEFAULT_AUTO_CHAT_RULES.autoCloseMessage,
  automationAgentName: String(rules?.automationAgentName || DEFAULT_AUTO_CHAT_RULES.automationAgentName).trim() || DEFAULT_AUTO_CHAT_RULES.automationAgentName,
});

const normalizeStickerMimeType = (name = '') => {
  const lower = String(name).toLowerCase();
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
};

const createDataUrl = (mimeType, base64) => `data:${mimeType};base64,${base64}`;

const sanitizeSticker = (sticker, index = 0) => {
  const mimeType = String(sticker?.mimeType || '').trim() || 'image/webp';
  const base64 = String(sticker?.base64 || '').trim();
  const content = String(sticker?.content || '').trim() || (base64 ? createDataUrl(mimeType, base64) : '');

  if (!content && !base64) return null;

  return {
    id: sticker?.id || `st_${crypto.randomUUID().split('-')[0]}`,
    name: String(sticker?.name || `Sticker ${index + 1}`).trim() || `Sticker ${index + 1}`,
    mimeType,
    base64: base64 || content.split(',')[1] || '',
    content: content || createDataUrl(mimeType, base64),
    active: sticker?.active !== false,
  };
};

const sanitizeStickerPack = (pack, index = 0) => {
  const stickers = Array.isArray(pack?.stickers)
    ? pack.stickers
        .map((sticker, stickerIndex) => sanitizeSticker(sticker, stickerIndex))
        .filter(Boolean)
    : [];

  if (!stickers.length) return null;

  return {
    id: pack?.id || `pack_${crypto.randomUUID().split('-')[0]}`,
    name: String(pack?.name || `Paquete ${index + 1}`).trim() || `Paquete ${index + 1}`,
    description: String(pack?.description || '').trim(),
    active: pack?.active !== false,
    sourceType: pack?.sourceType === 'package' ? 'package' : 'manual',
    importedAt: pack?.importedAt || new Date().toISOString(),
    stickers,
  };
};

const normalizePersistedData = (rawData = {}) => {
  const normalized = {
    sessions: rawData.sessions || {},
    chats: {},
    messages: {},
    quickReplies:
      Array.isArray(rawData.quickReplies) && rawData.quickReplies.length
        ? rawData.quickReplies.map((reply) => ({
            id: reply.id || `qr_${crypto.randomUUID().split('-')[0]}`,
            title: String(reply.title || '').trim(),
            content: String(reply.content || '').trim(),
            active: reply.active !== false,
          }))
        : DEFAULT_QUICK_REPLIES,
    autoChatRules: sanitizeAutoChatRules(rawData.autoChatRules),
    stickerPacks: Array.isArray(rawData.stickerPacks)
      ? rawData.stickerPacks
          .map((pack, index) => sanitizeStickerPack(pack, index))
          .filter(Boolean)
      : [],
  };

  for (const [rawKey, rawChat] of Object.entries(rawData.chats || {})) {
    if (!rawChat) continue;

    const createdAt = rawChat.createdAt || new Date().toISOString();
    const cleanPhone = normalizePhone(rawChat.phone || rawKey);
    const chatId =
      rawChat.id ||
      (rawKey.startsWith('chat_') ? rawKey : `chat_${cleanPhone}_${Date.parse(createdAt) || Date.now()}`);

    normalized.chats[chatId] = {
      id: chatId,
      phone: cleanPhone,
      connectionId: normalizeConnectionId(rawChat.connectionId || rawChat.channelId || null),
      groupId: rawChat.groupId || rawChat.botState?.groupId || null,
      workflow: rawChat.workflow || 'manual',
      sessionId: rawChat.sessionId || null,
      status: rawChat.status || 'pending',
      priority: rawChat.priority || 'normal',
      tags: Array.isArray(rawChat.tags) ? rawChat.tags : [],
      customerName: rawChat.customerName || null,
      notes: rawChat.notes || '',
      createdAt,
      assignedAt: rawChat.assignedAt || null,
      closedAt: rawChat.closedAt || null,
      lastMessageAt: rawChat.lastMessageAt || createdAt,
      messageCount: Number(rawChat.messageCount || 0),
      unreadCount: Number(rawChat.unreadCount || 0),
      automation: {
        lastAgentMessageAt: rawChat.automation?.lastAgentMessageAt || null,
        reminderSentAt: rawChat.automation?.reminderSentAt || null,
        autoClosedAt: rawChat.automation?.autoClosedAt || null,
      },
      botState: {
        groupId: rawChat.botState?.groupId || null,
        welcomeSentAt: rawChat.botState?.welcomeSentAt || null,
        lastBotReplyAt: rawChat.botState?.lastBotReplyAt || null,
        handoffSentAt: rawChat.botState?.handoffSentAt || null,
      },
    };

    const sourceMessages = rawData.messages?.[chatId] ?? rawData.messages?.[rawKey] ?? [];
    normalized.messages[chatId] = Array.isArray(sourceMessages)
      ? sourceMessages.map((message) => ({
          ...message,
          chatId,
        }))
      : [];
  }

  return normalized;
};

const loadData = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return normalizePersistedData(JSON.parse(data));
    }
  } catch (error) {
    logger.error('Error cargando datos de sesiones:', error);
  }
  return {
    sessions: {},
    chats: {},
    messages: {},
    quickReplies: DEFAULT_QUICK_REPLIES,
    autoChatRules: DEFAULT_AUTO_CHAT_RULES,
    stickerPacks: [],
  };
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

const getChatsByPhone = (data, phone) => {
  const cleanPhone = normalizePhone(phone);
  return Object.values(data.chats)
    .filter((chat) => chat.phone === cleanPhone)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const getChatsByPhoneAndConnection = (data, phone, connectionId = null) => {
  const cleanPhone = normalizePhone(phone);
  const normalizedConnectionId = normalizeConnectionId(connectionId);
  return Object.values(data.chats)
    .filter((chat) => {
      if (chat.phone !== cleanPhone) return false;
      if (!normalizedConnectionId) return true;
      return normalizeConnectionId(chat.connectionId) === normalizedConnectionId;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const getLatestChatByPhone = (data, phone, { includeClosed = true, connectionId = null } = {}) => {
  const matches = getChatsByPhoneAndConnection(data, phone, connectionId).filter((chat) => includeClosed || chat.status !== 'closed');
  return matches[0] || null;
};

const resolveChat = (data, chatRef, { includeClosed = true, connectionId = null } = {}) => {
  if (!chatRef) return null;
  if (data.chats[chatRef]) {
    const exactChat = data.chats[chatRef];
    if (connectionId && normalizeConnectionId(exactChat.connectionId) !== normalizeConnectionId(connectionId)) return null;
    if (!includeClosed && exactChat.status === 'closed') return null;
    return exactChat;
  }

  const latestChat = getLatestChatByPhone(data, chatRef, { includeClosed, connectionId });
  return latestChat || null;
};

const getAssignedChatsCount = (data, sessionId) =>
  Object.values(data.chats).filter((chat) => chat.sessionId === sessionId && chat.status === 'assigned').length;

const canAssignToSession = (data, sessionId) => {
  const session = data.sessions[sessionId];
  if (!session || session.status !== 'active') return false;
  return getAssignedChatsCount(data, sessionId) < session.maxChats;
};

const selectSessionForWorkflow = (data, sessionIds = [], workflow = 'manual') => {
  const eligible = sessionIds
    .map((sessionId) => data.sessions[sessionId])
    .filter(Boolean)
    .filter((session) => canAssignToSession(data, session.id));

  if (!eligible.length || workflow === 'manual') return null;

  if (workflow === 'least_loaded') {
    return eligible
      .map((session) => ({ session, load: getAssignedChatsCount(data, session.id) }))
      .sort((a, b) => a.load - b.load || new Date(a.session.lastActivity || 0) - new Date(b.session.lastActivity || 0))[0]
      ?.session || null;
  }

  return eligible
    .sort((a, b) => new Date(a.lastActivity || 0) - new Date(b.lastActivity || 0))[0] || null;
};

const createChatRecord = (data, phone, options = {}, previousChat = null) => {
  const cleanPhone = normalizePhone(phone);
  const connectionId = normalizeConnectionId(options.connectionId || previousChat?.connectionId || null);
  const chatId = generateChatId();
  const createdAt = new Date().toISOString();

  data.chats[chatId] = {
    id: chatId,
    phone: cleanPhone,
    connectionId,
    groupId: options.groupId || previousChat?.groupId || null,
    workflow: options.workflow || previousChat?.workflow || 'manual',
    sessionId: null,
    status: 'pending',
    priority: options.priority || previousChat?.priority || 'normal',
    tags: Array.isArray(options.tags) ? options.tags : [],
    customerName: options.customerName || previousChat?.customerName || null,
    notes: '',
    createdAt,
    assignedAt: null,
    closedAt: null,
    lastMessageAt: createdAt,
    messageCount: 0,
    unreadCount: 0,
    automation: {
      lastAgentMessageAt: null,
      reminderSentAt: null,
      autoClosedAt: null,
    },
    botState: {
      groupId: null,
      welcomeSentAt: null,
      lastBotReplyAt: null,
      handoffSentAt: null,
    },
  };

  data.messages[chatId] = data.messages[chatId] || [];
  logger.info(`💬 Nuevo chat registrado: ${cleanPhone} (${chatId})`);
  return data.chats[chatId];
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
  const cleanPhone = normalizePhone(phone);
  const connectionId = normalizeConnectionId(options.connectionId || null);
  const latestChat = getLatestChatByPhone(data, cleanPhone, { includeClosed: true, connectionId });
  const chat = !latestChat || latestChat.status === 'closed'
    ? createChatRecord(data, cleanPhone, options, latestChat)
    : latestChat;

  chat.lastMessageAt = new Date().toISOString();
  if (options.customerName && !chat.customerName) {
    chat.customerName = options.customerName;
  }
  if (options.groupId !== undefined) {
    chat.groupId = options.groupId || null;
  }
  if (options.workflow) {
    chat.workflow = options.workflow;
  }
  if (connectionId) {
    chat.connectionId = connectionId;
  }

  saveData(data);
  chatEvents.emit('change', {
    type: 'chat',
    action: latestChat ? 'upsert' : 'create',
    phone: cleanPhone,
    connectionId,
    chatId: chat.id,
    ts: Date.now(),
  });
  return chat;
};

const updateChatRouting = (chatRef, updates = {}) => {
  const data = loadData();
  const chat = resolveChat(data, chatRef, { includeClosed: true, connectionId: updates.connectionId || null });

  if (!chat) {
    return { success: false, error: 'Chat no encontrado' };
  }

  if (updates.connectionId !== undefined) {
    chat.connectionId = normalizeConnectionId(updates.connectionId);
  }
  if (updates.groupId !== undefined) {
    chat.groupId = updates.groupId || null;
    chat.botState = {
      groupId: chat.botState?.groupId || null,
      welcomeSentAt: chat.botState?.welcomeSentAt || null,
      lastBotReplyAt: chat.botState?.lastBotReplyAt || null,
      handoffSentAt: chat.botState?.handoffSentAt || null,
      ...chat.botState,
      groupId: updates.groupId || null,
    };
  }
  if (updates.workflow !== undefined) {
    chat.workflow = updates.workflow || 'manual';
  }

  saveData(data);
  chatEvents.emit('change', { type: 'chat', action: 'route', phone: chat.phone, connectionId: chat.connectionId || null, chatId: chat.id, ts: Date.now() });
  return { success: true, data: chat };
};

/**
 * Asignar chat a una sesión
 */
const assignChat = (chatRef, sessionId) => {
  const data = loadData();
  const chat = resolveChat(data, chatRef, { includeClosed: false });

  if (!chat) {
    return { success: false, error: 'Chat no encontrado' };
  }

  if (sessionId && !data.sessions[sessionId]) {
    return { success: false, error: 'Sesión no encontrada' };
  }

  // Verificar límite de chats de la sesión
  if (sessionId) {
    const session = data.sessions[sessionId];
    const currentChats = getAssignedChatsCount(data, sessionId);
    
    if (currentChats >= session.maxChats) {
      return { success: false, error: 'La sesión ha alcanzado el límite de chats' };
    }
  }

  const previousSession = chat.sessionId;
  
  chat.sessionId = sessionId;
  chat.status = sessionId ? 'assigned' : 'pending';
  chat.assignedAt = sessionId ? new Date().toISOString() : null;
  chat.closedAt = null;

  if (sessionId) {
    data.sessions[sessionId].lastActivity = new Date().toISOString();
  }

  saveData(data);

  logger.info(`🔄 Chat ${chat.phone} (${chat.id}) ${sessionId ? `asignado a sesión ${sessionId}` : 'desasignado'}`);
  chatEvents.emit('change', { type: 'chat', action: 'assign', phone: chat.phone, connectionId: chat.connectionId || null, chatId: chat.id, sessionId, ts: Date.now() });

  return { 
    success: true, 
    data: chat,
    previousSession
  };
};

const autoAssignChatByWorkflow = (chatRef, sessionIds = [], workflow = 'manual') => {
  const data = loadData();
  const chat = resolveChat(data, chatRef, { includeClosed: false });

  if (!chat) {
    return { success: false, error: 'Chat no encontrado' };
  }

  const selectedSession = selectSessionForWorkflow(data, sessionIds, workflow);
  if (!selectedSession) {
    return { success: false, error: 'No hay sesiones disponibles para este workflow' };
  }

  chat.sessionId = selectedSession.id;
  chat.status = 'assigned';
  chat.assignedAt = new Date().toISOString();
  chat.closedAt = null;
  chat.workflow = workflow || chat.workflow || 'manual';
  data.sessions[selectedSession.id].lastActivity = new Date().toISOString();

  saveData(data);
  chatEvents.emit('change', { type: 'chat', action: 'auto-assign', phone: chat.phone, connectionId: chat.connectionId || null, chatId: chat.id, sessionId: selectedSession.id, ts: Date.now() });
  return { success: true, data: chat };
};

/**
 * Transferir chat a otra sesión
 */
const transferChat = (chatRef, fromSessionId, toSessionId) => {
  const data = loadData();
  const chat = resolveChat(data, chatRef, { includeClosed: false });

  if (!chat) {
    return { success: false, error: 'Chat no encontrado' };
  }

  if (chat.sessionId !== fromSessionId) {
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

  chat.sessionId = toSessionId;
  chat.assignedAt = new Date().toISOString();
  
  // Registrar transferencia en notas
  const fromName = data.sessions[fromSessionId]?.agentName || 'Desconocido';
  const toName = data.sessions[toSessionId].agentName;
  chat.notes += `\n[${new Date().toISOString()}] Transferido de ${fromName} a ${toName}`;

  saveData(data);

  logger.info(`↔️ Chat ${chat.phone} (${chat.id}) transferido de ${fromSessionId} a ${toSessionId}`);
  chatEvents.emit('change', { type: 'chat', action: 'transfer', phone: chat.phone, connectionId: chat.connectionId || null, chatId: chat.id, fromSessionId, toSessionId, ts: Date.now() });

  return { success: true, data: chat };
};

/**
 * Cerrar un chat
 */
const closeChat = (chatRef, sessionId = null) => {
  const data = loadData();
  const chat = resolveChat(data, chatRef, { includeClosed: true });

  if (!chat) {
    return { success: false, error: 'Chat no encontrado' };
  }

  // Verificar que la sesión tiene permiso para cerrar este chat
  if (sessionId && chat.sessionId !== sessionId) {
    return { success: false, error: 'No tienes permiso para cerrar este chat' };
  }

  chat.status = 'closed';
  chat.closedAt = new Date().toISOString();

  saveData(data);

  logger.info(`✅ Chat cerrado: ${chat.phone} (${chat.id})`);
  chatEvents.emit('change', { type: 'chat', action: 'close', phone: chat.phone, connectionId: chat.connectionId || null, chatId: chat.id, ts: Date.now() });

  return { success: true, data: chat };
};

/**
 * Reabrir un chat
 */
const reopenChat = (chatRef) => {
  const data = loadData();
  const chat = resolveChat(data, chatRef, { includeClosed: true });

  if (!chat) {
    return { success: false, error: 'Chat no encontrado' };
  }

  chat.status = chat.sessionId ? 'assigned' : 'pending';
  chat.closedAt = null;

  saveData(data);

  chatEvents.emit('change', { type: 'chat', action: 'reopen', phone: chat.phone, connectionId: chat.connectionId || null, chatId: chat.id, ts: Date.now() });
  return { success: true, data: chat };
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
const getPendingChats = (filters = {}) => {
  const data = loadData();
  
  return Object.values(data.chats)
    .filter((chat) => {
      if (chat.status !== 'pending') return false;
      if (filters.connectionId && normalizeConnectionId(chat.connectionId) !== normalizeConnectionId(filters.connectionId)) return false;
      return true;
    })
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

  if (filters.connectionId) {
    chats = chats.filter((chat) => normalizeConnectionId(chat.connectionId) === normalizeConnectionId(filters.connectionId));
  }

  return chats.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
};

/**
 * Obtener información de un chat específico
 */
const getChatInfo = (chatRef, options = {}) => {
  const data = loadData();
  return resolveChat(data, chatRef, { includeClosed: true, connectionId: options.connectionId || null });
};

/**
 * Actualizar información de un chat
 */
const updateChat = (chatRef, updates) => {
  const data = loadData();
  const chat = resolveChat(data, chatRef, { includeClosed: true });

  if (!chat) {
    return { success: false, error: 'Chat no encontrado' };
  }

  const allowedUpdates = ['priority', 'tags', 'customerName', 'notes'];
  
  for (const field of allowedUpdates) {
    if (updates[field] !== undefined) {
      chat[field] = updates[field];
    }
  }

  saveData(data);

  return { success: true, data: chat };
};

const updateChatBotState = (chatRef, updates = {}) => {
  const data = loadData();
  const chat = resolveChat(data, chatRef, { includeClosed: true });

  if (!chat) {
    return { success: false, error: 'Chat no encontrado' };
  }

  chat.botState = {
    groupId: chat.botState?.groupId || null,
    welcomeSentAt: chat.botState?.welcomeSentAt || null,
    lastBotReplyAt: chat.botState?.lastBotReplyAt || null,
    handoffSentAt: chat.botState?.handoffSentAt || null,
    ...updates,
  };

  saveData(data);
  return { success: true, data: chat.botState };
};

const getChatForSession = (sessionId, chatRef) => {
  const data = loadData();
  const normalizedRef = normalizePhone(chatRef);
  const candidates = Object.values(data.chats)
    .filter((chat) => chat.sessionId === sessionId)
    .sort((a, b) => new Date(b.lastMessageAt || b.createdAt || 0) - new Date(a.lastMessageAt || a.createdAt || 0));

  return candidates.find((chat) => chat.id === chatRef) ||
    candidates.find((chat) => chat.phone === normalizedRef) ||
    null;
};

const resolveChatRouting = (chatRef, clientId = null) => {
  const data = loadData();
  const chat = resolveChat(data, chatRef, { includeClosed: true });

  if (!chat) {
    return { success: false, error: 'Chat no encontrado' };
  }

  if (chat.connectionId) {
    return {
      success: true,
      data: {
        connectionId: chat.connectionId,
        groupId: chat.groupId || null,
        workflow: chat.workflow || 'manual',
      },
    };
  }

  const siblingWithConnection = getChatsByPhone(data, chat.phone).find(
    (candidate) => candidate.id !== chat.id && candidate.connectionId
  );

  if (siblingWithConnection?.connectionId) {
    return {
      success: true,
      data: {
        connectionId: siblingWithConnection.connectionId,
        groupId: siblingWithConnection.groupId || chat.groupId || null,
        workflow: siblingWithConnection.workflow || chat.workflow || 'manual',
      },
    };
  }

  if (clientId) {
    const settings = inboxSettingsService.getClientSettings(clientId);
    const preferredGroup =
      (settings.groups || []).find((group) => group.id === chat.groupId) ||
      (settings.groups || []).find((group) => group.id === settings.defaultGroupId) ||
      (settings.groups || []).find((group) => group.active && group.connectionId);

    const fallbackConnectionId = preferredGroup?.connectionId || settings.defaultConnectionId || null;

    if (fallbackConnectionId) {
      return {
        success: true,
        data: {
          connectionId: fallbackConnectionId,
          groupId: preferredGroup?.id || chat.groupId || null,
          workflow: preferredGroup?.workflow || chat.workflow || 'manual',
        },
      };
    }
  }

  return { success: false, error: 'El chat no tiene una conexión de WhatsApp asociada.' };
};

const appendMessageToChat = (data, chat, message) => {
  if (!data.messages[chat.id]) {
    data.messages[chat.id] = [];
  }

  const timestamp = message.timestamp || new Date().toISOString();
  const messageRecord = {
    id: crypto.randomUUID(),
    chatId: chat.id,
    connectionId: normalizeConnectionId(message.connectionId || chat.connectionId || null),
    direction: message.direction || 'incoming',
    content: message.content || message.body,
    type: message.type || 'text',
    timestamp,
    sessionId: message.sessionId || null,
    agentName: message.agentName || null,
    whatsappId: message.whatsappId || null,
    ack: message.ack ?? null,
  };

  data.messages[chat.id].push(messageRecord);

  if (data.messages[chat.id].length > 500) {
    data.messages[chat.id] = data.messages[chat.id].slice(-500);
  }

  chat.lastMessageAt = messageRecord.timestamp;
  chat.messageCount = (chat.messageCount || 0) + 1;
  chat.automation = chat.automation || {
    lastAgentMessageAt: null,
    reminderSentAt: null,
    autoClosedAt: null,
  };

  if (message.direction === 'incoming') {
    chat.unreadCount = (chat.unreadCount || 0) + 1;
    chat.automation.lastAgentMessageAt = null;
    chat.automation.reminderSentAt = null;
    chat.automation.autoClosedAt = null;
  } else {
    const automationKind = message.automationKind || null;
    if (automationKind === 'reminder') {
      chat.automation.reminderSentAt = messageRecord.timestamp;
    } else if (automationKind === 'auto-close') {
      chat.automation.autoClosedAt = messageRecord.timestamp;
    } else {
      chat.automation.lastAgentMessageAt = messageRecord.timestamp;
      chat.automation.reminderSentAt = null;
      chat.automation.autoClosedAt = null;
    }
  }

  return messageRecord;
};

// ==================== GESTIÓN DE MENSAJES ====================

/**
 * Registrar un mensaje
 */
const logMessage = (phone, message) => {
  const data = loadData();
  const cleanPhone = normalizePhone(phone);
  const connectionId = normalizeConnectionId(message.connectionId || null);
  const latestChat = message.chatId
    ? resolveChat(data, message.chatId, { includeClosed: true, connectionId })
    : getLatestChatByPhone(data, cleanPhone, { includeClosed: true, connectionId });
  const chat = !latestChat || latestChat.status === 'closed'
    ? createChatRecord(data, cleanPhone, { customerName: message.customerName, connectionId }, latestChat)
    : latestChat;

  const messageRecord = appendMessageToChat(data, chat, message);

  saveData(data);
  chatEvents.emit('change', { type: 'message', action: 'new', phone: cleanPhone, connectionId: chat.connectionId || null, chatId: chat.id, ts: Date.now() });

  return messageRecord;
};

/**
 * Actualizar ACK de un mensaje por whatsappId
 */
const updateMessageAck = (whatsappId, ack, phoneHint = null, connectionId = null) => {
  const data = loadData();
  const hintedChatIds = phoneHint ? getChatsByPhoneAndConnection(data, phoneHint, connectionId).map((chat) => chat.id) : [];
  const targetChatIds = [
    ...hintedChatIds,
    ...Object.keys(data.messages).filter((chatId) => !hintedChatIds.includes(chatId)),
  ];

  for (const chatId of targetChatIds) {
    const list = data.messages[chatId];
    if (!list) continue;
    const msg = list.find((m) => m.whatsappId === whatsappId);
    if (msg) {
      msg.ack = ack;
      saveData(data);
      const chat = data.chats[chatId];
      chatEvents.emit('change', { type: 'message-ack', phone: chat?.phone || null, connectionId: chat?.connectionId || null, chatId, whatsappId, ack, ts: Date.now() });
      return true;
    }
  }
  return false;
};

/**
 * Obtener mensajes de un chat
 */
const getChatMessages = (chatRef, options = {}) => {
  const data = loadData();
  const chat = resolveChat(data, chatRef, { includeClosed: true });

  if (!chat || !data.messages[chat.id]) {
    return [];
  }

  let messages = [...data.messages[chat.id]];

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
const hasAccessToChat = (sessionId, chatRef) => {
  const data = loadData();
  const chat = typeof chatRef === 'object' && chatRef !== null
    ? resolveChat(data, chatRef.chatId || chatRef.phone || chatRef, {
        includeClosed: true,
        connectionId: chatRef.connectionId || null,
      })
    : resolveChat(data, chatRef, { includeClosed: true });

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

const getQuickReplies = () => {
  const data = loadData();
  return Array.isArray(data.quickReplies) && data.quickReplies.length
    ? data.quickReplies
    : DEFAULT_QUICK_REPLIES;
};

const updateQuickReplies = (quickReplies = []) => {
  const data = loadData();
  const sanitized = Array.isArray(quickReplies)
    ? quickReplies
        .map((item) => ({
          id: item?.id || `qr_${crypto.randomUUID().split('-')[0]}`,
          title: String(item?.title || '').trim(),
          content: String(item?.content || '').trim(),
          active: item?.active !== false,
        }))
        .filter((item) => item.title && item.content)
    : [];

  data.quickReplies = sanitized.length ? sanitized : DEFAULT_QUICK_REPLIES;
  saveData(data);
  chatEvents.emit('change', { type: 'quick-replies', action: 'update', ts: Date.now() });
  return data.quickReplies;
};

const getAutoChatRules = () => {
  const data = loadData();
  return sanitizeAutoChatRules(data.autoChatRules);
};

const updateAutoChatRules = (rules = {}) => {
  const data = loadData();
  data.autoChatRules = sanitizeAutoChatRules(rules);
  saveData(data);
  chatEvents.emit('change', { type: 'auto-chat-rules', action: 'update', ts: Date.now() });
  return data.autoChatRules;
};

const resolveTemplate = (template, chat, session, rules) =>
  String(template || '')
    .replace(/\[NOMBRE CLIENTE\]/gi, chat.customerName?.trim() || chat.phone)
    .replace(/\[NOMBRE DEL AGENTE\]/gi, session?.agentName?.trim() || rules.automationAgentName)
    .replace(/\[Nombre del Agente\]/g, session?.agentName?.trim() || rules.automationAgentName)
    .replace(/\[Nombre Cliente\]/g, chat.customerName?.trim() || chat.phone);

const runAutoChatRules = async (sendMessage) => {
  const data = loadData();
  const rules = sanitizeAutoChatRules(data.autoChatRules);
  if (!rules.enabled || typeof sendMessage !== 'function') return { processed: 0, reminders: 0, closed: 0 };

  let processed = 0;
  let reminders = 0;
  let closed = 0;
  let changed = false;
  const now = Date.now();

  for (const chat of Object.values(data.chats)) {
    if (!chat || chat.status === 'closed' || !chat.sessionId) continue;

    const messages = data.messages[chat.id] || [];
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.direction !== 'outgoing') continue;

    const session = data.sessions[chat.sessionId];
    if (!session) continue;

    chat.automation = chat.automation || {
      lastAgentMessageAt: null,
      reminderSentAt: null,
      autoClosedAt: null,
    };

    const lastAgentMessageAt = chat.automation.lastAgentMessageAt || lastMessage.timestamp;
    const reminderSentAt = chat.automation.reminderSentAt;
    const baseReminderTime = new Date(lastAgentMessageAt).getTime();

    if (!Number.isFinite(baseReminderTime)) continue;

    processed += 1;

    if (
      rules.reminderEnabled &&
      !reminderSentAt &&
      now - baseReminderTime >= rules.reminderDelayMinutes * 60 * 1000
    ) {
      const reminderMessage = resolveTemplate(rules.reminderMessage, chat, session, rules);
      const result = await sendMessage(chat.phone, reminderMessage, {
        connectionId: chat.connectionId || null,
      });
      appendMessageToChat(data, chat, {
        direction: 'outgoing',
        content: reminderMessage,
        type: 'text',
        sessionId: chat.sessionId,
        agentName: rules.automationAgentName,
        whatsappId: result?.whatsappId || null,
        ack: 0,
        automationKind: 'reminder',
        connectionId: chat.connectionId || null,
      });
      reminders += 1;
      changed = true;
      continue;
    }

    const closeBase = reminderSentAt || lastAgentMessageAt;
    const closeBaseMs = new Date(closeBase).getTime();

    if (
      rules.autoCloseEnabled &&
      !chat.automation.autoClosedAt &&
      Number.isFinite(closeBaseMs) &&
      now - closeBaseMs >= rules.autoCloseDelayMinutes * 60 * 1000
    ) {
      const closeMessage = resolveTemplate(rules.autoCloseMessage, chat, session, rules);
      const result = await sendMessage(chat.phone, closeMessage, {
        connectionId: chat.connectionId || null,
      });
      appendMessageToChat(data, chat, {
        direction: 'outgoing',
        content: closeMessage,
        type: 'text',
        sessionId: chat.sessionId,
        agentName: rules.automationAgentName,
        whatsappId: result?.whatsappId || null,
        ack: 0,
        automationKind: 'auto-close',
        connectionId: chat.connectionId || null,
      });
      chat.status = 'closed';
      chat.closedAt = new Date().toISOString();
      closed += 1;
      changed = true;
      chatEvents.emit('change', { type: 'chat', action: 'auto-close', phone: chat.phone, connectionId: chat.connectionId || null, chatId: chat.id, ts: Date.now() });
    }
  }

  if (changed) {
    saveData(data);
  }

  return { processed, reminders, closed };
};

const getStickerPacks = () => {
  const data = loadData();
  return Array.isArray(data.stickerPacks) ? data.stickerPacks : [];
};

const updateStickerPacks = (stickerPacks = []) => {
  const data = loadData();
  const sanitized = Array.isArray(stickerPacks)
    ? stickerPacks
        .map((pack, index) => sanitizeStickerPack(pack, index))
        .filter(Boolean)
    : [];

  data.stickerPacks = sanitized;
  saveData(data);
  chatEvents.emit('change', { type: 'sticker-packs', action: 'update', ts: Date.now() });
  return data.stickerPacks;
};

const importStickerPackage = async ({ fileName, base64, packName } = {}) => {
  const cleanBase64 = String(base64 || '').trim();
  if (!cleanBase64) {
    throw new Error('Archivo de paquete vacío');
  }

  const buffer = Buffer.from(cleanBase64, 'base64');
  const directory = await unzipper.Open.buffer(buffer);
  const stickers = [];
  let parsedMeta = null;

  for (const entry of directory.files) {
    if (!entry || entry.type !== 'File') continue;

    const rawPath = String(entry.path || '');
    const entryName = rawPath.split('/').pop() || rawPath;
    const lowerName = entryName.toLowerCase();
    if (!entryName || lowerName.startsWith('.') || rawPath.includes('__MACOSX')) continue;

    if (/\.(json)$/i.test(lowerName)) {
      try {
        const content = (await entry.buffer()).toString('utf8');
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') parsedMeta = parsed;
      } catch {
        /* ignore invalid metadata */
      }
      continue;
    }

    if (!/\.(webp|png|jpe?g|gif)$/i.test(lowerName)) continue;

    const mimeType = normalizeStickerMimeType(entryName);
    const entryBuffer = await entry.buffer();
    const entryBase64 = entryBuffer.toString('base64');
    stickers.push(
      sanitizeSticker({
        name: entryName.replace(/\.[^.]+$/, ''),
        mimeType,
        base64: entryBase64,
        content: createDataUrl(mimeType, entryBase64),
        active: true,
      }, stickers.length)
    );
  }

  if (!stickers.length) {
    throw new Error('El paquete no contiene stickers compatibles');
  }

  const importedPack = sanitizeStickerPack({
    name:
      String(packName || parsedMeta?.name || parsedMeta?.title || parsedMeta?.identifier || fileName || 'Paquete importado')
        .replace(/\.[^.]+$/, '')
        .trim() || 'Paquete importado',
    description: String(parsedMeta?.description || parsedMeta?.publisher || '').trim(),
    active: true,
    sourceType: 'package',
    importedAt: new Date().toISOString(),
    stickers,
  });

  const data = loadData();
  data.stickerPacks = [...(Array.isArray(data.stickerPacks) ? data.stickerPacks : []), importedPack];
  saveData(data);
  chatEvents.emit('change', { type: 'sticker-packs', action: 'import', packId: importedPack.id, ts: Date.now() });
  return importedPack;
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
  getChatForSession,
  resolveChatRouting,
  updateChat,
  updateChatRouting,
  updateChatBotState,
  autoAssignChatByWorkflow,
  
  // Mensajes
  logMessage,
  getChatMessages,
  updateMessageAck,
  
  // Validación
  hasAccessToChat,
  hasPermission,
  
  // Estadísticas
  getSessionStats,
  getGeneralStats,
  getQuickReplies,
  updateQuickReplies,
  getAutoChatRules,
  updateAutoChatRules,
  runAutoChatRules,
  getStickerPacks,
  updateStickerPacks,
  importStickerPackage,

  // Eventos
  chatEvents
};


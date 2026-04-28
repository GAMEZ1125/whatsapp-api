const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '../../data/client-inbox-settings.json');

const PLAN_PRESETS = {
  demo: {
    plan: 'Professional',
    maxConnections: 2,
    maxGroups: 3,
    chatbotEnabled: true,
  },
};

const CLIENT_LIMIT_ALIASES = {
  client_1: 'demo',
  'ee3b97d0-1239-11f1-a227-f0038cd89556': 'demo',
  'Cliente Demo': 'demo',
  'Demo Inc': 'demo',
  'demo@cliente.com': 'demo',
  'TechCorp Solutions': 'demo',
};

const defaultGroup = () => ({
  id: `grp_${crypto.randomUUID().split('-')[0]}`,
  name: 'Grupo principal',
  description: 'Canal principal de atencion',
  connectionId: null,
  workflow: 'manual',
  sessionIds: [],
  active: true,
  chatbotEnabled: false,
  welcomeMessage: 'Hola [NOMBRE CLIENTE], soy el asistente virtual. Antes de pasar con un agente, cuentame en que te puedo ayudar.',
  handoffMessage: 'Perfecto [NOMBRE CLIENTE], voy a dejar tu chat listo para que un agente humano te atienda.',
  fallbackMessage: 'Gracias [NOMBRE CLIENTE]. Ya registramos tu mensaje y seguiremos contigo en breve.',
  keywordRules: [
    {
      id: `rule_${crypto.randomUUID().split('-')[0]}`,
      label: 'Ventas',
      keywords: 'precio,cotizacion,comprar,ventas',
      response: 'Con gusto te ayudamos con ventas. Cuentame que producto o servicio te interesa.',
    },
    {
      id: `rule_${crypto.randomUUID().split('-')[0]}`,
      label: 'Soporte',
      keywords: 'soporte,error,falla,ayuda',
      response: 'Entendido. Describe por favor el inconveniente para que soporte lo revise.',
    },
  ],
});

const defaultSettingsForClient = (clientId) => ({
  clientId,
  defaultConnectionId: null,
  defaultGroupId: null,
  handoffKeywords: 'agente,asesor,humano,persona',
  groups: [defaultGroup()],
});

const ensureDataFile = () => {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ clients: {} }, null, 2));
  }
};

const loadData = () => {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { clients: {} };
  }
};

const saveData = (data) => {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

const getLimitsForClient = (clientId) => {
  const raw = String(clientId || '').trim();
  const presetKey = CLIENT_LIMIT_ALIASES[raw] || raw;
  return PLAN_PRESETS[presetKey] || {
    plan: 'Basic',
    maxConnections: 1,
    maxGroups: 1,
    chatbotEnabled: false,
  };
};

const sanitizeKeywordRules = (rules = []) =>
  Array.isArray(rules)
    ? rules
        .map((rule) => ({
          id: rule?.id || `rule_${crypto.randomUUID().split('-')[0]}`,
          label: String(rule?.label || 'Regla').trim() || 'Regla',
          keywords: String(rule?.keywords || '').trim(),
          response: String(rule?.response || '').trim(),
        }))
        .filter((rule) => rule.keywords && rule.response)
    : [];

const sanitizeGroup = (group, index = 0) => ({
  id: group?.id || `grp_${crypto.randomUUID().split('-')[0]}`,
  name: String(group?.name || `Grupo ${index + 1}`).trim() || `Grupo ${index + 1}`,
  description: String(group?.description || '').trim(),
  connectionId: group?.connectionId || null,
  workflow: ['manual', 'round_robin', 'least_loaded'].includes(group?.workflow) ? group.workflow : 'manual',
  sessionIds: Array.isArray(group?.sessionIds)
    ? [...new Set(group.sessionIds.map((sessionId) => String(sessionId || '').trim()).filter(Boolean))]
    : [],
  active: group?.active !== false,
  chatbotEnabled: group?.chatbotEnabled === true,
  welcomeMessage:
    String(group?.welcomeMessage || defaultGroup().welcomeMessage).trim() || defaultGroup().welcomeMessage,
  handoffMessage:
    String(group?.handoffMessage || defaultGroup().handoffMessage).trim() || defaultGroup().handoffMessage,
  fallbackMessage:
    String(group?.fallbackMessage || defaultGroup().fallbackMessage).trim() || defaultGroup().fallbackMessage,
  keywordRules: sanitizeKeywordRules(group?.keywordRules),
});

const getClientSettings = (clientId) => {
  const data = loadData();
  const raw = data.clients?.[clientId] || defaultSettingsForClient(clientId);
  const groups = (Array.isArray(raw.groups) ? raw.groups : [defaultGroup()]).map((group, index) =>
    sanitizeGroup(group, index)
  );
  const defaultGroupId = raw.defaultGroupId || groups[0]?.id || null;
  return {
    clientId,
    plan: getLimitsForClient(clientId).plan,
    limits: getLimitsForClient(clientId),
    defaultConnectionId: raw.defaultConnectionId || null,
    defaultGroupId,
    handoffKeywords: String(raw.handoffKeywords || 'agente,asesor,humano,persona').trim(),
    groups,
  };
};

const updateClientSettings = (clientId, payload = {}, connectionCount = 0) => {
  const data = loadData();
  const limits = getLimitsForClient(clientId);
  const groups = (Array.isArray(payload.groups) ? payload.groups : [])
    .map((group, index) => sanitizeGroup(group, index))
    .slice(0, limits.maxGroups);

  const next = {
    clientId,
    defaultConnectionId: payload.defaultConnectionId || null,
    defaultGroupId: payload.defaultGroupId || groups[0]?.id || null,
    handoffKeywords: String(payload.handoffKeywords || 'agente,asesor,humano,persona').trim(),
    groups: groups.length ? groups : [defaultGroup()],
  };

  if (connectionCount > limits.maxConnections) {
    const error = new Error(`Tu plan ${limits.plan} permite hasta ${limits.maxConnections} conexiones de WhatsApp.`);
    error.code = 'CONNECTION_LIMIT_REACHED';
    throw error;
  }

  data.clients = data.clients || {};
  data.clients[clientId] = next;
  saveData(data);
  return getClientSettings(clientId);
};

const resolveGroupForConnection = (clientId, connectionId = null, preferredGroupId = null) => {
  const settings = getClientSettings(clientId);
  const groups = Array.isArray(settings.groups) ? settings.groups.filter((group) => group.active) : [];
  if (!groups.length) return null;

  const compatibleGroups = connectionId
    ? groups.filter((group) => !group.connectionId || group.connectionId === connectionId)
    : groups;

  return (
    compatibleGroups.find((group) => group.id === preferredGroupId) ||
    compatibleGroups.find((group) => group.id === settings.defaultGroupId) ||
    compatibleGroups[0] ||
    null
  );
};

module.exports = {
  getClientSettings,
  updateClientSettings,
  getLimitsForClient,
  resolveGroupForConnection,
};

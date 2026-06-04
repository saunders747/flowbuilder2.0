const STORE_PREFIX = 'hio_swb_entity_';
const USER_KEY = 'hio_swb_user';
const SETTINGS_TOKEN_KEY = 'hio_swb_settings_token';
const REMOTE_STORAGE_ENABLED = import.meta.env.VITE_STORAGE_MODE === 'remote';

const ENTITY_NAMES = [
  'Process',
  'ImprovementAction',
  'ProcessRevision',
  'AppSettings',
  'StepActuals',
  'ProcessPresence',
  'User',
];

const isBrowser = typeof window !== 'undefined';

function storage() {
  return isBrowser ? window.localStorage : null;
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = 'rec') {
  if (isBrowser && window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getCurrentUser() {
  const fallback = {
    id: 'local-user',
    email: 'local.user@standalone.app',
    full_name: 'Local User',
    role: 'admin',
  };
  const ls = storage();
  if (!ls) return fallback;
  try {
    const stored = JSON.parse(ls.getItem(USER_KEY) || 'null');
    return stored || fallback;
  } catch {
    return fallback;
  }
}

function readEntity(entityName) {
  const ls = storage();
  if (!ls) return [];
  try {
    return JSON.parse(ls.getItem(`${STORE_PREFIX}${entityName}`) || '[]');
  } catch {
    return [];
  }
}

function writeEntity(entityName, records) {
  const ls = storage();
  if (!ls) return;
  ls.setItem(`${STORE_PREFIX}${entityName}`, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent('hio-swb-entity-change', { detail: { entityName } }));
}

async function callStorage(payload) {
  const res = await fetch('/api/storage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(storage()?.getItem(SETTINGS_TOKEN_KEY)
        ? { 'X-Settings-Token': storage().getItem(SETTINGS_TOKEN_KEY) }
        : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Storage request failed (${res.status})`);
  return body;
}

export function hasSettingsAccess() {
  return Boolean(storage()?.getItem(SETTINGS_TOKEN_KEY));
}

export function lockSettingsAccess() {
  storage()?.removeItem(SETTINGS_TOKEN_KEY);
}

export async function unlockSettingsAccess(pin) {
  if (!REMOTE_STORAGE_ENABLED) {
    const expected = import.meta.env.VITE_SETTINGS_PIN || '2468';
    if (String(pin || '') !== expected) throw new Error('Invalid settings PIN');
    storage()?.setItem(SETTINGS_TOKEN_KEY, `local.${Date.now()}`);
    return true;
  }

  const res = await fetch('/api/settings-pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || 'Invalid settings PIN');
  storage()?.setItem(SETTINGS_TOKEN_KEY, body.token);
  return true;
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function sortRecords(records, orderBy) {
  if (!orderBy) return records;
  const desc = String(orderBy).startsWith('-');
  const field = desc ? String(orderBy).slice(1) : String(orderBy);
  return [...records].sort((a, b) => {
    const result = compareValues(a?.[field], b?.[field]);
    return desc ? -result : result;
  });
}

function matchesCriterion(value, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$gte' in expected) return value >= expected.$gte;
    if ('$lte' in expected) return value <= expected.$lte;
    if ('$gt' in expected) return value > expected.$gt;
    if ('$lt' in expected) return value < expected.$lt;
    if ('$ne' in expected) return value !== expected.$ne;
    if ('$in' in expected) return expected.$in.includes(value);
  }
  return value === expected;
}

function matchesCriteria(record, criteria = {}) {
  return Object.entries(criteria || {}).every(([key, expected]) => {
    if (key === '$or' && Array.isArray(expected)) return expected.some(c => matchesCriteria(record, c));
    return matchesCriterion(record?.[key], expected);
  });
}

function createEntityClient(entityName) {
  return {
    async list(orderBy = '-updated_date', limit) {
      if (REMOTE_STORAGE_ENABLED) {
        const { records } = await callStorage({ action: 'list', entityName, orderBy, limit });
        return records || [];
      }
      const records = sortRecords(readEntity(entityName), orderBy);
      return typeof limit === 'number' ? records.slice(0, limit) : records;
    },

    async filter(criteria = {}, orderBy = '-updated_date', limit) {
      if (REMOTE_STORAGE_ENABLED) {
        const { records } = await callStorage({ action: 'filter', entityName, criteria, orderBy, limit });
        return records || [];
      }
      const records = sortRecords(readEntity(entityName).filter(r => matchesCriteria(r, criteria)), orderBy);
      return typeof limit === 'number' ? records.slice(0, limit) : records;
    },

    async get(id) {
      if (REMOTE_STORAGE_ENABLED) {
        const { record } = await callStorage({ action: 'get', entityName, id });
        if (!record) throw new Error(`${entityName} not found`);
        return record;
      }
      const record = readEntity(entityName).find(r => r.id === id);
      if (!record) throw new Error(`${entityName} not found`);
      return record;
    },

    async create(data = {}) {
      if (REMOTE_STORAGE_ENABLED) {
        const { record } = await callStorage({ action: 'create', entityName, data });
        return record;
      }
      const user = getCurrentUser();
      const record = {
        ...data,
        id: data.id || makeId(entityName.toLowerCase()),
        created_date: data.created_date || nowIso(),
        updated_date: nowIso(),
        created_by: data.created_by || user.email,
      };
      writeEntity(entityName, [...readEntity(entityName), record]);
      return record;
    },

    async update(id, data = {}) {
      if (REMOTE_STORAGE_ENABLED) {
        const { record } = await callStorage({ action: 'update', entityName, id, data });
        return record;
      }
      let updated;
      const records = readEntity(entityName).map(record => {
        if (record.id !== id) return record;
        updated = { ...record, ...data, id, updated_date: nowIso() };
        return updated;
      });
      if (!updated) throw new Error(`${entityName} not found`);
      writeEntity(entityName, records);
      return updated;
    },

    async delete(id) {
      if (REMOTE_STORAGE_ENABLED) {
        await callStorage({ action: 'delete', entityName, id });
        return { id, deleted: true };
      }
      writeEntity(entityName, readEntity(entityName).filter(record => record.id !== id));
      return { id, deleted: true };
    },

    subscribe(callback) {
      if (!isBrowser) return () => {};
      const handler = (event) => {
        if (event.detail?.entityName === entityName) callback({ records: readEntity(entityName) });
      };
      window.addEventListener('hio-swb-entity-change', handler);
      return () => window.removeEventListener('hio-swb-entity-change', handler);
    },
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function fileToText(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

async function callOpenAI(payload) {
  const res = await fetch('/api/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `OpenAI request failed (${res.status})`);
  return body;
}

const conversations = new Map();
const conversationSubscribers = new Map();

function notifyConversation(conversationId) {
  const conversation = conversations.get(conversationId);
  const subscribers = conversationSubscribers.get(conversationId) || new Set();
  subscribers.forEach(callback => callback({ messages: conversation?.messages || [] }));
}

export const appClient = {
  auth: {
    async me() {
      return getCurrentUser();
    },
    redirectToLogin() {},
    logout() {},
    async updateMe(data = {}) {
      const user = { ...getCurrentUser(), ...data };
      storage()?.setItem(USER_KEY, JSON.stringify(user));
      return user;
    },
  },

  entities: ENTITY_NAMES.reduce((acc, entityName) => {
    acc[entityName] = createEntityClient(entityName);
    return acc;
  }, {}),

  integrations: {
    Core: {
      async UploadFile({ file }) {
        if (!file) throw new Error('No file supplied');
        if (file.type === 'application/json' || file.name?.toLowerCase().endsWith('.json')) {
          return { file_url: await fileToText(file) };
        }
        return { file_url: await fileToDataUrl(file) };
      },

      async InvokeLLM({ prompt, response_json_schema, file_urls = [] }) {
        const result = await callOpenAI({
          mode: response_json_schema ? 'json' : 'text',
          prompt,
          response_json_schema,
          file_urls,
        });
        return response_json_schema ? result.json : { text: result.text };
      },
    },
  },

  agents: {
    async createConversation({ agent_name, metadata = {}, system_prompt = '' }) {
      const id = makeId('conversation');
      const conversation = { id, agent_name, metadata, system_prompt, messages: [] };
      conversations.set(id, conversation);
      return conversation;
    },

    subscribeToConversation(conversationId, callback) {
      const subscribers = conversationSubscribers.get(conversationId) || new Set();
      subscribers.add(callback);
      conversationSubscribers.set(conversationId, subscribers);
      callback({ messages: conversations.get(conversationId)?.messages || [] });
      return () => subscribers.delete(callback);
    },

    async addMessage(conversation, message) {
      const record = conversations.get(conversation.id) || conversation;
      record.messages = [...(record.messages || []), message];
      conversations.set(record.id, record);
      notifyConversation(record.id);

      if (message.role === 'user') {
        const history = record.messages
          .map(m => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
          .join('\n\n');
        const result = await callOpenAI({
          mode: 'text',
          prompt: `${record.system_prompt ? `${record.system_prompt}\n\n` : ''}${history}`,
        });
        record.messages = [...record.messages, { role: 'assistant', content: result.text || '' }];
        conversations.set(record.id, record);
        notifyConversation(record.id);
      }
      return message;
    },
  },

  analytics: {
    track() {},
  },
};

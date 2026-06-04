import { verifySettingsToken } from './settings-pin.js';

const TABLE = 'app_records';

function env(name) {
  return process.env[name];
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = 'rec') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

function sortRecords(records, orderBy) {
  if (!orderBy) return records;
  const desc = String(orderBy).startsWith('-');
  const field = desc ? String(orderBy).slice(1) : String(orderBy);
  return [...records].sort((a, b) => {
    const av = a?.[field];
    const bv = b?.[field];
    if (av == null && bv == null) return 0;
    if (av == null) return desc ? 1 : -1;
    if (bv == null) return desc ? -1 : 1;
    const result = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv));
    return desc ? -result : result;
  });
}

async function supabase(path, options = {}) {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');

  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.message || `Supabase request failed (${response.status})`);
  return body;
}

async function getRows(entityName) {
  return await supabase(`${TABLE}?entity=eq.${encodeURIComponent(entityName)}&select=id,data`);
}

async function getRecord(entityName, id) {
  const rows = await supabase(`${TABLE}?entity=eq.${encodeURIComponent(entityName)}&id=eq.${encodeURIComponent(id)}&select=id,data`);
  return rows?.[0]?.data || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, entityName, id, data = {}, criteria = {}, orderBy = '-updated_date', limit } = req.body || {};
    if (!action || !entityName) return res.status(400).json({ error: 'Missing action or entityName' });
    const isProtectedSettingsWrite = entityName === 'AppSettings' && ['update', 'delete'].includes(action);
    if (isProtectedSettingsWrite && !verifySettingsToken(req.headers['x-settings-token'])) {
      return res.status(403).json({ error: 'Settings PIN required' });
    }

    if (action === 'list' || action === 'filter') {
      const rows = await getRows(entityName);
      const all = rows.map(row => row.data);
      const filtered = action === 'filter' ? all.filter(record => matchesCriteria(record, criteria)) : all;
      const sorted = sortRecords(filtered, orderBy);
      return res.status(200).json({ records: typeof limit === 'number' ? sorted.slice(0, limit) : sorted });
    }

    if (action === 'get') {
      const record = await getRecord(entityName, id);
      if (!record) return res.status(404).json({ error: `${entityName} not found` });
      return res.status(200).json({ record });
    }

    if (action === 'create') {
      const record = {
        ...data,
        id: data.id || makeId(entityName.toLowerCase()),
        created_date: data.created_date || nowIso(),
        updated_date: nowIso(),
        created_by: data.created_by || 'global@standalone.app',
      };
      const rows = await supabase(TABLE, {
        method: 'POST',
        body: JSON.stringify({ entity: entityName, id: record.id, data: record }),
      });
      return res.status(200).json({ record: rows?.[0]?.data || record });
    }

    if (action === 'update') {
      const existing = await getRecord(entityName, id);
      if (!existing) return res.status(404).json({ error: `${entityName} not found` });
      const record = { ...existing, ...data, id, updated_date: nowIso() };
      const rows = await supabase(`${TABLE}?entity=eq.${encodeURIComponent(entityName)}&id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ data: record }),
      });
      return res.status(200).json({ record: rows?.[0]?.data || record });
    }

    if (action === 'delete') {
      await supabase(`${TABLE}?entity=eq.${encodeURIComponent(entityName)}&id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      return res.status(200).json({ deleted: true });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Storage request failed' });
  }
}

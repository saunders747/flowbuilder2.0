import crypto from 'crypto';

const DEFAULT_PIN = '2468';

function getPin() {
  return process.env.SETTINGS_PIN || DEFAULT_PIN;
}

function sign(value) {
  const secret = process.env.SETTINGS_PIN_SECRET || process.env.SETTINGS_PIN || DEFAULT_PIN;
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export function verifySettingsToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [issuedAt, signature] = token.split('.');
  if (!issuedAt || !signature) return false;
  const issued = Number(issuedAt);
  if (!Number.isFinite(issued)) return false;
  const maxAgeMs = 8 * 60 * 60 * 1000;
  if (Date.now() - issued > maxAgeMs) return false;
  const expected = sign(issuedAt);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { pin } = req.body || {};
  if (String(pin || '') !== getPin()) {
    return res.status(401).json({ error: 'Invalid settings PIN' });
  }

  const issuedAt = String(Date.now());
  return res.status(200).json({ token: `${issuedAt}.${sign(issuedAt)}` });
}

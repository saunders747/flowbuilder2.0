import { useState, useEffect } from 'react';

export const DEFAULT_ROLE_COLORS = {
  Fitter: '#f59e0b',
  Electrician: '#3b82f6',
  Boilermaker: '#ef4444',
  Supervisor: '#8b5cf6',
  Operator: '#10b981',
  'Service Person': '#06b6d4',
  'Auto-Electrician': '#f97316',
  'HV Electrician': '#6366f1',
  AHS: '#84cc16',
  default: '#94a3b8',
};

const STORAGE_KEY = 'roleColours';

function load() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...DEFAULT_ROLE_COLORS, ...JSON.parse(stored) } : { ...DEFAULT_ROLE_COLORS };
  } catch {
    return { ...DEFAULT_ROLE_COLORS };
  }
}

export function getRoleColour(role, colours) {
  if (!role || !colours) return DEFAULT_ROLE_COLORS.default;
  return colours[role] || colours.default || DEFAULT_ROLE_COLORS.default;
}

// ─── Hook (delegates to AppSettings context for global persistence) ───────────
export { useRoleColours } from '@/hooks/useAppSettings';
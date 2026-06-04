import { useState } from 'react';

const STORAGE_KEY = 'tool_time_groups_v1';

export const DEFAULT_TOOL_TIME_GROUPS = {
  tooltime: {
    label: 'Tooltime',
    color: '#006A9D',
    subcategories: [
      'Tooltime - Planned Maint',
      'Tooltime - Break-in Work',
    ],
  },
  nva_essential: {
    label: 'NVA - Essential Tasks',
    color: '#EAB308',
    subcategories: [
      'Other Maintenance Activities',
      'Supervision of Others',
      'Admin Tasks (including HSE)',
      'Meetings (including toolbox)',
      'Handover',
      'Training',
    ],
  },
  nva_activities: {
    label: 'NVA Activities',
    color: '#F68C50',
    subcategories: [
      'Sourcing Parts / Spares',
      'Sourcing Tools / Equipment',
      'Travel',
      'Breaks',
    ],
  },
  waste: {
    label: 'Waste',
    color: '#F15B55',
    subcategories: [
      'Waiting for Others',
      'Waiting for Clearance / Hold Point',
      'Idle',
      'On the Job Waste',
      'Not at Work Area',
    ],
  },
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_TOOL_TIME_GROUPS;
  } catch {
    return DEFAULT_TOOL_TIME_GROUPS;
  }
}

function save(groups) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

// ─── Hook (delegates to AppSettings context for global persistence) ───────────
export { useToolTimeCategories } from '@/hooks/useAppSettings';

// Singleton-style read for non-hook contexts (e.g. SmartCategorise, YamazumiChart)
export function getStoredToolTimeGroups() {
  try {
    const raw = localStorage.getItem('tool_time_groups_v1');
    return raw ? JSON.parse(raw) : DEFAULT_TOOL_TIME_GROUPS;
  } catch { return DEFAULT_TOOL_TIME_GROUPS; }
}
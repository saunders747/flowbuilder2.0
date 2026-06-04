// Tool Time Categories derived from DILO-FIT CSV
// Groups are user-editable and stored in localStorage via useToolTimeCategories hook.
// This module reads the current stored value for use in non-hook contexts.

import { getStoredToolTimeGroups, DEFAULT_TOOL_TIME_GROUPS } from '@/hooks/useToolTimeCategories';

// Live read from storage (falls back to defaults)
export const TOOL_TIME_GROUPS = getStoredToolTimeGroups();

// Flat list for dropdowns
export const ALL_TOOL_TIME_CATEGORIES = Object.entries(TOOL_TIME_GROUPS).flatMap(([groupKey, group]) =>
  group.subcategories.map(sub => ({
    value: `${groupKey}::${sub}`,
    label: sub,
    group: group.label,
    groupKey,
    color: group.color,
  }))
);

// Sub-categories per main category (for step form)
export const TOOL_TIME_SUBCATEGORIES = {
  'Tooltime - Planned Maint': ['On Schedule', 'Other'],
  'Tooltime - Break-in Work': ['Scheduled', 'Unscheduled'],
  'Other Maintenance Activities': ['Cleaning', 'Workshop Maintenance', 'Isolations/Lock On-Off', 'EAC Setup/Demob', 'Set Up / Pack Up Workfront', 'Positioning Truck/Spotting', 'Other'],
  'Supervision of Others': ['Training / Instructing other', 'Apprentice supervision', 'Safety Interactions', 'Other'],
  'Admin Tasks (including HSE)': ['Obzervr Data Entry', 'Risk assessment / JSA', 'Other'],
  'Meetings (including toolbox)': ['Prestart (L1)', 'Job Specific', 'Mandatory', 'HSE', 'Other'],
  'Handover': ['From previous shift', 'To next shift', 'Task Handover (same crew)', 'Other'],
  'Training': ['VOC', 'Job Specific', 'HSE', 'PTW', 'Other'],
  'Sourcing Parts / Spares': ['Spares from Stores', 'Spares on job', 'Spares in Workshop', 'Consumables', 'Other'],
  'Sourcing Tools / Equipment': ['from workshop', 'from store', 'heavy equipment (Cranes, Vac Truck, etc)', 'cleaning tools', 'Other'],
  'Travel': ['To job', 'To Workshop', 'Offsite', 'To Permit Office', 'To PCR/OCC', 'Other'],
  'Breaks': ['Lunch', 'Morning/afternoon Tea', 'Unplanned', 'Smoking Break', 'Other (including toilet)'],
  'Waiting for Others': ['Waiting for support', 'Waiting for other trades', 'Waiting for operators', 'Waiting for instructions', 'Queuing'],
  'Waiting for Clearance / Hold Point': ['Hold Point not Approved', 'Clearance not Approved', 'Waiting for Permit', 'Return of Clearance', 'Other'],
  'Idle': ['On job', 'In Workshop', 'Other'],
  'On the Job Waste': ['Quality Losses (Rework)', 'Efficiency Losses', 'Other'],
  'Not at Work Area': ['Left Job', 'Task Halted', 'Other'],
};

// Color for a given group key
export const getGroupColor = (groupKey) => TOOL_TIME_GROUPS[groupKey]?.color || '#94a3b8';
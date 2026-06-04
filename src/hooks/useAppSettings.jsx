/**
 * useAppSettings — single source of truth for all user-configurable app settings.
 * Persists to the AppSettings entity (one record per app) with localStorage fallback.
 *
 * Re-exports specialised hooks so existing import sites keep working unchanged:
 *   useRoles()             → from useRoles.js  (or directly here)
 *   useSections()          → from useSections.js
 *   useToolTimeCategories() → from useToolTimeCategories.js
 *   useRoleColours()       → from useRoleColours.js
 *   useFleet()             → re-exported at bottom of THIS file
 */

import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { appClient } from '@/api/standaloneClient';
import { DEFAULT_TOOL_TIME_GROUPS } from './useToolTimeCategories';
import { DEFAULT_ROLE_COLORS } from './useRoleColours';

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_ROLES = ['Fitter', 'Service Person', 'Auto-Electrician', 'HV Electrician', 'Boilermaker', 'AHS'];
const DEFAULT_SECTIONS = ['Prepare', 'Pre Service', 'Service', 'Post Service', 'Wash', 'Inspection'];
export const DEFAULT_FLEET_CLASSES = ['CAT 793F', 'CAT 797F', 'EH4000', 'EH5000', 'CAT 994K', 'EX3600', 'EX5600', 'CAT D11', 'CAT 16M', 'CAT 24M', 'DM45', 'PV271'];

// ─── Context ─────────────────────────────────────────────────────────────────

const AppSettingsContext = createContext(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function AppSettingsProvider({ children }) {
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [toolTimeGroups, setToolTimeGroups] = useState(DEFAULT_TOOL_TIME_GROUPS);
  const [roleColours, setRoleColours] = useState({ ...DEFAULT_ROLE_COLORS });
  const [fleetClasses, setFleetClasses] = useState(DEFAULT_FLEET_CLASSES);
  const [recordId, setRecordId] = useState(null);
  const recordIdRef = useRef(null);
  const saveTimerRef = useRef(null);

  // ── Load from backend on mount ──────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const records = await appClient.entities.AppSettings.list();
        if (records && records.length > 0) {
          const rec = records[0];
          setRecordId(rec.id);
          recordIdRef.current = rec.id;
          if (rec.roles) setRoles(JSON.parse(rec.roles));
          if (rec.sections) setSections(JSON.parse(rec.sections));
          if (rec.tool_time_groups) setToolTimeGroups(JSON.parse(rec.tool_time_groups));
          if (rec.role_colours) setRoleColours(JSON.parse(rec.role_colours));
          if (rec.fleet_classes) setFleetClasses(JSON.parse(rec.fleet_classes));
        } else {
          // First-ever load — create the record
          const created = await appClient.entities.AppSettings.create({
            roles: JSON.stringify(DEFAULT_ROLES),
            sections: JSON.stringify(DEFAULT_SECTIONS),
            tool_time_groups: JSON.stringify(DEFAULT_TOOL_TIME_GROUPS),
            role_colours: JSON.stringify(DEFAULT_ROLE_COLORS),
            fleet_classes: JSON.stringify(DEFAULT_FLEET_CLASSES),
          });
          setRecordId(created.id);
          recordIdRef.current = created.id;
        }
      } catch {
        // Backend unavailable — fall back to localStorage
        try {
          const r = localStorage.getItem('mm_swb_roles');
          if (r) setRoles(JSON.parse(r));
          const s = localStorage.getItem('mm_swb_sections');
          if (s) setSections(JSON.parse(s));
          const t = localStorage.getItem('tool_time_groups_v1');
          if (t) setToolTimeGroups(JSON.parse(t));
          const c = localStorage.getItem('roleColours');
          if (c) setRoleColours(JSON.parse(c));
          const f = localStorage.getItem('mm_swb_fleet');
          if (f) setFleetClasses(JSON.parse(f));
        } catch {}
      }
    }
    load();
  }, []);

  // ── Debounced backend save ──────────────────────────────────────────────────
  // Use a ref for the pending patch so rapid updates accumulate and only the latest fires
  const pendingPatchRef = useRef({});
  const scheduleSave = useCallback((patch) => {
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const id = recordIdRef.current;
      const toSave = pendingPatchRef.current;
      pendingPatchRef.current = {};
      try {
        if (id) {
          await appClient.entities.AppSettings.update(id, toSave);
        }
      } catch {}
    }, 600);
  }, []);

  // ── Roles ───────────────────────────────────────────────────────────────────
  const saveRoles = useCallback((next) => {
    setRoles(next);
    try { localStorage.setItem('mm_swb_roles', JSON.stringify(next)); } catch {}
    scheduleSave({ roles: JSON.stringify(next) });
  }, [scheduleSave]);

  const addRole = useCallback((role) => {
    const trimmed = role.trim();
    setRoles(prev => {
      if (!trimmed || prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      saveRoles(next);
      return next;
    });
  }, [saveRoles]);

  const removeRole = useCallback((role) => {
    setRoles(prev => {
      const next = prev.filter(r => r !== role);
      saveRoles(next);
      return next;
    });
  }, [saveRoles]);

  const renameRole = useCallback((oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return false;
    // Check for duplicate synchronously before setState
    setRoles(prev => {
      if (prev.includes(trimmed)) return prev; // no-op, duplicate
      const next = prev.map(r => r === oldName ? trimmed : r);
      saveRoles(next);
      return next;
    });
    return true;
  }, [saveRoles]);

  const resetRoles = useCallback(() => saveRoles(DEFAULT_ROLES), [saveRoles]);

  // ── Sections ────────────────────────────────────────────────────────────────
  const saveSections = useCallback((next) => {
    setSections(next);
    try { localStorage.setItem('mm_swb_sections', JSON.stringify(next)); } catch {}
    scheduleSave({ sections: JSON.stringify(next) });
  }, [scheduleSave]);

  const addSection = useCallback((s) => {
    const trimmed = (s || '').trim();
    setSections(prev => {
      if (!trimmed || prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      saveSections(next);
      return next;
    });
  }, [saveSections]);

  const removeSection = useCallback((s) => {
    setSections(prev => {
      const next = prev.filter(x => x !== s);
      saveSections(next);
      return next;
    });
  }, [saveSections]);

  const resetSections = useCallback(() => saveSections(DEFAULT_SECTIONS), [saveSections]);

  // ── Tool Time Groups ────────────────────────────────────────────────────────
  const saveToolTimeGroups = useCallback((next) => {
    setToolTimeGroups(next);
    try { localStorage.setItem('tool_time_groups_v1', JSON.stringify(next)); } catch {}
    scheduleSave({ tool_time_groups: JSON.stringify(next) });
  }, [scheduleSave]);

  const updateGroup = useCallback((key, patch) => {
    setToolTimeGroups(prev => {
      const next = { ...prev, [key]: { ...prev[key], ...patch } };
      saveToolTimeGroups(next);
      return next;
    });
  }, [saveToolTimeGroups]);

  const addSubcategory = useCallback((groupKey, sub) => {
    if (!sub.trim()) return;
    setToolTimeGroups(prev => {
      const existing = prev[groupKey]?.subcategories || [];
      if (existing.includes(sub.trim())) return prev;
      const next = { ...prev, [groupKey]: { ...prev[groupKey], subcategories: [...existing, sub.trim()] } };
      saveToolTimeGroups(next);
      return next;
    });
  }, [saveToolTimeGroups]);

  const removeSubcategory = useCallback((groupKey, sub) => {
    setToolTimeGroups(prev => {
      const next = { ...prev, [groupKey]: { ...prev[groupKey], subcategories: prev[groupKey].subcategories.filter(s => s !== sub) } };
      saveToolTimeGroups(next);
      return next;
    });
  }, [saveToolTimeGroups]);

  const resetToolTimeGroups = useCallback(() => saveToolTimeGroups(DEFAULT_TOOL_TIME_GROUPS), [saveToolTimeGroups]);

  // ── Role Colours ────────────────────────────────────────────────────────────
  const saveRoleColours = useCallback((next) => {
    setRoleColours(next);
    try { localStorage.setItem('roleColours', JSON.stringify(next)); } catch {}
    scheduleSave({ role_colours: JSON.stringify(next) });
  }, [scheduleSave]);

  const setColour = useCallback((role, colour) => {
    setRoleColours(prev => {
      const next = { ...prev, [role]: colour };
      saveRoleColours(next);
      return next;
    });
  }, [saveRoleColours]);

  const renameColourKey = useCallback((oldName, newName) => {
    setRoleColours(prev => {
      if (prev[oldName] === undefined) return prev;
      const next = { ...prev, [newName]: prev[oldName] };
      delete next[oldName];
      saveRoleColours(next);
      return next;
    });
  }, [saveRoleColours]);

  const resetColours = useCallback(() => saveRoleColours({ ...DEFAULT_ROLE_COLORS }), [saveRoleColours]);

  // ── Fleet Classes ───────────────────────────────────────────────────────────
  const saveFleetClasses = useCallback((next) => {
    setFleetClasses(next);
    try { localStorage.setItem('mm_swb_fleet', JSON.stringify(next)); } catch {}
    scheduleSave({ fleet_classes: JSON.stringify(next) });
  }, [scheduleSave]);

  const addFleetClass = useCallback((item) => {
    const trimmed = (item || '').trim();
    setFleetClasses(prev => {
      if (!trimmed || prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      saveFleetClasses(next);
      return next;
    });
  }, [saveFleetClasses]);

  const removeFleetClass = useCallback((item) => {
    setFleetClasses(prev => {
      const next = prev.filter(f => f !== item);
      saveFleetClasses(next);
      return next;
    });
  }, [saveFleetClasses]);

  const resetFleetClasses = useCallback(() => saveFleetClasses(DEFAULT_FLEET_CLASSES), [saveFleetClasses]);

  // ── Context value ───────────────────────────────────────────────────────────
  const value = {
    // Roles
    roles, addRole, removeRole, renameRole, resetToDefaultRoles: resetRoles,
    // Sections
    sections, addSection, removeSection, resetToDefaultSections: resetSections,
    // Tool Time Groups
    groups: toolTimeGroups, updateGroup, addSubcategory, removeSubcategory, resetToolTimeGroups,
    // Role Colours
    colours: roleColours, setColour, renameColourKey, resetColours,
    // Fleet Classes
    fleetClasses, addFleetClass, removeFleetClass, resetFleetClasses,
    FLEET_CLASSES: fleetClasses, // legacy alias
  };

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings must be used inside AppSettingsProvider');
  return ctx;
}

// ─── Specialised re-exports (keep existing import sites working) ──────────────

export function useRoles() {
  const { roles, addRole, removeRole, renameRole, resetToDefaultRoles: resetToDefaults } = useAppSettings();
  return { roles, addRole, removeRole, renameRole, resetToDefaults };
}

export function useSections() {
  const { sections, addSection, removeSection, resetToDefaultSections: resetToDefaults } = useAppSettings();
  return { sections, addSection, removeSection, resetToDefaults };
}

export function useToolTimeCategories() {
  const { groups, updateGroup, addSubcategory, removeSubcategory, resetToolTimeGroups: resetToDefaults } = useAppSettings();
  return { groups, updateGroup, addSubcategory, removeSubcategory, resetToDefaults };
}

export function useRoleColours() {
  const { colours, setColour, renameColourKey, resetColours: reset } = useAppSettings();
  return { colours, setColour, renameColourKey, reset };
}

export function useFleet() {
  const { fleetClasses: fleet, addFleetClass: addFleet, removeFleetClass: removeFleet, resetFleetClasses: resetToDefaults } = useAppSettings();
  return { fleet, addFleet, removeFleet, resetToDefaults, FLEET_CLASSES: fleet };
}
/**
 * useSections.js — re-exports from AppSettings (global backend persistence).
 * Import site compatibility shim.
 */
export { useSections } from '@/hooks/useAppSettings';

// Standalone reader for non-hook contexts — reads localStorage as fallback
const STORAGE_KEY = 'mm_swb_sections';
const DEFAULT_SECTIONS = ['Prepare', 'Pre Service', 'Service', 'Post Service', 'Wash', 'Inspection'];
export function getStoredSections() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_SECTIONS;
  } catch { return DEFAULT_SECTIONS; }
}
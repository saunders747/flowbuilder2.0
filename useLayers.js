import { useState } from 'react';

const DEFAULT_LAYERS = [
  { key: 'ground', label: 'Ground', color: '#f59e0b' },
  { key: 'upper_deck', label: 'Upper Deck', color: '#3b82f6' },
  { key: 'layer_3', label: '', color: '#8b5cf6' },
  { key: 'layer_4', label: '', color: '#10b981' },
  { key: 'layer_5', label: '', color: '#ef4444' },
  { key: 'layer_6', label: '', color: '#f97316' },
  { key: 'layer_7', label: '', color: '#6366f1' },
  { key: 'layer_8', label: '', color: '#dc2626' },
];
const STORAGE_KEY = 'mm_swb_layers';

export function useLayers() {
  const [layers, setLayers] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return DEFAULT_LAYERS;
  });

  const save = (updated) => {
    setLayers(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const renameLayer = (key, newLabel) => {
    save(layers.map(l => l.key === key ? { ...l, label: newLabel } : l));
  };

  const addLayer = (label) => {
    const key = `layer_${Date.now()}`;
    const colors = ['#a855f7', '#06b6d4', '#84cc16', '#f43f5e', '#14b8a6', '#fb923c'];
    const color = colors[layers.length % colors.length];
    save([...layers, { key, label: label || '', color }]);
  };

  const removeLayer = (key) => {
    save(layers.filter(l => l.key !== key));
  };

  const resetToDefaults = () => {
    setLayers(DEFAULT_LAYERS);
    localStorage.removeItem(STORAGE_KEY);
  };

  return { layers, renameLayer, addLayer, removeLayer, resetToDefaults };
}
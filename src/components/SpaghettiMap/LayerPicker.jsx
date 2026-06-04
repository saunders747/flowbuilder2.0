import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export default function LayerPicker({ mapLayers, activeLayers, setActiveLayers }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleLayer = (layerId) => {
    setActiveLayers(prev =>
      prev.includes(layerId)
        ? prev.filter(id => id !== layerId)
        : [...prev, layerId]
    );
  };

  const allSelected = mapLayers.length > 0 && activeLayers.length === mapLayers.length;
  const toggleAllLayers = () => {
    setActiveLayers(allSelected ? [] : mapLayers.map(l => l.id));
  };

  const displayLabel = activeLayers.length === 0 
    ? 'No layers'
    : activeLayers.length === mapLayers.length
    ? 'All layers'
    : `${activeLayers.length} layer${activeLayers.length !== 1 ? 's' : ''}`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="h-8 text-xs px-3 rounded border border-border bg-background hover:bg-muted/40 transition-colors flex items-center gap-2 whitespace-nowrap"
      >
        <span>{displayLabel}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>

      {open && mapLayers.length > 0 && (
        <div className="absolute top-full mt-1 left-0 bg-card border border-border rounded-lg shadow-lg z-40 min-w-[160px]">
          <div className="p-2 space-y-1">
            <button
              onClick={toggleAllLayers}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted/40 transition-colors text-left"
            >
              <div className="w-3.5 h-3.5 rounded border border-border flex items-center justify-center" 
                style={{ background: allSelected ? 'hsl(var(--primary))' : 'transparent' }}>
                {allSelected && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span className="font-medium">All layers</span>
            </button>
            <div className="border-t border-border my-1" />
            {mapLayers.map(layer => (
              <button
                key={layer.id}
                onClick={() => toggleLayer(layer.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted/40 transition-colors text-left"
              >
                <div className="w-3.5 h-3.5 rounded border border-border flex items-center justify-center"
                  style={{ background: activeLayers.includes(layer.id) ? 'hsl(var(--primary))' : 'transparent' }}>
                  {activeLayers.includes(layer.id) && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span>{layer.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
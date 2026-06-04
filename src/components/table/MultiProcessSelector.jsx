import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/standaloneClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Save } from 'lucide-react';
import { SLOT_COLORS, MAX_SLOTS } from '@/hooks/useMultiProcessTable';

export default function MultiProcessSelector({ slots, onAdd, onRemove, onSave, onSaveAll }) {
  const { data: processes = [] } = useQuery({
    queryKey: ['processes'],
    queryFn: () => appClient.entities.Process.list('-updated_date', 200),
  });

  const loadedIds = new Set(slots.map(s => s.process.id));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Loaded Processes ({slots.length}/{MAX_SLOTS})
        </span>
        <div className="flex gap-2">
           {slots.length > 1 && (
             <Button size="sm" onClick={onSaveAll} className="h-7 text-xs gap-1 bg-primary hover:bg-primary/90">
               <Save className="w-3 h-3" /> Save All
             </Button>
           )}
         </div>
      </div>

      {/* Loaded slots */}
      <div className="flex flex-wrap gap-2">
        {slots.map((slot, idx) => {
          const color = SLOT_COLORS[idx];
          return (
            <div
              key={slot.process.id}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border"
              style={{ background: color.light, borderColor: color.bg, color: color.text }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: color.bg }}
              />
              <span className="max-w-[160px] truncate">{slot.process.name}</span>
              <span className="text-[10px] opacity-60 ml-0.5">({slot.steps.length})</span>
              <button
                 onClick={() => onSave(slot.process.id)}
                 className="opacity-70 hover:opacity-100 transition-opacity ml-0.5 text-primary hover:text-primary"
                 title="Save this process"
               >
                 <Save className="w-3 h-3" />
               </button>
              <button
                onClick={() => onRemove(slot.process.id)}
                className="opacity-60 hover:opacity-100 transition-opacity"
                title="Remove from view"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {/* Add process dropdown */}
        {slots.length < MAX_SLOTS && (
          <Select onValueChange={(id) => {
            const proc = processes.find(p => p.id === id);
            if (proc) onAdd(proc);
          }}>
            <SelectTrigger className="h-7 w-auto min-w-[160px] text-xs gap-1 border-dashed">
              <Plus className="w-3 h-3" />
              <SelectValue placeholder="Add process…" />
            </SelectTrigger>
            <SelectContent>
              {processes.filter(p => !loadedIds.has(p.id)).map(p => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}{p.fleet_class ? ` — ${p.fleet_class}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
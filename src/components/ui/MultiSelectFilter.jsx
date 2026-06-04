import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MultiSelectFilter({ label, options, selected, onChange, width = 'w-44' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isAll = selected.length === 0;
  const toggle = (opt) => isAll
    ? onChange([opt])
    : selected.includes(opt) ? onChange(selected.filter(v => v !== opt)) : onChange([...selected, opt]);

  const label_ = isAll ? `All ${label}s`
    : selected.length === 1 ? selected[0]
    : `${selected.length} ${label}s`;

  return (
    <div ref={ref} className={cn('relative', width)}>
      <button type="button" onClick={() => setOpen(!open)}
        className={cn('w-full h-7 px-2 text-xs rounded border flex items-center justify-between gap-1',
          'bg-background border-border focus:outline-none focus:ring-1 focus:ring-primary',
          open && 'ring-1 ring-primary', !isAll && 'border-primary/50 bg-primary/5')}>
        <span className="truncate text-left flex items-center gap-1">
          {!isAll && <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex-shrink-0">{selected.length}</span>}
          {label_}
        </span>
        {!isAll
          ? <X className="w-3 h-3 flex-shrink-0 text-muted-foreground" onClick={(e) => { e.stopPropagation(); onChange([]); }} />
          : <ChevronDown className={cn('w-3 h-3 flex-shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-0.5 z-50 bg-popover border border-border rounded-md shadow-lg min-w-full max-h-60 overflow-y-auto py-1">
          <button type="button" onClick={() => onChange([])}
            className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left', isAll && 'font-medium')}>
            <span className={cn('w-3.5 h-3.5 rounded flex items-center justify-center border flex-shrink-0', isAll ? 'bg-primary border-primary' : 'border-border')}>
              {isAll && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
            </span>All {label}s
          </button>
          <div className="border-t border-border/50 my-1" />
          {options.map(opt => {
            const checked = selected.includes(opt);
            return (
              <button key={opt} type="button" onClick={() => toggle(opt)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left">
                <span className={cn('w-3.5 h-3.5 rounded flex items-center justify-center border flex-shrink-0',
                  checked ? 'bg-primary border-primary' : 'border-border')}>
                  {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </span>{opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
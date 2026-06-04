import React, { useMemo } from 'react';
import { AlertTriangle, XCircle, Info } from 'lucide-react';

function getStepTotal(s) {
  return (Number(s.manual_time)||0) + (Number(s.walking_time)||0) +
    (Number(s.waiting_time)||0) + (Number(s.machine_time)||0) +
    (Number(s.inspection_time)||0);
}

function detectCircularDependency(stepId, steps) {
  const depMap = {};
  steps.forEach(s => { depMap[s.id] = s.dependencies || []; });
  const visited = new Set();
  const queue   = [stepId];
  while (queue.length > 0) {
    const curr = queue.shift();
    for (const dep of (depMap[curr] || [])) {
      if (dep === stepId) return true;
      if (!visited.has(dep)) { visited.add(dep); queue.push(dep); }
    }
  }
  return false;
}

export function useStepValidation(steps) {
  return useMemo(() => {
    if (!steps || steps.length === 0)
      return { errors:[], warnings:[], infos:[], hasIssues:false,
        errorCount:0, warningCount:0, infoCount:0 };
    const errors=[], warnings=[], infos=[];

    steps.forEach(s => {
      const lbl = `#${s.step_number}${s.task_description
        ? ` "${s.task_description.substring(0,30)}"` : ''}`;

      // Errors
      [['manual_time','manual time'],['walking_time','walking time'],
       ['waiting_time','waiting time'],['machine_time','machine time'],
       ['inspection_time','inspection time']].forEach(([f,l]) => {
        const v = Number(s[f]);
        if (s[f] != null && s[f] !== '' && v < 0)
          errors.push({ stepId:s.id, stepLabel:lbl,
            message:`${l} is negative — must be ≥ 0` });
      });
      if ((s.dependencies||[]).length > 0 && detectCircularDependency(s.id, steps))
        errors.push({ stepId:s.id, stepLabel:lbl,
          message:'Circular dependency detected — creates an infinite loop' });

      // Warnings
      if (getStepTotal(s) === 0)
        warnings.push({ stepId:s.id, stepLabel:lbl,
          message:'Zero total duration — all time fields are 0' });
      if (!s.role)
        warnings.push({ stepId:s.id, stepLabel:lbl,
          message:'No role assigned — step excluded from role filters and Obzervr export' });
      if (!s.tool_time_category)
        warnings.push({ stepId:s.id, stepLabel:lbl,
          message:'No tool time category — excluded from PCE calculation' });
      if (getStepTotal(s) > 120)
        warnings.push({ stepId:s.id, stepLabel:lbl,
          message:`Very long step (${getStepTotal(s)}m > 2h) — check values are minutes not hours` });

      // Info
      if (!s.section)
        infos.push({ stepId:s.id, stepLabel:lbl,
          message:'No section — not grouped into a work phase' });
    });

    return { errors, warnings, infos,
      hasIssues: errors.length > 0 || warnings.length > 0,
      errorCount: errors.length, warningCount: warnings.length, infoCount: infos.length };
  }, [steps]);
}

export function ValidationPanel({ steps, className = '' }) {
  const [open, setOpen] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(new Set());
  const v = useStepValidation(steps);

  if (!v.hasIssues && v.infoCount === 0) return null;

  const dismiss = key => setDismissed(prev => new Set([...prev, key]));
  const vis_e = v.errors.filter(i   => !dismissed.has(i.stepId+i.message));
  const vis_w = v.warnings.filter(i => !dismissed.has(i.stepId+i.message));
  const vis_i = v.infos.filter(i    => !dismissed.has(i.stepId+i.message));

  // Use visible (post-dismiss) counts everywhere
  const visibleErrors   = vis_e.length;
  const visibleWarnings = vis_w.length;
  const visibleInfos    = vis_i.length;
  const visibleTotal    = visibleErrors + visibleWarnings + visibleInfos;

  if (visibleTotal === 0) return null;

  const dismissAll = () => {
    const allKeys = new Set([
      ...v.errors.map(i => i.stepId+i.message),
      ...v.warnings.map(i => i.stepId+i.message),
      ...v.infos.map(i => i.stepId+i.message),
    ]);
    setDismissed(allKeys);
  };

  return (
    <div className={`border rounded-lg overflow-hidden ${visibleErrors > 0 ? 'border-destructive/40' : 'border-amber-300/60'} ${className}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-left
          hover:opacity-90 transition-colors
          ${visibleErrors > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-amber-50 dark:bg-amber-950/20'}`}>
        <div className="flex items-center gap-3 text-xs font-semibold">
          {visibleErrors > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <XCircle className="w-4 h-4" />
              {visibleErrors} error{visibleErrors !== 1 ? 's' : ''}
            </span>
          )}
          {visibleWarnings > 0 && (
            <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              {visibleWarnings} warning{visibleWarnings !== 1 ? 's' : ''}
            </span>
          )}
          {visibleInfos > 0 && (
            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <Info className="w-4 h-4" />
              {visibleInfos} info
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); dismissAll(); }}
            className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted/50 transition-colors"
            title="Dismiss all">
            Clear all
          </button>
          {open ? '▲' : '▼'}
        </div>
      </button>
      {open && (
        <div className="px-4 py-3 space-y-2 bg-card/50 text-[11px] border-t border-border/20">
          {[
            { items:vis_e, icon: <XCircle className="w-3.5 h-3.5 text-destructive" /> },
            { items:vis_w, icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-500" /> },
            { items:vis_i, icon: <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> },
          ].flatMap(({ items, icon }) =>
            items.map(item => (
              <div key={item.stepId+item.message} className="flex items-start gap-2 text-muted-foreground">
                {icon}
                <div className="flex-1">
                  <span className="font-semibold text-foreground">
                    {item.stepLabel} — 
                  </span>
                  {item.message}
                </div>
                <button
                  onClick={() => dismiss(item.stepId+item.message)}
                  className="text-[10px] text-muted-foreground hover:text-foreground shrink-0 ml-2"
                  title="Dismiss">✕</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default ValidationPanel;
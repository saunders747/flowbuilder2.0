import React from 'react';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';

export default function SequenceOptimiserPanel({
  seqOptResult,
  setSeqOptResult,
  seqOptRole,
  setSeqOptRole,
  seqOptSection,
  setSeqOptSection,
  roles,
  sections,
  onRun,
  onApply,
  onApplyAndDelete,
}) {
  return (
    <>
      <button
        onClick={() => setSeqOptResult(prev => prev && prev !== 'open' ? 'open' : prev === 'open' ? null : 'open')}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors text-left rounded-xl">
        <div>
          <span className="text-sm font-semibold">⬡ Sequence Optimiser</span>
          <span className="text-[11px] text-muted-foreground ml-3">Resequence tasks by role and section using spaghetti map node positions</span>
        </div>
        <span className="text-muted-foreground text-xs">{seqOptResult === 'open' ? '▲' : '▼'}</span>
      </button>

      {seqOptResult === 'open' && (
        <CardContent className="pt-0 pb-3 px-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Role</label>
              <select value={seqOptRole || ''} onChange={e => setSeqOptRole(e.target.value || null)}
                className="h-7 text-xs px-2 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">— Select role —</option>
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Section</label>
              <select value={seqOptSection} onChange={e => setSeqOptSection(e.target.value)}
                className="h-7 text-xs px-2 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="all">All sections</option>
                {sections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white" onClick={onRun}>
              Run Optimiser
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Uses node positions from the Spaghetti Map. Applies changes to step order in the Combination Table and syncs immediately across the app.
          </p>
        </CardContent>
      )}

      {seqOptResult && seqOptResult !== 'open' && (
        <CardContent className="pt-0 pb-3 px-4">
          <div className="grid grid-cols-2 gap-2 mb-3 text-center">
            <div className="bg-muted/40 rounded-lg py-2">
              <p className="text-[10px] text-muted-foreground">Current walking</p>
              <p className="text-sm font-semibold text-destructive">{seqOptResult.currentDist}px</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg py-2">
              <p className="text-[10px] text-muted-foreground">Optimised walking</p>
              <p className="text-sm font-semibold text-purple-600 dark:text-purple-400">{seqOptResult.optimisedDist}px</p>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto mb-3 space-y-0.5">
            <div className="grid grid-cols-[24px_1fr_1fr] gap-2 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1">
              <div>#</div><div>Current</div><div>Resequenced</div>
            </div>
            {seqOptResult.groupResults.map((item, i) => (
              <div key={item.step.id}
                className={`grid grid-cols-[24px_1fr_1fr] gap-2 items-center px-2 py-1 rounded text-[11px] ${item.changed ? 'bg-purple-50/60 dark:bg-purple-950/20' : 'bg-muted/10'}`}>
                <span className="font-mono font-bold text-muted-foreground text-center">{i + 1}</span>
                <span className={`truncate ${item.changed ? 'line-through text-muted-foreground text-[10px]' : 'text-muted-foreground'}`}>
                  #{item.originalStep?.step_number ?? item.step.step_number} {(item.originalStep?.task_description || item.step.task_description || '—').substring(0, 22)}
                </span>
                <span className={`truncate ${item.changed ? 'font-medium text-purple-700 dark:text-purple-300' : 'text-muted-foreground'}`}>
                  #{item.step.step_number} {(item.step.task_description || '—').substring(0, 22)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSeqOptResult('open')}>← Back</Button>
            <Button size="sm"
              className="h-7 text-xs flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              onClick={onApply}>
              Resequence — {seqOptResult.groupResults.filter(r => r.changed).length} steps
            </Button>
            {seqOptResult.wasteCount > 0 && (
              <Button size="sm"
                className="h-7 text-xs flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={onApplyAndDelete}>
                🗑 Resequence + Delete {seqOptResult.wasteCount} waste
              </Button>
            )}
          </div>
        </CardContent>
      )}
    </>
  );
}
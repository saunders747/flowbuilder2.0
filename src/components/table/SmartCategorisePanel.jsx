import React from 'react';
import { Wand2 } from 'lucide-react';

export default function SmartCategorisePanel({ preview, setPreview, onApply, toolTimeGroups }) {
  if (!preview) return null;

  return (
    <div className="border border-purple-200 rounded-xl overflow-hidden mb-2">
      <div className="flex items-center justify-between px-4 py-2.5 bg-purple-50 dark:bg-purple-950/30 border-b border-purple-200">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-semibold text-purple-800 dark:text-purple-300">
            Smart Categorise — Review Suggestions
          </span>
          <span className="text-[11px] text-purple-600">
            {preview.results.filter(r => r.accepted && r.suggestedCategory).length} of {preview.results.filter(r => r.suggestedCategory).length} selected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreview(prev => ({
              ...prev,
              results: prev.results.map(r => ({ ...r, accepted: !!r.suggestedCategory }))
            }))}
            className="text-[10px] text-purple-600 hover:text-purple-800 px-2 py-0.5 rounded hover:bg-purple-100 transition-colors">
            Select all
          </button>
          <button
            onClick={() => setPreview(prev => ({
              ...prev,
              results: prev.results.map(r => ({ ...r, accepted: false }))
            }))}
            className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted/50 transition-colors">
            Deselect all
          </button>
          <button
            onClick={onApply}
            disabled={preview.applying || preview.results.filter(r => r.accepted && r.suggestedCategory).length === 0}
            className="h-7 px-3 text-[11px] rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors font-semibold disabled:opacity-40 flex items-center gap-1.5">
            {preview.applying
              ? <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Applying…</>
              : 'Apply Selected'}
          </button>
          <button onClick={() => setPreview(null)}
            className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted/50 transition-colors">
            Dismiss
          </button>
        </div>
      </div>
      <div className="max-h-60 overflow-y-auto bg-background divide-y divide-border/30">
        {preview.results.map(r => {
          const catParts = (r.suggestedCategory || '').split('::');
          const groupKey = catParts[0];
          const groupColour = toolTimeGroups[groupKey]?.color || '#94a3b8';
          return (
            <div key={r.stepId}
              onClick={() => setPreview(prev => ({
                ...prev,
                results: prev.results.map(x => x.stepId === r.stepId ? { ...x, accepted: !x.accepted } : x)
              }))}
              className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors ${r.accepted && r.suggestedCategory ? 'bg-purple-50/60 dark:bg-purple-950/10' : 'hover:bg-muted/20'} ${!r.suggestedCategory ? 'opacity-40' : ''}`}>
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${r.accepted && r.suggestedCategory ? 'bg-purple-600 border-purple-600' : 'border-border'}`}>
                {r.accepted && r.suggestedCategory && (
                  <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">#{r.stepNum}</span>
                  <span className="text-[11px] font-medium truncate">{(r.task || '—').substring(0,50)}{(r.task||'').length>50?'…':''}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {r.suggestedCategory ? (
                    <>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: groupColour+'22', color: groupColour, border: `1px solid ${groupColour}44` }}>
                        {r.suggestedCategory.split('::')[1] || r.suggestedCategory}
                      </span>
                      {r.suggestedIntext && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${r.suggestedIntext==='Internal'?'bg-blue-100 text-blue-700':'bg-green-100 text-green-700'}`}>
                          {r.suggestedIntext}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground italic">{r.reason}</span>
                    </>
                  ) : (
                    <span className="text-[10px] text-muted-foreground italic">Could not determine category — assign manually</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
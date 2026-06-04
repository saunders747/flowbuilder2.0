import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Wand2, Loader2, CheckCircle2 } from 'lucide-react';
import { appClient } from '@/api/standaloneClient';
import { toast } from 'sonner';
import { getStoredToolTimeGroups } from '@/hooks/useToolTimeCategories';

/**
 * Analyses all steps via LLM and bulk-assigns tool_time_category + waste_tags.
 * Only updates steps that are currently unassigned (or the user selects "re-analyse all").
 */
export default function SmartCategorise({ steps, updateStep, scope = 'unassigned' }) {
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState(null); // { results: [{id, category, waste_tags, reason}] }
  const [applying, setApplying] = useState(false);

  const groups = getStoredToolTimeGroups();

  // Build a flat map of category key → label for the LLM prompt
  const categoryList = Object.entries(groups).flatMap(([gKey, g]) =>
    g.subcategories.map(sub => `${gKey}::${sub}`)
  );

  const targetSteps = scope === 'unassigned'
    ? steps.filter(s => !s.tool_time_category)
    : steps;

  const run = async () => {
    if (targetSteps.length === 0) {
      toast.info('All steps already have categories. Use "Re-analyse all" to override.');
      return;
    }
    setRunning(true);
    setPreview(null);
    try {
      const stepsPayload = targetSteps.map(s => ({
        id: s.id,
        step_number: s.step_number,
        task_description: s.task_description || '',
        manual_time: s.manual_time || 0,
        walking_time: s.walking_time || 0,
        waiting_time: s.waiting_time || 0,
        machine_time: s.machine_time || 0,
        inspection_time: s.inspection_time || 0,
        role: s.role || '',
        section: s.section || '',
        notes: s.notes || '',
      }));

      const prompt = `You are a lean manufacturing / maintenance engineering expert. Analyse the following process steps and classify each one.

Available tool-time categories (use the EXACT string shown):
${categoryList.map(c => `  - "${c}"`).join('\n')}

Classification rules:
- "tooltime::..." = Direct value-adding work on the asset/equipment (spanner-on-nut time).
- "nva_essential::..." = Necessary but non-value-adding (admin, HSE, meetings, handover, supervision, training).
- "nva_activities::..." = Non-value-adding activities that could be reduced (sourcing parts/tools, travel to work area, breaks).
- "waste::..." = Pure waste — waiting for others, clearance/hold points, idle time, rework, unnecessary movement.

Signals in the data:
- waiting_time > 0 → likely Waste (Waiting for Others or Waiting for Clearance / Hold Point)
- walking_time > 10 → may indicate Travel or Sourcing
- task_description keywords: "wait", "hold", "clearance", "idle", "rework", "redo" → Waste
- keywords: "source", "collect", "get parts", "retrieve tool" → nva_activities::Sourcing Parts / Spares or Sourcing Tools / Equipment
- keywords: "travel", "drive", "walk to" → nva_activities::Travel
- keywords: "toolbox", "briefing", "meeting" → nva_essential::Meetings (including toolbox)
- keywords: "handover", "shift change" → nva_essential::Handover
- keywords: "training", "sign off", "competency" → nva_essential::Training
- keywords: "inspect", "check", "torque check", "verify" → tooltime::Tooltime - Planned Maint (if planned) or nva_essential::Other Maintenance Activities
- keywords: "break", "smoko", "lunch" → nva_activities::Breaks

Also suggest up to 3 waste_tags from: ["Waiting", "Transport", "Overprocessing", "Rework", "Overproduction", "Inventory", "Motion", "UnderutilisedTalent"]. Return [] if the step is not waste.

Steps to classify:
${JSON.stringify(stepsPayload, null, 2)}

Return a JSON object with a "results" array. Each element: { "id": "<step id>", "category": "<exact category string>", "waste_tags": [], "reason": "<one sentence>" }`;

      const response = await appClient.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id:         { type: 'string' },
                  category:   { type: 'string' },
                  waste_tags: { type: 'array', items: { type: 'string' } },
                  reason:     { type: 'string' },
                },
                required: ['id', 'category'],
              },
            },
          },
          required: ['results'],
        },
      });

      // Validate categories — drop any that don't match known values
      const validCats = new Set(categoryList);
      const results = (response.results || []).map(r => ({
        ...r,
        category: validCats.has(r.category) ? r.category : '',
        waste_tags: Array.isArray(r.waste_tags) ? r.waste_tags : [],
      })).filter(r => r.category);

      if (results.length === 0) {
        toast.error('AI could not classify any steps — check your step descriptions.');
      } else {
        setPreview({ results });
      }
    } catch (err) {
      toast.error('Smart Categorise failed: ' + (err?.message || 'unknown error'));
    } finally {
      setRunning(false);
    }
  };

  const applyAll = async () => {
    if (!preview) return;
    setApplying(true);
    let count = 0;
    for (const r of preview.results) {
      updateStep(r.id, { tool_time_category: r.category, waste_tags: r.waste_tags });
      count++;
    }
    toast.success(`Smart Categorise applied to ${count} step${count !== 1 ? 's' : ''}`);
    setPreview(null);
    setApplying(false);
  };

  const dismiss = () => setPreview(null);

  // Category colour helper
  const catColour = (cat) => {
    const l = (cat || '').toLowerCase();
    if (l.startsWith('tooltime'))   return '#006A9D';
    if (l.includes('essential'))    return '#EAB308';
    if (l.startsWith('nva'))        return '#F68C50';
    if (l.startsWith('waste'))      return '#F15B55';
    return '#94a3b8';
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5 text-violet-700 border-violet-300 hover:bg-violet-50 dark:text-violet-300 dark:border-violet-700 dark:hover:bg-violet-950/30"
          onClick={run}
          disabled={running || applying}
          title={`AI-analyse task descriptions and durations to auto-assign tool time categories. ${scope === 'unassigned' ? `${targetSteps.length} unassigned step(s) will be processed.` : `All ${targetSteps.length} step(s) will be re-analysed.`}`}
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          {running ? 'Analysing…' : `Smart Categorise${scope === 'unassigned' && targetSteps.length > 0 ? ` (${targetSteps.length})` : ''}`}
        </Button>
        {scope === 'unassigned' && (
          <button
            onClick={() => { /* trigger with scope=all */ run(); }}
            className="text-[10px] text-muted-foreground hover:text-violet-600 transition-colors"
            title="Re-analyse all steps, even those already categorised"
            disabled={running}
          />
        )}
      </div>

      {/* Preview panel */}
      {preview && (
        <div className="absolute top-full mt-1 right-0 z-50 bg-background border border-border rounded-xl shadow-xl w-[480px] max-h-[400px] overflow-hidden flex flex-col"
          style={{ minWidth: 320 }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-violet-50 dark:bg-violet-950/30">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
              <Wand2 className="w-3.5 h-3.5" />
              AI Suggestions — {preview.results.length} step{preview.results.length !== 1 ? 's' : ''}
            </div>
            <button onClick={dismiss} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
          </div>
          <div className="overflow-y-auto flex-1 p-1.5 space-y-0.5">
            {preview.results.map(r => {
              const step = steps.find(s => s.id === r.id);
              const groupKey = r.category.split('::')[0];
              const subLabel = r.category.split('::')[1] || r.category;
              const groupLabel = groups[groupKey]?.label || groupKey;
              return (
                <div key={r.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 text-xs">
                  <span className="font-mono text-muted-foreground shrink-0 mt-0.5 w-5 text-right">#{step?.step_number}</span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{step?.task_description || r.id}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0"
                        style={{ background: catColour(r.category) + '20', color: catColour(r.category), border: `1px solid ${catColour(r.category)}40` }}>
                        {groupLabel} → {subLabel}
                      </span>
                      {r.waste_tags?.map(tag => (
                        <span key={tag} className="px-1 py-0.5 rounded text-[9px] bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400">{tag}</span>
                      ))}
                    </div>
                    {r.reason && <p className="text-[10px] text-muted-foreground mt-0.5 italic">{r.reason}</p>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-border px-3 py-2 flex items-center justify-between gap-2 bg-muted/20">
            <span className="text-[10px] text-muted-foreground">Review suggestions above, then apply.</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={dismiss}>Cancel</Button>
              <Button size="sm"
                className="h-6 text-xs gap-1 bg-violet-600 hover:bg-violet-700 text-white"
                onClick={applyAll} disabled={applying}>
                {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                Apply All
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
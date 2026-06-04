import React, { useRef, useState, useCallback, useMemo } from 'react';
import { useUnsavedWarning } from '@/hooks/useUnsavedWarning';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { appClient } from '@/api/standaloneClient';
import { Plus, Download, FileDown, ZoomOut, ZoomIn, Trash2, RotateCcw, RotateCw, Unlink, Wand2, GitBranch } from 'lucide-react';
import ScenarioBranchDialog from '@/components/ScenarioBranchDialog';
import { createScenarioBranch } from '@/lib/scenarioUtils';
import { useRoles } from '@/hooks/useRoles';
import { useSections } from '@/hooks/useSections';
import { useToolTimeCategories, getStoredToolTimeGroups } from '@/hooks/useToolTimeCategories';
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter';
import { useRoleColours, getRoleColour } from '@/hooks/useRoleColours';
import { useProcess } from '@/lib/processContext';
import { PresenceAvatars } from '@/components/PresenceAvatars';
import { SaveRevisionDialog, RevisionHistoryPanel } from '@/components/RevisionHistory';
import { usePresence } from '@/hooks/usePresence';
import { useAuth } from '@/lib/AuthContext';
import { useEffect } from 'react';
import { getStepTotal } from '@/hooks/useMultiProcessTable';
import ProcessSelector from '@/components/ProcessSelector';
import DependencyGraphView from '@/components/table/DependencyGraphView';
import SaveStatusBar from '@/components/SaveStatusBar';
import { ValidationPanel } from '@/components/StepValidation';
import GanttRow from '@/components/table/GanttRow';
import SmartCategorisePanel from '@/components/table/SmartCategorisePanel';
import SequenceOptimiserPanel from '@/components/table/SequenceOptimiserPanel';
import WaitDetectorPanel from '@/components/WaitDetectorPanel';
import { useCombinationTableExportPDF } from '@/hooks/useCombinationTableExportPDF';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

const TIME_COLS = 40;
const CELL_W = 18;
const UNASSIGNED_COLOR = '#e5e7eb';

const DEFAULT_COL_WIDTHS = {
  stepNum: 32,
  description: 180,
  role: 80,
  section: 100,
  duration: 56,
  start: 40,
  finish: 40,
  category: 100,
  intext: 80,
  layer: 90,
  dependency: 100,
};
const COL_WIDTHS_STORAGE_KEY = 'mm_swb_combination_col_widths';

const CHART_GROUP_COLORS = {
  tooltime: '#006A9D',
  nva_essential: '#EAB308',
  nva_activities: '#F68C50',
  waste: '#F15B55',
  unassigned: '#94A3B8',
};

function getCatColour(cat) {
  const l = (cat || '').toLowerCase();
  if (l.startsWith('tooltime')) return '#1B7A3F';
  if (l.startsWith('nva'))      return '#d97706';
  if (l.startsWith('waste'))    return '#dc2626';
  return '#94a3b8';
}

function CategoryFilter({ options, selected, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const isAll = selected.length === 0;
  const toggle = (opt) => isAll
    ? onChange([opt])
    : selected.includes(opt) ? onChange(selected.filter(v => v !== opt)) : onChange([...selected, opt]);
  const displayLabel = isAll ? 'All Categories'
    : selected.length === 1 ? selected[0].split('::')[1] || selected[0]
    : `${selected.length} Categories`;
  return (
    <div ref={ref} className="relative w-52">
      <button type="button" onClick={() => setOpen(!open)}
        className={`w-full h-7 px-2 text-xs rounded border flex items-center justify-between gap-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary ${open ? 'ring-1 ring-primary' : ''} ${!isAll ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
        <span className="truncate text-left flex items-center gap-1.5">
          {!isAll && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getCatColour(selected[0]) }} />}
          {displayLabel}
        </span>
        {!isAll
          ? <button type="button" onClick={e => { e.stopPropagation(); onChange([]); }} className="text-muted-foreground hover:text-foreground shrink-0">✕</button>
          : <span className="text-muted-foreground shrink-0">▾</span>
        }
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-background border border-border rounded-lg shadow-lg py-1 w-64 max-h-72 overflow-y-auto">
          {['tooltime', 'nva', 'waste', ''].map(prefix => {
            const group = options.filter(o => prefix === '' ? !o.toLowerCase().startsWith('tooltime') && !o.toLowerCase().startsWith('nva') && !o.toLowerCase().startsWith('waste') : o.toLowerCase().startsWith(prefix));
            if (!group.length) return null;
            const groupLabel = prefix === 'tooltime' ? '🟢 Tooltime' : prefix === 'nva' ? '🟡 NVA' : prefix === 'waste' ? '🔴 Waste' : '⚪ Other';
            return (
              <div key={prefix || 'other'}>
                <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/30 bg-muted/20">{groupLabel}</div>
                {group.map(opt => {
                  const checked = selected.includes(opt);
                  const subLabel = opt.split('::')[1] || opt;
                  return (
                    <button key={opt} type="button" onClick={() => toggle(opt)}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-muted/40 transition-colors ${checked ? 'bg-primary/5 font-medium' : ''}`}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getCatColour(opt) }} />
                      <span className="flex-1 truncate">{subLabel}</span>
                      {checked && <span className="text-primary shrink-0">✓</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getChartStepDuration(step) {
  return (Number(step.manual_time) || 0) + (Number(step.walking_time) || 0) +
         (Number(step.waiting_time) || 0) + (Number(step.machine_time) || 0) +
         (Number(step.inspection_time) || 0);
}

function getChartStepColor(toolTimeCategory, optimiserGroups) {
  if (!toolTimeCategory) return CHART_GROUP_COLORS.unassigned;
  for (const [groupKey, groupData] of Object.entries(optimiserGroups)) {
    if (groupData.subcategories?.some(sub => toolTimeCategory.includes(sub))) {
      return groupData.color || CHART_GROUP_COLORS[groupKey] || CHART_GROUP_COLORS.unassigned;
    }
  }
  return CHART_GROUP_COLORS.unassigned;
}

function buildLanesFromSteps(steps, optimiserGroups) {
  if (!Array.isArray(steps) || steps.length === 0) return { lanes: [], cycleTime: 0, sectionBands: [] };
  const roleMap = {}; const roleOrder = {};
  steps.forEach((step, idx) => {
    const role = step.role || 'Unassigned';
    if (!(role in roleOrder)) roleOrder[role] = idx;
    if (!roleMap[role]) roleMap[role] = { cursor: 0, bars: [], totalDuration: 0 };
    const duration = step._total !== undefined ? step._total : getChartStepDuration(step);
    const barStart = step._start !== undefined ? step._start : roleMap[role].cursor;
    roleMap[role].bars.push({ stepNumber: step.step_number ?? idx + 1, taskDescription: step.task_description || '', duration, start: barStart, end: barStart + duration, color: getChartStepColor(step.tool_time_category, optimiserGroups), section: step.section || '' });
    roleMap[role].cursor = Math.max(roleMap[role].cursor, barStart) + duration;
    roleMap[role].totalDuration += duration;
  });
  let maxEnd = 0;
  Object.values(roleMap).forEach(r => { r.bars.forEach(b => { if (b.end > maxEnd) maxEnd = b.end; }); });
  const lanes = Object.entries(roleMap).sort(([a], [b]) => roleOrder[a] - roleOrder[b]).map(([role, data]) => ({ role, bars: data.bars, totalDuration: data.totalDuration, idleTime: maxEnd - data.totalDuration }));
  const sectionRanges = {};
  lanes.forEach(lane => { lane.bars.forEach(bar => { const sec = bar.section; if (!sec) return; if (!sectionRanges[sec]) sectionRanges[sec] = { start: bar.start, end: bar.end }; else { sectionRanges[sec].start = Math.min(sectionRanges[sec].start, bar.start); sectionRanges[sec].end = Math.max(sectionRanges[sec].end, bar.end); } }); });
  const sectionBands = Object.entries(sectionRanges).map(([section, { start, end }]) => ({ section, start, end })).sort((a, b) => a.start - b.start);
  return { lanes, cycleTime: maxEnd, sectionBands };
}

function computeCriticalPath(stepsWithTiming) {
  if (!stepsWithTiming || stepsWithTiming.length === 0) return null;
  const stepMap = {};
  stepsWithTiming.forEach(s => { stepMap[s.id] = s; });
  const successors = {}; const predecessors = {};
  stepsWithTiming.forEach(s => { successors[s.id] = []; predecessors[s.id] = [...(s.dependencies || [])]; });
  stepsWithTiming.forEach(s => { (s.dependencies || []).forEach(depId => { if (successors[depId]) successors[depId].push(s.id); }); });
  const roleGroups = {};
  stepsWithTiming.forEach(s => { const r = s.role || '_none'; if (!roleGroups[r]) roleGroups[r] = []; roleGroups[r].push(s); });
  Object.values(roleGroups).forEach(group => {
    const sorted = [...group].sort((a,b) => a._start - b._start || a.step_number - b.step_number);
    for (let i = 0; i < sorted.length - 1; i++) { const curr = sorted[i], next = sorted[i+1]; if (Math.abs(next._start - curr._finish) < 0.5) { if (!successors[curr.id].includes(next.id)) successors[curr.id].push(next.id); if (!predecessors[next.id].includes(curr.id)) predecessors[next.id].push(curr.id); } }
  });
  const projectFinish = Math.max(...stepsWithTiming.map(s => s._finish), 0);
  const inDeg = {};
  stepsWithTiming.forEach(s => { inDeg[s.id] = (predecessors[s.id] || []).length; });
  const queue = stepsWithTiming.filter(s => inDeg[s.id] === 0).map(s => s.id);
  const topo = [];
  while (queue.length > 0) { const id = queue.shift(); topo.push(id); (successors[id] || []).forEach(nid => { inDeg[nid]--; if (inDeg[nid] === 0) queue.push(nid); }); }
  stepsWithTiming.filter(s => !topo.includes(s.id)).sort((a,b) => a.step_number - b.step_number).forEach(s => topo.push(s.id));
  const LFT = {};
  stepsWithTiming.forEach(s => { LFT[s.id] = projectFinish; });
  for (let i = topo.length - 1; i >= 0; i--) { const id = topo[i]; const step = stepMap[id]; if (!step) continue; const succs = (successors[id] || []).filter(sid => stepMap[sid]); LFT[id] = succs.length === 0 ? projectFinish : Math.min(...succs.map(sid => LFT[sid] - (stepMap[sid]._total || 0))); }
  const TOLERANCE = 0.5; const floatMap = {};
  stepsWithTiming.forEach(s => { floatMap[s.id] = Math.max(0, Math.round((LFT[s.id] - s._finish) * 10) / 10); });
  const criticalIds = new Set(stepsWithTiming.filter(s => floatMap[s.id] <= TOLERANCE).map(s => s.id));
  const criticalChain = topo.map(id => stepMap[id]).filter(s => s && criticalIds.has(s.id));
  const roleChains = {};
  criticalChain.forEach(s => { const r = s.role || 'Unassigned'; if (!roleChains[r]) roleChains[r] = []; roleChains[r].push(s); });
  const entries = Object.entries(floatMap);
  return { projectFinish: Math.round(projectFinish), criticalIds, floatMap, criticalChain, roleChains, totalCriticalSteps: criticalIds.size, totalSteps: stepsWithTiming.length, bucket0: entries.filter(([,f]) => f <= 0.5).length, bucket10: entries.filter(([,f]) => f > 0.5 && f <= 10).length, bucket30: entries.filter(([,f]) => f > 10 && f <= 30).length, bucketHi: entries.filter(([,f]) => f > 30).length };
}

const CriticalPathPanel = React.memo(function CriticalPathPanel({ cpData, cycleTimeTarget }) {
  const [open, setOpen] = React.useState(true);
  if (!cpData) return null;
  const { projectFinish, roleChains, totalCriticalSteps, totalSteps, bucket0, bucket10, bucket30, bucketHi } = cpData;
  const overTarget = cycleTimeTarget > 0 && projectFinish > cycleTimeTarget;
  const slipAmount = overTarget ? projectFinish - cycleTimeTarget : 0;
  const spare = !overTarget && cycleTimeTarget > 0 ? cycleTimeTarget - projectFinish : 0;
  const maxBar = cycleTimeTarget > 0 ? Math.max(projectFinish, cycleTimeTarget) : projectFinish;
  return (
    <div className="border rounded-xl overflow-hidden mb-2" style={{ borderColor: overTarget ? '#fca5a5' : '#e2e8f0' }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/20 transition-colors" style={{ background: overTarget ? '#fff1f2' : '#f8fafc' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold">📊 Critical Path Analysis</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: overTarget ? '#fee2e2' : '#dcfce7', color: overTarget ? '#dc2626' : '#166534' }}>{totalCriticalSteps} critical / {totalSteps} steps</span>
          {overTarget && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">⚠ +{slipAmount}m over target</span>}
          {spare > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">✓ {spare}m spare</span>}
          <span className="text-[11px] text-muted-foreground">Project finish: <strong>{projectFinish}m</strong>{cycleTimeTarget > 0 ? ` · Target: ${cycleTimeTarget}m` : ''}</span>
        </div>
        <span className="text-muted-foreground text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="p-4 space-y-4 bg-background">
          <div className="flex gap-2 flex-wrap">
            {[{ label:'Critical — 0m float', count:bucket0, color:'#dc2626', bg:'#fee2e2' }, { label:'Near-critical ≤10m', count:bucket10, color:'#d97706', bg:'#fef3c7' }, { label:'Some float ≤30m', count:bucket30, color:'#2563eb', bg:'#dbeafe' }, { label:'High float >30m', count:bucketHi, color:'#16a34a', bg:'#dcfce7' }].filter(b => b.count > 0).map(b => (
              <div key={b.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold" style={{ background:b.bg, color:b.color }}>
                <span className="w-2 h-2 rounded-full" style={{ background:b.color }} />{b.count} · {b.label}
              </div>
            ))}
          </div>
          {Object.keys(roleChains).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Critical Chain by Role</p>
              <div className="space-y-2">
                {Object.entries(roleChains).map(([role, steps]) => (
                  <div key={role} className="flex items-start gap-3">
                    <div className="flex items-center gap-1.5 min-w-[90px] shrink-0 pt-0.5"><span className="w-2 h-2 rounded-full bg-red-500 shrink-0" /><span className="text-[10px] font-semibold truncate">{role}</span></div>
                    <div className="flex items-center gap-1 flex-wrap flex-1">
                      {steps.map((s, i) => (<React.Fragment key={s.id}>{i > 0 && <span className="text-[9px] text-muted-foreground">→</span>}<span className="px-1.5 py-0.5 rounded text-[9px] font-mono" style={{ background:'#fee2e2', color:'#dc2626', border:'0.5px solid #fca5a5' }}>#{s.step_number} <span className="opacity-70">{(s.task_description||'').substring(0,14)}{(s.task_description||'').length>14?'…':''}</span></span></React.Fragment>))}
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">→{Math.round(Math.max(...steps.map(s => s._finish)))}m</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Timeline</p>
            <div className="relative h-6 rounded-lg overflow-hidden" style={{ background:'#f1f5f9' }}>
              <div className="absolute left-0 top-0 h-full rounded-l-lg" style={{ width:`${Math.min(100,(projectFinish/maxBar)*100)}%`, background: overTarget ? '#fca5a5' : '#bbf7d0' }} />
              {cycleTimeTarget > 0 && <div className="absolute top-0 h-full w-0.5" style={{ left:`${Math.min(100,(cycleTimeTarget/maxBar)*100)}%`, background:'#dc2626', zIndex:2 }} />}
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold z-10" style={{ color: overTarget ? '#dc2626' : '#166534' }}>{projectFinish}m{overTarget ? ` (+${slipAmount}m)` : spare > 0 ? ` (−${spare}m)` : ''}{cycleTimeTarget > 0 ? ` · Target: ${cycleTimeTarget}m` : ''}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

const LiveCycleChart = React.memo(function LiveCycleChart({ steps, numCols, cycleTimeTarget, maxElapsed, roleColours, validRoles }) {
  const optimiserGroups = React.useMemo(() => getStoredToolTimeGroups(), []);
  const filteredSteps = React.useMemo(() => validRoles && validRoles.length > 0 ? steps.filter(s => validRoles.includes(s.role)) : steps, [steps, validRoles]);
  const { lanes, cycleTime } = React.useMemo(() => buildLanesFromSteps(filteredSteps, optimiserGroups), [filteredSteps, optimiserGroups]);
  const [collapsed, setCollapsed] = React.useState(false);
  if (!steps || steps.length === 0) return null;
  const maxTime = Math.max(numCols || 100, Math.ceil((cycleTime || 1) / 25) * 25 || 100);
  const tickInterval = 25; const labelInterval = 50; const ticks = [];
  for (let t = 0; t <= maxTime; t += tickInterval) ticks.push(t);
  return (
    <Card className="mb-4">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3"><span className="text-sm font-semibold">Live Cycle Time</span><span className="text-xs text-muted-foreground">Total: <span className="font-semibold text-foreground">{cycleTime}m</span></span></div>
          <Button variant="ghost" size="sm" onClick={() => setCollapsed(c => !c)} className="h-6 text-xs gap-1">{collapsed ? 'Show chart' : 'Hide chart'}</Button>
        </div>
        {!collapsed && (
          <div className="space-y-1">
            <div className="flex items-end mb-1">
              <div className="w-28" />
              <div className="relative flex-1 h-5 border-b border-border">
                {ticks.map(tick => (<div key={tick} className="absolute top-0 flex flex-col items-center" style={{ left: `${(tick / maxTime) * 100}%`, width: '1px' }}><div className="w-px h-1 bg-muted-foreground/60" />{tick % labelInterval === 0 && <span className="text-[10px] text-muted-foreground mt-0.5">{tick}m</span>}</div>))}
              </div>
              <div className="w-32" />
            </div>
            {lanes.map((lane, idx) => (
              <div key={idx} className="flex items-center h-6 gap-2">
                <div className="w-28 text-right flex items-center justify-end gap-1.5"><span className="text-xs font-medium">{lane.role}</span><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getRoleColour(lane.role, roleColours) }} /></div>
                <div className="relative flex-1 h-5 bg-muted/40 rounded-sm">{lane.bars.map((bar, bi) => (<div key={bi} className="absolute top-[2px] h-[16px] rounded-sm border border-white/40" style={{ left: `${(bar.start / maxTime) * 100}%`, width: `${(bar.duration / maxTime) * 100}%`, backgroundColor: bar.color, minWidth: bar.duration > 0 ? '2px' : '0' }} title={`Step ${bar.stepNumber}: ${bar.taskDescription} — ${bar.duration}m`} />))}</div>
                <div className="w-32 text-right text-[10px]"><span className="font-semibold">{lane.totalDuration}m</span><span className="text-muted-foreground ml-1">{lane.idleTime}m idle</span></div>
              </div>
            ))}
            <div className="flex flex-wrap gap-3 pt-2 mt-2 border-t border-border/30">
              {Object.entries(optimiserGroups).map(([key, group]) => (<div key={key} className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: group.color || CHART_GROUP_COLORS[key] }} /><span className="text-[10px] text-muted-foreground">{group.label || key}</span></div>))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

const ResizeHandle = ({ onResize, onReset }) => (
  <div
    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); let lastX = e.clientX; const onMove = (me) => { const delta = me.clientX - lastX; lastX = me.clientX; onResize(delta); }; const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); document.body.style.cursor = ''; }; document.body.style.cursor = 'col-resize'; window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp); }}
    onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); if (onReset) onReset(); }}
    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-border/40 hover:bg-primary transition-colors"
    title="Drag to resize • Double-click to reset"
  />
);

function getStepPriorityCT(step) {
  const cat = (step.tool_time_category || '').toLowerCase();
  if (cat.startsWith('tooltime')) return 0;
  if (cat.startsWith('nva') && cat.includes('essential')) return 1;
  if (cat.startsWith('nva')) return 2;
  if (cat.startsWith('waste')) return 3;
  return 1;
}

export default function CombinationTable() {
  useUnsavedWarning();
  const { roles } = useRoles();
  const { sections, addSection } = useSections();
  const { groups: toolTimeGroups } = useToolTimeCategories();
  const { colours: roleColours } = useRoleColours();
  const {
    activeProcess, steps, nodes, connections, mapEdgeWaypoints,
    updateStep, addStep, deleteStep, saveProcess, reorderSteps, reorderAndTimeSteps,
    setProcessData, updateMapLayers, updateMapBlocked, updateProcessMeta,
    clearAllDependencies, insertWaitStep,
    undo, redo, canUndo, canRedo, lastUndoLabel, lastRedoLabel,
    allStepsWithTiming: contextStepsWithTiming,
    syncStatus, syncError, lastSavedAt,
    mapLayers, mapBlocked, loadProcess, updateNodePosition,
  } = useProcess();

  const { user: currentUser } = useAuth();
  const { peers, lockedSteps, setEditingStep } = usePresence(activeProcess?.id, currentUser);

  const [showSaveRevision, setShowSaveRevision] = React.useState(false);
  const [revCount, setRevCount] = React.useState(0);
  const [showBranchDialog, setShowBranchDialog] = React.useState(false);
  const [branchCreating, setBranchCreating] = React.useState(false);

  // ── Save Revision ──────────────────────────────────────────────────────────
  const handleSaveRevision = React.useCallback(async ({ label, change_reason, saved_by_name }) => {
    if (!activeProcess) { toast.error('No active process selected'); return; }
    const totalTime = steps.reduce((a,s) => a + (Number(s.manual_time)||0)+(Number(s.walking_time)||0)+(Number(s.waiting_time)||0)+(Number(s.machine_time)||0)+(Number(s.inspection_time)||0), 0);
    const ttTime = steps.filter(s => (s.tool_time_category||'').toLowerCase().startsWith('tooltime')).reduce((a,s) => a + (Number(s.manual_time)||0)+(Number(s.walking_time)||0)+(Number(s.waiting_time)||0)+(Number(s.machine_time)||0)+(Number(s.inspection_time)||0), 0);
    try {
      const existing = await appClient.entities.ProcessRevision.filter({ process_id: activeProcess.id }, '-revision_number', 100);
      const nextNum = (existing.length > 0 ? Math.max(...existing.map(r=>r.revision_number||0)) : 0) + 1;
      let userName = saved_by_name || 'Anonymous';
      let userEmail = '';
      try { const user = await appClient.auth.me(); if (user) { userName = user.full_name || user.email || saved_by_name || 'Anonymous'; userEmail = user.email || ''; } } catch {}
      await appClient.entities.ProcessRevision.create({
        process_id: activeProcess.id, revision_number: nextNum,
        label: label || `v${nextNum}`, change_reason,
        changed_by_name: userName, changed_by_email: userEmail,
        steps_snapshot: JSON.stringify(steps), step_count: steps.length,
        pce_snapshot: totalTime > 0 ? Math.round(ttTime/totalTime*100) : 0,
        cycle_time_snapshot: totalTime,
        approval_status_snapshot: activeProcess.approval_status || 'Draft',
        nodes_snapshot: nodes ? JSON.stringify(nodes) : null,
        connections_snapshot: connections ? JSON.stringify(connections) : null,
        waypoints_snapshot: mapEdgeWaypoints ? JSON.stringify(mapEdgeWaypoints) : null,
        layers_snapshot: mapLayers ? JSON.stringify(mapLayers) : null,
        blocked_snapshot: mapBlocked ? JSON.stringify(mapBlocked) : null,
      });
      setRevCount(nextNum);
      toast.success(`Revision "${label || `v${nextNum}`}" saved`);
    } catch(e) {
      console.error('Save revision error:', e);
      toast.error('Failed to save revision: ' + (e?.message || String(e)));
    }
  }, [activeProcess, steps, nodes, connections, mapEdgeWaypoints, mapLayers, mapBlocked]);

  const handleBranch = React.useCallback(async ({ name, reason }) => {
    if (!activeProcess) return;
    setBranchCreating(true);
    try {
      const pd = { steps, nodes, connections: connections || [], mapEdgeWaypoints: mapEdgeWaypoints || {} };
      const scenario = await createScenarioBranch(activeProcess, pd, mapLayers || [], mapBlocked || [], name, reason);
      setShowBranchDialog(false);
      await loadProcess(scenario);
      toast.success(`Scenario "${name}" created — you are now editing the branch`);
    } catch (err) {
      console.error('Branch failed:', err);
      toast.error('Failed to create branch: ' + (err?.message || 'unknown error'));
    } finally {
      setBranchCreating(false);
    }
  }, [activeProcess, steps, nodes, connections, mapEdgeWaypoints, mapLayers, mapBlocked, loadProcess]);

  // ── Rollback — restores steps, nodes, connections, routing, layers, and blocked zones ───
  const handleRollback = React.useCallback((rollbackSteps, label, extras) => {
    setProcessData(prev => ({
      ...prev,
      steps: rollbackSteps,
      nodes: extras?.nodes !== undefined ? extras.nodes : prev.nodes,
      connections: extras?.connections !== undefined ? extras.connections : prev.connections,
      mapEdgeWaypoints: extras?.mapEdgeWaypoints !== undefined ? extras.mapEdgeWaypoints : prev.mapEdgeWaypoints,
    }), 'Rollback to revision');
    if (extras?.mapLayers !== undefined) updateMapLayers(extras.mapLayers || []);
    if (extras?.mapBlocked !== undefined) updateMapBlocked(extras.mapBlocked || []);
    toast.success(`Rolled back to "${label}"`);
  }, [setProcessData, updateMapLayers, updateMapBlocked]);

  React.useEffect(() => {
    const handle = (e) => { const { stepId, layerId } = e.detail; const pos = nodes?.[stepId]; if (pos) updateNodePosition(stepId, pos.x, pos.y, layerId); };
    document.addEventListener('hio:changelayer', handle);
    return () => document.removeEventListener('hio:changelayer', handle);
  }, [nodes, updateNodePosition]);

  const tableRef = useRef(null);
  const writeTimerRef = React.useRef(null);
  const [zoom, setZoom] = useState(100);
  const [roleFilter, setRoleFilter] = useState(() => { try { const s = localStorage.getItem('mm_swb_combination_table_role_filter'); return s ? JSON.parse(s) : []; } catch { return []; } });
  useEffect(() => { try { localStorage.setItem('mm_swb_combination_table_role_filter', JSON.stringify(roleFilter)); } catch {} }, [roleFilter]);
  const [sectionFilter, setSectionFilter] = useState(() => { try { const s = localStorage.getItem('mm_swb_combination_table_section_filter'); return s ? JSON.parse(s) : []; } catch { return []; } });
  useEffect(() => { try { localStorage.setItem('mm_swb_combination_table_section_filter', JSON.stringify(sectionFilter)); } catch {} }, [sectionFilter]);
  const [taskFilter, setTaskFilter] = useState(() => { try { return localStorage.getItem('mm_swb_combination_table_task_filter') || ''; } catch { return ''; } });
  useEffect(() => { try { localStorage.setItem('mm_swb_combination_table_task_filter', taskFilter); } catch {} }, [taskFilter]);
  const _taskDebounceRef = React.useRef(null);
  const [debouncedTaskFilter, setDebouncedTaskFilter] = React.useState(taskFilter);
  const handleTaskFilterChange = React.useCallback((val) => { setTaskFilter(val); if (_taskDebounceRef.current) clearTimeout(_taskDebounceRef.current); _taskDebounceRef.current = setTimeout(() => setDebouncedTaskFilter(val), 280); }, []);
  React.useEffect(() => { if (taskFilter === '') setDebouncedTaskFilter(''); }, [taskFilter]);
  const [categoryFilter, setCategoryFilter] = useState(() => { try { const s = localStorage.getItem('mm_swb_combination_table_cat_filter'); return s ? JSON.parse(s) : []; } catch { return []; } });
  useEffect(() => { try { localStorage.setItem('mm_swb_combination_table_cat_filter', JSON.stringify(categoryFilter)); } catch {} }, [categoryFilter]);
  const [intextFilter, setIntextFilter] = useState(() => { try { const s = localStorage.getItem('mm_swb_combination_table_intext_filter'); return s ? JSON.parse(s) : []; } catch { return []; } });
  useEffect(() => { try { localStorage.setItem('mm_swb_combination_table_intext_filter', JSON.stringify(intextFilter)); } catch {} }, [intextFilter]);
  const [layerFilter, setLayerFilter] = useState([]);
  const processTargetMin = activeProcess?.target_duration_hrs ? Number(activeProcess.target_duration_hrs) * 60 : 480;
  const [cycleTimeTarget, setCycleTimeTarget] = useState(processTargetMin);
  useEffect(() => { if (activeProcess?.target_duration_hrs) setCycleTimeTarget(Number(activeProcess.target_duration_hrs) * 60); }, [activeProcess?.id, activeProcess?.target_duration_hrs]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [colWidths, setColWidths] = useState(() => { try { const raw = localStorage.getItem(COL_WIDTHS_STORAGE_KEY); return raw ? { ...DEFAULT_COL_WIDTHS, ...JSON.parse(raw) } : DEFAULT_COL_WIDTHS; } catch { return DEFAULT_COL_WIDTHS; } });
  const [pdfPaper, setPdfPaper] = useState(() => localStorage.getItem('mm_swb_pdf_paper') || 'a3-landscape');
  const [showDepGraph, setShowDepGraph] = useState(false);
  const { activeProcess: process } = useProcess();
  useEffect(() => { try { localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(colWidths)); } catch {} }, [colWidths]);

  const handleZoom = (direction) => setZoom(prev => Math.max(50, Math.min(200, prev + (direction === 'in' ? 20 : -20))));
  const handleColResize = (col, delta) => setColWidths(prev => ({ ...prev, [col]: Math.max(30, Math.min(600, prev[col] + delta)) }));
  const handleColReset = (col) => setColWidths(prev => ({ ...prev, [col]: DEFAULT_COL_WIDTHS[col] }));
  const handleResetAllCols = () => setColWidths(DEFAULT_COL_WIDTHS);

  const stickyLeft = useMemo(() => {
    const CW = 28; const s = colWidths.stepNum; const sc = colWidths.section; const d = colWidths.description;
    return { checkbox: 0, stepNum: CW, section: CW + s, description: CW + s + sc, role: CW + s + sc + d };
  }, [colWidths]);

  const allStepsWithTiming = contextStepsWithTiming;
  const activeRoles = roles;
  const nodesMemo = useMemo(() => nodes, [nodes]);
  const stepTimingMap = useMemo(() => { const m = {}; allStepsWithTiming.forEach((s, i) => { m[s.id] = { ...s, _rowIdx: i }; }); return m; }, [allStepsWithTiming]);
  const allCategories = useMemo(() => { const cats = new Set(allStepsWithTiming.map(s => s.tool_time_category).filter(Boolean)); return [...cats].sort(); }, [allStepsWithTiming]);
  const visibleSteps = useMemo(() => {
    const taskLower = debouncedTaskFilter.trim().toLowerCase();
    return allStepsWithTiming.filter(s => {
      const roleOk = roleFilter.length === 0 || roleFilter.includes(s.role || '');
      const sectionOk = sectionFilter.length === 0 || sectionFilter.includes(s.section || '');
      const taskOk = !taskLower || (s.task_description || '').toLowerCase().includes(taskLower);
      const catOk = categoryFilter.length === 0 || categoryFilter.includes(s.tool_time_category || '');
      const intextOk = intextFilter.length === 0 || intextFilter.includes(s.internal_external || '');
      const nodeLayerId = nodes?.[s.id]?.layerId ?? 'layer-ground';
      const layerOk = layerFilter.length === 0 || layerFilter.includes(nodeLayerId);
      return roleOk && sectionOk && taskOk && catOk && intextOk && layerOk;
    });
  }, [allStepsWithTiming, roleFilter, sectionFilter, debouncedTaskFilter, categoryFilter, intextFilter, layerFilter, nodes]);

  const maxElapsed = allStepsWithTiming.length > 0 ? Math.max(...allStepsWithTiming.map(s => s._finish)) : TIME_COLS;
  const numCols = Math.max(TIME_COLS, Math.ceil(maxElapsed) + 5, cycleTimeTarget + 1);

  const overlappingStepIds = useMemo(() => {
    const ids = new Set(); const TOLERANCE = 0.01;
    const roleList = [...new Set(allStepsWithTiming.map(s => s.role).filter(Boolean))];
    roleList.forEach(role => {
      const roleSteps = allStepsWithTiming.filter(s => s.role === role && (s._total || 0) > 0).sort((a, b) => a._start - b._start || a.step_number - b.step_number);
      for (let i = 0; i < roleSteps.length - 1; i++) { if (roleSteps[i]._finish > roleSteps[i + 1]._start + TOLERANCE) { ids.add(roleSteps[i].id); ids.add(roleSteps[i + 1].id); } }
    });
    return ids;
  }, [allStepsWithTiming]);

  const ROW_HEIGHT = 34; const SEP_H = 20; const OVERSCAN = 15;
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportH, setViewportH] = React.useState(600);
  const rowOffsets = React.useMemo(() => {
    const offsets = new Array(visibleSteps.length + 1); offsets[0] = 0;
    for (let i = 0; i < visibleSteps.length; i++) { const hasSep = i > 0 && visibleSteps[i - 1].role !== visibleSteps[i].role && !!visibleSteps[i].role; offsets[i + 1] = offsets[i] + ROW_HEIGHT + (hasSep ? SEP_H : 0); }
    return offsets;
  }, [visibleSteps]);
  const totalTableH = rowOffsets[visibleSteps.length] || 0;
  const { startIdx, endIdx } = React.useMemo(() => {
    const top = Math.max(0, scrollTop - OVERSCAN * ROW_HEIGHT); const bot = scrollTop + viewportH + OVERSCAN * ROW_HEIGHT;
    let start = 0; while (start < visibleSteps.length - 1 && rowOffsets[start + 1] <= top) start++;
    let end = start; while (end < visibleSteps.length - 1 && rowOffsets[end] < bot) end++;
    return { startIdx: start, endIdx: Math.min(end + 1, visibleSteps.length) };
  }, [scrollTop, viewportH, rowOffsets, visibleSteps.length]);
  const topSpacerH = rowOffsets[startIdx] || 0;
  const botSpacerH = totalTableH - (rowOffsets[endIdx] || totalTableH);
  const scrollContainerRef = useRef(null);

  const autoResolveOverlaps = useCallback(() => {
    const roleList = [...new Set(allStepsWithTiming.map(s => s.role).filter(Boolean))]; let resolved = 0;
    roleList.forEach(role => {
      const roleSteps = allStepsWithTiming.filter(s => s.role === role && (s._total || 0) > 0).sort((a, b) => a._start - b._start);
      if (roleSteps.length === 0) return;
      let cursor = roleSteps[0]._start;
      roleSteps.forEach((s) => { if (s._start < cursor) { updateStep(s.id, { start_time: cursor, start_time_override: true, dependencies: [] }); resolved++; cursor += s._total; } else { cursor = s._start + s._total; } });
    });
    if (resolved > 0) toast.success(`Resolved ${resolved} overlap${resolved !== 1 ? 's' : ''} — bars repositioned`);
    else toast.info('No overlaps to resolve');
  }, [allStepsWithTiming, updateStep]);

  const [selectedStepIds, setSelectedStepIds] = useState(new Set());
  const [openDepStepId, setOpenDepStepId] = useState(null);

  const deleteSelectedSteps = useCallback(() => {
    if (selectedStepIds.size === 0) return;
    const count = selectedStepIds.size;
    if (!window.confirm(`Delete ${count} selected step${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    reorderSteps(steps.filter(s => !selectedStepIds.has(s.id)));
    setSelectedStepIds(new Set());
    toast.success(`Deleted ${count} step${count !== 1 ? 's' : ''}`);
  }, [selectedStepIds, steps, reorderSteps]);

  const toggleSelectStep = useCallback((id) => { setSelectedStepIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return new Set(next); }); }, []);
  const toggleSelectAll = useCallback(() => { if (selectedStepIds.size === visibleSteps.length) setSelectedStepIds(new Set()); else setSelectedStepIds(new Set(visibleSteps.map(s => s.id))); }, [selectedStepIds.size, visibleSteps]);

  const barMoveTimerRef = React.useRef(null);
  const handleBarMove = useCallback((stepId, newStart, newDuration) => {
    const step = steps.find(s => s.id === stepId); if (!step) return;
    const oldTotal = getStepTotal(step); const newStartClamped = Math.max(0, newStart);
    const deps = step.dependencies || []; let depFinish = 0;
    if (deps.length > 0) { depFinish = Math.max(...deps.map(depId => { const d = allStepsWithTiming.find(s => s.id === depId); return d ? d._finish : 0; })); }
    const updates = { start_time: newStartClamped, start_offset: newStartClamped - depFinish, start_time_override: true };
    if (newDuration !== undefined) {
      const safeNewDuration = Math.max(1, newDuration);
      if (oldTotal > 0) { const ratio = safeNewDuration / oldTotal; updates.manual_time = Math.round((step.manual_time || 0) * ratio); updates.walking_time = Math.round((step.walking_time || 0) * ratio); updates.waiting_time = Math.round((step.waiting_time || 0) * ratio); updates.machine_time = Math.round((step.machine_time || 0) * ratio); updates.inspection_time = Math.round((step.inspection_time || 0) * ratio); const newTotal = updates.manual_time + updates.walking_time + updates.waiting_time + updates.machine_time + updates.inspection_time; updates.manual_time += safeNewDuration - newTotal; }
      else { updates.manual_time = safeNewDuration; }
    }
    updateStep(stepId, updates);
  }, [steps, updateStep, allStepsWithTiming]);

  const rowOnUpdate = useMemo(() => { const m = {}; for (const s of steps) m[s.id] = (changes) => updateStep(s.id, changes); return m; }, [steps, updateStep]);
  const rowOnDelete = useMemo(() => { const m = {}; for (const s of steps) m[s.id] = () => deleteStep(s.id); return m; }, [steps, deleteStep]);
  const rowOnBarMove = useMemo(() => { const m = {}; for (const s of steps) m[s.id] = (ns, nd) => handleBarMove(s.id, ns, nd); return m; }, [steps, handleBarMove]);
  const rowOnToggle = useMemo(() => { const m = {}; for (const s of steps) m[s.id] = () => toggleSelectStep(s.id); return m; }, [steps, toggleSelectStep]);

  const duplicateStep = useCallback((stepId) => {
    const src = steps.find(s => s.id === stepId); if (!src) return;
    addStep(null, { task_description: `${src.task_description} (copy)`, role: src.role || '', section: src.section || '', manual_time: src.manual_time || 0, walking_time: src.walking_time || 0, waiting_time: src.waiting_time || 0, machine_time: src.machine_time || 0, inspection_time: src.inspection_time || 0, tool_time_category: src.tool_time_category || '', start_time: 0, start_time_override: false, dependencies: [] });
    toast.success('Step duplicated');
  }, [steps, addStep]);
  const rowOnDuplicate = useMemo(() => { const m = {}; for (const s of steps) m[s.id] = () => duplicateStep(s.id); return m; }, [steps, duplicateStep]);

  const [showWaitDetector, setShowWaitDetector] = React.useState(false);
  const [showCriticalPath, setShowCriticalPath] = React.useState(() => { try { return localStorage.getItem('mm_swb_show_cp') === 'true'; } catch { return false; } });
  const criticalPathData = useMemo(() => { if (!showCriticalPath || allStepsWithTiming.length === 0) return null; return computeCriticalPath(allStepsWithTiming); }, [allStepsWithTiming, showCriticalPath]);

  const [smartCatRunning, setSmartCatRunning] = React.useState(false);
  const [smartCatPreview, setSmartCatPreview] = React.useState(null);

  const runSmartCategorise = React.useCallback(async () => {
    const uncategorised = steps.filter(s => !s.tool_time_category);
    if (uncategorised.length === 0) { toast.info('All steps already have a Tool Time Category assigned.'); return; }
    if (uncategorised.length > 80) toast.info(`Analysing first 80 uncategorised steps (${uncategorised.length} total).`);
    const batch = uncategorised.slice(0, 80);
    setSmartCatRunning(true);
    const categoryOptions = Object.entries(toolTimeGroups).flatMap(([gKey, g]) => (g.subcategories || []).map(sub => `${gKey}::${sub}`)).join('\n');
    const stepsPayload = batch.map(s => `#${s.step_number} | ${s.task_description || '(no description)'} | manual:${s.manual_time||0}m walking:${s.walking_time||0}m waiting:${s.waiting_time||0}m`).join('\n');
    try {
      const result = await appClient.integrations.Core.InvokeLLM({
        prompt: `You are a lean manufacturing expert and maintenance process engineer.\nAnalyse each maintenance task step below and assign the MOST APPROPRIATE Tool Time Category.\n\nCATEGORY OPTIONS (use exact format "group::subcategory"):\n${categoryOptions}\n\nCLASSIFICATION RULES:\n- tooltime::* → Direct hands-on maintenance work.\n- nva_essential::Admin Tasks (including HSE) → Safety checks, permits, paperwork, LOTO.\n- nva_activities::Travel → Walking to/from work area.\n- waste::Waiting for Others → Waiting for another trade, crane, inspector.\n- waste::Idle → No work being done.\n\nRespond with JSON only.\n\nSTEPS TO CATEGORISE:\n${stepsPayload}`,
        response_json_schema: { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { step_number: { type: 'number' }, suggested_category: { type: 'string' }, suggested_intext: { type: 'string' }, reason: { type: 'string' } }, required: ['step_number', 'suggested_category', 'reason'] } } }, required: ['results'] },
      });
      if (!result?.results?.length) { toast.error('AI returned no results. Try again or categorise manually.'); setSmartCatRunning(false); return; }
      const stepNumMap = {};
      batch.forEach(s => { stepNumMap[s.step_number] = s; });
      const preview = result.results.map(r => {
        const s = stepNumMap[r.step_number]; if (!s) return null;
        const catValid = Object.entries(toolTimeGroups).some(([gKey, g]) => (g.subcategories || []).some(sub => `${gKey}::${sub}` === r.suggested_category));
        return { stepId: s.id, stepNum: s.step_number, task: s.task_description, currentCategory: s.tool_time_category, suggestedCategory: catValid ? r.suggested_category : null, suggestedIntext: ['Internal','External'].includes(r.suggested_intext) ? r.suggested_intext : '', reason: r.reason || '', accepted: catValid };
      }).filter(Boolean);
      const validCount = preview.filter(r => r.suggestedCategory).length;
      setSmartCatPreview({ results: preview, applying: false });
      toast.success(`AI analysed ${preview.length} steps — ${validCount} categorised. Review and apply below.`);
    } catch (err) { toast.error('Smart Categorise failed: ' + (err?.message || 'unknown error')); }
    setSmartCatRunning(false);
  }, [steps, toolTimeGroups]);

  const applySmartCat = React.useCallback(async () => {
    if (!smartCatPreview) return;
    const toApply = smartCatPreview.results.filter(r => r.accepted && r.suggestedCategory);
    if (toApply.length === 0) { toast.info('No suggestions selected to apply.'); return; }
    setSmartCatPreview(prev => ({ ...prev, applying: true }));
    let count = 0;
    for (const r of toApply) { const update = { tool_time_category: r.suggestedCategory }; if (r.suggestedIntext) update.internal_external = r.suggestedIntext; updateStep(r.stepId, update); count++; }
    await new Promise(res => setTimeout(res, 400));
    setSmartCatPreview(null);
    toast.success(`Applied ${count} categor${count !== 1 ? 'ies' : 'y'} to steps.`);
  }, [smartCatPreview, updateStep]);

  const [bulkRoleTarget, setBulkRoleTarget] = useState('');
  const [bulkCatTarget, setBulkCatTarget] = useState('');
  const bulkAssignRole = useCallback(() => { if (!bulkRoleTarget || selectedStepIds.size === 0) return; selectedStepIds.forEach(id => updateStep(id, { role: bulkRoleTarget })); toast.success(`Role "${bulkRoleTarget}" assigned to ${selectedStepIds.size} step${selectedStepIds.size!==1?'s':''}`); setSelectedStepIds(new Set()); setBulkRoleTarget(''); }, [bulkRoleTarget, selectedStepIds, updateStep]);
  const bulkAssignCategory = useCallback(() => { if (!bulkCatTarget || selectedStepIds.size === 0) return; selectedStepIds.forEach(id => updateStep(id, { tool_time_category: bulkCatTarget })); toast.success(`Category set on ${selectedStepIds.size} step${selectedStepIds.size!==1?'s':''}`); setSelectedStepIds(new Set()); setBulkCatTarget(''); }, [bulkCatTarget, selectedStepIds, updateStep]);

  const [draggingSection, setDraggingSection] = React.useState(null);
  const reorderSections = useCallback((draggedSection, targetSection) => {
    if (draggedSection === targetSection) return;
    const sectionGroups = {}; const sectionOrder = [];
    [...steps].sort((a, b) => a.step_number - b.step_number).forEach(s => { const sec = s.section || ''; if (!sectionGroups[sec]) { sectionGroups[sec] = []; sectionOrder.push(sec); } sectionGroups[sec].push(s); });
    const fromIdx = sectionOrder.indexOf(draggedSection); const toIdx = sectionOrder.indexOf(targetSection);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...sectionOrder]; newOrder.splice(fromIdx, 1); newOrder.splice(toIdx, 0, draggedSection);
    const reordered = newOrder.flatMap(sec => sectionGroups[sec] || []);
    const timingMap = {}; let cursor = 0;
    newOrder.forEach(sec => { (sectionGroups[sec] || []).forEach(s => { timingMap[s.id] = { start_time: cursor, start_time_override: true, dependencies: [] }; cursor += getStepTotal(s); }); });
    reorderAndTimeSteps(reordered, timingMap);
    toast.success(`Moved section "${draggedSection}" — start times updated`);
  }, [steps, reorderAndTimeSteps]);

  const [seqOptRole, setSeqOptRole] = useState(null);
  const [seqOptSection, setSeqOptSection] = useState('all');
  const [seqOptResult, setSeqOptResult] = useState(null);
  const distPt = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const runCTSequenceOptimiser = useCallback(() => {
    const targetRole = seqOptRole || roleFilter[0] || null;
    if (!targetRole) { toast.error('Select a role to optimise'); return; }
    const getPos = (step) => nodes?.[step.id] || null;
    const targetSteps = [...steps].sort((a, b) => a.step_number - b.step_number).filter(s => { const roleOk = (s.role || '') === targetRole; const secOk = seqOptSection === 'all' || (s.section || '') === seqOptSection; const hasNode = !!nodes?.[s.id]; const hasDep = (s.dependencies || []).length > 0; return roleOk && secOk && hasNode && !hasDep; });
    const depLockedCount = [...steps].filter(s => (s.role||'') === targetRole && (seqOptSection === 'all' || (s.section||'') === seqOptSection) && nodes?.[s.id] && (s.dependencies||[]).length > 0).length;
    if (depLockedCount > 0) toast.info(`${depLockedCount} step${depLockedCount!==1?'s':''} with dependencies excluded from optimisation.`);
    if (targetSteps.length < 2) { toast.info('Need at least 2 placed nodes without dependencies'); return; }
    const sectionNames = seqOptSection === 'all' ? [...new Set(targetSteps.map(s => s.section || ''))] : [seqOptSection];
    const groups = []; const groupResults = []; let totalCurrent = 0; let totalOptimised = 0; let anyChange = false;
    sectionNames.forEach(section => {
      const ss = targetSteps.filter(s => (s.section || '') === section);
      if (ss.length < 2) { groups.push({ section, original: ss, optimised: ss }); groupResults.push(...ss.map(s => ({ step: s, originalStep: s, changed: false, section, isWaste: getStepPriorityCT(s) === 3 }))); return; }
      const tiers = [0, 1, 2, 3].map(p => ss.filter(s => getStepPriorityCT(s) === p)); const optSteps = [];
      tiers.forEach(tier => { if (!tier.length) return; if (tier.length === 1) { optSteps.push(tier[0]); return; } const wp = tier.map(s => ({ step: s, pos: getPos(s) })); const rem = [...wp]; const opt = [rem.splice(0, 1)[0]]; while (rem.length > 0) { const last = opt[opt.length - 1]; let bi = 0, bd = Infinity; rem.forEach((sp, i) => { const d = distPt(last.pos, sp.pos); if (d < bd) { bd = d; bi = i; } }); opt.push(rem.splice(bi, 1)[0]); } opt.forEach(sp => optSteps.push(sp.step)); });
      const cDist = ss.reduce((a, s, i) => i === 0 ? 0 : a + distPt(getPos(ss[i - 1]), getPos(s)), 0);
      const oDist = optSteps.reduce((a, s, i) => i === 0 ? 0 : a + distPt(getPos(optSteps[i - 1]), getPos(s)), 0);
      totalCurrent += cDist; totalOptimised += oDist;
      groups.push({ section, original: ss, optimised: optSteps });
      optSteps.forEach((step, i) => { const changed = step.id !== ss[i]?.id; if (changed) anyChange = true; groupResults.push({ step, originalStep: ss[i], changed, section, isWaste: getStepPriorityCT(step) === 3 }); });
    });
    const wasteCount = groupResults.filter(r => r.isWaste).length;
    if (!anyChange) { toast.info(`Sequence for ${targetRole} is already optimal`); return; }
    setSeqOptResult({ role: targetRole, section: seqOptSection, groups, groupResults, wasteCount, currentDist: Math.round(totalCurrent), optimisedDist: Math.round(totalOptimised), saving: Math.round(totalCurrent - totalOptimised) });
  }, [seqOptRole, seqOptSection, roleFilter, steps, nodes]);

  const applyCTSequenceOptimisation = useCallback((deleteWaste = false) => {
    if (!seqOptResult) return;
    const { role, section, groups, wasteCount } = seqOptResult;
    const cleanedGroups = groups.map(g => ({ ...g, optimised: deleteWaste ? g.optimised.filter(s => getStepPriorityCT(s) < 3) : g.optimised }));
    const currentSteps = [...steps].sort((a, b) => a.step_number - b.step_number);
    const result = [...currentSteps];
    cleanedGroups.forEach(({ section: sec, optimised }) => { if (!optimised.length) return; const slots = []; for (let i = 0; i < result.length; i++) { if ((result[i].role||'') === role && (result[i].section||'') === sec) slots.push(i); } const optimisedIds = new Set(optimised.map(o => o.id)); const unplaced = currentSteps.filter(s => (s.role||'') === role && (s.section||'') === sec && !optimisedIds.has(s.id)); const fullGroup = [...optimised, ...unplaced]; slots.forEach((slot, i) => { if (fullGroup[i]) result[slot] = fullGroup[i]; }); });
    const seen = new Set();
    let finalList = result.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
    if (deleteWaste) finalList = finalList.filter(s => getStepPriorityCT(s) < 3);
    const timingMap = {};
    const groupStepIds = new Set(cleanedGroups.flatMap(g => g.optimised.map(s => s.id)));
    const anchorStart = finalList.filter(s => groupStepIds.has(s.id)).reduce((min, s) => Math.min(min, s.start_time ?? 0), Infinity);
    let cursor = isFinite(anchorStart) ? anchorStart : 0;
    cleanedGroups.forEach(({ optimised }) => { optimised.forEach((step) => { const total = (Number(step.manual_time)||0) + (Number(step.walking_time)||0) + (Number(step.waiting_time)||0) + (Number(step.machine_time)||0) + (Number(step.inspection_time)||0); timingMap[step.id] = { start_time: cursor, start_time_override: true, dependencies: [] }; cursor += total; }); });
    reorderAndTimeSteps(finalList, timingMap);
    const wasteRemoved = deleteWaste ? wasteCount : 0;
    setSeqOptResult(null);
    toast.success(`Resequenced ${role}${section !== 'all' ? ` / ${section}` : ''}${wasteRemoved > 0 ? ` — ${wasteRemoved} waste step${wasteRemoved !== 1 ? 's' : ''} removed` : ' — Gantt updated'}`);
  }, [seqOptResult, steps, reorderAndTimeSteps]);

  const colLabels = Array.from({ length: numCols }, (_, i) => i);

  const stats = useMemo(() => {
    const all = steps;
    const totalManual = all.reduce((a, s) => a + (Number(s.manual_time) || 0), 0);
    const totalWalking = all.reduce((a, s) => a + (Number(s.walking_time) || 0), 0);
    const totalWaiting = all.reduce((a, s) => a + (Number(s.waiting_time) || 0), 0);
    const totalDuration = totalManual + totalWalking + totalWaiting + all.reduce((a, s) => a + (Number(s.machine_time) || 0), 0) + all.reduce((a, s) => a + (Number(s.inspection_time) || 0), 0);
    const valueAdd = totalManual + all.reduce((a, s) => a + (Number(s.machine_time) || 0), 0);
    return { totalSteps: all.length, totalDuration, totalManual, totalWalking, totalWaiting, valueAddPct: totalDuration > 0 ? Math.round((valueAdd / totalDuration) * 100) : 0 };
  }, [steps]);

  // PDF export via extracted hook
  const { exportPDF } = useCombinationTableExportPDF({ tableRef, pdfPaper, processName: process?.name });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!activeProcess) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveProcess(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeProcess, undo, redo, saveProcess]);

  const handleReorderSteps = useCallback((fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex === -1 || toIndex === -1) return;
    const reordered = [...steps]; const [moved] = reordered.splice(fromIndex, 1); reordered.splice(toIndex, 0, moved);
    const oldPrev = fromIndex > 0 ? steps[fromIndex - 1] : null; const newPrev = toIndex > 0 ? reordered[toIndex - 1] : null;
    const hadSeqDep = oldPrev && (moved.dependencies || []).includes(oldPrev.id);
    reorderSteps(reordered);
    if (hadSeqDep) { if (newPrev && newPrev.id !== oldPrev.id) updateStep(moved.id, { dependencies: [newPrev.id], start_time: newPrev._finish || 0, start_time_override: false }); else if (!newPrev) updateStep(moved.id, { dependencies: [], start_time: 0, start_time_override: false }); }
  }, [steps, reorderSteps, updateStep]);

  const handleDragEnd = useCallback(({ active, over }) => { if (!over || active.id === over.id) return; handleReorderSteps(steps.findIndex(s => s.id === active.id), steps.findIndex(s => s.id === over.id)); }, [steps, handleReorderSteps]);

  const fillDown = useCallback((fromStepId, field, value) => {
    const fromIdx = visibleSteps.findIndex(s => s.id === fromStepId); if (fromIdx === -1) return;
    let targetIdx = fromIdx;
    const onMouseMove = (e) => { Array.from(document.querySelectorAll('[data-step-row]')).forEach((row, i) => { const rect = row.getBoundingClientRect(); if (e.clientY >= rect.top && e.clientY <= rect.bottom && i > fromIdx) targetIdx = i; }); };
    const onMouseUp = () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); for (let i = fromIdx + 1; i <= targetIdx; i++) { if (visibleSteps[i]) updateStep(visibleSteps[i].id, { [field]: value }); } };
    window.addEventListener('mousemove', onMouseMove); window.addEventListener('mouseup', onMouseUp);
  }, [visibleSteps, updateStep]);

  const exportCSV = () => {
    const headers = ['Task No', 'Task Description', 'Role', 'Duration', 'Start', 'Finish', 'Dependencies', 'Tool Time Category'];
    const rows = allStepsWithTiming.map(s => [s.step_number, s.task_description, s.role, s._total, s._start.toFixed(1), s._finish.toFixed(1), (s.dependencies || []).map(id => { const dep = stepTimingMap[id]; return dep ? `#${dep.step_number}` : ''; }).join('; '), s.tool_time_category]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `combination_table.csv`; a.click();
  };

  return (
    <div className="space-y-3">
      <ScenarioBranchDialog open={showBranchDialog} onClose={() => setShowBranchDialog(false)} onBranch={handleBranch} parentName={activeProcess?.name || ''} isLoading={branchCreating} />
      <SaveRevisionDialog
        isOpen={showSaveRevision}
        onClose={() => setShowSaveRevision(false)}
        onSave={handleSaveRevision}
        currentRevCount={revCount}
        defaultName={currentUser?.full_name || currentUser?.email || ''}
      />
      {steps.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[{ label: 'Total Steps', value: stats.totalSteps }, { label: 'Combined Duration', value: `${stats.totalDuration}m` }, { label: 'Task Duration', value: `${Math.ceil(maxElapsed)}m` }, { label: 'Manual', value: `${stats.totalManual}m` }, { label: 'Walking', value: `${stats.totalWalking}m`, warn: stats.totalWalking > 30 }, { label: 'Waiting', value: `${stats.totalWaiting}m`, warn: stats.totalWaiting > 20 }].map((s, i) => (
              <Card key={i} className={s.warn ? 'border-destructive/40' : ''}><CardContent className="p-2 text-center"><p className="text-[10px] text-muted-foreground">{s.label}</p><p className="text-base font-bold">{s.value}</p></CardContent></Card>
            ))}
          </div>
          <div className="flex items-center gap-3 bg-card border rounded-lg px-4 py-3">
            <div className="flex-1" data-tour="takt-time-input">
              <label className="text-xs text-muted-foreground font-medium">Target Duration (min)</label>
              <input type="number" min={1} value={cycleTimeTarget} onChange={(e) => { const newMin = Number(e.target.value) || 480; setCycleTimeTarget(newMin); if (activeProcess) { if (writeTimerRef.current) clearTimeout(writeTimerRef.current); writeTimerRef.current = setTimeout(() => updateProcessMeta({ target_duration_hrs: newMin / 60 }), 600); } }} className="w-24 h-8 px-2 text-sm border rounded bg-background focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>
            {allStepsWithTiming.some(s => s._finish > cycleTimeTarget) && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-1.5 rounded-md"><span className="font-semibold">⚠ Bottleneck Alert:</span><span>{allStepsWithTiming.filter(s => s._finish > cycleTimeTarget).length} step(s) exceed cycle time</span></div>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <div data-tour="ct-process-select"><ProcessSelector /></div>
        <SaveStatusBar syncStatus={syncStatus} syncError={syncError} lastSavedAt={lastSavedAt} />
        {peers && peers.length > 0 && <PresenceAvatars peers={peers} />}
        <RevisionHistoryPanel processId={activeProcess?.id} currentSteps={steps} currentUser={currentUser} onRollback={handleRollback} />
        <Button data-tour="revision-btn" variant="outline" size="sm" onClick={() => setShowSaveRevision(true)} className="gap-1.5 h-7 text-xs">📸 Save Rev.</Button>
        {activeProcess && !activeProcess.is_scenario && (
          <Button variant="outline" size="sm" onClick={() => setShowBranchDialog(true)} className="gap-1.5 h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20" title="Create a what-if scenario branch">
            <GitBranch className="w-3 h-3" /> Branch
          </Button>
        )}
      </div>

      {steps.length > 0 && (
        <div className="flex gap-3 flex-wrap text-[10px] text-muted-foreground items-center">
          {Object.entries(toolTimeGroups).map(([k, g]) => (<span key={k} className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: g.color }} />{g.label}</span>))}
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: UNASSIGNED_COLOR }} />Unassigned</span>
          <span className="flex items-center gap-1"><span style={{ fontSize: 10 }}>📌</span>Manually positioned</span>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={undo} disabled={!canUndo} className="gap-1.5 h-7 text-xs" title={canUndo ? `Undo: ${lastUndoLabel} (Ctrl+Z)` : 'Nothing to undo'}><RotateCcw className="w-3 h-3" /> Undo</Button>
            <Button variant="outline" size="sm" onClick={redo} disabled={!canRedo} className="gap-1.5 h-7 text-xs" title={canRedo ? `Redo: ${lastRedoLabel} (Ctrl+Y)` : 'Nothing to redo'}><RotateCw className="w-3 h-3" /> Redo</Button>
            <Button variant="outline" size="sm" onClick={saveProcess} className="gap-1.5 h-7 text-xs" title="Save now (Ctrl+S)">Save</Button>
            <Button variant="outline" size="sm" onClick={() => { if (steps.some(s => (s.dependencies || []).length > 0)) { clearAllDependencies(); toast.success('All dependencies cleared'); } }} disabled={!steps.some(s => (s.dependencies || []).length > 0)} className="gap-1.5 h-7 text-xs text-destructive hover:text-destructive" title="Remove every dependency"><Unlink className="w-3 h-3" /> Clear all deps</Button>
            <Button variant={showCriticalPath ? 'default' : 'outline'} size="sm" onClick={() => { const next = !showCriticalPath; setShowCriticalPath(next); try { localStorage.setItem('mm_swb_show_cp', String(next)); } catch {} }} className={`gap-1.5 h-7 text-xs ${showCriticalPath ? '' : 'text-red-600 hover:text-red-600 border-red-300 hover:border-red-400'}`}>📊 Critical Path{showCriticalPath && criticalPathData ? ` (${criticalPathData.totalCriticalSteps})` : ''}</Button>
            <Button variant="outline" size="sm" onClick={autoResolveOverlaps} disabled={overlappingStepIds.size === 0} className="gap-1.5 h-7 text-xs text-orange-600 hover:text-orange-600 border-orange-300 hover:border-orange-400">⚡ Auto-Resolve ({overlappingStepIds.size > 0 ? overlappingStepIds.size : 0})</Button>
            <Button variant={showDepGraph ? 'default' : 'outline'} size="sm" onClick={() => setShowDepGraph(p => !p)} className="gap-1.5 h-7 text-xs">🕸 Dep Graph</Button>
            <Button variant={showWaitDetector ? 'default' : 'outline'} size="sm" onClick={() => setShowWaitDetector(p => !p)} className={`gap-1.5 h-7 text-xs ${showWaitDetector ? '' : 'text-amber-700 hover:text-amber-700 border-amber-300 hover:border-amber-400'}`}>⏱ Waits</Button>
            {selectedStepIds.size > 0 && (
              <div className="flex items-center gap-1.5 bg-primary/5 border border-primary/20 rounded-lg px-2 py-1 flex-wrap">
                <span className="text-xs font-semibold text-primary">{selectedStepIds.size} selected</span>
                <div className="flex items-center gap-1">
                  <select value={bulkRoleTarget} onChange={e => setBulkRoleTarget(e.target.value)} className="h-6 text-[11px] px-1.5 rounded border border-border bg-background"><option value="">Set role…</option>{activeRoles.map(r => <option key={r} value={r}>{r}</option>)}</select>
                  {bulkRoleTarget && <button onClick={bulkAssignRole} className="h-6 px-2 text-[11px] rounded bg-primary text-white">Apply</button>}
                </div>
                <div className="flex items-center gap-1">
                  <select value={bulkCatTarget} onChange={e => setBulkCatTarget(e.target.value)} className="h-6 text-[11px] px-1.5 rounded border border-border bg-background max-w-[180px]"><option value="">Set category…</option>{Object.entries(toolTimeGroups).map(([gKey, g]) => g.subcategories.map(sub => (<option key={`${gKey}::${sub}`} value={`${gKey}::${sub}`}>{g.label} → {sub}</option>)))}</select>
                  {bulkCatTarget && <button onClick={bulkAssignCategory} className="h-6 px-2 text-[11px] rounded bg-primary text-white">Apply</button>}
                </div>
                <Button variant="destructive" size="sm" onClick={deleteSelectedSteps} className="h-6 px-2 text-[11px] gap-1"><Trash2 className="w-3 h-3" /> Delete</Button>
                <button onClick={() => setSelectedStepIds(new Set())} className="text-[10px] text-muted-foreground ml-1 hover:text-foreground">✕</button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Filter by role:</label>
            <MultiSelectFilter label="Role" options={activeRoles} selected={roleFilter} onChange={setRoleFilter} width="w-44" />
            <button onClick={() => { const unassigned = allStepsWithTiming.filter(s => !s.role || !s.tool_time_category); if (unassigned.length > 0) toast.info(`${unassigned.length} step${unassigned.length!==1?'s':''} need role or category`); else toast.success('All steps have roles and categories ✓'); }} className="h-7 px-2 text-[11px] rounded border border-amber-300 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors shrink-0">🏷 Untagged?</button>
            <button data-tour="categorise-btn" onClick={runSmartCategorise} disabled={smartCatRunning || steps.length === 0} className="flex items-center gap-1 h-7 px-2.5 text-[11px] rounded border border-purple-300 text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-colors shrink-0 disabled:opacity-40 font-medium">
              {smartCatRunning ? <><span className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin inline-block" /> Analysing…</> : <><Wand2 className="w-3 h-3" /> Smart Categorise</>}
            </button>
            <label className="text-xs text-muted-foreground ml-2">Section:</label>
            <MultiSelectFilter label="Section" options={sections} selected={sectionFilter} onChange={setSectionFilter} width="w-44" />
            <label className="text-xs text-muted-foreground ml-2">Category:</label>
            <CategoryFilter options={allCategories} selected={categoryFilter} onChange={setCategoryFilter} />
            <label className="text-xs text-muted-foreground ml-2">Int/Ext:</label>
            <div className="flex items-center gap-1">
              <select value={intextFilter[0] || ''} onChange={e => setIntextFilter(e.target.value ? [e.target.value] : [])} className="h-7 text-xs px-1.5 rounded border border-border bg-background focus:outline-none" style={{ minWidth: 90 }}>
                <option value="">All</option><option value="Internal">🔵 Internal</option><option value="External">🟢 External</option>
              </select>
              {intextFilter.length > 0 && <button onClick={() => setIntextFilter([])} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>}
            </div>
            {mapLayers && mapLayers.length > 1 && (
              <div className="flex items-center gap-1">
                <label className="text-xs text-muted-foreground">Layer:</label>
                <select value={layerFilter[0] || ''} onChange={e => setLayerFilter(e.target.value ? [e.target.value] : [])} className="h-7 text-xs px-1.5 rounded border border-border bg-background focus:outline-none">
                  <option value="">All layers</option>{mapLayers.map(l => (<option key={l.id} value={l.id}>{l.name}</option>))}
                </select>
                {layerFilter.length > 0 && <button onClick={() => setLayerFilter([])} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>}
              </div>
            )}
            <label className="text-xs text-muted-foreground ml-2">Task:</label>
            <input value={taskFilter} onChange={e => handleTaskFilterChange(e.target.value)} placeholder="Search task…" className="h-7 w-36 text-xs px-2 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            {(roleFilter.length > 0 || sectionFilter.length > 0 || categoryFilter.length > 0 || intextFilter.length > 0 || layerFilter.length > 0 || taskFilter) && (
              <><span className="text-[10px] text-muted-foreground">Showing {visibleSteps.length} of {allStepsWithTiming.length}</span><Button variant="ghost" size="sm" onClick={() => { setRoleFilter([]); setSectionFilter([]); setCategoryFilter([]); setIntextFilter([]); setLayerFilter([]); setTaskFilter(''); }} className="h-6 text-[10px] px-2">Clear</Button></>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleResetAllCols} className="gap-1.5 h-7 text-xs">Reset Columns</Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleZoom('out')} className="gap-1.5 h-7 px-2"><ZoomOut className="w-3 h-3" /></Button>
            <span className="text-xs font-medium w-10 text-center text-muted-foreground">{zoom}%</span>
            <Button variant="outline" size="sm" onClick={() => handleZoom('in')} className="gap-1.5 h-7 px-2"><ZoomIn className="w-3 h-3" /></Button>
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 h-7 text-xs"><Download className="w-3 h-3" /> CSV</Button>
          <div className="flex items-center gap-1">
            <select value={pdfPaper} onChange={(e) => setPdfPaper(e.target.value)} className="h-7 text-xs border border-border rounded px-1.5 bg-background">
              <optgroup label="Standard">
                <option value="a4-landscape">A4 Landscape</option><option value="a4-portrait">A4 Portrait</option>
                <option value="a3-landscape">A3 Landscape</option><option value="a3-portrait">A3 Portrait</option>
                <option value="a2-landscape">A2 Landscape</option><option value="a1-landscape">A1 Landscape</option>
                <option value="letter-landscape">Letter Landscape</option><option value="tabloid-landscape">Tabloid Landscape</option>
              </optgroup>
              <optgroup label="Plotter (continuous length)">
                <option value="plotter-a0">A0 Plotter (841mm wide)</option><option value="plotter-a1">A1 Plotter (594mm wide)</option>
                <option value="plotter-a2">A2 Plotter (420mm wide)</option><option value="plotter-36in">36" Roll (914mm wide)</option>
                <option value="plotter-24in">24" Roll (610mm wide)</option>
              </optgroup>
            </select>
            <Button variant="outline" size="sm" onClick={exportPDF} className="gap-1.5 h-7 text-xs"><FileDown className="w-3 h-3" /> PDF</Button>
          </div>
        </div>
      )}

      {showDepGraph && steps.length > 0 && <DependencyGraphView steps={allStepsWithTiming} roleColours={roleColours} onClose={() => setShowDepGraph(false)} />}

      {steps.length > 0 && (
        <Card className="mb-1">
          <SequenceOptimiserPanel seqOptResult={seqOptResult} setSeqOptResult={setSeqOptResult} seqOptRole={seqOptRole} setSeqOptRole={setSeqOptRole} seqOptSection={seqOptSection} setSeqOptSection={setSeqOptSection} roles={activeRoles} sections={sections} onRun={runCTSequenceOptimiser} onApply={() => applyCTSequenceOptimisation(false)} onApplyAndDelete={() => applyCTSequenceOptimisation(true)} />
        </Card>
      )}

      {steps.length > 0 && <WaitDetectorPanel activeProcess={activeProcess} stepsWithTiming={allStepsWithTiming} insertWaitStep={insertWaitStep} forceShow={showWaitDetector} />}

      <ValidationPanel steps={steps} className="mb-4" />

      {steps.length > 0 && <LiveCycleChart steps={allStepsWithTiming} numCols={numCols} cycleTimeTarget={cycleTimeTarget} maxElapsed={maxElapsed} roleColours={roleColours} validRoles={activeRoles} />}

      <SmartCategorisePanel preview={smartCatPreview} setPreview={setSmartCatPreview} onApply={applySmartCat} toolTimeGroups={toolTimeGroups} />

      <Card data-tour="gantt-table">
        <CardContent className="p-0">
          <div className="overflow-x-auto" ref={(el) => { tableRef.current = el; scrollContainerRef.current = el; }} style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }} onScroll={(e) => { setScrollTop(e.currentTarget.scrollTop); setViewportH(e.currentTarget.clientHeight); }}>
            {!activeProcess ? (
              <div className="py-16 text-center text-sm text-muted-foreground p-6"><p className="font-medium mb-1">No process selected</p><p className="text-xs">Select a process above to begin</p></div>
            ) : (
              <table className="text-xs border-collapse" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%', fontSize: `${zoom}%` }}>
                <colgroup>
                  <col style={{ width: 28, minWidth: 28 }} /><col style={{ width: colWidths.stepNum }} /><col style={{ width: colWidths.section }} />
                  <col style={{ width: colWidths.description }} /><col style={{ width: colWidths.role }} />
                  <col style={{ width: colWidths.duration }} /><col style={{ width: colWidths.start }} /><col style={{ width: colWidths.finish }} />
                  <col style={{ width: colWidths.category }} /><col style={{ width: colWidths.intext }} /><col style={{ width: colWidths.layer || 90 }} />
                  <col style={{ width: colWidths.dependency }} />
                  {Array.from({ length: numCols }, (_, i) => (<col key={i} style={{ width: CELL_W, minWidth: CELL_W }} />))}
                </colgroup>
                <thead className="sticky top-0 z-20">
                  <tr className="bg-muted border-b">
                    <th className="border border-border p-1 text-center bg-muted z-30" rowSpan={2} style={{ width: 28, minWidth: 28, position: 'sticky', left: stickyLeft.checkbox }}><input type="checkbox" checked={visibleSteps.length > 0 && selectedStepIds.size === visibleSteps.length} onChange={toggleSelectAll} className="cursor-pointer w-3.5 h-3.5" /></th>
                    <th className="border border-border p-1 text-center text-[10px] font-semibold relative bg-muted z-30" rowSpan={2} style={{ width: colWidths.stepNum, position: 'sticky', left: stickyLeft.stepNum }}># <ResizeHandle onResize={(d) => handleColResize('stepNum', d)} onReset={() => handleColReset('stepNum')} /></th>
                    <th className="border border-border p-1 text-center text-[10px] font-semibold relative bg-muted z-30" rowSpan={2} style={{ width: colWidths.section, position: 'sticky', left: stickyLeft.section }}>Section <ResizeHandle onResize={(d) => handleColResize('section', d)} onReset={() => handleColReset('section')} /></th>
                    <th className="border border-border p-1 text-left text-[10px] font-semibold relative bg-muted z-30" rowSpan={2} style={{ width: colWidths.description, position: 'sticky', left: stickyLeft.description }}>Task Description <ResizeHandle onResize={(d) => handleColResize('description', d)} onReset={() => handleColReset('description')} /></th>
                    <th className="border border-border p-1 text-center text-[10px] font-semibold relative bg-muted z-30" rowSpan={2} style={{ width: colWidths.role, position: 'sticky', left: stickyLeft.role, boxShadow: '2px 0 6px -2px rgba(0,0,0,0.15)' }}>Role <ResizeHandle onResize={(d) => handleColResize('role', d)} onReset={() => handleColReset('role')} /></th>
                    <th className="border border-border p-1 text-center text-[10px] font-semibold relative bg-muted z-30" rowSpan={2} style={{ width: colWidths.start }}>Start <ResizeHandle onResize={(d) => handleColResize('start', d)} onReset={() => handleColReset('start')} /></th>
                    <th className="border border-border p-1 text-center text-[10px] font-semibold relative bg-muted z-30" rowSpan={2} style={{ width: colWidths.duration }}>Dur <ResizeHandle onResize={(d) => handleColResize('duration', d)} onReset={() => handleColReset('duration')} /></th>
                    <th className="border border-border p-1 text-center text-[10px] font-semibold relative bg-muted z-30" rowSpan={2} style={{ width: colWidths.finish }}>Fin <ResizeHandle onResize={(d) => handleColResize('finish', d)} onReset={() => handleColReset('finish')} /></th>
                    <th className="border border-border p-1 text-center text-[10px] font-semibold relative bg-muted z-30" rowSpan={2} style={{ width: colWidths.category }}>Tool Time Category <ResizeHandle onResize={(d) => handleColResize('category', d)} onReset={() => handleColReset('category')} /></th>
                    <th className="border border-border p-1 text-center text-[10px] font-semibold relative bg-muted z-30" rowSpan={2} style={{ width: colWidths.intext }}>Int/Ext <ResizeHandle onResize={(d) => handleColResize('intext', d)} onReset={() => handleColReset('intext')} /></th>
                    <th className="border border-border p-1 text-center text-[10px] font-semibold relative bg-muted z-30" rowSpan={2} style={{ width: colWidths.layer }}>Layer <ResizeHandle onResize={(d) => handleColResize('layer', d)} onReset={() => handleColReset('layer')} /></th>
                    <th className="border border-border p-1 text-center text-[10px] font-semibold relative bg-muted z-30" rowSpan={2} style={{ width: colWidths.dependency }}>Dependency <ResizeHandle onResize={(d) => handleColResize('dependency', d)} onReset={() => handleColReset('dependency')} /></th>
                    <th className="border border-border p-1 text-center text-[10px] font-semibold bg-primary/10" colSpan={numCols}>Elapsed Task Time (min) →</th>
                  </tr>
                  <tr className="bg-muted/50">
                    {colLabels.map(n => (
                      <th key={n} className="border border-border/40 text-center font-normal text-[9px] text-muted-foreground relative" style={{ width: CELL_W, minWidth: CELL_W, maxWidth: CELL_W, padding: '2px 0' }}>
                        {n === cycleTimeTarget ? (<span className="text-destructive font-bold" title="Cycle time target">▼</span>) : n > 0 && n % 5 === 0 ? n : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={visibleSteps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {topSpacerH > 0 && (<tr aria-hidden="true"><td colSpan={12 + numCols} style={{ height: topSpacerH, padding: 0, border: 'none' }} /></tr>)}
                  {visibleSteps.slice(startIdx, endIdx).map((step, sliceIdx) => {
                    const idx = startIdx + sliceIdx;
                    const prevRole = idx > 0 ? visibleSteps[idx - 1].role : null;
                    const showSeparator = prevRole !== undefined && prevRole !== step.role && step.role;
                    return (
                      <React.Fragment key={step.id}>
                        {showSeparator && (
                          <tr className={`bg-muted/10 transition-colors ${draggingSection && draggingSection !== (step.section || '') ? 'hover:bg-primary/10' : ''}`} style={{ height: SEP_H }} draggable onDragStart={(e) => { setDraggingSection(step.section || ''); e.dataTransfer.effectAllowed = 'move'; }} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={(e) => { e.preventDefault(); if (draggingSection !== null && draggingSection !== (step.section || '')) reorderSections(draggingSection, step.section || ''); setDraggingSection(null); }} onDragEnd={() => setDraggingSection(null)}>
                            <td colSpan={11 + numCols} className="py-0.5 px-3 cursor-grab active:cursor-grabbing select-none">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-px bg-border/50" />
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded flex items-center gap-1.5" style={{ color: getRoleColour(step.role, roleColours), background: `${getRoleColour(step.role, roleColours)}15`, borderLeft: `3px solid ${getRoleColour(step.role, roleColours)}` }}>
                                  <span className="text-muted-foreground opacity-60">⠿</span>{step.section || step.role}
                                </span>
                                <div className="flex-1 h-px bg-border/50" />
                              </div>
                            </td>
                          </tr>
                        )}
                        <GanttRow step={step} stepIndex={idx} onUpdate={rowOnUpdate[step.id]} onBarMove={rowOnBarMove[step.id]} onDelete={rowOnDelete[step.id]} onAddStep={addStep} numCols={numCols} roles={activeRoles} sections={sections} onAddSection={addSection} allSteps={allStepsWithTiming} visibleSteps={visibleSteps} allStepsUnordered={steps} toolTimeGroups={toolTimeGroups} roleColours={roleColours} colWidths={colWidths} cycleTimeTarget={cycleTimeTarget} fillDown={fillDown} isOverlapping={overlappingStepIds.has(step.id)} isSelected={selectedStepIds.has(step.id)} onToggleSelect={rowOnToggle[step.id]} onDuplicate={rowOnDuplicate[step.id]} stickyLeft={stickyLeft} openDepStepId={openDepStepId} setOpenDepStepId={setOpenDepStepId} cpData={criticalPathData} mapLayers={mapLayers} nodeLayer={nodesMemo?.[step.id]?.layerId ?? 'layer-ground'} lockedBy={lockedSteps[step.id] || null} onEditingChange={setEditingStep} />
                      </React.Fragment>
                    );
                  })}
                  {botSpacerH > 0 && (<tr aria-hidden="true"><td colSpan={12 + numCols} style={{ height: botSpacerH, padding: 0, border: 'none' }} /></tr>)}
                  {visibleSteps.length === 0 && allStepsWithTiming.length > 0 && (<tr><td colSpan={11 + numCols} className="py-8 text-center text-xs text-muted-foreground">No steps match the selected role filter.</td></tr>)}
                  {activeProcess && (
                    <tr className="border-t-2 border-primary/20 hover:bg-muted/30">
                      <td colSpan={11} className="border border-border/30 px-3 py-2"><Button data-tour="add-step-btn" variant="ghost" size="sm" onClick={() => addStep()} className="h-6 px-2 text-xs gap-1"><Plus className="w-3 h-3" /> Add Step</Button></td>
                      <td colSpan={numCols} className="border border-border/30" />
                    </tr>
                  )}
                </tbody>
                </SortableContext>
                </DndContext>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
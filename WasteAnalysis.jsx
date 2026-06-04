import React, { useState, useCallback, useMemo } from 'react';
import { useProcess } from '@/lib/processContext';
import { useUnsavedWarning } from '@/hooks/useUnsavedWarning';
import { applyWaitingWasteRule } from '@/lib/stepUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, ComposedChart, Line,
} from 'recharts';
import { useToolTimeCategories } from '@/hooks/useToolTimeCategories';
import { useRoles } from '@/hooks/useRoles';
import ProcessSelector from '@/components/ProcessSelector';
import { YamazumiPanel } from '@/components/YamazumiChart';
import SaveStatusBar from '@/components/SaveStatusBar';
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── helpers ───────────────────────────────────────────────────────────────────
const getStepTotal = (step) =>
  (step.manual_time || 0) + (step.walking_time || 0) +
  (step.waiting_time || 0) + (step.machine_time || 0) +
  (step.inspection_time || 0);

// ── SortableWasteRow ──────────────────────────────────────────────────────────
function SortableWasteRow({ step, TOOL_TIME_GROUPS, updateStep, addStep, deleteStep }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });

  const currentCat = step.tool_time_category || '';
  const group = Object.entries(TOOL_TIME_GROUPS).find(([, g]) =>
    g.subcategories.some(sub => currentCat.includes(sub))
  );

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="border-b border-border/30 hover:bg-muted/20 group"
    >
      {/* Grip + step number */}
      <td className="p-2 font-mono">
        <div className="flex items-center gap-1">
          <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground">
            <GripVertical className="w-3 h-3" />
          </span>
          <span>{step.step_number}</span>
          <button
            onClick={() => addStep(step.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-primary/20 rounded text-[10px] text-primary"
            title="Insert step before this one"
          >+</button>
          <button
            onClick={() => deleteStep(step.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-destructive/20 rounded text-destructive"
            title="Delete step"
          ><Trash2 className="w-3 h-3" /></button>
        </div>
      </td>

      {/* Task */}
      <td className="p-2">
        <input
          type="text"
          value={step.task_description || ''}
          onChange={e => updateStep(step.id, { task_description: e.target.value })}
          className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
          placeholder="Task description"
        />
      </td>

      {/* Role */}
      <td className="p-2 text-muted-foreground text-xs">{step.role}</td>

      {/* Total */}
      <td className="p-2 text-center font-mono">
        <div className="flex items-center justify-center gap-1">
          <input
            type="number" min={0}
            value={getStepTotal(step)}
            onChange={e => {
              const newDuration = Math.max(0, Number(e.target.value) || 0);
              const oldTotal = getStepTotal(step);
              if (newDuration === oldTotal) return;
              const updates = {
                manual_time: step.manual_time || 0,
                walking_time: step.walking_time || 0,
                waiting_time: step.waiting_time || 0,
                machine_time: step.machine_time || 0,
                inspection_time: step.inspection_time || 0,
              };
              if (oldTotal > 0) {
                const scale = newDuration / oldTotal;
                updates.manual_time = Math.round((updates.manual_time * scale) * 10) / 10;
                updates.walking_time = Math.round((updates.walking_time * scale) * 10) / 10;
                updates.waiting_time = Math.round((updates.waiting_time * scale) * 10) / 10;
                updates.machine_time = Math.round((updates.machine_time * scale) * 10) / 10;
                updates.inspection_time = Math.round((updates.inspection_time * scale) * 10) / 10;
                const sum = Object.values(updates).reduce((a, v) => a + v, 0);
                updates.manual_time += newDuration - sum;
              } else {
                updates.manual_time = newDuration;
              }
              const corrected = applyWaitingWasteRule(step, updates);
              updateStep(step.id, corrected);
            }}
            className="w-14 text-right bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring font-mono"
          />
          <span className="text-muted-foreground">m</span>
        </div>
      </td>

      {/* Tool Time Category */}
      <td className="p-1">
        <div className="flex items-center gap-1.5">
          <select
            value={currentCat}
            onChange={e => updateStep(step.id, { tool_time_category: e.target.value })}
            className="flex-1 text-[10px] bg-transparent border border-border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-ring"
            style={{ color: group ? TOOL_TIME_GROUPS[group[0]].color : undefined }}
          >
            <option value="">— Select —</option>
            {Object.entries(TOOL_TIME_GROUPS).map(([gKey, g]) => (
              <optgroup key={gKey} label={g.label}>
                {g.subcategories.map(sub => (
                  <option key={sub} value={`${gKey}::${sub}`}>{sub}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {currentCat && (
            <button
              onClick={() => updateStep(step.id, { tool_time_category: '' })}
              className="p-1 hover:text-destructive text-muted-foreground"
              title="Clear category"
            ><X className="w-3 h-3" /></button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WasteAnalysis() {
  useUnsavedWarning();
  const { activeProcess, steps, updateStep, addStep, deleteStep, reorderSteps } = useProcess();
  const { groups: TOOL_TIME_GROUPS } = useToolTimeCategories();
  const { roles } = useRoles();

  const [activeGroup, setActiveGroup] = useState(null);
  const [roleFilter, setRoleFilter] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Category options = the 4 DILO-FIT group labels
  const categoryOptions = useMemo(() => Object.values(TOOL_TIME_GROUPS).map(g => g.label), [TOOL_TIME_GROUPS]);

  // Role options including (Unassigned) for steps with no role
  const roleOptions = useMemo(() => {
    const used = [...new Set(steps.map(s => s.role || '(Unassigned)'))];
    return [...roles.filter(r => used.includes(r)), ...used.filter(r => !roles.includes(r))];
  }, [steps, roles]);

  // Filtered steps (for metrics + table)
  const filteredSteps = useMemo(() => {
    return steps.filter(s => {
      const roleOk = roleFilter.length === 0 || roleFilter.includes(s.role || '(Unassigned)');
      if (!roleOk) return false;
      if (categoryFilter.length === 0) return true;
      const cat = s.tool_time_category || '';
      if (!cat) return categoryFilter.includes('(Untagged)');
      return categoryFilter.some(label => {
        const group = Object.values(TOOL_TIME_GROUPS).find(g => g.label === label);
        return group && group.subcategories.some(sub => cat === `${Object.entries(TOOL_TIME_GROUPS).find(([,g]) => g.label === label)?.[0]}::${sub}`);
      });
    });
  }, [steps, roleFilter, categoryFilter, TOOL_TIME_GROUPS]);

  const isFiltered = roleFilter.length > 0 || categoryFilter.length > 0;

  // Metrics from filteredSteps
  const totalDuration = filteredSteps.reduce((a, s) => a + getStepTotal(s), 0);

  const toolTimeData = useMemo(() => Object.entries(TOOL_TIME_GROUPS).map(([key, group]) => ({
    name: group.label,
    key,
    value: filteredSteps.filter(s => {
      const cat = s.tool_time_category || '';
      return group.subcategories.some(sub => cat.includes(sub));
    }).reduce((a, s) => a + getStepTotal(s), 0),
    fill: group.color,
  })).filter(d => d.value > 0), [filteredSteps, TOOL_TIME_GROUPS]);

  const totalToolTime = toolTimeData.reduce((a, d) => a + d.value, 0);
  const valueAddToolTime = toolTimeData.filter(d => ['Tooltime', 'NVA - Essential Tasks'].some(l => d.name.includes(l))).reduce((a, d) => a + d.value, 0);
  const nonValueAddToolTime = toolTimeData.filter(d => ['NVA - Activities', 'Waste'].some(l => d.name.includes(l))).reduce((a, d) => a + d.value, 0);
  const toolTimeValueAddPct = totalToolTime > 0 ? Math.round((valueAddToolTime / totalToolTime) * 100) : 0;
  const toolTimeNonValueAddPct = totalToolTime > 0 ? Math.round((nonValueAddToolTime / totalToolTime) * 100) : 0;
  const processCycleEfficiency = totalDuration > 0 ? Math.round((valueAddToolTime / totalDuration) * 100) : 0;

  // ── Section-Level PCE ─────────────────────────────────────────────────
  const sectionPCE = useMemo(() => {
    const sectionMap = {};
    filteredSteps.forEach(s => {
      const sec = s.section || '(No Section)';
      if (!sectionMap[sec]) sectionMap[sec] = { total:0, tooltime:0, waste:0, steps:0 };
      const dur = getStepTotal(s);
      sectionMap[sec].total += dur;
      sectionMap[sec].steps++;
      const cat = (s.tool_time_category||'').toLowerCase();
      if (cat.startsWith('tooltime')) sectionMap[sec].tooltime += dur;
      if (cat.startsWith('waste') || Number(s.waiting_time) > 0) sectionMap[sec].waste += dur;
    });
    return Object.entries(sectionMap).map(([section, d]) => ({
      section, total: d.total, tooltime: d.tooltime, waste: d.waste, steps: d.steps,
      pce: d.total > 0 ? Math.round(d.tooltime/d.total*100) : 0,
    })).sort((a,b) => b.total-a.total);
  }, [filteredSteps]);

  // ── Role Efficiency ────────────────────────────────────────────────────
  const roleEfficiency = useMemo(() => {
    const roleMap = {};
    filteredSteps.forEach(s => {
      const role = s.role || '(Unassigned)';
      if (!roleMap[role]) roleMap[role] = { total:0, tooltime:0, walking:0, waiting:0, waste:0, steps:0 };
      const dur = getStepTotal(s);
      roleMap[role].total += dur;
      roleMap[role].walking += Number(s.walking_time)||0;
      roleMap[role].waiting += Number(s.waiting_time)||0;
      roleMap[role].steps++;
      const cat = (s.tool_time_category||'').toLowerCase();
      if (cat.startsWith('tooltime')) roleMap[role].tooltime += dur;
      if (cat.startsWith('waste') || Number(s.waiting_time) > 0) roleMap[role].waste += dur;
    });
    return Object.entries(roleMap).map(([role, d]) => ({
      role, total:d.total, tooltime:d.tooltime, walking:d.walking, waiting:d.waiting, waste:d.waste, steps:d.steps,
      pce: d.total > 0 ? Math.round(d.tooltime/d.total*100) : 0,
    })).sort((a,b) => b.total-a.total);
  }, [filteredSteps]);

  // ── Internal vs External Breakdown ────────────────────────────────────
  const intextBreakdown = useMemo(() => {
    const internal     = filteredSteps.filter(s => s.internal_external === 'Internal');
    const external     = filteredSteps.filter(s => s.internal_external === 'External');
    const unclassified = filteredSteps.filter(s => !s.internal_external);
    const dur  = arr => arr.reduce((a, s) => a + getStepTotal(s), 0);
    const tt   = arr => arr.filter(s =>
      (s.tool_time_category || '').toLowerCase().startsWith('tooltime'))
      .reduce((a, s) => a + getStepTotal(s), 0);
    const intDur = dur(internal), extDur = dur(external), unDur = dur(unclassified);
    const totalDur = intDur + extDur + unDur || 1;
    return [
      { label: 'Internal', color: '#2563EB', bgColor: '#EFF6FF',
        steps: internal.length, duration: intDur, tooltime: tt(internal),
        pct: Math.round(intDur / totalDur * 100) },
      { label: 'External', color: '#059669', bgColor: '#F0FDF4',
        steps: external.length, duration: extDur, tooltime: tt(external),
        pct: Math.round(extDur / totalDur * 100) },
      { label: 'Unclassified', color: '#94a3b8', bgColor: '#F8FAFC',
        steps: unclassified.length, duration: unDur, tooltime: tt(unclassified),
        pct: Math.round(unDur / totalDur * 100) },
    ];
  }, [filteredSteps]);

  // Waterfall chart
  const waterfallData = useMemo(() => {
    let running = 0;
    const items = Object.entries(TOOL_TIME_GROUPS).map(([key, group]) => {
      const value = toolTimeData.find(d => d.key === key)?.value ?? 0;
      const cumulativeStart = running;
      running += value;
      return { name: group.label, value, cumulativeStart, cumulativeEnd: running, fill: group.color };
    });
    items.push({ name: 'Total', value: running, cumulativeStart: 0, cumulativeEnd: running, fill: '#94a3b8', isTotal: true });
    return items.map(item => ({ ...item, totalMax: running }));
  }, [toolTimeData, TOOL_TIME_GROUPS]);

  const WaterfallBar = (props) => {
    const { x, width, payload, background } = props;
    if (!payload || payload.value === 0) return null;
    const totalMax = payload.totalMax || 1;
    const bgY = background?.y ?? 0;
    const bgH = background?.height ?? 200;
    if (payload.isTotal) {
      const barH = bgH * (payload.value / totalMax);
      return <rect x={x} y={bgY + bgH - barH} width={width} height={barH} fill={payload.fill} rx={2} />;
    }
    const barH = Math.max(1, bgH * (payload.value / totalMax));
    const barTop = bgY + bgH * (1 - payload.cumulativeEnd / totalMax);
    return <rect x={x} y={barTop} width={width} height={barH} fill={payload.fill} rx={2} />;
  };

  // DnD reorder
  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = steps.findIndex(s => s.id === active.id);
    const newIdx = steps.findIndex(s => s.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = [...steps];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    reorderSteps(reordered);
  }, [steps, reorderSteps]);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <SaveStatusBar />

      <div className="flex items-center gap-3">
        <ProcessSelector />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Duration</p>
            <p className="text-2xl font-bold">{totalDuration}m</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Tool Time</p>
            <p className="text-2xl font-bold text-primary">{totalToolTime}m</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Value-Add %</p>
            <p className="text-2xl font-bold" style={{ color: '#00917B' }}>{toolTimeValueAddPct}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Non-Value-Add %</p>
            <p className="text-2xl font-bold text-destructive">{toolTimeNonValueAddPct}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground" title="Process Cycle Efficiency = Value-added Time ÷ Total Lead Time × 100">
              Process Cycle Efficiency
            </p>
            <p className="text-2xl font-bold" style={{ color: '#2563eb' }}>{processCycleEfficiency}%</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
              {valueAddToolTime}m / {totalDuration}m
            </p>
          </CardContent>
        </Card>

        {Object.entries(TOOL_TIME_GROUPS).map(([key, group]) => {
          const value = toolTimeData.find(d => d.key === key)?.value ?? 0;
          const pct = totalToolTime > 0 ? Math.round((value / totalToolTime) * 100) : 0;
          return (
            <Card key={key} style={{ borderLeftWidth: 3, borderLeftColor: group.color }}>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: group.color }} />
                  {group.label}
                </p>
                <p className="text-2xl font-bold" style={{ color: group.color }}>{value}m · {pct}%</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter active banner */}
      {isFiltered && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <span>⚡ Metrics filtered — showing {filteredSteps.length} of {steps.length} steps</span>
          <button onClick={() => { setRoleFilter([]); setCategoryFilter([]); }}
            className="ml-auto underline hover:no-underline">Clear filters</button>
        </div>
      )}

      {/* PCE explainer */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-3 text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">Process Cycle Efficiency (Time):</span>
            <span className="font-mono">(Value-added Time ÷ Total Lead Time) × 100</span>
          </div>
          <div><span className="font-medium text-foreground">Value-added Time:</span> Tooltime + NVA - Essential Tasks.</div>
          <div><span className="font-medium text-foreground">Total Lead Time:</span> Total time from start to finish, including wait/delay.</div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Time Waterfall by DILO-FIT Group</CardTitle>
            <p className="text-[11px] text-muted-foreground">Cumulative breakdown · {totalToolTime}m total</p>
          </CardHeader>
          <CardContent>
            {toolTimeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={waterfallData} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}m`} />
                  <Tooltip
                    contentStyle={{ fontSize: 10 }}
                    formatter={(v, name, props) => {
                      if (props.payload.isTotal) return [`${props.payload.value}m`, 'Total'];
                      return [`${v}m`, props.payload.name];
                    }}
                    labelFormatter={() => ''}
                  />
                  <Line type="monotone" dataKey="cumulativeEnd" stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="3 3" isAnimationActive={false} dot={false} opacity={0.3} yAxisId="right" />
                  <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false} shape={<WaterfallBar />}>
                    {waterfallData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    <LabelList dataKey="value" position="top" formatter={v => v > 0 ? `${v}m` : ''} style={{ fontSize: 10 }} />
                  </Bar>
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `${v}m`} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                Assign Tool Time Categories to steps to see waterfall
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tool Time Breakdown</CardTitle>
            <p className="text-[11px] text-muted-foreground">By DILO-FIT category group · {totalToolTime}m total</p>
          </CardHeader>
          <CardContent>
            {toolTimeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={toolTimeData} cx="50%" cy="45%" outerRadius={90} innerRadius={40}
                    dataKey="value" label={({ percent }) => `${Math.round(percent * 100)}%`} labelLine>
                    {toolTimeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v, name) => [`${v}m`, name]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                Assign Tool Time Categories to steps to see breakdown
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Group legend */}
      <div className="flex gap-3 flex-wrap">
        {Object.entries(TOOL_TIME_GROUPS).map(([key, group]) => (
          <button key={key}
            onClick={() => setActiveGroup(activeGroup === key ? null : key)}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-all ${activeGroup === key ? 'border-current font-semibold' : 'border-transparent opacity-70'}`}
            style={{ color: group.color }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: group.color }} />
            {group.label}
          </button>
        ))}
      </div>

      {/* ── Section-Level PCE Breakdown ──────────────────────────────────── */}
      {sectionPCE.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">📋 PCE by Section</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sectionPCE.map(sec => (
              <div key={sec.section} className="grid grid-cols-[1fr_56px_56px_64px_64px_88px] gap-2 items-center text-xs py-1 border-b border-border/20 last:border-0">
                <span className="font-medium truncate">{sec.section}</span>
                <span className="text-muted-foreground text-right">{sec.steps}×</span>
                <span className="text-right">{sec.total}m</span>
                <span className="text-right font-medium" style={{ color:'#1B7A3F' }}>{sec.tooltime}m</span>
                <span className="text-right text-red-600">{sec.waste}m</span>
                <div className="flex items-center gap-1">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width:`${Math.min(100,sec.pce)}%`, background: sec.pce>=30?'#1B7A3F':sec.pce>=15?'#d97706':'#dc2626' }} />
                  </div>
                  <span className="text-[10px] font-bold w-8 text-right" style={{ color:sec.pce>=30?'#1B7A3F':sec.pce>=15?'#d97706':'#dc2626' }}>{sec.pce}%</span>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground pt-1">PCE = Tooltime ÷ Section total. 🟢 ≥30% · 🟡 15–29% · 🔴 &lt;15%</p>
          </CardContent>
        </Card>
      )}

      {/* ── Role Efficiency Table ─────────────────────────────────────────── */}
      {roleEfficiency.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">👷 Efficiency by Role</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    {['Role','Steps','Total','Tooltime','Walking','Waiting','Waste','PCE'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold border border-border/30 text-[11px] text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roleEfficiency.map((r,i) => (
                    <tr key={r.role} className={i%2===0?'':'bg-muted/20'}>
                      <td className="px-3 py-2 font-semibold border border-border/20">{r.role}</td>
                      <td className="px-3 py-2 text-center border border-border/20">{r.steps}</td>
                      <td className="px-3 py-2 text-center border border-border/20">{r.total}m</td>
                      <td className="px-3 py-2 text-center border border-border/20 font-medium" style={{ color:'#1B7A3F' }}>{r.tooltime}m</td>
                      <td className="px-3 py-2 text-center border border-border/20 text-blue-600">{r.walking}m</td>
                      <td className="px-3 py-2 text-center border border-border/20 text-amber-600">{r.waiting}m</td>
                      <td className="px-3 py-2 text-center border border-border/20 text-red-600">{r.waste}m</td>
                      <td className="px-3 py-2 border border-border/20">
                        <div className="flex items-center gap-1">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden min-w-[40px]">
                            <div className="h-full rounded-full" style={{ width:`${Math.min(100,r.pce)}%`, background:r.pce>=30?'#1B7A3F':r.pce>=15?'#d97706':'#dc2626' }} />
                          </div>
                          <span className="font-bold text-[11px] w-8 text-right" style={{ color:r.pce>=30?'#1B7A3F':r.pce>=15?'#d97706':'#dc2626' }}>{r.pce}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Internal vs External Analysis ──────────────────────────────────── */}
      {filteredSteps.length > 0 && intextBreakdown.some(b => b.duration > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">🔵🟢 Internal vs External Analysis</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Internal tasks require equipment to be stopped. External tasks can be
              performed while equipment is running (SMED methodology).
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {intextBreakdown.map(b => (
                <div key={b.label} className="rounded-lg p-3 text-center border" style={{ background: b.bgColor, borderColor: b.color + '40' }}>
                  <p className="text-[10px] font-semibold mb-1" style={{ color: b.color }}>{b.label}</p>
                  <p className="text-xl font-bold" style={{ color: b.color }}>{b.duration}m</p>
                  <p className="text-[10px] text-muted-foreground">{b.pct}% of total · {b.steps} steps</p>
                  <p className="text-[10px] text-muted-foreground">Tooltime: {b.tooltime}m</p>
                </div>
              ))}
            </div>
            <div className="h-4 rounded-full overflow-hidden flex gap-px">
              {intextBreakdown.filter(b => b.pct > 0).map(b => (
                <div key={b.label} style={{ width: `${b.pct}%`, background: b.color }}
                  title={`${b.label}: ${b.pct}%`} />
              ))}
            </div>
            <div className="flex gap-4 text-[11px]">
              {intextBreakdown.filter(b => b.pct > 0).map(b => (
                <span key={b.label} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: b.color }} />
                  {b.label} {b.pct}%
                </span>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground bg-muted/40 rounded px-3 py-2">
              💡 Tip: Classify tasks as External and move them before/after the
              main shutdown window to reduce total stopped-equipment time.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Yamazumi Chart ─────────────────────────────────────────────────── */}
      {filteredSteps.length > 0 && (
        <YamazumiPanel
          steps={filteredSteps}
          taktTime={activeProcess?.target_duration_hrs
            ? Number(activeProcess.target_duration_hrs) * 60
            : 0}
          title="Yamazumi — Operator Workload Balance"
          subtitle="Total work per role, stacked by category"
        />
      )}

      {/* ── Tag Wastes & Tool Time per Step (data entry — bottom of page) ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm">Tag Wastes & Tool Time per Step</CardTitle>
            <div className="flex items-center gap-2">
              <MultiSelectFilter label="Role" options={roleOptions} selected={roleFilter} onChange={setRoleFilter} width="w-36" />
              <MultiSelectFilter label="Category" options={categoryOptions} selected={categoryFilter} onChange={setCategoryFilter} width="w-44" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <p className="font-medium mb-1">No steps found</p>
              <p className="text-xs">Create steps in the Combination Table first.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="p-2 text-left">#</th>
                    <th className="p-2 text-left">Task</th>
                    <th className="p-2 text-left">Role</th>
                    <th className="p-2 text-center">Total</th>
                    <th className="p-2 text-left min-w-[200px]">Tool Time Category</th>
                  </tr>
                </thead>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                    <tbody>
                      {filteredSteps.map(step => (
                        <SortableWasteRow
                          key={step.id}
                          step={step}
                          TOOL_TIME_GROUPS={TOOL_TIME_GROUPS}
                          updateStep={updateStep}
                          addStep={addStep}
                          deleteStep={deleteStep}
                        />
                      ))}
                      <tr className="hover:bg-muted/20">
                        <td colSpan="5" className="p-2 text-center">
                          <button onClick={() => addStep()}
                            className="text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded transition-colors flex items-center gap-1 mx-auto">
                            <Plus className="w-3 h-3" /> Add Step
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </SortableContext>
                </DndContext>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
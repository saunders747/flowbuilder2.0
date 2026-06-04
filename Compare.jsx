import { useEffect, useState, useMemo, useRef } from 'react';
import { appClient } from '@/api/standaloneClient';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, TrendingDown, TrendingUp, AlertCircle } from 'lucide-react';
import { SelectGroup, SelectLabel } from '@/components/ui/select';
import { groupProcessesByFleetClass } from '@/hooks/useGroupedProcesses';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getStoredToolTimeGroups } from '@/hooks/useToolTimeCategories';
import { YamazumiCompare } from '@/components/YamazumiChart';

async function calcStats(process, groups) {
  if (!process?.steps_data) return null;
  let steps;
  try {
    let data = process.steps_data;
    if (typeof data === 'string' && (data.startsWith('http://') || data.startsWith('https://'))) {
      const res = await fetch(data);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      steps = await res.json();
    } else {
      steps = JSON.parse(data);
    }
  } catch (err) {
    console.warn('calcStats parse error:', err);
    return null;
  }
  if (!Array.isArray(steps)) return null;
  
  // Calculate total lead time (all step durations)
  const totalLeadTime = steps.reduce((a, s) => {
    const total = (Number(s.manual_time) || 0) + (Number(s.walking_time) || 0) +
                  (Number(s.waiting_time) || 0) + (Number(s.machine_time) || 0) +
                  (Number(s.inspection_time) || 0);
    return a + total;
  }, 0);

  // Calculate per-group totals
  const groupTotals = {};
  Object.entries(groups).forEach(([key, group]) => {
    const value = steps.filter(s => {
      const cat = s.tool_time_category || '';
      return group.subcategories.some(sub => cat.includes(sub));
    }).reduce((a, s) => a + (Number(s.manual_time) || 0) + (Number(s.walking_time) || 0) +
                          (Number(s.waiting_time) || 0) + (Number(s.machine_time) || 0) +
                          (Number(s.inspection_time) || 0), 0);
    groupTotals[key] = value;
  });

  const totalToolTime = Object.values(groupTotals).reduce((a, v) => a + v, 0);
  const valueAddToolTime = (groupTotals.tooltime || 0) + (groupTotals.nva_essential || 0);
  const nonValueAddToolTime = (groupTotals.nva_activities || 0) + (groupTotals.waste || 0);

  const valueAddPct = totalToolTime > 0 ? Math.round((valueAddToolTime / totalToolTime) * 100) : 0;
  const nonValueAddPct = totalToolTime > 0 ? Math.round((nonValueAddToolTime / totalToolTime) * 100) : 0;
  const pce = totalLeadTime > 0 ? Math.round((valueAddToolTime / totalLeadTime) * 100) : 0;

  const groupTotalsWithPct = {};
  Object.entries(groupTotals).forEach(([key, value]) => {
    groupTotalsWithPct[key] = {
      value,
      pct: totalToolTime > 0 ? Math.round((value / totalToolTime) * 100) : 0,
    };
  });

  // Load nodes and edge waypoints
  let nodes = {};
  let edgeWaypoints = {};
  try {
    if (process.nodes_data) {
      nodes = typeof process.nodes_data === 'string' ? JSON.parse(process.nodes_data) : process.nodes_data;
    }
  } catch {}
  try {
    if (process.map_edges_data) {
      edgeWaypoints = typeof process.map_edges_data === 'string' ? JSON.parse(process.map_edges_data) : process.map_edges_data;
    }
  } catch {}

  const getStepDur = s =>
    (Number(s.manual_time)||0)+(Number(s.walking_time)||0)+
    (Number(s.waiting_time)||0)+(Number(s.machine_time)||0)+
    (Number(s.inspection_time)||0);

  const internalSteps   = steps.filter(s => s.internal_external === 'Internal');
  const externalSteps   = steps.filter(s => s.internal_external === 'External');
  const unclassifiedInt = steps.filter(s => !s.internal_external);
  const internalTime    = internalSteps.reduce((a, s) => a + getStepDur(s), 0);
  const externalTime    = externalSteps.reduce((a, s) => a + getStepDur(s), 0);
  const unclassifiedIntextTime = unclassifiedInt.reduce((a, s) => a + getStepDur(s), 0);

  return {
    name: process.name,
    totalSteps: steps.length,
    totalLeadTime,
    totalToolTime,
    groupTotals: groupTotalsWithPct,
    valueAddToolTime,
    nonValueAddToolTime,
    valueAddPct,
    nonValueAddPct,
    pce,
    steps,
    nodes,
    edgeWaypoints,
    schematicUrl: process.schematic_url || null,
    internalTime, externalTime, unclassifiedIntextTime,
    internalCount: internalSteps.length,
    externalCount: externalSteps.length,
  };
}

function ReadOnlySpaghettiMap({ stats, label, groups }) {
  const UNASSIGNED = '#e5e7eb';
  const NODE_R = 14;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [height, setHeight] = useState(420);
  const svgRef = useRef(null);

  const getColor = (cat) => {
    if (!cat) return UNASSIGNED;
    const gk = cat.split('::')[0];
    return groups[gk]?.color || UNASSIGNED;
  };

  const getPos = (step) => {
    if (stats.nodes?.[step.id]) return stats.nodes[step.id];
    const col = (step.step_number - 1) % 7;
    const row = Math.floor((step.step_number - 1) / 7);
    return { x: 80 + col * 120, y: 80 + row * 100 };
  };

  const buildPath = (from, to, wps) => {
    if (!wps || wps.length === 0) {
      const dx = to.x - from.x;
      return `M ${from.x} ${from.y} C ${from.x + dx * 0.4} ${from.y} ${to.x - dx * 0.4} ${to.y} ${to.x} ${to.y}`;
    }
    return 'M ' + [from, ...wps, to].map(p => `${p.x} ${p.y}`).join(' L ');
  };

  // Scroll-wheel zoom
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom(z => Math.min(4, Math.max(0.2, z + (e.deltaY > 0 ? -0.08 : 0.08))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const steps = stats.steps || [];
  const allXs = steps.map(s => getPos(s).x);
  const allYs = steps.map(s => getPos(s).y);
  const minX = Math.min(...allXs, 0) - NODE_R - 10;
  const minY = Math.min(...allYs, 0) - NODE_R - 20;
  const maxX = Math.max(...allXs, 400) + NODE_R + 10;
  const maxY = Math.max(...allYs, 300) + NODE_R + 20;
  const vbW = maxX - minX; const vbH = maxY - minY;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-xs font-medium">{label}</h3>
          <p className="text-[10px] text-muted-foreground">{stats.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <button
            onClick={() => setZoom(z => Math.max(0.2, z - 0.15))}
            className="w-6 h-6 rounded border border-border text-xs flex items-center justify-center hover:bg-muted"
          >
            −
          </button>
          <span className="text-[10px] font-medium w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(z => Math.min(4, z + 0.15))}
            className="w-6 h-6 rounded border border-border text-xs flex items-center justify-center hover:bg-muted"
          >
            +
          </button>
          <button
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="h-6 px-2 rounded border border-border text-[10px] hover:bg-muted"
          >
            Reset
          </button>
          {/* Height resize */}
          <select
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            className="h-6 text-[10px] rounded border border-border bg-background px-1"
          >
            <option value={280}>Small</option>
            <option value={420}>Medium</option>
            <option value={600}>Large</option>
            <option value={800}>X-Large</option>
          </select>
          <span className="text-[10px] text-muted-foreground">{steps.length} steps · read-only</span>
        </div>
      </div>

      {/* SVG canvas */}
      <div className="border rounded bg-slate-50 dark:bg-slate-900 overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
          style={{ width: '100%', height: `${height}px`, cursor: isPanning ? 'grabbing' : 'grab' }}
          className="bg-white dark:bg-slate-950"
          onMouseDown={(e) => {
            setIsPanning(true);
            setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
          }}
          onMouseMove={(e) => {
            if (!isPanning) return;
            setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
          }}
          onMouseUp={() => setIsPanning(false)}
          onMouseLeave={() => setIsPanning(false)}
        >
          <defs>
            <marker id={`arrow-${label}`} markerWidth="7" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 7 3, 0 6" fill="#94a3b8" />
            </marker>
          </defs>

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Grid */}
            <rect x={minX} y={minY} width={vbW} height={vbH} fill="transparent" />

            {/* Schematic */}
            {stats.schematicUrl && (
              <image href={stats.schematicUrl} x={minX} y={minY} width={vbW * 1.2} height={vbH * 1.2} opacity={0.15} />
            )}

            {/* Edges — sequential same-role paths matching the main Spaghetti Map */}
            {(() => {
              const sorted = [...steps].sort((a,b)=>(a.step_number||0)-(b.step_number||0));
              return sorted.slice(0,-1).map((fromStep,i) => {
                const toStep = sorted[i+1];
                if (!toStep || fromStep.role !== toStep.role) return null;
                const edgeId = `${fromStep.id}→${toStep.id}`;
                const wps = stats.edgeWaypoints?.[edgeId] || [];
                const pathD = buildPath(getPos(fromStep), getPos(toStep), wps);
                return <path key={edgeId} d={pathD} fill="none" stroke="#94a3b8" strokeWidth={1.2} markerEnd={`url(#arrow-${label})`} />;
              });
            })()}

            {/* Nodes */}
            {steps.map(step => {
              const pos = getPos(step);
              const color = getColor(step.tool_time_category);
              const textColor = color === UNASSIGNED ? '#374151' : '#ffffff';
              return (
                <g key={step.id} transform={`translate(${pos.x},${pos.y})`}>
                  <circle r={NODE_R} fill={color} stroke="white" strokeWidth={1} />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={Number(step.step_number.toString().length) > 1 ? 8 : 9}
                    fontWeight="700"
                    fill={textColor}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {step.step_number}
                  </text>
                  <text textAnchor="middle" y={NODE_R + 8} fontSize={7} fill="#94a3b8" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    {(step.task_description || '').substring(0, 14)}{(step.task_description || '').length > 14 ? '…' : ''}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Colour legend */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        {Object.entries(groups).map(([key, g]) => (
          <div key={key} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: g.color }} />
            {g.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Compare() {
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [leftStats, setLeftStats] = useState(null);
  const [rightStats, setRightStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const TOOL_TIME_GROUPS = useMemo(() => getStoredToolTimeGroups(), []);

  const { data: processes = [], isLoading, error } = useQuery({
    queryKey: ['processes'],
    queryFn: () => appClient.entities.Process.list('-updated_date', 200),
  });

  const processGroups = useMemo(() => groupProcessesByFleetClass(processes), [processes]);

  useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      setLoadingStats(true);
      const left = processes.find(p => p.id === leftId);
      const right = processes.find(p => p.id === rightId);
      
      const [ls, rs] = await Promise.all([
        left ? calcStats(left, TOOL_TIME_GROUPS) : Promise.resolve(null),
        right ? calcStats(right, TOOL_TIME_GROUPS) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setLeftStats(ls);
      setRightStats(rs);
      setLoadingStats(false);
    };
    
    loadStats();
    return () => { cancelled = true; };
  }, [leftId, rightId, processes]);

  const leadTimeImprovement = leftStats && rightStats && leftStats.totalLeadTime > 0
    ? Math.round(((leftStats.totalLeadTime - rightStats.totalLeadTime) / leftStats.totalLeadTime) * 100)
    : null;
  
  const pceImprovement = leftStats && rightStats ? rightStats.pce - leftStats.pce : null;

  const compareData = leftStats && rightStats
    ? Object.entries(TOOL_TIME_GROUPS).map(([key, g]) => ({
        metric: g.label,
        current: leftStats.groupTotals?.[key]?.value ?? 0,
        future: rightStats.groupTotals?.[key]?.value ?? 0,
        fill: g.color,
      }))
    : [];

  const pceCompareData = leftStats && rightStats
    ? [
        { name: 'Current', value: leftStats.pce },
        { name: 'Future', value: rightStats.pce },
      ]
    : [];

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Current vs Future State Comparison</h2>
          <p className="text-sm text-muted-foreground mt-1">Compare two versions of a process side-by-side</p>
        </div>
      </div>

      {/* Loading & Error States */}
      {isLoading && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Loading processes…
          </CardContent>
        </Card>
      )}
      
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
            <div className="text-sm text-destructive">Failed to load processes. Please try again.</div>
          </CardContent>
        </Card>
      )}

      {/* Selectors */}
      {!isLoading && (
        <div className="grid md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
          <div>
            <label htmlFor="select-current" className="text-xs font-medium text-muted-foreground mb-1 block">Current / Baseline State</label>
            <Select value={leftId} onValueChange={setLeftId}>
              <SelectTrigger id="select-current"><SelectValue placeholder="Select process..." /></SelectTrigger>
              <SelectContent>
                {processGroups.map(({ fleetClass, processes: procs }) => (
                  <SelectGroup key={fleetClass}>
                    <SelectLabel className="text-[10px] font-bold uppercase tracking-wider">📁 {fleetClass}</SelectLabel>
                    {procs.filter(p => p.id !== rightId).map(p => (
                      <SelectItem key={p.id} value={p.id} className="pl-6">
                        {p.name} ({p.state_type || 'Current'})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground hidden md:block mb-2" />
          <div>
            <label htmlFor="select-future" className="text-xs font-medium text-muted-foreground mb-1 block">Future / Improved State</label>
            <Select value={rightId} onValueChange={setRightId}>
              <SelectTrigger id="select-future"><SelectValue placeholder="Select process..." /></SelectTrigger>
              <SelectContent>
                {processGroups.map(({ fleetClass, processes: procs }) => (
                  <SelectGroup key={fleetClass}>
                    <SelectLabel className="text-[10px] font-bold uppercase tracking-wider">📁 {fleetClass}</SelectLabel>
                    {procs.filter(p => p.id !== leftId).map(p => (
                      <SelectItem key={p.id} value={p.id} className="pl-6">
                        {p.name} ({p.state_type || 'Current'})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {leftStats && rightStats && !loadingStats ? (
        <>
          {/* Improvement Banners */}
          {leadTimeImprovement !== null && (
            <Card className={leadTimeImprovement > 0 ? 'border-chart-3/40 bg-chart-3/5' : 'border-destructive/40 bg-destructive/5'}>
              <CardContent className="p-4 flex items-center gap-3">
                {leadTimeImprovement > 0 ? <TrendingDown className="w-5 h-5 text-chart-3" /> : <TrendingUp className="w-5 h-5 text-destructive" />}
                <div>
                  <p className="font-semibold">
                    Lead Time: {leadTimeImprovement > 0 ? `${leadTimeImprovement}% improvement` : `${Math.abs(leadTimeImprovement)}% increase`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Math.abs(leftStats.totalLeadTime - rightStats.totalLeadTime)} minutes {leadTimeImprovement > 0 ? 'saved' : 'added'} per service
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {pceImprovement !== null && (
            <Card className={pceImprovement > 0 ? 'border-chart-3/40 bg-chart-3/5' : 'border-destructive/40 bg-destructive/5'}>
              <CardContent className="p-4 flex items-center gap-3">
                {pceImprovement > 0 ? <TrendingUp className="w-5 h-5 text-chart-3" /> : <TrendingDown className="w-5 h-5 text-destructive" />}
                <div>
                  <p className="font-semibold">
                    Process Cycle Efficiency: {pceImprovement > 0 ? '+' : ''}{pceImprovement} percentage points
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {leftStats.pce}% → {rightStats.pce}%
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Side-by-Side Stat Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { stats: leftStats, label: 'Current State' },
              { stats: rightStats, label: 'Future State' },
            ].map(({ stats, label }) => (
              <Card key={label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{label}: {stats.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Lead Time</span>
                    <span className="font-medium">{stats.totalLeadTime}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Tool Time</span>
                    <span className="font-medium">{stats.totalToolTime}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Process Cycle Eff.</span>
                    <span className="font-medium">{stats.pce}% ({stats.valueAddToolTime}m / {stats.totalLeadTime}m)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Value-Add %</span>
                    <span className="font-medium" style={{ color: '#00917B' }}>{stats.valueAddPct}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Non-Value-Add %</span>
                    <span className="font-medium text-destructive">{stats.nonValueAddPct}%</span>
                  </div>
                  
                  <div className="border-t border-border/30 pt-2 mt-2" />
                  
                  {Object.entries(TOOL_TIME_GROUPS).map(([key, group]) => {
                    const total = stats.groupTotals?.[key];
                    if (!total || total.value === 0) return null;
                    return (
                      <div key={key} className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: group.color }} />
                          <span className="text-muted-foreground">{group.label}</span>
                        </div>
                        <span className="font-medium" style={{ color: group.color }}>{total.value}m · {total.pct}%</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* DILO-FIT Group Comparison Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">DILO-FIT Group Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={compareData}>
                  <XAxis dataKey="metric" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}m`} />
                  <Tooltip formatter={(v) => `${v}m`} />
                  <Legend />
                  <Bar dataKey="current" name="Current" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="future" name="Future" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Process Cycle Efficiency Comparison */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Process Cycle Efficiency Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={pceCompareData}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {pceCompareData.map((d, i) => (
                      <Cell key={i} fill={i === 0 ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-2))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Yamazumi Comparison */}
          {(leftStats?.steps?.length > 0 || rightStats?.steps?.length > 0) && (
            <YamazumiCompare
              leftSteps={leftStats?.steps || []}
              rightSteps={rightStats?.steps || []}
              leftLabel={`Current: ${leftStats?.name || ''}`}
              rightLabel={`Future: ${rightStats?.name || ''}`}
              taktTime={0}
            />
          )}

          {/* Internal vs External Comparison */}
          {leftStats && rightStats && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">🔵🟢 Internal vs External</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/50">
                        {['Classification', 'Current', 'Future', 'Change'].map(h => (
                          <th key={h} className="text-left px-3 py-2 font-semibold border border-border/30 text-[11px] text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: 'internalTime',  label: 'Internal',      color: '#2563EB', cKey: 'internalCount' },
                        { key: 'externalTime',  label: 'External',      color: '#059669', cKey: 'externalCount' },
                        { key: 'unclassifiedIntextTime', label: 'Unclassified', color: '#94a3b8', cKey: null },
                      ].map(({ key, label, color, cKey }) => {
                        const lv = leftStats[key]  || 0;
                        const rv = rightStats[key] || 0;
                        const diff = rv - lv;
                        return (
                          <tr key={key} className="border-b border-border/20">
                            <td className="px-3 py-2 font-semibold border border-border/20 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: color }} />
                              {label}
                            </td>
                            <td className="px-3 py-2 border border-border/20">
                              {lv}m {cKey && leftStats[cKey] !== undefined && (
                                <span className="text-muted-foreground">({leftStats[cKey]} steps)</span>
                              )}
                            </td>
                            <td className="px-3 py-2 border border-border/20">
                              {rv}m {cKey && rightStats[cKey] !== undefined && (
                                <span className="text-muted-foreground">({rightStats[cKey]} steps)</span>
                              )}
                            </td>
                            <td className="px-3 py-2 border border-border/20 font-bold"
                              style={{ color: diff < 0 ? '#059669' : diff > 0 ? '#dc2626' : '#64748b' }}>
                              {diff > 0 ? '+' : ''}{diff}m
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Goal: reduce Internal time by converting tasks to External (SMED). Negative change = improvement.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Spaghetti Map Comparison */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Spaghetti Map Comparison</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Node positions and paths reflect what was mapped in the Spaghetti Map tool. Read-only — edit in the Spaghetti Map page.</p>
            </CardHeader>
            <CardContent>
              {(leftStats.steps?.length > 0 || rightStats.steps?.length > 0) ? (
                <div className="space-y-6">
                  <ReadOnlySpaghettiMap stats={leftStats} label="Current State" groups={TOOL_TIME_GROUPS} />
                  <div className="border-t border-border/40" />
                  <ReadOnlySpaghettiMap stats={rightStats} label="Future State" groups={TOOL_TIME_GROUPS} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-6">No spaghetti map data found. Place nodes in the Spaghetti Map tool first.</p>
              )}
            </CardContent>
          </Card>
          </>
          ) : (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Select two processes to compare
          </CardContent>
        </Card>
      )}
    </div>
  );
}
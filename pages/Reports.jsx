import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/standaloneClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cascadeTimings, getStepTotal } from '@/hooks/useMultiProcessTable';
import { getStoredToolTimeGroups } from '@/hooks/useToolTimeCategories';
import { useRoleColours, getRoleColour } from '@/hooks/useRoleColours';
import { BarChart2, Map, TrendingDown, AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadProcessFull(proc) {
  let steps = [], nodes = {};
  try {
    if (proc.steps_data) {
      const raw = typeof proc.steps_data === 'string'
        ? proc.steps_data.startsWith('http')
          ? await fetch(proc.steps_data).then(r => r.json())
          : JSON.parse(proc.steps_data)
        : proc.steps_data;
      steps = Array.isArray(raw) ? raw : [];
    }
    if (proc.nodes_data) {
      const raw = typeof proc.nodes_data === 'string' ? JSON.parse(proc.nodes_data) : proc.nodes_data;
      nodes = raw || {};
    }
  } catch {}
  return { ...proc, _steps: steps, _nodes: nodes };
}

function computeProcessMetrics(steps) {
  if (!steps || steps.length === 0) return null;
  const cascaded = cascadeTimings(steps);
  const timed = steps.map(s => {
    const cs = cascaded[s.id] || s;
    const total = getStepTotal(cs);
    const start = cs.start_time ?? 0;
    return { ...cs, _start: start, _total: total, _finish: start + total };
  });

  const cycleTime = timed.length > 0 ? Math.max(...timed.map(s => s._finish)) : 0;
  const totalManual = steps.reduce((a, s) => a + (Number(s.manual_time) || 0), 0);
  const totalWalking = steps.reduce((a, s) => a + (Number(s.walking_time) || 0), 0);
  const totalWaiting = steps.reduce((a, s) => a + (Number(s.waiting_time) || 0), 0);
  const totalDuration = steps.reduce((a, s) => a + getStepTotal(s), 0);

  // Role breakdown
  const roles = [...new Set(steps.map(s => s.role).filter(Boolean))];
  const roleBreakdown = roles.map(role => {
    const rs = timed.filter(s => s.role === role);
    const total = rs.reduce((a, s) => a + s._total, 0);
    const finish = rs.length > 0 ? Math.max(...rs.map(s => s._finish)) : 0;
    const idle = Math.max(0, cycleTime - total);
    return { role, total, finish, idle, steps: rs.length };
  }).sort((a, b) => b.finish - a.finish);

  // Bottleneck = role with highest finish time
  const bottleneck = roleBreakdown[0] || null;

  // Category breakdown
  const groups = getStoredToolTimeGroups();
  const catMap = {};
  steps.forEach(s => {
    const gKey = (s.tool_time_category || '').split('::')[0] || 'unassigned';
    if (!catMap[gKey]) catMap[gKey] = { duration: 0, count: 0, label: groups[gKey]?.label || 'Unassigned', color: groups[gKey]?.color || '#94a3b8' };
    catMap[gKey].duration += getStepTotal(s);
    catMap[gKey].count++;
  });
  const categories = Object.entries(catMap).map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.duration - a.duration);

  const toolTimeDuration = (catMap['tooltime']?.duration || 0);
  const pce = totalDuration > 0 ? Math.round((toolTimeDuration / totalDuration) * 100) : 0;
  const wasteDuration = (catMap['waste']?.duration || 0);

  return { cycleTime, totalManual, totalWalking, totalWaiting, totalDuration, roles: roleBreakdown, bottleneck, categories, pce, wasteDuration, timed, stepCount: steps.length };
}

function computeWalkingMetrics(steps, nodes) {
  if (!steps || !nodes) return { total: 0, perRole: [] };
  const distPt = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const roles = [...new Set(steps.map(s => s.role).filter(Boolean))];
  const perRole = roles.map(role => {
    const rs = [...steps].filter(s => s.role === role && nodes[s.id]).sort((a, b) => a.step_number - b.step_number);
    if (rs.length < 2) return { role, distance: 0, nodeCount: rs.length };
    const dist = rs.reduce((a, s, i) => i === 0 ? 0 : a + distPt(nodes[rs[i - 1].id], nodes[s.id]), 0);
    return { role, distance: Math.round(dist), nodeCount: rs.length };
  }).filter(r => r.nodeCount >= 2).sort((a, b) => b.distance - a.distance);
  const total = perRole.reduce((a, r) => a + r.distance, 0);
  return { total, perRole };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h2 className="font-bold text-base">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function BottleneckAnalysis({ enriched, roleColours }) {
  const [expanded, setExpanded] = useState(null);

  // Sort by cycle time descending — worst process first
  const sorted = [...enriched].filter(p => p._metrics).sort((a, b) => (b._metrics.cycleTime) - (a._metrics.cycleTime));
  if (!sorted.length) return <p className="text-xs text-muted-foreground">No process data loaded.</p>;

  const maxCT = Math.max(...sorted.map(p => p._metrics.cycleTime), 1);

  return (
    <div className="space-y-3">
      {sorted.map(proc => {
        const m = proc._metrics;
        const isExpanded = expanded === proc.id;
        const bn = m.bottleneck;
        const overTarget = proc.target_duration_hrs && m.cycleTime > proc.target_duration_hrs * 60;

        return (
          <div key={proc.id} className="border rounded-xl overflow-hidden">
            <button
              className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
              onClick={() => setExpanded(isExpanded ? null : proc.id)}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{proc.name}</span>
                    {proc.fleet_class && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{proc.fleet_class}</span>}
                    {overTarget && <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 px-1.5 py-0.5 rounded font-medium">⚠ Over target</span>}
                    {bn && <span className="text-[10px] text-muted-foreground">Bottleneck: <strong className="text-foreground">{bn.role}</strong> ({bn.finish}m)</span>}
                  </div>
                  <div className="mt-1.5 relative h-4 bg-muted/50 rounded overflow-hidden">
                    {m.roles.map((r, i) => {
                      const colour = getRoleColour(r.role, roleColours);
                      return (
                        <div key={r.role}
                          className="absolute top-0 h-full opacity-80 first:rounded-l last:rounded-r"
                          style={{
                            left: '0%',
                            width: `${(r.finish / maxCT) * 100}%`,
                            backgroundColor: colour,
                            opacity: 0.3 + (0.5 * (m.roles.length - i) / m.roles.length),
                            zIndex: m.roles.length - i,
                          }}
                          title={`${r.role}: ${r.finish}m`}
                        />
                      );
                    })}
                    {/* Cycle time marker */}
                    <div className="absolute top-0 h-full w-0.5 bg-primary z-10"
                      style={{ left: `${(m.cycleTime / maxCT) * 100}%` }}
                      title={`Cycle time: ${m.cycleTime}m`}
                    />
                    {proc.target_duration_hrs && (
                      <div className="absolute top-0 h-full w-0.5 bg-destructive z-10"
                        style={{ left: `${Math.min(100, (proc.target_duration_hrs * 60 / maxCT) * 100)}%` }}
                        title={`Target: ${Math.round(proc.target_duration_hrs * 60)}m`}
                      />
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-sm">{m.cycleTime}m</div>
                  <div className="text-[10px] text-muted-foreground">{m.stepCount} steps</div>
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t bg-muted/10 space-y-3">
                {/* Role breakdown */}
                <div className="pt-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Role Breakdown</p>
                  <div className="space-y-1.5">
                    {m.roles.map(r => {
                      const colour = getRoleColour(r.role, roleColours);
                      const isBottleneck = bn?.role === r.role;
                      return (
                        <div key={r.role} className="flex items-center gap-2">
                          <div className="w-24 text-right flex items-center justify-end gap-1.5 shrink-0">
                            {isBottleneck && <span className="text-[9px] text-destructive font-bold">▲</span>}
                            <span className="text-[11px] font-medium truncate">{r.role}</span>
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: colour }} />
                          </div>
                          <div className="flex-1 relative h-4 bg-muted/40 rounded-sm overflow-hidden">
                            <div className="absolute top-0 left-0 h-full rounded-sm"
                              style={{ width: `${(r.total / m.cycleTime) * 100}%`, background: colour, opacity: 0.7 }} />
                            <div className="absolute top-0 h-full rounded-r-sm bg-muted/60"
                              style={{ left: `${(r.total / m.cycleTime) * 100}%`, width: `${(r.idle / m.cycleTime) * 100}%` }} />
                          </div>
                          <div className="text-[10px] text-right w-28 shrink-0">
                            <span className="font-semibold">{r.total}m</span>
                            <span className="text-muted-foreground ml-1">{r.idle}m idle</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Category summary */}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Time Distribution</p>
                  <div className="flex gap-1 h-4 rounded overflow-hidden">
                    {m.categories.filter(c => c.duration > 0).map(c => (
                      <div key={c.key} className="h-full rounded-sm"
                        style={{ flex: c.duration, backgroundColor: c.color, opacity: 0.85 }}
                        title={`${c.label}: ${c.duration}m`} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {m.categories.filter(c => c.duration > 0).map(c => (
                      <span key={c.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="w-2 h-2 rounded-sm inline-block" style={{ background: c.color }} />
                        {c.label}: <strong className="text-foreground">{c.duration}m</strong>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 flex-wrap text-[11px]">
                  <span className="px-2 py-1 rounded bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 font-semibold">PCE {m.pce}%</span>
                  <span className="px-2 py-1 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">Waste: {m.wasteDuration}m</span>
                  <span className="px-2 py-1 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300">Walking: {m.totalWalking}m</span>
                  <span className="px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300">Waiting: {m.totalWaiting}m</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WalkingHotspots({ enriched, roleColours }) {
  // Aggregate walking metrics across all processes
  const allRoleDistances = useMemo(() => {
    const map = {};
    enriched.forEach(proc => {
      const m = computeWalkingMetrics(proc._steps, proc._nodes);
      m.perRole.forEach(r => {
        const key = r.role;
        if (!map[key]) map[key] = { role: r.role, totalDist: 0, processes: [] };
        map[key].totalDist += r.distance;
        map[key].processes.push({ name: proc.name, distance: r.distance });
      });
    });
    return Object.values(map).sort((a, b) => b.totalDist - a.totalDist);
  }, [enriched]);

  // Processes with most walking overall
  const processTotals = useMemo(() => {
    return enriched.map(proc => {
      const m = computeWalkingMetrics(proc._steps, proc._nodes);
      return { name: proc.name, id: proc.id, total: m.total, perRole: m.perRole };
    }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);
  }, [enriched]);

  if (!processTotals.length) {
    return <p className="text-xs text-muted-foreground">No node position data found. Place nodes on the Spaghetti Map to enable walking distance analysis.</p>;
  }

  const maxDist = Math.max(...processTotals.map(p => p.total), 1);
  const maxRoleDist = Math.max(...allRoleDistances.map(r => r.totalDist), 1);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Per-process walking */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Walking Distance by Process</p>
        <div className="space-y-2">
          {processTotals.map(p => (
            <div key={p.id}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-medium truncate">{p.name}</span>
                <span className="text-xs font-bold ml-2 shrink-0">{p.total.toLocaleString()}px</span>
              </div>
              <div className="h-3 bg-muted/40 rounded overflow-hidden">
                <div className="h-full rounded bg-primary/60" style={{ width: `${(p.total / maxDist) * 100}%` }} />
              </div>
              {p.perRole.length > 1 && (
                <div className="flex gap-2 mt-0.5 flex-wrap">
                  {p.perRole.map(r => (
                    <span key={r.role} className="text-[9px] text-muted-foreground">
                      {r.role}: <strong className="text-foreground">{r.distance.toLocaleString()}</strong>px
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Per-role walking hotspots (cross-process) */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Hotspot Roles (Cross-Process)</p>
        {allRoleDistances.length === 0 ? (
          <p className="text-xs text-muted-foreground">No role data available.</p>
        ) : (
          <div className="space-y-2">
            {allRoleDistances.map(r => {
              const colour = getRoleColour(r.role, roleColours);
              return (
                <div key={r.role}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: colour }} />
                      <span className="text-xs font-medium">{r.role}</span>
                    </div>
                    <span className="text-xs font-bold">{r.totalDist.toLocaleString()}px total</span>
                  </div>
                  <div className="h-3 bg-muted/40 rounded overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${(r.totalDist / maxRoleDist) * 100}%`, background: colour, opacity: 0.7 }} />
                  </div>
                  <div className="flex gap-2 mt-0.5 flex-wrap">
                    {r.processes.map((p, i) => (
                      <span key={i} className="text-[9px] text-muted-foreground truncate">{p.name}: <strong className="text-foreground">{p.distance.toLocaleString()}</strong></span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CycleTimeSavings({ enriched }) {
  // Identify processes where cycle time > target (potential savings)
  const opportunities = useMemo(() => {
    return enriched
      .filter(p => p._metrics && p.target_duration_hrs)
      .map(p => {
        const target = Math.round(p.target_duration_hrs * 60);
        const ct = p._metrics.cycleTime;
        const gap = ct - target;
        const m = p._metrics;
        // Walking savings: if walking reduced to zero
        const walkSaving = m.totalWalking;
        // Waste savings: all waste time
        const wasteSaving = m.wasteDuration;
        // Waiting savings: all waiting time
        const waitSaving = m.totalWaiting;
        const maxPossibleSaving = Math.round((walkSaving + wasteSaving + waitSaving) * 0.6); // realistic 60% achievable
        return {
          id: p.id, name: p.name, fleet_class: p.fleet_class,
          cycleTime: ct, target, gap, overTarget: gap > 0,
          walkSaving, wasteSaving, waitSaving, maxPossibleSaving,
          pce: m.pce,
        };
      })
      .sort((a, b) => b.gap - a.gap);
  }, [enriched]);

  // Summary stats
  const totalOverTarget = opportunities.filter(o => o.overTarget).length;
  const totalGap = opportunities.filter(o => o.overTarget).reduce((a, o) => a + o.gap, 0);
  const totalPossibleSaving = opportunities.reduce((a, o) => a + o.maxPossibleSaving, 0);

  if (!opportunities.length) {
    return <p className="text-xs text-muted-foreground">Set target durations on your processes to see cycle time savings analysis.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Summary pills */}
      <div className="flex flex-wrap gap-3">
        <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
          <p className="text-[10px] text-muted-foreground">Processes over target</p>
          <p className="font-bold text-red-600 dark:text-red-400">{totalOverTarget} / {opportunities.length}</p>
        </div>
        <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <p className="text-[10px] text-muted-foreground">Total time above target</p>
          <p className="font-bold text-amber-600 dark:text-amber-400">{totalGap}m</p>
        </div>
        <div className="px-3 py-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
          <p className="text-[10px] text-muted-foreground">Achievable savings (est.)</p>
          <p className="font-bold text-green-600 dark:text-green-400">{totalPossibleSaving}m</p>
        </div>
      </div>

      {/* Per-process breakdown */}
      <div className="space-y-2">
        {opportunities.map(o => (
          <div key={o.id} className={`border rounded-xl p-3 ${o.overTarget ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10' : 'border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm truncate">{o.name}</span>
                  {o.fleet_class && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{o.fleet_class}</span>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${o.overTarget ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}`}>
                    {o.overTarget ? `+${o.gap}m over` : `${Math.abs(o.gap)}m under`} target
                  </span>
                </div>
                {/* CT vs target bar */}
                <div className="mt-2 relative h-4 bg-muted/40 rounded overflow-hidden">
                  <div className="absolute top-0 left-0 h-full rounded"
                    style={{
                      width: `${Math.min(100, (o.cycleTime / Math.max(o.cycleTime, o.target)) * 100)}%`,
                      background: o.overTarget ? '#ef4444' : '#22c55e',
                      opacity: 0.6,
                    }} />
                  <div className="absolute top-0 h-full w-0.5 bg-primary/80 z-10"
                    style={{ left: `${Math.min(100, (o.target / Math.max(o.cycleTime, o.target)) * 100)}%` }}
                    title={`Target: ${o.target}m`} />
                </div>
                {/* Saving levers */}
                <div className="flex flex-wrap gap-2 mt-1.5 text-[10px]">
                  <span className="text-muted-foreground">Walk <strong className="text-blue-600 dark:text-blue-400">{o.walkSaving}m</strong></span>
                  <span className="text-muted-foreground">Waste <strong className="text-red-600 dark:text-red-400">{o.wasteSaving}m</strong></span>
                  <span className="text-muted-foreground">Wait <strong className="text-amber-600 dark:text-amber-400">{o.waitSaving}m</strong></span>
                  <span className="text-muted-foreground">PCE <strong className="text-green-600 dark:text-green-400">{o.pce}%</strong></span>
                  <span className="ml-auto text-muted-foreground">Est. achievable: <strong className="text-foreground">{o.maxPossibleSaving}m saving</strong></span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-sm">{o.cycleTime}m</div>
                <div className="text-[10px] text-muted-foreground">target {o.target}m</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Reports() {
  const { colours: roleColours } = useRoleColours();
  const [loadingFull, setLoadingFull] = useState(false);
  const [enriched, setEnriched] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [selectedFleet, setSelectedFleet] = useState('');

  const { data: processes = [], isLoading: isLoadingList } = useQuery({
    queryKey: ['processes-list'],
    queryFn: () => appClient.entities.Process.list('-updated_date', 200),
  });

  const fleetClasses = useMemo(() => [...new Set(processes.map(p => p.fleet_class).filter(Boolean))].sort(), [processes]);

  const filteredProcesses = useMemo(() =>
    selectedFleet ? processes.filter(p => p.fleet_class === selectedFleet) : processes,
    [processes, selectedFleet]
  );

  const loadAll = async () => {
    setLoadingFull(true);
    setLoadError(null);
    try {
      const results = await Promise.all(filteredProcesses.map(loadProcessFull));
      const withMetrics = results.map(proc => ({
        ...proc,
        _metrics: computeProcessMetrics(proc._steps),
      }));
      setEnriched(withMetrics);
    } catch (err) {
      setLoadError(err.message);
    }
    setLoadingFull(false);
  };

  const hasData = enriched.length > 0;

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Cross-Process Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Bottleneck analysis, cycle time savings & walking distance hotspots across {processes.length} processes
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {fleetClasses.length > 0 && (
            <select
              value={selectedFleet}
              onChange={e => setSelectedFleet(e.target.value)}
              className="h-9 text-sm px-3 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All fleet classes</option>
              {fleetClasses.map(fc => <option key={fc} value={fc}>{fc}</option>)}
            </select>
          )}
          <Button onClick={loadAll} disabled={loadingFull || isLoadingList} className="gap-1.5">
            <RefreshCw className={`w-4 h-4 ${loadingFull ? 'animate-spin' : ''}`} />
            {loadingFull ? 'Loading…' : hasData ? 'Refresh Data' : 'Load Report'}
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-4 py-2.5 rounded-lg border border-destructive/30">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {loadError}
        </div>
      )}

      {!hasData && !loadingFull && (
        <Card>
          <CardContent className="py-16 text-center">
            <BarChart2 className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="font-semibold text-sm">No data loaded yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Click "Load Report" to fetch and analyse all processes</p>
            <Button onClick={loadAll} disabled={loadingFull || isLoadingList}>
              <RefreshCw className="w-4 h-4 mr-2" /> Load Report
            </Button>
          </CardContent>
        </Card>
      )}

      {loadingFull && (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading {filteredProcesses.length} processes…</p>
          </CardContent>
        </Card>
      )}

      {hasData && !loadingFull && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Processes Analysed', value: enriched.length },
              { label: 'Total Steps', value: enriched.reduce((a, p) => a + (p._metrics?.stepCount || 0), 0) },
              { label: 'Over Target', value: enriched.filter(p => p._metrics && p.target_duration_hrs && p._metrics.cycleTime > p.target_duration_hrs * 60).length },
              { label: 'Avg PCE', value: `${Math.round(enriched.filter(p => p._metrics).reduce((a, p) => a + p._metrics.pce, 0) / Math.max(enriched.filter(p => p._metrics).length, 1))}%` },
            ].map((s, i) => (
              <Card key={i}>
                <CardContent className="p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-bold">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Section 1: Bottleneck Analysis */}
          <Card>
            <CardHeader className="pb-0">
              <SectionHeader
                icon={AlertTriangle}
                title="Cross-Process Bottleneck Analysis"
                subtitle="Processes ranked by cycle time, with per-role breakdown and constraint identification"
              />
            </CardHeader>
            <CardContent>
              <BottleneckAnalysis enriched={enriched} roleColours={roleColours} />
            </CardContent>
          </Card>

          {/* Section 2: Cycle Time Savings */}
          <Card>
            <CardHeader className="pb-0">
              <SectionHeader
                icon={TrendingDown}
                title="Cycle Time Savings Opportunities"
                subtitle="Processes vs targets — walking, waste & waiting reduction potential"
              />
            </CardHeader>
            <CardContent>
              <CycleTimeSavings enriched={enriched} />
            </CardContent>
          </Card>


        </>
      )}
    </div>
  );
}
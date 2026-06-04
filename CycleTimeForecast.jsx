/**
 * CycleTimeForecast.jsx
 * Two analyses on one page:
 *   1. Monte Carlo P50/P80/P90 cycle time forecast based on historical actuals
 *   2. Resource what-if slider — change role headcount, see total cycle adjust
 */
import React, { useState, useEffect, useMemo } from 'react';
import { appClient } from '@/api/standaloneClient';
import { useProcess } from '@/lib/processContext';
import { useRoles } from '@/hooks/useRoles';
import { useQuery } from '@tanstack/react-query';
import { groupProcessesByFleetClass } from '@/hooks/useGroupedProcesses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, Users, Activity, AlertCircle, BarChart3, Target, Sparkles, Info } from 'lucide-react';
import { runMonteCarlo, simulateResourceAllocation } from '@/lib/monteCarlo';

function fmtMin(m) {
  if (!m || m < 0) return '0m';
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  if (h === 0) return `${min}m`;
  return `${h}h ${min}m`;
}

async function loadStepsFromProcess(process) {
  if (!process?.steps_data) return [];
  try {
    const data = process.steps_data;
    if (typeof data === 'string' && data.startsWith('http')) {
      return await fetch(data).then(r => r.json());
    }
    return JSON.parse(data);
  } catch { return []; }
}

export default function CycleTimeForecast() {
  const { activeProcess: contextProcess } = useProcess();
  const { roles } = useRoles();

  const { data: allProcesses = [] } = useQuery({
    queryKey: ['processes'],
    queryFn: () => appClient.entities.Process.list('-updated_date', 200),
  });
  const processGroups = useMemo(() => groupProcessesByFleetClass(allProcesses.filter(p => !p.is_scenario)), [allProcesses]);

  const [selectedProcessId, setSelectedProcessId] = useState('');
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [localSteps, setLocalSteps] = useState([]);

  // Initialise with context process if available
  useEffect(() => {
    if (contextProcess && !selectedProcessId) {
      setSelectedProcessId(contextProcess.id);
      setSelectedProcess(contextProcess);
    }
  }, [contextProcess?.id]);

  useEffect(() => {
    if (!selectedProcessId) return;
    const proc = allProcesses.find(p => p.id === selectedProcessId);
    if (proc) {
      setSelectedProcess(proc);
      loadStepsFromProcess(proc).then(steps => {
        setLocalSteps(steps);
        setMcResult(null); // reset forecast when process changes
      });
    }
  }, [selectedProcessId, allProcesses]);

  const activeProcess = selectedProcess;
  const steps = localSteps;

  const { data: actuals = [], isLoading: actualsLoading } = useQuery({
    queryKey: ['stepActuals', activeProcess?.id],
    queryFn: async () => {
      if (!activeProcess?.id) return [];
      try {
        return await appClient.entities.StepActuals.filter(
          { process_id: activeProcess.id },
          '-run_date',
          5000
        );
      } catch {
        return [];
      }
    },
    enabled: !!activeProcess?.id,
    staleTime: 60_000,
  });

  const actualsByStepId = useMemo(() => {
    const grouped = {};
    actuals.forEach(a => {
      if (!grouped[a.step_id]) grouped[a.step_id] = [];
      const v = Number(a.actual_duration_minutes);
      if (v > 0 && Number.isFinite(v)) grouped[a.step_id].push(v);
    });
    return grouped;
  }, [actuals]);

  const [mcResult, setMcResult] = useState(null);
  const [running, setRunning] = useState(false);

  const runForecast = async () => {
    setRunning(true);
    await new Promise(r => setTimeout(r, 50));
    const result = runMonteCarlo(steps, actualsByStepId);
    setMcResult(result);
    setRunning(false);
  };

  useEffect(() => {
    if (steps.length > 0 && !mcResult && !actualsLoading) runForecast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length, actualsLoading]);

  const targetMin = activeProcess?.target_duration_hours
    ? activeProcess.target_duration_hours * 60
    : (activeProcess?.cycle_time_target || null);

  const usedRoles = useMemo(() => {
    const set = new Set();
    steps.forEach(s => { if (s.role) set.add(s.role); });
    return [...set].sort();
  }, [steps]);

  const [roleCounts, setRoleCounts] = useState({});

  useEffect(() => {
    setRoleCounts(prev => {
      const next = { ...prev };
      usedRoles.forEach(r => { if (!(r in next)) next[r] = 1; });
      return next;
    });
  }, [usedRoles]);

  const baseline = useMemo(() => {
    const ones = Object.fromEntries(usedRoles.map(r => [r, 1]));
    return simulateResourceAllocation(steps, ones);
  }, [steps, usedRoles]);

  const scenario = useMemo(() => simulateResourceAllocation(steps, roleCounts), [steps, roleCounts]);

  const cycleDelta = scenario.totalCycle - baseline.totalCycle;
  const cyclePct = baseline.totalCycle > 0 ? Math.round(Math.abs(cycleDelta) / baseline.totalCycle * 100) : 0;

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            Cycle Time Forecast
          </h1>
          {activeProcess && (
            <p className="text-xs text-muted-foreground mt-1">
              {actuals.length === 0
                ? <span className="text-amber-600">No historical actuals yet — forecasts use planned ±15%</span>
                : <>{actuals.length} historical actual{actuals.length === 1 ? '' : 's'} from {Object.keys(actualsByStepId).length} step{Object.keys(actualsByStepId).length === 1 ? '' : 's'}</>
              }
            </p>
          )}
        </div>
        <div className="w-72">
          <Select value={selectedProcessId} onValueChange={setSelectedProcessId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a process…" />
            </SelectTrigger>
            <SelectContent>
              {processGroups.map(({ fleetClass, processes: procs }) => (
                <SelectGroup key={fleetClass}>
                  <SelectLabel className="text-[10px] font-bold uppercase tracking-wider">📁 {fleetClass}</SelectLabel>
                  {procs.map(p => (
                    <SelectItem key={p.id} value={p.id} className="pl-6">{p.name}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!activeProcess && (
        <div className="py-12 text-center text-sm text-muted-foreground">Select a process above to run the forecast.</div>
      )}

      {activeProcess && <Tabs defaultValue="forecast">
        <TabsList>
          <TabsTrigger value="forecast" className="gap-1">
            <TrendingUp className="w-3 h-3" /> Monte Carlo Forecast
          </TabsTrigger>
          <TabsTrigger value="resources" className="gap-1">
            <Users className="w-3 h-3" /> Resource What-If
          </TabsTrigger>
        </TabsList>

        {/* Monte Carlo tab */}
        <TabsContent value="forecast" className="space-y-4 mt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Runs 2,000 simulated executions of this process, sampling each step's duration from its historical
              distribution. Output is the spread of likely total cycle times.
            </p>
            <Button variant="outline" size="sm" onClick={runForecast} disabled={running} className="gap-1">
              <Sparkles className="w-3 h-3" /> {running ? 'Running…' : 'Re-run'}
            </Button>
          </div>

          {mcResult && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <PercentileCard label="P50" value={mcResult.p50} desc="Even odds" colour="blue" />
                <PercentileCard label="P80" value={mcResult.p80} desc="Likely to hit" colour="green" target={targetMin} />
                <PercentileCard label="P90" value={mcResult.p90} desc="Confidence cap" colour="amber" target={targetMin} />
                <PercentileCard label="P95" value={mcResult.p95} desc="Pessimistic" colour="red" target={targetMin} />
              </div>

              {targetMin && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h3 className="text-sm font-medium flex items-center gap-2">
                          <Target className="w-4 h-4 text-purple-600" /> Target Comparison
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Target: <span className="font-mono">{fmtMin(targetMin)}</span>
                        </p>
                      </div>
                      <TargetVerdict mc={mcResult} target={targetMin} />
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" /> Distribution of {mcResult.iterations.toLocaleString()} simulations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Histogram histogram={mcResult.histogram} percentiles={[
                    { value: mcResult.p50, label: 'P50', colour: '#3b82f6' },
                    { value: mcResult.p80, label: 'P80', colour: '#10b981' },
                    { value: mcResult.p90, label: 'P90', colour: '#f59e0b' },
                    { value: mcResult.p95, label: 'P95', colour: '#ef4444' },
                  ]} target={targetMin} />
                </CardContent>
              </Card>

              <Card className={mcResult.stepsWithoutActuals > mcResult.stepsWithActuals ? 'border-amber-300' : ''}>
                <CardContent className="p-3 flex items-start gap-2 text-xs">
                  <Info className={`w-4 h-4 shrink-0 mt-0.5 ${mcResult.stepsWithoutActuals > mcResult.stepsWithActuals ? 'text-amber-600' : 'text-muted-foreground'}`} />
                  <div className="space-y-1">
                    <p>
                      <span className="font-medium">{mcResult.stepsWithActuals}</span> step{mcResult.stepsWithActuals === 1 ? '' : 's'} used historical distributions ·{' '}
                      <span className="font-medium">{mcResult.stepsWithoutActuals}</span> used planned ±15% (no historical data yet)
                    </p>
                    {mcResult.stepsWithoutActuals > mcResult.stepsWithActuals && (
                      <p className="text-amber-700 dark:text-amber-400">
                        Most of this forecast is estimate-based. Run more DILO sessions to improve accuracy.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Resource What-If tab */}
        <TabsContent value="resources" className="space-y-4 mt-3">
          <p className="text-xs text-muted-foreground">
            Adjust the number of people in each role. The total cycle recalculates based on which steps can run in parallel.
            Dependencies between steps remain enforced — adding people only helps where work is parallelisable.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Baseline (1 of each)</div>
                <div className="text-3xl font-bold mt-1">{fmtMin(baseline.totalCycle)}</div>
              </CardContent>
            </Card>
            <Card className={cycleDelta < 0 ? 'border-green-400 bg-green-50/30' : cycleDelta > 0 ? 'border-red-400 bg-red-50/30' : ''}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Scenario</div>
                <div className="text-3xl font-bold mt-1">{fmtMin(scenario.totalCycle)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Δ vs Baseline</div>
                <div className={`text-3xl font-bold mt-1 ${cycleDelta < 0 ? 'text-green-600' : cycleDelta > 0 ? 'text-red-600' : ''}`}>
                  {cycleDelta === 0 ? '—' : `${cycleDelta < 0 ? '−' : '+'}${cyclePct}%`}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Role Headcount</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {usedRoles.map(role => {
                const count = roleCounts[role] || 1;
                const roleScenario = scenario.perRole.find(r => r.role === role);
                return (
                  <div key={role}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-medium text-sm">{role}</span>
                        <span className="ml-2 text-2xl font-bold text-blue-600">{count}</span>
                        <span className="text-sm text-muted-foreground"> {count === 1 ? 'person' : 'people'}</span>
                      </div>
                      {roleScenario && (
                        <div className="text-right text-xs">
                          <div>Finish: <span className="font-mono">{fmtMin(roleScenario.finish)}</span></div>
                          <div className="text-muted-foreground">Util: {roleScenario.utilisation}%</div>
                        </div>
                      )}
                    </div>
                    <Slider
                      value={[count]}
                      onValueChange={(v) => setRoleCounts(prev => ({ ...prev, [role]: v[0] }))}
                      min={1} max={6} step={1}
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {scenario.perRole.some(r => r.utilisation < 50 && r.lanes > 1) && (
            <Card className="border-amber-300 bg-amber-50/30">
              <CardContent className="p-3 flex items-start gap-2 text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900">Diminishing returns</p>
                  <p className="text-amber-800 mt-0.5">
                    {scenario.perRole.filter(r => r.utilisation < 50 && r.lanes > 1).map(r => `${r.role} at ${r.utilisation}% utilisation`).join(', ')} —
                    extra people on these roles aren't reducing the total cycle. The bottleneck is elsewhere.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>}
    </div>
  );
}

function PercentileCard({ label, value, desc, colour, target }) {
  const colours = {
    blue:  'border-blue-200 bg-blue-50/50',
    green: 'border-green-200 bg-green-50/50',
    amber: 'border-amber-200 bg-amber-50/50',
    red:   'border-red-200 bg-red-50/50',
  };
  const textColours = {
    blue: 'text-blue-700', green: 'text-green-700', amber: 'text-amber-700', red: 'text-red-700',
  };
  const overTarget = target && value > target;
  return (
    <Card className={colours[colour]}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className={`text-sm font-bold uppercase ${textColours[colour]}`}>{label}</div>
          {overTarget && <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700">over target</Badge>}
        </div>
        <div className="text-2xl font-bold mt-1">{fmtMin(value)}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{desc}</div>
      </CardContent>
    </Card>
  );
}

function TargetVerdict({ mc, target }) {
  const verdict = mc.p50 <= target ? { colour: 'green', text: '50% confident we hit target' }
    : mc.p80 <= target ? { colour: 'green', text: '80% confident we hit target' }
    : mc.p90 <= target ? { colour: 'amber', text: '90% confident we hit target' }
    : mc.p95 <= target ? { colour: 'red', text: 'Only 95% scenarios under target — add buffer' }
    : { colour: 'red', text: 'Even worst case exceeds target — re-plan needed' };

  const colourClass = verdict.colour === 'green' ? 'text-green-600' : verdict.colour === 'amber' ? 'text-amber-600' : 'text-red-600';
  return (
    <div className={`text-right ${colourClass}`}>
      <div className="text-sm font-medium">{verdict.text}</div>
    </div>
  );
}

function Histogram({ histogram, percentiles, target }) {
  const maxCount = Math.max(...histogram.map(b => b.count));
  const allValues = histogram.flatMap(b => [b.bucket, b.bucketEnd]);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  const xOf = (v) => ((v - minVal) / range) * 100;

  return (
    <div className="relative">
      <div className="flex items-end gap-px h-32 px-2">
        {histogram.map((b, i) => (
          <div key={i} className="flex-1 bg-blue-200 dark:bg-blue-900/50 rounded-t"
            style={{ height: maxCount > 0 ? `${(b.count / maxCount) * 100}%` : '0%' }}
            title={`${fmtMin(b.bucket)}–${fmtMin(b.bucketEnd)}: ${b.count} runs`}
          />
        ))}
      </div>
      <div className="relative h-6 mt-1 mx-2">
        {percentiles.map(p => (
          <div key={p.label} className="absolute -top-32 h-32" style={{ left: `${xOf(p.value)}%` }}>
            <div className="w-px h-full" style={{ background: p.colour }} />
            <div className="absolute -bottom-5 -translate-x-1/2 text-[10px] font-bold whitespace-nowrap" style={{ color: p.colour }}>
              {p.label}
            </div>
          </div>
        ))}
        {target && target >= minVal && target <= maxVal && (
          <div className="absolute -top-32 h-32" style={{ left: `${xOf(target)}%` }}>
            <div style={{ borderRight: '2px dashed #7c3aed', width: 0, height: '100%' }} />
            <div className="absolute -top-4 -translate-x-1/2 text-[10px] font-bold text-purple-700 whitespace-nowrap">
              TARGET
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-6 px-2">
        <span>{fmtMin(minVal)}</span>
        <span>{fmtMin((minVal + maxVal) / 2)}</span>
        <span>{fmtMin(maxVal)}</span>
      </div>
    </div>
  );
}
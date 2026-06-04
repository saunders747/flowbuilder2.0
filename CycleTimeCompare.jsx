import React, { useEffect, useState, useMemo } from 'react';
import { appClient } from '@/api/standaloneClient';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { groupProcessesByFleetClass } from '@/hooks/useGroupedProcesses';
import { Badge } from '@/components/ui/badge';
import { Clock, TrendingDown, TrendingUp } from 'lucide-react';
import { getStoredToolTimeGroups } from '@/hooks/useToolTimeCategories';

// Color mapping for tool time groups
const GROUP_COLORS = {
  tooltime: '#006A9D',
  nva_essential: '#EAB308',
  nva_activities: '#F68C50',
  waste: '#F15B55',
  unassigned: '#94A3B8',
};

// Load steps from process (handles JSON string or URL)
async function loadSteps(process) {
  if (!process?.steps_data) return [];
  try {
    let data = process.steps_data;
    if (typeof data === 'string' && (data.startsWith('http://') || data.startsWith('https://'))) {
      const res = await fetch(data);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      return await res.json();
    }
    return JSON.parse(data);
  } catch (err) {
    console.warn('loadSteps error:', err);
    return [];
  }
}

// Calculate step duration in minutes
function getStepDuration(step) {
  return (Number(step.manual_time) || 0) +
         (Number(step.walking_time) || 0) +
         (Number(step.waiting_time) || 0) +
         (Number(step.machine_time) || 0) +
         (Number(step.inspection_time) || 0);
}

// Get color for a step based on tool_time_category
function getStepColor(toolTimeCategory, groups) {
  if (!toolTimeCategory) return GROUP_COLORS.unassigned;
  
  for (const [groupKey, groupData] of Object.entries(groups)) {
    if (groupData.subcategories.some(sub => toolTimeCategory.includes(sub))) {
      return groupData.color || GROUP_COLORS[groupKey] || GROUP_COLORS.unassigned;
    }
  }
  
  return GROUP_COLORS.unassigned;
}

// Build lanes for a process (one per role)
async function buildLanes(process, groups) {
const steps = await loadSteps(process);
if (!steps.length) return { lanes: [], cycleTime: 0, totalLeadTime: 0, pce: 0, sectionBands: [] };

// Create map: role -> { bars, totalDuration }
const roleMap = {};
const roleFirstAppearance = {}; // Track order

let totalLeadTime = 0;
let valueAddTime = 0;

steps.forEach((step, idx) => {
  const role = step.role || 'Unassigned';
  if (!roleFirstAppearance.hasOwnProperty(role)) {
    roleFirstAppearance[role] = idx;
  }
  if (!roleMap[role]) {
    roleMap[role] = { cursor: 0, bars: [], totalDuration: 0 };
  }

  const duration = getStepDuration(step);
  const bar = {
    stepNumber: step.step_number,
    taskDescription: step.task_description,
    duration,
    start: roleMap[role].cursor,
    end: roleMap[role].cursor + duration,
    color: getStepColor(step.tool_time_category, groups),
    section: step.section || '',
  };

  roleMap[role].bars.push(bar);
  roleMap[role].cursor += duration;
  roleMap[role].totalDuration += duration;

  // Calculate lead time and value-add time
  totalLeadTime += duration;
  const cat = step.tool_time_category || '';
  const isValueAdd = groups.tooltime.subcategories.some(sub => cat.includes(sub)) ||
                     groups.nva_essential.subcategories.some(sub => cat.includes(sub));
  if (isValueAdd) {
    valueAddTime += duration;
  }
});

// Calculate max end time (cycle time)
let maxEnd = 0;
Object.values(roleMap).forEach(role => {
  const roleMax = Math.max(...role.bars.map(b => b.end), 0);
  maxEnd = Math.max(maxEnd, roleMax);
});

const pce = totalLeadTime > 0 ? Math.round((valueAddTime / totalLeadTime) * 100) : 0;

// Sort roles by first appearance
let sortedRoles = Object.entries(roleMap)
  .sort(([roleA], [roleB]) => roleFirstAppearance[roleA] - roleFirstAppearance[roleB])
  .map(([role, data]) => ({
    role,
    bars: data.bars,
    totalDuration: data.totalDuration,
    idleTime: maxEnd - data.totalDuration,
  }));

// Compute section bands and cycle times
const sectionRanges = {};
const sectionSteps = {};
sortedRoles.forEach(lane => {
  lane.bars.forEach(bar => {
    const sec = bar.section;
    if (!sec) return;
    if (!sectionRanges[sec]) sectionRanges[sec] = { start: bar.start, end: bar.end };
    else {
      sectionRanges[sec].start = Math.min(sectionRanges[sec].start, bar.start);
      sectionRanges[sec].end = Math.max(sectionRanges[sec].end, bar.end);
    }
    if (!sectionSteps[sec]) sectionSteps[sec] = [];
    sectionSteps[sec].push(bar);
  });
});

const sectionBands = Object.entries(sectionRanges)
  .map(([section, { start, end }]) => ({
    section,
    start,
    end,
    duration: end - start,
    stepCount: sectionSteps[section]?.length || 0,
  }))
  .sort((a, b) => a.start - b.start);

return { lanes: sortedRoles, cycleTime: maxEnd, totalLeadTime, pce, sectionBands };
}

// Time axis ruler component
function TimeRuler({ maxTime }) {
  const ticks = [];
  const tickInterval = 25;
  const displayInterval = 50;
  
  for (let i = 0; i <= maxTime; i += tickInterval) {
    ticks.push(i);
  }

  return (
    <div className="flex items-end mb-2">
      <div className="w-32" />
      <div className="relative flex-1 h-6 border-b border-border">
        {ticks.map((tick) => (
          <div
            key={tick}
            className="absolute top-0 flex flex-col items-center"
            style={{
              left: `${(tick / maxTime) * 100}%`,
              width: '1px',
            }}
          >
            <div className="w-0.5 h-1 bg-muted-foreground" />
            {tick % displayInterval === 0 && (
              <span className="text-xs text-muted-foreground mt-1">{tick}m</span>
            )}
          </div>
        ))}
      </div>
      <div className="w-40" />
    </div>
  );
}

// Lane row component
function LaneRow({ lane, maxTime }) {
  return (
    <div className="flex items-center h-8 gap-3 mb-1">
      <div className="w-32 text-right">
        <span className="text-sm font-medium text-foreground">{lane.role}</span>
      </div>
      
      <div className="relative flex-1 h-6 bg-muted rounded-sm border border-border/30">
        {lane.bars.map((bar, idx) => (
          <div
            key={idx}
            className="absolute h-[22px] top-[2px] rounded-sm border border-white/40 hover:opacity-80 transition-opacity"
            style={{
              left: `${(bar.start / maxTime) * 100}%`,
              width: `${(bar.duration / maxTime) * 100}%`,
              backgroundColor: bar.color,
              minWidth: bar.duration > 0 ? '2px' : '0px',
            }}
            title={`Step ${bar.stepNumber}: ${bar.taskDescription} — ${bar.duration}m`}
          />
        ))}
      </div>
      
      <div className="w-40 text-right">
        <div className="text-xs">
          <span className="font-semibold text-foreground">{lane.totalDuration}m</span>
          <span className="text-muted-foreground ml-1">{lane.idleTime}m idle</span>
        </div>
      </div>
    </div>
  );
}

// Section breakdown component
function SectionBreakdown({ sectionBands, maxTime }) {
  if (!sectionBands || sectionBands.length === 0) return null;
  
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground mb-2">Section Cycle Times</p>
      <div className="space-y-1 text-xs">
        {sectionBands.map((section, idx) => (
          <div key={idx} className="flex items-center justify-between bg-muted/40 rounded px-3 py-1.5">
            <span className="font-medium text-foreground">{section.section}</span>
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">{section.stepCount} step{section.stepCount !== 1 ? 's' : ''}</span>
              <span className="font-semibold text-foreground w-12 text-right">{section.duration}m</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// State section (Current or Future)
function StateSection({ label, isCurrentState, lanes, cycleTime, maxTime, sectionBands }) {
  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Badge variant={isCurrentState ? 'secondary' : 'default'} className="text-xs">
            {label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
         <TimeRuler maxTime={maxTime} />

         <div className="space-y-1">
           {lanes.map((lane, idx) => (
             <LaneRow key={idx} lane={lane} maxTime={maxTime} />
           ))}
         </div>

         <div className="border-t border-border/30 pt-3 text-right text-sm">
           <span className="text-muted-foreground">Total Cycle Time: </span>
           <span className="font-semibold text-foreground">{cycleTime}m</span>
         </div>

         <SectionBreakdown sectionBands={sectionBands} maxTime={maxTime} />
       </CardContent>
     </Card>
   );
}

export default function CycleTimeCompare() {
  const [currentId, setCurrentId] = useState('');
  const [futureId, setFutureId] = useState('');
  const [currentLanes, setCurrentLanes] = useState(null);
  const [futureLanes, setFutureLanes] = useState(null);
  const [loadingLanes, setLoadingLanes] = useState(false);
  const TOOL_TIME_GROUPS = useMemo(() => getStoredToolTimeGroups(), []);

  const { data: processes = [], isLoading } = useQuery({
    queryKey: ['processes'],
    queryFn: () => appClient.entities.Process.list('-updated_date', 200),
  });

  const processGroups = useMemo(() => groupProcessesByFleetClass(processes), [processes]);

  // Load lane data when selections change
  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setLoadingLanes(true);
      const current = processes.find(p => p.id === currentId);
      const future = processes.find(p => p.id === futureId);

      const [currentData, futureData] = await Promise.all([
         current ? buildLanes(current, TOOL_TIME_GROUPS) : Promise.resolve(null),
         future ? buildLanes(future, TOOL_TIME_GROUPS) : Promise.resolve(null),
       ]);

      if (cancelled) return;
      setCurrentLanes(currentData);
      setFutureLanes(futureData);
      setLoadingLanes(false);
    };

    loadData();
    return () => { cancelled = true; };
  }, [currentId, futureId, processes, TOOL_TIME_GROUPS]);

  // Calculate metrics
  const currentCycleTime = currentLanes?.cycleTime || 0;
  const futureCycleTime = futureLanes?.cycleTime || 0;
  const timeSaved = currentCycleTime - futureCycleTime;
  const improvementPct = currentCycleTime > 0 ? Math.round((timeSaved / currentCycleTime) * 100) : 0;
  
  const currentPce = currentLanes?.pce || 0;
  const futurePce = futureLanes?.pce || 0;
  const pceImprovement = futurePce - currentPce;
  
  const maxTime = Math.ceil(Math.max(currentCycleTime, futureCycleTime) / 25) * 25 || 100;

  // Union of roles from both states
  const allRoles = new Set();
  currentLanes?.lanes.forEach(lane => allRoles.add(lane.role));
  futureLanes?.lanes.forEach(lane => allRoles.add(lane.role));

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Cycle Time Compare</h2>
          <p className="text-sm text-muted-foreground mt-1">Per-role time-series comparison</p>
        </div>
      </div>

      {/* Selectors */}
      {!isLoading && (
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="select-current" className="text-xs font-medium text-muted-foreground mb-1 block">
              Current State
            </label>
            <Select value={currentId} onValueChange={setCurrentId}>
              <SelectTrigger id="select-current">
                <SelectValue placeholder="Select process..." />
              </SelectTrigger>
              <SelectContent>
                {processGroups.map(({ fleetClass, processes: procs }) => (
                  <SelectGroup key={fleetClass}>
                    <SelectLabel className="text-[10px] font-bold uppercase tracking-wider">📁 {fleetClass}</SelectLabel>
                    {procs.filter(p => p.id !== futureId).map(p => (
                      <SelectItem key={p.id} value={p.id} className="pl-6">{p.name}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="select-future" className="text-xs font-medium text-muted-foreground mb-1 block">
              Future State
            </label>
            <Select value={futureId} onValueChange={setFutureId}>
              <SelectTrigger id="select-future">
                <SelectValue placeholder="Select process..." />
              </SelectTrigger>
              <SelectContent>
                {processGroups.map(({ fleetClass, processes: procs }) => (
                  <SelectGroup key={fleetClass}>
                    <SelectLabel className="text-[10px] font-bold uppercase tracking-wider">📁 {fleetClass}</SelectLabel>
                    {procs.filter(p => p.id !== currentId).map(p => (
                      <SelectItem key={p.id} value={p.id} className="pl-6">{p.name}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {currentLanes && futureLanes && !loadingLanes && (
        <div className="grid md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Current Cycle Time</p>
                  <p className="text-2xl font-bold mt-1">{currentCycleTime}m</p>
                </div>
                <Clock className="w-5 h-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Future Cycle Time</p>
                  <p className="text-2xl font-bold mt-1">{futureCycleTime}m</p>
                </div>
                <Clock className="w-5 h-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Time Saved</p>
                  <p className={`text-2xl font-bold mt-1 ${timeSaved > 0 ? 'text-chart-3' : 'text-destructive'}`}>
                    {Math.abs(timeSaved)}m
                  </p>
                </div>
                {timeSaved > 0 ? (
                  <TrendingDown className="w-5 h-5 text-chart-3" />
                ) : (
                  <TrendingUp className="w-5 h-5 text-destructive" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Improvement</p>
                  <p className={`text-2xl font-bold mt-1 ${improvementPct > 0 ? 'text-chart-3' : 'text-destructive'}`}>
                    {improvementPct > 0 ? '+' : ''}{improvementPct}%
                  </p>
                </div>
                {improvementPct > 0 ? (
                  <TrendingDown className="w-5 h-5 text-chart-3" />
                ) : (
                  <TrendingUp className="w-5 h-5 text-destructive" />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* State Sections */}
      {currentLanes && futureLanes && !loadingLanes ? (
        <>
          <Card className="border-border/50 bg-muted/30">
            <CardContent className="pt-6">
              <p className="text-xs font-medium text-muted-foreground mb-4">Process Cycle Efficiency</p>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Current</p>
                  <p className="text-xl font-bold">{currentPce}%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Future</p>
                  <p className="text-xl font-bold">{futurePce}%</p>
                </div>
              </div>
              {pceImprovement !== 0 && (
                <div className="mt-3 pt-3 border-t border-border/30 text-xs">
                  <span className={pceImprovement > 0 ? 'text-chart-3 font-medium' : 'text-destructive font-medium'}>
                    {pceImprovement > 0 ? '+' : ''}{pceImprovement} percentage points
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-muted/30">
            <CardContent className="pt-6">
              <p className="text-xs font-medium text-muted-foreground mb-4">Section Cycle Time Comparison</p>
              <div className="space-y-2 text-xs max-h-64 overflow-y-auto">
                {(() => {
                  const allSections = new Set();
                  currentLanes?.sectionBands.forEach(s => allSections.add(s.section));
                  futureLanes?.sectionBands.forEach(s => allSections.add(s.section));

                  if (allSections.size === 0) {
                    return <p className="text-muted-foreground italic">No sections defined</p>;
                  }

                  return Array.from(allSections).sort().map(sec => {
                    const currentSec = currentLanes?.sectionBands.find(s => s.section === sec);
                    const futureSec = futureLanes?.sectionBands.find(s => s.section === sec);
                    const currentDur = currentSec?.duration || 0;
                    const futureDur = futureSec?.duration || 0;
                    const timeSavedSec = currentDur - futureDur;

                    return (
                      <div key={sec} className="flex items-center justify-between bg-card rounded px-3 py-2 border border-border/30">
                        <span className="font-medium text-foreground truncate flex-1">{sec}</span>
                        <div className="flex items-center gap-3 text-right">
                          <div className="flex gap-2">
                            <span className="text-muted-foreground">{currentDur}m</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-semibold text-foreground">{futureDur}m</span>
                          </div>
                          {timeSavedSec !== 0 && (
                            <span className={`font-semibold w-10 text-right ${timeSavedSec > 0 ? 'text-chart-3' : 'text-destructive'}`}>
                              {timeSavedSec > 0 ? '-' : '+'}{Math.abs(timeSavedSec)}m
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
          <StateSection
            label="Current State"
            isCurrentState={true}
            lanes={currentLanes.lanes}
            cycleTime={currentLanes.cycleTime}
            maxTime={maxTime}
            sectionBands={currentLanes.sectionBands}
          />
          <StateSection
            label="Future State"
            isCurrentState={false}
            lanes={futureLanes.lanes}
            cycleTime={futureLanes.cycleTime}
            maxTime={maxTime}
            sectionBands={futureLanes.sectionBands}
          />

          {/* Legend */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4">
                {Object.entries(TOOL_TIME_GROUPS).map(([key, group]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: group.color || GROUP_COLORS[key] }}
                    />
                    <span className="text-xs text-muted-foreground">{group.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          </div>
        </>
      ) : !isLoading && !loadingLanes && !currentLanes && !futureLanes ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Select a current state and future state process to compare
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
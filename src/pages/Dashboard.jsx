import React from 'react';
import { appClient } from '@/api/standaloneClient';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  FileText, CheckCircle, Clock, AlertTriangle,
  TrendingUp, Users, Plus, ArrowRight, FlaskConical, GitMerge } from
'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import DashboardStatCard from '@/components/dashboard/DashboardStatCard';
import RecentActivityTable from '@/components/dashboard/RecentActivityTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProcess } from '@/lib/processContext';
import { useNavigate } from 'react-router-dom';

const STATUS_COLORS = {
  Draft: 'bg-muted text-muted-foreground',
  'Under Review': 'bg-chart-2/10 text-chart-2',
  'Approved for Trial': 'bg-chart-4/10 text-chart-4',
  'Approved Standard': 'bg-chart-3/10 text-chart-3',
  Superseded: 'bg-destructive/10 text-destructive'
};

const PIE_COLORS = ['hsl(38,92%,50%)', 'hsl(199,89%,48%)', 'hsl(142,71%,45%)', 'hsl(280,65%,60%)', 'hsl(0,72%,51%)'];

export default function Dashboard() {
  const navigate = useNavigate();
  const { loadProcess } = useProcess();

  const { data: allProcesses = [], isLoading } = useQuery({
    queryKey: ['processes'],
    queryFn: () => appClient.entities.Process.list('-updated_date', 200)
  });

  // Separate live processes from scenarios
  const processes = React.useMemo(() => allProcesses.filter(p => !p.is_scenario), [allProcesses]);
  const scenarios = React.useMemo(() => allProcesses.filter(p => p.is_scenario), [allProcesses]);

  const handleOpenScenario = async (scenario) => {
    await loadProcess(scenario);
    navigate('/combination-table');
  };

  const { data: actions = [] } = useQuery({
    queryKey: ['actions'],
    queryFn: () => appClient.entities.ImprovementAction.list('-created_date', 50)
  });

  const [pceStats, setPceStats] = React.useState({ totalSaved: 0, avgPce: 0, pceByProcess: [] });

  React.useEffect(() => {
    let cancelled = false;
    const computePce = async () => {
      const results = await Promise.all(processes.slice(0, 20).map(async (p) => {
        try {
          let steps = [];
          const sd = p.steps_data;
          if (!sd) return { name: p.name, saved: 0, pce: 0 };
          if (typeof sd === 'string' && (sd.startsWith('http://') || sd.startsWith('https://'))) {
            const res = await fetch(sd);
            steps = await res.json();
          } else if (typeof sd === 'string') {
            try { steps = JSON.parse(sd); } catch { steps = []; }
          }
          if (!Array.isArray(steps) || steps.length === 0) return { name: p.name, saved: 0, pce: 0 };
          const totalDur = steps.reduce((a,s) => a+(Number(s.manual_time)||0)+(Number(s.walking_time)||0)+(Number(s.waiting_time)||0)+(Number(s.machine_time)||0)+(Number(s.inspection_time)||0), 0);
          const tooltime = steps.filter(s => (s.tool_time_category||'').toLowerCase().startsWith('tooltime')).reduce((a,s) => a+(Number(s.manual_time)||0)+(Number(s.walking_time)||0)+(Number(s.waiting_time)||0)+(Number(s.machine_time)||0)+(Number(s.inspection_time)||0), 0);
          const waiting = steps.reduce((a,s) => a+(Number(s.waiting_time)||0), 0);
          const walking = steps.reduce((a,s) => a+(Number(s.walking_time)||0), 0);
          return { name: p.name, saved: Math.round((waiting+walking)*0.3), pce: totalDur > 0 ? Math.round(tooltime/totalDur*100) : 0 };
        } catch { return { name: p.name, saved: 0, pce: 0 }; }
      }));
      if (cancelled) return;
      const totalSaved = results.reduce((a,r) => a+r.saved, 0);
      const pceVals = results.filter(r => r.pce > 0);
      const avgPce = pceVals.length > 0 ? Math.round(pceVals.reduce((a,r) => a+r.pce, 0)/pceVals.length) : 0;
      setPceStats({ totalSaved, avgPce, pceByProcess: results });
    };
    if (processes.length > 0) computePce();
    return () => { cancelled = true; };
  }, [processes]);

  const stats = React.useMemo(() => {
    const drafts = processes.filter((p) => p.approval_status === 'Draft').length;
    const approved = processes.filter((p) => p.approval_status === 'Approved Standard').length;
    const review = processes.filter((p) => ['Under Review', 'Approved for Trial'].includes(p.approval_status)).length;
    const fleetClasses = [...new Set(processes.map((p) => p.fleet_class).filter(Boolean))];
    const openActions = actions.filter((a) => a.status === 'Open' || a.status === 'In Progress').length;
    return { total: processes.length, drafts, approved, review, fleetClasses, openActions,
      totalSaved: pceStats.totalSaved, avgPce: pceStats.avgPce };
  }, [processes, actions, pceStats]);

  const statusData = React.useMemo(() => {
    const counts = {};
    processes.forEach((p) => {
      counts[p.approval_status || 'Draft'] = (counts[p.approval_status || 'Draft'] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [processes]);

  const fleetData = React.useMemo(() => {
    const counts = {};
    processes.forEach((p) => {
      const fc = p.fleet_class || 'Unassigned';
      counts[fc] = (counts[fc] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count })).slice(0, 8);
  }, [processes]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>);

  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">HIO FlowBuilder - Standardised Work</h2>
          <p className="text-muted-foreground text-sm mt-1">Overview of standardised work processes</p>
        </div>
        <Link to="/process-builder">
          <Button className="gap-2">
            <Plus className="w-4 h-4" /> New Process
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="overview">

      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="scenarios" className="relative">
          Scenarios
          {scenarios.length > 0 && (
            <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {scenarios.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashboardStatCard title="Total Processes" value={stats.total} icon={FileText} color="text-primary" />
        <DashboardStatCard title="Approved Standards" value={stats.approved} icon={CheckCircle} color="text-chart-3" />
        <DashboardStatCard title="Under Review" value={stats.review} icon={Clock} color="text-chart-2" />
        <DashboardStatCard title="Open Actions" value={stats.openActions} icon={AlertTriangle} color="text-chart-5" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashboardStatCard title="Drafts" value={stats.drafts} icon={FileText} color="text-muted-foreground" />
        <DashboardStatCard title="Fleet Classes" value={stats.fleetClasses.length} icon={Users} color="text-chart-4" />
        <DashboardStatCard title="Est. Mins Saved" value={stats.totalSaved} icon={TrendingUp} color="text-chart-3" />
        <DashboardStatCard title="Avg PCE" value={stats.avgPce > 0 ? `${stats.avgPce}%` : '—'} icon={TrendingUp} color="text-chart-3" />
        <DashboardStatCard title="Templates" value={processes.filter((p) => p.is_template).length} icon={FileText} color="text-chart-1" />
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">By Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
               <ResponsiveContainer width="100%" height={200}>
                 <PieChart>
                   <Pie data={statusData} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                     {statusData.map((_, i) => (
                       <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                     ))}
                   </Pie>
                   <Tooltip />
                 </PieChart>
               </ResponsiveContainer>
            ) : (
               <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">By Fleet Class</CardTitle>
          </CardHeader>
          <CardContent>
            {fleetData.length > 0 ? (
               <ResponsiveContainer width="100%" height={200}>
                 <BarChart data={fleetData}>
                   <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                   <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                   <Tooltip />
                   <Bar dataKey="count" fill="hsl(38,92%,50%)" radius={[4, 4, 0, 0]} />
                 </BarChart>
               </ResponsiveContainer>
            ) : (
               <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Recent Processes */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Recent Processes</CardTitle>
            <Link to="/process-builder" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <RecentActivityTable processes={processes.slice(0, 8)} statusColors={STATUS_COLORS} />
        </CardContent>
      </Card>

      {/* PCE Leaderboard */}
      {pceStats.pceByProcess.filter(p => p.pce > 0).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">PCE Leaderboard</CardTitle>
              <span className="text-xs text-muted-foreground">Process Cycle Efficiency — target ≥ 30%</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[...pceStats.pceByProcess].filter(p => p.pce > 0).sort((a,b) => b.pce - a.pce).slice(0, 10).map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-muted-foreground w-5 text-right">{i+1}</span>
                  <span className="text-xs flex-1 truncate">{p.name}</span>
                  <div className="flex items-center gap-2 w-44">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width:`${Math.min(100,p.pce)}%`, background: p.pce>=30?'#1B7A3F':p.pce>=15?'#d97706':'#dc2626' }} />
                    </div>
                    <span className="text-xs font-bold w-8 text-right" style={{ color: p.pce>=30?'#1B7A3F':p.pce>=15?'#d97706':'#dc2626' }}>{p.pce}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      </TabsContent>

      <TabsContent value="scenarios">
        {scenarios.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center space-y-2">
              <FlaskConical className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No active scenario branches</p>
              <p className="text-xs text-muted-foreground">Use the Branch button in the Combination Table to create a what-if scenario</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{scenarios.length} active scenario branch{scenarios.length !== 1 ? 'es' : ''}</p>
            {(() => {
              // Group by parent
              const groups = {};
              scenarios.forEach(s => {
                const key = s.parent_process_id || 'unknown';
                if (!groups[key]) groups[key] = [];
                groups[key].push(s);
              });
              return Object.entries(groups).map(([parentId, scenList]) => {
                const parent = allProcesses.find(p => p.id === parentId);
                return (
                  <Card key={parentId} className="border-amber-200 dark:border-amber-800">
                    <CardHeader className="pb-2 pt-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="w-3.5 h-3.5" />
                        <span>Parent: <strong>{parent?.name || parentId}</strong></span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                      {scenList.map(s => (
                        <div key={s.id} className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2.5">
                          <FlaskConical className="w-4 h-4 text-amber-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{s.name}</p>
                            {s.scenario_reason && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{s.scenario_reason}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Created {new Date(s.created_date).toLocaleDateString()}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenScenario(s)}
                            className="h-7 text-xs gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 shrink-0"
                          >
                            <ArrowRight className="w-3 h-3" /> Open
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              });
            })()}
          </div>
        )}
      </TabsContent>
      </Tabs>
    </div>);

}
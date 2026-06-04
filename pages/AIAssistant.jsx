import React, { useState, useEffect, useRef, useMemo } from 'react';
import { appClient } from '@/api/standaloneClient';
import { useProcess } from '@/lib/processContext';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useRoles } from '@/hooks/useRoles';
import { useQuery } from '@tanstack/react-query';
import { groupProcessesByFleetClass } from '@/hooks/useGroupedProcesses';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Bot, User, Send, RefreshCw, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Play } from 'lucide-react';
import { toast } from 'sonner';
import {
  AGENT_NAME,
  SYSTEM_PROMPT,
  buildProcessContext,
  buildAnalysisRequest,
  extractRecommendations,
} from '@/lib/aiAssistantPrompts';

const FOCUS_OPTIONS = [
  { value: 'all', label: 'Full Analysis', desc: 'Everything — most thorough' },
  { value: 'reallocation', label: 'Skill Reallocation', desc: 'Unskilled work on skilled trades' },
  { value: 'smed', label: 'SMED', desc: 'Internal → External' },
  { value: 'waste', label: 'Waste Elimination', desc: 'Remove no-value steps' },
  { value: 'critical_path', label: 'Critical Path', desc: 'Shorten the bottleneck' },
];

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

export default function AIAssistant() {
  const { activeProcess: contextProcess } = useProcess();
  const { groups: toolTimeGroups } = useAppSettings();
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

  // Load steps when selected process changes
  useEffect(() => {
    if (!selectedProcessId) return;
    const proc = allProcesses.find(p => p.id === selectedProcessId);
    if (proc) {
      setSelectedProcess(proc);
      loadStepsFromProcess(proc).then(setLocalSteps);
    }
  }, [selectedProcessId, allProcesses]);

  const activeProcess = selectedProcess;
  const steps = localSteps;

  const updateStep = () => {}; // no-op — AI page doesn't directly mutate
  const reorderSteps = () => {};

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [focus, setFocus] = useState('all');
  const [appliedRecs, setAppliedRecs] = useState(new Set());
  const [expandedRecs, setExpandedRecs] = useState(new Set());
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!conversation) return;
    const unsub = appClient.agents.subscribeToConversation(conversation.id, (data) => {
      const msgs = data.messages || [];
      setMessages(msgs);
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
        setThinking(false);
      }
    });
    return unsub;
  }, [conversation?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const startAnalysis = async () => {
    if (!activeProcess || steps.length === 0) {
      toast.error('Load a process with steps first.');
      return;
    }
    setStarting(true);
    setAppliedRecs(new Set());
    try {
      const conv = await appClient.agents.createConversation({
        agent_name: AGENT_NAME,
        metadata: {
          name: `Analysis — ${activeProcess.name}`,
          process_id: activeProcess.id,
          focus,
        },
        system_prompt: SYSTEM_PROMPT,
      });
      setConversation(conv);
      setMessages([]);
      setThinking(true);

      const ctx = buildProcessContext(activeProcess, steps, toolTimeGroups, roles);
      const req = buildAnalysisRequest(ctx, focus);

      await appClient.agents.addMessage(conv, {
        role: 'user',
        content: req,
      });
    } catch (e) {
      toast.error('Failed to start analysis: ' + e.message);
      setThinking(false);
    }
    setStarting(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || !conversation) return;
    const msg = input.trim();
    setInput('');
    setThinking(true);
    await appClient.agents.addMessage(conversation, { role: 'user', content: msg });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const latestRecs = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== 'assistant') continue;
      const recs = extractRecommendations(messages[i].content);
      if (recs?.recommendations?.length) return recs;
    }
    return null;
  })();

  const applyRec = async (rec) => {
    if (appliedRecs.has(rec.id)) return;
    try {
      switch (rec.type) {
        case 'reallocate_role': {
          const newRole = rec.proposed_state.replace(/.*Reallocate to /i, '').replace(/.*to /i, '').trim();
          for (const sid of (rec.step_ids || [])) {
            const step = steps.find(s => s.id === sid);
            if (step) updateStep(sid, { role: newRole });
          }
          toast.success(`Reallocated ${rec.step_ids?.length || 0} step(s) to ${newRole}`);
          break;
        }
        case 'convert_to_external': {
          for (const sid of (rec.step_ids || [])) {
            updateStep(sid, { int_ext: 'External' });
          }
          toast.success(`Converted ${rec.step_ids?.length || 0} step(s) to External`);
          break;
        }
        case 'eliminate_waste': {
          if (!window.confirm(`Delete ${rec.step_ids?.length || 0} waste step(s)?`)) return;
          const keep = steps.filter(s => !rec.step_ids?.includes(s.id));
          reorderSteps(keep);
          toast.success(`Deleted ${rec.step_ids?.length || 0} step(s)`);
          break;
        }
        case 'resequence': {
          toast.info('Resequence requires Sequence Optimiser — opening Combination Table');
          break;
        }
        default:
          toast.info(`Recommendation applied: ${rec.type}`);
      }
      setAppliedRecs(prev => new Set([...prev, rec.id]));
    } catch (e) {
      toast.error('Failed to apply: ' + e.message);
    }
  };

  const toggleExpand = (id) => {
    setExpandedRecs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] gap-3 p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            AI Assistant
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {activeProcess
              ? <>Analysing <span className="font-medium text-foreground">{activeProcess.name}</span> — {steps.length} step{steps.length === 1 ? '' : 's'}</>
              : 'No process selected — pick one from the top bar'}
          </p>
        </div>
        {conversation && (
          <Button variant="outline" size="sm" onClick={() => { setConversation(null); setMessages([]); setAppliedRecs(new Set()); }} className="gap-1 h-7 text-xs">
            <RefreshCw className="w-3 h-3" /> New analysis
          </Button>
        )}
      </div>

      {/* Pre-analysis setup */}
      {!conversation && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <label className="text-sm font-medium">Process</label>
              <Select value={selectedProcessId} onValueChange={setSelectedProcessId}>
                <SelectTrigger className="mt-1">
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
            <div>
              <label className="text-sm font-medium">What should the assistant focus on?</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                {FOCUS_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setFocus(o.value)}
                    className={`text-left p-2 rounded-lg border text-xs transition-colors ${
                      focus === o.value ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20' : 'border-border hover:border-purple-300'
                    }`}>
                    <div className="font-medium">{o.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{o.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={startAnalysis} disabled={starting || !activeProcess || steps.length === 0} className="gap-2">
              <Play className="w-4 h-4" />
              {starting ? 'Starting…' : 'Run Analysis'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Conversation + Recommendations split view */}
      {conversation && (
        <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
          <TabsList>
            <TabsTrigger value="chat">Conversation</TabsTrigger>
            <TabsTrigger value="recommendations">
              Recommendations
              {latestRecs?.recommendations && (
                <Badge variant="secondary" className="ml-2 text-[10px] h-4 px-1.5">
                  {latestRecs.recommendations.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Chat tab */}
          <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 mt-2 gap-2">
            <div className="flex-1 overflow-y-auto space-y-3 p-1">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
                  {m.role === 'assistant' && (
                    <div className="shrink-0 w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-purple-600" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-lg p-3 text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 border border-border'
                  }`}>
                    {m.role === 'user' && m.content.length > 600
                      ? m.content.split('```json')[0].trim() + '\n\n📎 (process data attached)'
                      : m.role === 'assistant'
                        ? m.content.split('```json')[0].trim()
                        : m.content}
                  </div>
                  {m.role === 'user' && (
                    <div className="shrink-0 w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <User className="w-4 h-4 text-blue-600" />
                    </div>
                  )}
                </div>
              ))}
              {thinking && (
                <div className="flex gap-2">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-purple-600 animate-pulse" />
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-sm border border-border">
                    <span className="text-muted-foreground italic">Analysing process…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2 shrink-0 border-t pt-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a follow-up… e.g., 'What if we doubled the fitters?'"
                className="flex-1 text-sm p-2 rounded-md border bg-background resize-none"
                rows={2}
                disabled={thinking}
              />
              <Button onClick={sendMessage} disabled={!input.trim() || thinking} className="self-end gap-1">
                <Send className="w-4 h-4" /> Send
              </Button>
            </div>
          </TabsContent>

          {/* Recommendations tab */}
          <TabsContent value="recommendations" className="flex-1 overflow-y-auto mt-2 space-y-2">
            {!latestRecs?.recommendations && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {thinking ? 'Generating recommendations…' : 'Run an analysis to see recommendations'}
              </div>
            )}
            {latestRecs?.totals && (
              <Card className="bg-purple-50 dark:bg-purple-950/20 border-purple-200">
                <CardContent className="p-3 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-2xl font-bold text-purple-700">{latestRecs.totals.potential_minutes_saved || 0}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Mins saved</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-700">+{latestRecs.totals.potential_pce_uplift_percent || 0}%</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">PCE uplift</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-700">{latestRecs.totals.skilled_trade_hours_freed || 0}h</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Skilled hours freed</div>
                  </div>
                </CardContent>
              </Card>
            )}

            {latestRecs?.recommendations?.map(rec => {
              const isApplied = appliedRecs.has(rec.id);
              const isExpanded = expandedRecs.has(rec.id);
              const priorityColours = {
                high:   'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
                medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
                low:    'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
              };
              const riskColours = {
                low:    'bg-green-50 text-green-700',
                medium: 'bg-amber-50 text-amber-700',
                high:   'bg-red-50 text-red-700',
              };
              return (
                <Card key={rec.id} className={isApplied ? 'opacity-60' : ''}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge className={priorityColours[rec.priority] || ''}>{rec.priority}</Badge>
                          <span className="text-xs text-muted-foreground capitalize">
                            {rec.type.replace(/_/g, ' ')}
                          </span>
                          {rec.step_numbers?.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              Step{rec.step_numbers.length > 1 ? 's' : ''} {rec.step_numbers.join(', ')}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-medium">{rec.proposed_state}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{rec.current_state}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {rec.estimated_saving_minutes > 0 && (
                          <div className="text-right">
                            <div className="text-base font-bold text-green-600">{rec.estimated_saving_minutes}m</div>
                            <div className="text-[10px] text-muted-foreground">saved</div>
                          </div>
                        )}
                      </div>
                    </div>

                    <button onClick={() => toggleExpand(rec.id)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {isExpanded ? 'Hide' : 'Show'} reasoning
                    </button>

                    {isExpanded && (
                      <div className="text-xs space-y-2 pl-4 border-l-2 border-purple-200">
                        <p>{rec.rationale}</p>
                        <div className="flex gap-1 flex-wrap">
                          {rec.risk_level && <Badge variant="outline" className={`text-[10px] ${riskColours[rec.risk_level]}`}>Risk: {rec.risk_level}</Badge>}
                          {rec.labour_cost_impact && <Badge variant="outline" className="text-[10px]">Cost: {rec.labour_cost_impact}</Badge>}
                          {rec.implementation_effort && <Badge variant="outline" className="text-[10px]">Effort: {rec.implementation_effort}</Badge>}
                        </div>
                        {rec.risk_level === 'high' && (
                          <div className="flex items-start gap-1.5 p-2 bg-red-50 dark:bg-red-950/20 rounded text-red-700 dark:text-red-300">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>High risk — review with the team before applying.</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end">
                      {isApplied ? (
                        <Button variant="ghost" size="sm" disabled className="gap-1 h-7 text-xs text-green-600">
                          <CheckCircle2 className="w-3 h-3" /> Applied
                        </Button>
                      ) : (
                        <Button variant="default" size="sm" onClick={() => applyRec(rec)} className="gap-1 h-7 text-xs">
                          Apply
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
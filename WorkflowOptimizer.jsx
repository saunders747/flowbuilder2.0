import React, { useState, useEffect, useRef } from 'react';
import { appClient } from '@/api/standaloneClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Send, Bot, Sparkles, Loader2, Plus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { groupProcessesByFleetClass } from '@/hooks/useGroupedProcesses';

const AGENT_NAME = 'workflow_optimizer';

async function fetchSteps(process) {
  if (!process?.steps_data) return [];
  const val = process.steps_data;
  if (val.startsWith('http')) {
    const res = await fetch(val);
    return await res.json();
  }
  return JSON.parse(val);
}

function buildSummary(processes) {
  return processes.map(({ proc, steps }) => {
    if (!steps || steps.length === 0) return `Process: ${proc.name} — no steps`;
    const rows = steps.map(s => {
      const total = (s.manual_time || 0) + (s.walking_time || 0) + (s.waiting_time || 0) + (s.machine_time || 0) + (s.inspection_time || 0);
      const parts = [`#${s.step_number} "${s.task_description}" ${s.role || '—'} ${total}m`];
      if (s.waiting_time > 0) parts.push(`wait:${s.waiting_time}m`);
      if (s.walking_time > 0) parts.push(`walk:${s.walking_time}m`);
      if (s.tool_time_category) parts.push(s.tool_time_category.split('::').pop());
      return parts.join(' ');
    }).join('\n');
    const totalTime = steps.reduce((a, s) => a + (s.manual_time||0)+(s.walking_time||0)+(s.waiting_time||0)+(s.machine_time||0)+(s.inspection_time||0), 0);
    const roles = [...new Set(steps.map(s => s.role).filter(Boolean))];
    return `=== ${proc.name} | ${proc.service_type||'—'} | ${totalTime}m total | Roles: ${roles.join(', ')} ===\n${rows}`;
  }).join('\n\n');
}

export default function WorkflowOptimizer() {
  const [selectedIds, setSelectedIds] = useState([]);
  const [loadedData, setLoadedData] = useState([]); // [{proc, steps}]
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef(null);

  const { data: processes = [] } = useQuery({
    queryKey: ['processes'],
    queryFn: () => appClient.entities.Process.list('-updated_date', 200),
  });

  const processGroups = React.useMemo(() => groupProcessesByFleetClass(processes), [processes]);

  useEffect(() => {
    if (!conversation) return;
    const unsub = appClient.agents.subscribeToConversation(conversation.id, (data) => {
      const msgs = data.messages || [];
      setMessages(msgs);
      // Stop thinking indicator when last message is from assistant
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
        setThinking(false);
      }
    });
    return unsub;
  }, [conversation?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addProcess = async (id) => {
    if (selectedIds.includes(id) || selectedIds.length >= 6) return;
    const proc = processes.find(p => p.id === id);
    if (!proc) return;
    const steps = await fetchSteps(proc);
    setSelectedIds(prev => [...prev, id]);
    setLoadedData(prev => [...prev, { proc, steps }]);
  };

  const removeProcess = (id) => {
    setSelectedIds(prev => prev.filter(x => x !== id));
    setLoadedData(prev => prev.filter(x => x.proc.id !== id));
  };

  const totalSteps = loadedData.reduce((a, x) => a + x.steps.length, 0);

  const startAnalysis = async () => {
    if (totalSteps === 0) { toast.error('Load at least one process with steps first.'); return; }
    setStarting(true);
    const conv = await appClient.agents.createConversation({
      agent_name: AGENT_NAME,
      metadata: { name: `Analysis — ${loadedData.map(x => x.proc.name).join(', ')}` },
    });
    setConversation(conv);
    setMessages([]);
    setThinking(true);

    const summary = buildSummary(loadedData);
    await appClient.agents.addMessage(conv, {
      role: 'user',
      content: `Analyse these workflow(s) for waste, waiting time, role gaps, and sequencing improvements. Be concise.\n\n${summary}`,
    });
    setStarting(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || !conversation || sending) return;
    const msg = input.trim();
    setInput('');
    setSending(true);
    setThinking(true);
    await appClient.agents.addMessage(conversation, { role: 'user', content: msg });
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const newConversation = () => { setConversation(null); setMessages([]); };

  const isThinking = thinking;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-4xl space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" /> Workflow Optimizer
          </h2>
          <p className="text-sm text-muted-foreground">AI-powered waste analysis, role optimization & improvement recommendations</p>
        </div>
        {conversation && (
          <Button variant="outline" size="sm" onClick={newConversation} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New Analysis
          </Button>
        )}
      </div>

      {/* Process picker */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Processes to analyse:</span>
            {loadedData.map(({ proc }) => (
              <span key={proc.id} className="flex items-center gap-1 bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                {proc.name}
                <button onClick={() => removeProcess(proc.id)} className="ml-1 opacity-60 hover:opacity-100">×</button>
              </span>
            ))}
            {selectedIds.length < 6 && (
              <Select onValueChange={addProcess}>
                <SelectTrigger className="h-7 w-auto min-w-[160px] text-xs border-dashed">
                  <SelectValue placeholder="Add process…" />
                </SelectTrigger>
                <SelectContent>
                  {processGroups.map(({ fleetClass, processes: procs }) => (
                    <SelectGroup key={fleetClass}>
                      <SelectLabel className="text-[10px] font-bold uppercase tracking-wider">📁 {fleetClass}</SelectLabel>
                      {procs.filter(p => !selectedIds.includes(p.id)).map(p => (
                        <SelectItem key={p.id} value={p.id} className="text-xs pl-6">{p.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {totalSteps > 0 && (
            <p className="text-[11px] text-muted-foreground">{totalSteps} steps across {loadedData.length} process(es) loaded</p>
          )}
        </CardContent>
      </Card>

      {/* Chat area */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          {!conversation ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Ready to analyse your workflow</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Add one or more processes above, then click Analyse to get AI-powered recommendations on waste reduction, role optimization, cross-process dependencies, and improvement actions.
                </p>
              </div>
              <Button onClick={startAnalysis} disabled={starting || totalSteps === 0} className="gap-2 mt-2">
                {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {starting ? 'Analysing…' : 'Analyse Workflow'}
              </Button>
              {totalSteps === 0 && (
                <p className="text-xs text-muted-foreground">Add at least one process with steps above.</p>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
              {isThinking && (
                <div className="flex gap-3 justify-start">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-2xl px-4 py-2.5 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Analysing…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {conversation && (
            <div className="border-t p-3 flex gap-2 items-end">
              <Textarea
                value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Ask a follow-up question… (Enter to send)"
                className="resize-none min-h-[40px] max-h-[120px] text-sm flex-1" rows={1}
              />
              <Button size="icon" onClick={sendMessage} disabled={!input.trim() || sending} className="shrink-0 h-10 w-10">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${isUser ? 'bg-slate-800 text-white' : 'bg-muted border'}`}>
        {isUser ? (
          <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <ReactMarkdown
            className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
            components={{
              h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
              p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
              ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              code: ({ children }) => <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-mono">{children}</code>,
            }}
          >
            {message.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
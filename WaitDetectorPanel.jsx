/**
 * WaitDetectorPanel.jsx
 *
 * Banner-style panel that appears above the Combination Table when waits between
 * roles are detected. For each detected wait, offers:
 *
 *   • Generate Wait Step — auto-creates a "Waiting for [Role]" step pre-categorised
 *     as waste::Waiting for Others, with correct dependency wiring so cascade timing
 *     stays consistent.
 *
 *   • Dismiss — silently ignore this specific wait (stored per-process in localStorage,
 *     persists across reloads, cleared by the "Reset dismissals" link if needed).
 *
 *   • Generate All — bulk action for when the user has confirmed they want every
 *     detected wait represented as a step.
 *
 * Uses processContext.insertWaitStep — a single atomic state update that both inserts
 * the new step AND rewires the dependent step's dependencies, avoiding the race
 * conditions that plagued the previous implementation.
 */
import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, Plus, X, ChevronDown, ChevronUp, AlertCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  detectRoleWaits,
  getDismissedWaits,
  dismissWait,
  clearDismissedWaits,
} from '@/lib/waitDetector';

const WAITING_CATEGORY = 'waste::Waiting for Others';

export default function WaitDetectorPanel({
  activeProcess,
  stepsWithTiming,
  insertWaitStep,           // from useProcess()
  forceShow = false,        // show panel even when no waits detected
  className = '',
}) {
  const [collapsed, setCollapsed] = useState(false);
  // Force a re-render after dismissals (localStorage doesn't fire React updates)
  const [dismissTick, setDismissTick] = useState(0);

  // Compute waits + filter out dismissed ones
  const visibleWaits = useMemo(() => {
    const all = detectRoleWaits(stepsWithTiming);
    const dismissed = getDismissedWaits(activeProcess?.id);
    return all.filter(w => !dismissed.has(w.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsWithTiming, activeProcess?.id, dismissTick]);

  if (!activeProcess) return null;

  // If no waits and not forced open, stay hidden
  if (visibleWaits.length === 0 && !forceShow) return null;

  // No-waits state when forced open
  if (visibleWaits.length === 0 && forceShow) {
    return (
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border border-green-300 bg-green-50/60 dark:bg-green-950/20 dark:border-green-700 text-xs text-green-800 dark:text-green-200 ${className}`}>
        <Clock className="w-3.5 h-3.5 text-green-600 shrink-0" />
        <span className="font-medium">No cross-role waits detected</span>
        <span className="text-muted-foreground">— all dependencies are within the same role, or gaps are under 2 minutes.</span>
      </div>
    );
  }

  // ── Action handlers ──────────────────────────────────────────────────────
  const generateOne = (wait) => {
    if (!insertWaitStep) {
      toast.error('Cannot generate — insertWaitStep not available');
      return;
    }
    insertWaitStep(
      wait.toStep.id,
      wait.fromStep.id,
      [wait.toStep.id],
      {
        task_description: `Waiting for ${wait.fromRole} to complete`,
        role: wait.toRole,
        section: wait.toStep.section || '',
        waiting_time: wait.gapMinutes,
        tool_time_category: WAITING_CATEGORY,
        int_ext: wait.toStep.int_ext || 'Internal',
      }
    );
    toast.success(`Added "Waiting for ${wait.fromRole}" step (${wait.gapMinutes}m) before step ${wait.toStep.step_number}`);
  };

  const generateAll = () => {
    if (!window.confirm(`Generate ${visibleWaits.length} waiting steps?\n\nEach will be inserted as "waste — Waiting for Others", with dependencies wired correctly so cascade timing stays consistent.`)) return;
    visibleWaits.forEach((w, i) => setTimeout(() => generateOne(w), i * 100));
    toast.info(`Generating ${visibleWaits.length} steps…`);
  };

  const dismissOne = (wait) => {
    dismissWait(activeProcess.id, wait.key);
    setDismissTick(t => t + 1);
  };

  const resetDismissals = () => {
    clearDismissedWaits(activeProcess.id);
    setDismissTick(t => t + 1);
    toast.info('Dismissed waits reset — all hidden waits will reappear');
  };

  const totalWaitMinutes = visibleWaits.reduce((a, w) => a + w.gapMinutes, 0);

  return (
    <Card className={`border-amber-300 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-700 ${className}`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="flex items-center gap-2 flex-1 text-left hover:opacity-80">
            <Clock className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
                {visibleWaits.length} wait{visibleWaits.length === 1 ? '' : 's'} between roles detected
              </span>
              <Badge variant="outline" className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                {totalWaitMinutes}m total
              </Badge>
            </div>
            {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-amber-700" /> : <ChevronUp className="w-3.5 h-3.5 text-amber-700" />}
          </button>
          {!collapsed && visibleWaits.length > 1 && (
            <Button onClick={generateAll} size="sm" variant="outline"
              className="h-7 text-xs gap-1 border-amber-400 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40">
              <Sparkles className="w-3 h-3" /> Generate all
            </Button>
          )}
        </div>

        {!collapsed && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              When a step waits on another role to finish, that wait is invisible in the table — it's just dead time.
              Generate a waste step to make it visible in PCE, Yamazumi, and the Gantt.
            </p>
            <div className="space-y-1.5">
              {visibleWaits.slice(0, 12).map(w => (
                <div key={w.key} className="flex items-center gap-2 bg-white/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-2 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-amber-950 dark:text-amber-100">
                      Step {w.toStep.step_number} <span className="font-normal text-muted-foreground">({w.toRole})</span>
                      {' waits '}
                      <span className="text-red-700 dark:text-red-300 font-bold">{w.gapMinutes}m</span>
                      {' on Step '}{w.fromStep.step_number} <span className="font-normal text-muted-foreground">({w.fromRole})</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {w.fromStep.task_description} → {w.toStep.task_description}
                    </div>
                  </div>
                  <Button
                    onClick={() => generateOne(w)}
                    size="sm"
                    variant="default"
                    className="h-6 text-[11px] gap-1 px-2 bg-amber-600 hover:bg-amber-700">
                    <Plus className="w-3 h-3" /> Generate
                  </Button>
                  <Button
                    onClick={() => dismissOne(w)}
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                    title="Dismiss — won't show this wait again">
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {visibleWaits.length > 12 && (
                <div className="text-[10px] text-muted-foreground italic pl-2">
                  + {visibleWaits.length - 12} more — use Generate all to handle them in bulk
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button onClick={resetDismissals} className="text-[10px] text-amber-700 dark:text-amber-300 hover:underline">
                Reset dismissals
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
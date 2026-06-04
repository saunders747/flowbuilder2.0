import React, { useState, useEffect } from 'react';
import { appClient } from '@/api/standaloneClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History, Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

/**
 * SaveRevisionDialog
 * Modal for creating a new revision snapshot with label and reason
 */
export function SaveRevisionDialog({ isOpen, onClose, onSave, currentRevCount = 0, defaultName = '' }) {
  const [label, setLabel] = useState(`v${currentRevCount + 1}`);
  const [savedByName, setSavedByName] = useState(defaultName);
  const [changeReason, setChangeReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset fields when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      setLabel(`v${currentRevCount + 1}`);
      setSavedByName(defaultName);
      setChangeReason('');
    }
  }, [isOpen, currentRevCount, defaultName]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ label, change_reason: changeReason, saved_by_name: savedByName });
      onClose();
    } catch (err) {
      toast.error('Failed to save revision');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save Revision Snapshot</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Revision Label</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., v2 — Post kaizen"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Your Name</label>
            <Input
              value={savedByName}
              onChange={(e) => setSavedByName(e.target.value)}
              placeholder="Who is saving this revision?"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Comments / Change Summary</label>
            <Textarea
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Describe what changed in this revision…"
              className="mt-1 h-24"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !label.trim()}>
              {saving ? 'Saving...' : 'Save Snapshot'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * RevisionHistoryPanel
 * Full modal showing revision history with diff and restore capabilities
 */
export function RevisionHistoryPanel({ processId, currentSteps = [], currentUser, onRollback }) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: revisions = [], isLoading } = useQuery({
    queryKey: ['processRevisions', processId],
    queryFn: async () => {
      if (!processId) return [];
      const revs = await appClient.entities.ProcessRevision.filter(
        { process_id: processId },
        '-revision_number',
        100
      );
      return revs;
    },
    enabled: !!processId,
    staleTime: 30_000,
  });

  const computeDiff = (stepsA, stepsB) => {
    if (!stepsA || !stepsB) return { added: [], removed: [], changed: [] };

    const mapById = (steps) => {
      const m = {};
      steps.forEach((s) => {
        m[s.id] = s;
      });
      return m;
    };

    const mapA = mapById(stepsA);
    const mapB = mapById(stepsB);

    const added = [];
    const removed = [];
    const changed = [];

    // Find added and changed
    Object.entries(mapB).forEach(([id, stepB]) => {
      if (!mapA[id]) {
        added.push(stepB);
      } else {
        const stepA = mapA[id];
        // Check all fields that are meaningful to a process — description, timing,
        // role, section, category, internal/external classification, dependencies.
        const depsA = JSON.stringify((stepA.dependencies || []).slice().sort());
        const depsB = JSON.stringify((stepB.dependencies || []).slice().sort());
        const hasChange =
          stepA.task_description !== stepB.task_description ||
          stepA.manual_time !== stepB.manual_time ||
          stepA.role !== stepB.role ||
          (stepA.section || '') !== (stepB.section || '') ||
          (stepA.tool_time_category || '') !== (stepB.tool_time_category || '') ||
          (stepA.int_ext || '') !== (stepB.int_ext || '') ||
          depsA !== depsB;
        if (hasChange) {
          const entry = { old: stepA, new: stepB, changes: [] };
          if (stepA.task_description !== stepB.task_description) entry.changes.push('description');
          if (stepA.manual_time !== stepB.manual_time) entry.changes.push('duration');
          if (stepA.role !== stepB.role) entry.changes.push('role');
          if ((stepA.section||'') !== (stepB.section||'')) entry.changes.push('section');
          if ((stepA.tool_time_category||'') !== (stepB.tool_time_category||'')) entry.changes.push('category');
          if ((stepA.int_ext||'') !== (stepB.int_ext||'')) entry.changes.push('int/ext');
          if (depsA !== depsB) entry.changes.push('dependencies');
          changed.push(entry);
        }
      }
    });

    // Find removed
    Object.entries(mapA).forEach(([id, stepA]) => {
      if (!mapB[id]) {
        removed.push(stepA);
      }
    });

    return { added, removed, changed };
  };

  const handleRestore = (rev) => {
    const confirmed = window.confirm(
      `Restore to revision "${rev.label}"? Current steps, nodes, layers, and no-go zones will be replaced.`
    );
    if (!confirmed) return;

    try {
      const stepsSnapshot = JSON.parse(rev.steps_snapshot || '[]');
      // Optional snapshots — fall back to undefined so rollback handler knows what to skip
      let nodesSnapshot, connectionsSnapshot, waypointsSnapshot, layersSnapshot, blockedSnapshot;
      try { nodesSnapshot       = rev.nodes_snapshot       ? JSON.parse(rev.nodes_snapshot)       : undefined; } catch {}
      try { connectionsSnapshot = rev.connections_snapshot ? JSON.parse(rev.connections_snapshot) : undefined; } catch {}
      try { waypointsSnapshot   = rev.waypoints_snapshot   ? JSON.parse(rev.waypoints_snapshot)   : undefined; } catch {}
      try { layersSnapshot      = rev.layers_snapshot      ? JSON.parse(rev.layers_snapshot)      : undefined; } catch {}
      try { blockedSnapshot     = rev.blocked_snapshot     ? JSON.parse(rev.blocked_snapshot)     : undefined; } catch {}

      onRollback(stepsSnapshot, rev.label, {
        nodes: nodesSnapshot,
        connections: connectionsSnapshot,
        mapEdgeWaypoints: waypointsSnapshot,
        mapLayers: layersSnapshot,
        mapBlocked: blockedSnapshot,
      });
      // Force the revision list to refetch so a new rollback-marker revision shows up
      queryClient.invalidateQueries({ queryKey: ['processRevisions', processId] });
      setIsOpen(false);
      toast.success(`Restored to ${rev.label}`);
    } catch (err) {
      toast.error('Failed to restore revision: ' + (err?.message || 'parse error'));
    }
  };

  // Pre-compute a diff for every revision against its next-older sibling.
  // revisions are sorted newest-first → revisions[idx+1] is the older one.
  // For the OLDEST revision there's nothing older, so diff is null (no false 'added' badges).
  const revisionDiffs = React.useMemo(() => {
    const out = {};
    revisions.forEach((rev, idx) => {
      const olderRev = revisions[idx + 1];
      if (!olderRev) { out[rev.id] = null; return; }
      try {
        const thisSteps  = JSON.parse(rev.steps_snapshot || '[]');
        const olderSteps = JSON.parse(olderRev.steps_snapshot || '[]');
        out[rev.id] = computeDiff(olderSteps, thisSteps);
      } catch {
        out[rev.id] = null;
      }
    });
    return out;
  }, [revisions]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-1.5 h-7 text-xs"
      >
        <History className="w-3 h-3" />
        History {revisions.length > 0 ? `(${revisions.length})` : ''}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revision History</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading revisions...
            </div>
          ) : revisions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No revisions yet
            </div>
          ) : (
            <div className="space-y-3">
              {revisions.map((rev, idx) => {
                const cardDiff = revisionDiffs[rev.id];
                const hasChanges = cardDiff && (cardDiff.added.length || cardDiff.removed.length || cardDiff.changed.length);

                return (
                  <Card
                    key={rev.id}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-base">{rev.label}</CardTitle>
                          <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                            <div>
                              PCE: <span className="font-mono">{rev.pce_snapshot?.toFixed(1)}%</span> •
                              Steps: <span className="font-mono">{rev.step_count}</span> •
                              Cycle: <span className="font-mono">{rev.cycle_time_snapshot}m</span>
                            </div>
                            <div>
                              {rev.changed_by_name}
                              {rev.changed_by_email && ` (${rev.changed_by_email})`}
                            </div>
                            <div>{new Date(rev.created_date).toLocaleString()}</div>
                          </div>
                          {rev.change_reason && (
                            <div className="mt-2 px-3 py-2 rounded-md bg-muted/50 border border-border/50 text-xs text-foreground italic">
                              💬 {rev.change_reason}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1.5 ml-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRestore(rev);
                            }}
                            className="h-6 text-xs gap-1"
                            title="Restore this revision"
                          >
                            <RotateCcw className="w-3 h-3" /> Restore
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    {/* Inline diff — shown for every card that has a previous revision */}
                    {hasChanges && (
                      <CardContent className="pt-0 space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {cardDiff.added.length > 0 && (
                            <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300">
                              +{cardDiff.added.length} added
                            </span>
                          )}
                          {cardDiff.removed.length > 0 && (
                            <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                              −{cardDiff.removed.length} removed
                            </span>
                          )}
                          {cardDiff.changed.length > 0 && (
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                              ~{cardDiff.changed.length} changed
                            </span>
                          )}
                          <span className="text-muted-foreground">vs previous</span>
                        </div>
                        {cardDiff.added.length > 0 && (
                          <div className="text-xs">
                            {cardDiff.added.slice(0, 3).map((s) => (
                              <div key={s.id} className="ml-3 text-green-600 dark:text-green-400">
                                + {s.task_description}
                              </div>
                            ))}
                            {cardDiff.added.length > 3 && (
                              <div className="ml-3 text-muted-foreground italic">… and {cardDiff.added.length - 3} more</div>
                            )}
                          </div>
                        )}
                        {cardDiff.removed.length > 0 && (
                          <div className="text-xs">
                            {cardDiff.removed.slice(0, 3).map((s) => (
                              <div key={s.id} className="ml-3 text-red-600 dark:text-red-400 line-through">
                                − {s.task_description}
                              </div>
                            ))}
                            {cardDiff.removed.length > 3 && (
                              <div className="ml-3 text-muted-foreground italic">… and {cardDiff.removed.length - 3} more</div>
                            )}
                          </div>
                        )}
                        {cardDiff.changed.length > 0 && (
                          <div className="text-xs">
                            {cardDiff.changed.slice(0, 3).map((item) => (
                              <div key={item.new.id} className="ml-3 text-blue-600 dark:text-blue-400">
                                ~ {item.new.task_description}
                                {item.changes.length > 0 && (
                                  <span className="text-muted-foreground"> ({item.changes.join(', ')})</span>
                                )}
                              </div>
                            ))}
                            {cardDiff.changed.length > 3 && (
                              <div className="ml-3 text-muted-foreground italic">… and {cardDiff.changed.length - 3} more</div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
import React, { useState } from 'react';
import { useProcess } from '@/lib/processContext';
import { appClient } from '@/api/standaloneClient';
import { useAuth } from '@/lib/AuthContext';
import { mergeScenarioIntoParent } from '@/lib/scenarioUtils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { GitMerge, Trash2, FlaskConical } from 'lucide-react';

export default function ScenarioBanner() {
  const { activeProcess, steps, nodes, connections, mapLayers, mapBlocked, loadProcess } = useProcess();
  const { user } = useAuth();
  const [merging, setMerging] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  // Only render for scenario processes
  if (!activeProcess?.is_scenario || !activeProcess?.parent_process_id) return null;

  const handleMerge = async () => {
    if (!window.confirm(
      `Merge "${activeProcess.name}" into the live standard?\n\nA rollback snapshot will be taken of the live process first. This action cannot be easily undone (but can be rolled back via Revision History).`
    )) return;

    setMerging(true);
    try {
      const parent = await appClient.entities.Process.get(activeProcess.parent_process_id);
      const pd = { steps: steps || [], nodes: nodes || {}, connections: connections || [] };
      const updatedParent = await mergeScenarioIntoParent(activeProcess, parent, pd, mapLayers || [], mapBlocked || [], user);
      await loadProcess(updatedParent);
      toast.success(`Scenario merged into "${updatedParent.name}" — rollback snapshot saved`);
    } catch (err) {
      console.error('Merge failed:', err);
      toast.error('Merge failed: ' + (err?.message || 'unknown error'));
    } finally {
      setMerging(false);
    }
  };

  const handleDiscard = async () => {
    if (!window.confirm(
      `Discard scenario "${activeProcess.name}"?\n\nThe live standard process will be untouched. The scenario will be permanently deleted.`
    )) return;

    setDiscarding(true);
    try {
      const parent = await appClient.entities.Process.get(activeProcess.parent_process_id);
      await appClient.entities.Process.delete(activeProcess.id);
      await loadProcess(parent);
      toast.success('Scenario discarded — live standard reloaded');
    } catch (err) {
      console.error('Discard failed:', err);
      toast.error('Discard failed: ' + (err?.message || 'unknown error'));
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <div className="sticky top-16 z-30 w-full bg-amber-50 dark:bg-amber-950/60 border-b-2 border-amber-400 dark:border-amber-600 px-6 py-2 flex items-center gap-4 shadow-sm">
      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 flex-1">
        <FlaskConical className="w-4 h-4 shrink-0" />
        <span className="text-sm font-semibold">Scenario Branch:</span>
        <span className="text-sm font-bold">{activeProcess.name}</span>
        {activeProcess.scenario_reason && (
          <span className="text-xs text-amber-700 dark:text-amber-400 italic truncate max-w-md">
            — {activeProcess.scenario_reason}
          </span>
        )}
        <span className="text-xs bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-full font-medium shrink-0">
          NOT LIVE STANDARD
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={handleMerge}
          disabled={merging || discarding}
          className="h-7 text-xs gap-1.5 border-green-500 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
        >
          <GitMerge className="w-3.5 h-3.5" />
          {merging ? 'Merging…' : 'Merge to Live'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleDiscard}
          disabled={merging || discarding}
          className="h-7 text-xs gap-1.5 border-destructive text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {discarding ? 'Discarding…' : 'Discard'}
        </Button>
      </div>
    </div>
  );
}
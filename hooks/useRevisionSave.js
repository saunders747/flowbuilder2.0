import { useCallback } from 'react';
import { appClient } from '@/api/standaloneClient';
import { toast } from 'sonner';

/**
 * Encapsulates the logic for saving a ProcessRevision snapshot.
 * Snapshots steps, nodes, connections, waypoints, layers, and blocked zones so
 * that a full restore (including spaghetti map routing) is possible.
 */
export function useRevisionSave({ activeProcess, steps, nodes, connections, mapEdgeWaypoints, mapLayers, mapBlocked }) {
  const handleSaveRevision = useCallback(async ({ label, change_reason, saved_by_name }) => {
    if (!activeProcess) { toast.error('No active process selected'); return; }

    const totalTime = steps.reduce((a, s) => a +
      (Number(s.manual_time) || 0) + (Number(s.walking_time) || 0) +
      (Number(s.waiting_time) || 0) + (Number(s.machine_time) || 0) +
      (Number(s.inspection_time) || 0), 0);

    const ttTime = steps
      .filter(s => (s.tool_time_category || '').toLowerCase().startsWith('tooltime'))
      .reduce((a, s) => a +
        (Number(s.manual_time) || 0) + (Number(s.walking_time) || 0) +
        (Number(s.waiting_time) || 0) + (Number(s.machine_time) || 0) +
        (Number(s.inspection_time) || 0), 0);

    const existing = await appClient.entities.ProcessRevision.filter(
      { process_id: activeProcess.id }, '-revision_number', 100
    );
    const nextNum = (existing.length > 0
      ? Math.max(...existing.map(r => r.revision_number || 0)) : 0) + 1;

    let userName = saved_by_name || 'Anonymous';
    let userEmail = '';
    try {
      const user = await appClient.auth.me();
      if (user) {
        userName = user.full_name || user.email || saved_by_name || 'Anonymous';
        userEmail = user.email || '';
      }
    } catch {}

    await appClient.entities.ProcessRevision.create({
      process_id: activeProcess.id,
      revision_number: nextNum,
      label: label || `v${nextNum}`,
      change_reason,
      changed_by_name: userName,
      changed_by_email: userEmail,
      steps_snapshot: JSON.stringify(steps),
      step_count: steps.length,
      pce_snapshot: totalTime > 0 ? Math.round((ttTime / totalTime) * 100) : 0,
      cycle_time_snapshot: totalTime,
      approval_status_snapshot: activeProcess.approval_status || 'Draft',
      nodes_snapshot: nodes ? JSON.stringify(nodes) : null,
      connections_snapshot: connections ? JSON.stringify(connections) : null,
      waypoints_snapshot: mapEdgeWaypoints ? JSON.stringify(mapEdgeWaypoints) : null,
      layers_snapshot: mapLayers ? JSON.stringify(mapLayers) : null,
      blocked_snapshot: mapBlocked ? JSON.stringify(mapBlocked) : null,
    });

    toast.success(`Revision "${label || `v${nextNum}`}" saved`);
    return nextNum;
  }, [activeProcess, steps, nodes, connections, mapEdgeWaypoints, mapLayers, mapBlocked]);

  return { handleSaveRevision };
}
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/standaloneClient';
import { toast } from 'sonner';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { applyWaitingWasteRule } from './stepUtils';
import { cascadeTimings, getStepTotal } from '@/hooks/useMultiProcessTable';

const ProcessContext = createContext();

export const useProcess = () => {
  const ctx = useContext(ProcessContext);
  if (!ctx) throw new Error('useProcess must be used inside ProcessProvider');
  return ctx;
};

function renumberSteps(steps) {
  return steps.map((s, idx) => ({ ...s, step_number: idx + 1 }));
}

export const ProcessProvider = ({ children }) => {
  const initialData = { steps: [], nodes: {}, connections: [], mapEdgeWaypoints: {} };

  const {
    state: processData,
    setState: setProcessData,
    setCurrentOnly: setProcessDataSilent,
    commitSilent,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    lastUndoLabel,
    lastRedoLabel,
  } = useUndoRedo(initialData);

  const [activeProcess, setActiveProcess] = useState(null);
  const [schematicUrl, setSchematicUrl] = useState('');
  const [mapLayers, setMapLayers] = useState([
    { id: 'layer-ground', name: 'Ground Level', order: 0 },
  ]);
  const [mapBlocked, setMapBlocked] = useState([]);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [syncError, setSyncError] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const syncTimerRef = useRef(null);
  const isDirtyRef = useRef(false);  // true only after a real user mutation
  const isSavingRef = useRef(false); // prevents overlapping save calls
  // Always-current refs so saveProcess never has stale closure data
  const processDataRef = useRef(processData);
  const mapLayersRef = useRef(mapLayers);
  const mapBlockedRef = useRef(mapBlocked);
  const mapEdgeWaypointsRef = useRef(processData.mapEdgeWaypoints);
  const activeProcessRef = useRef(activeProcess);

  // Keep refs current
  useEffect(() => { processDataRef.current = processData; }, [processData]);
  useEffect(() => { mapLayersRef.current = mapLayers; }, [mapLayers]);
  useEffect(() => { mapBlockedRef.current = mapBlocked; }, [mapBlocked]);
  useEffect(() => { mapEdgeWaypointsRef.current = processData.mapEdgeWaypoints; }, [processData.mapEdgeWaypoints]);
  useEffect(() => { activeProcessRef.current = activeProcess; }, [activeProcess]);

  const loadProcess = useCallback(async (proc) => {
    try {
      let stepsData = [];
      let nodesData = {};
      let connectionsData = [];

      if (proc.steps_data) {
        const data = typeof proc.steps_data === 'string'
          ? proc.steps_data.startsWith('http')
            ? await fetch(proc.steps_data).then(r => r.json())
            : JSON.parse(proc.steps_data)
          : proc.steps_data;
        stepsData = Array.isArray(data) ? data : [];
      }
      if (proc.nodes_data) {
        const data = typeof proc.nodes_data === 'string'
          ? proc.nodes_data.startsWith('http')
            ? await fetch(proc.nodes_data).then(r => r.json())
            : JSON.parse(proc.nodes_data)
          : proc.nodes_data;
        nodesData = data || {};
      }
      if (proc.connections_data) {
        const data = typeof proc.connections_data === 'string'
          ? proc.connections_data.startsWith('http')
            ? await fetch(proc.connections_data).then(r => r.json())
            : JSON.parse(proc.connections_data)
          : proc.connections_data;
        connectionsData = Array.isArray(data) ? data : [];
      }

      if (proc.map_layers_data) {
        try { setMapLayers(JSON.parse(proc.map_layers_data)); } catch {}
      }
      if (proc.map_blocked_data) {
        try { setMapBlocked(JSON.parse(proc.map_blocked_data)); } catch {}
      }
      if (proc.map_edges_data) {
        try { 
          const edgesData = JSON.parse(proc.map_edges_data);
          setProcessData(prev => ({ ...prev, mapEdgeWaypoints: edgesData }));
        } catch {}
      }

      setActiveProcess(proc);
      setSchematicUrl(proc.schematic_url || '');
      setProcessData({ steps: stepsData, nodes: nodesData, connections: connectionsData });
      clearHistory();
      isDirtyRef.current = false; // nothing to save — data just came from the server
    } catch (err) {
      console.error('Failed to load process:', err);
      toast.error('Failed to load process');
    }
  }, [setProcessData, clearHistory]);

  const stepCounterRef = useRef(0);

  const addStep = useCallback((beforeStepId, initialData = {}) => {
    isDirtyRef.current = true;
    setProcessData((prev) => {
      const newId = `step_${Date.now()}_${++stepCounterRef.current}_${Math.random().toString(36).substr(2, 9)}`;
      const maxNum = prev.steps.length > 0 ? Math.max(...prev.steps.map(s => s.step_number || 0)) : 0;
      let insertIndex = prev.steps.length;
      if (beforeStepId) {
        insertIndex = prev.steps.findIndex(s => s.id === beforeStepId);
        if (insertIndex === -1) insertIndex = prev.steps.length;
      }
      const newStep = {
        id: newId, step_number: maxNum + 1, task_description: '', role: '', section: '',
        manual_time: 0, walking_time: 0, waiting_time: 0, machine_time: 0,
        inspection_time: 0, tool_time_category: '', dependencies: [],
        start_time: 0, start_offset: 0, start_time_override: false,
        ...initialData,
      };
      const newSteps = [...prev.steps];
      newSteps.splice(insertIndex, 0, newStep);
      return { ...prev, steps: renumberSteps(newSteps) };
    }, 'Add step');
  }, [setProcessData]);

  /**
   * Insert a waste/waiting step between a blocking step and one or more dependent steps,
   * rewiring dependencies in a single atomic state update.
   *
   * Use case: when role A finishes a step that role B was waiting on, this inserts an
   * explicit "Waiting for A" step on role B that depends on the blocker and becomes
   * the new dependency of the steps that were waiting. Cascade timing stays consistent.
   *
   * @param {string} beforeStepId - insert the new wait step BEFORE this step in the table
   * @param {string} blockerStepId - the step whose finish creates the wait
   * @param {string[]} rewireDependentIds - steps that currently depend on blockerStepId
   *        and should now depend on the new wait step instead
   * @param {object} initialData - other fields for the new wait step
   */
  const insertWaitStep = useCallback((beforeStepId, blockerStepId, rewireDependentIds, initialData = {}) => {
    isDirtyRef.current = true;
    setProcessData((prev) => {
      const newId = `step_${Date.now()}_${++stepCounterRef.current}_${Math.random().toString(36).substr(2, 9)}`;
      let insertIndex = prev.steps.length;
      if (beforeStepId) {
        insertIndex = prev.steps.findIndex(s => s.id === beforeStepId);
        if (insertIndex === -1) insertIndex = prev.steps.length;
      }
      const newWaitStep = {
        id: newId, step_number: 0, task_description: '', role: '', section: '',
        manual_time: 0, walking_time: 0, waiting_time: 0, machine_time: 0,
        inspection_time: 0, tool_time_category: '', int_ext: 'Internal',
        dependencies: [blockerStepId],
        start_time: 0, start_offset: 0, start_time_override: false,
        is_generated_wait: true,
        ...initialData,
      };
      // Build new steps array: insert the wait step, then rewire dependents
      const rewireSet = new Set(rewireDependentIds || []);
      const newSteps = [];
      for (let i = 0; i < prev.steps.length; i++) {
        if (i === insertIndex) newSteps.push(newWaitStep);
        const s = prev.steps[i];
        if (rewireSet.has(s.id)) {
          // Replace the original blocker dep with the new wait step's ID;
          // keep any other deps untouched
          const newDeps = (s.dependencies || []).map(d => d === blockerStepId ? newId : d);
          // Deduplicate
          const dedup = [...new Set(newDeps)];
          newSteps.push({ ...s, dependencies: dedup });
        } else {
          newSteps.push(s);
        }
      }
      // Append at end if insert was beyond bounds
      if (insertIndex >= prev.steps.length) newSteps.push(newWaitStep);

      return { ...prev, steps: renumberSteps(newSteps) };
    }, 'Insert waiting-for-others step');
  }, [setProcessData]);

  const updateStep = useCallback((stepId, rawUpdates) => {
    isDirtyRef.current = true;
    const label = rawUpdates.dependencies !== undefined ? 'Edit dependencies'
      : (rawUpdates.start_time !== undefined || rawUpdates.start_time_override !== undefined) ? 'Edit timing'
      : rawUpdates.role !== undefined ? 'Edit role'
      : rawUpdates.tool_time_category !== undefined ? 'Edit category'
      : 'Edit step';
    setProcessData((prev) => {
      const existing = prev.steps.find(s => s.id === stepId) || {};
      const updates = applyWaitingWasteRule(existing, rawUpdates);
      return { ...prev, steps: prev.steps.map(s => s.id === stepId ? { ...s, ...updates } : s) };
    }, label);
  }, [setProcessData]);

  const deleteStep = useCallback((stepId) => {
    isDirtyRef.current = true;
    setProcessData((prev) => {
      const filtered = prev.steps
        .filter(s => s.id !== stepId)
        .map(s => ({ ...s, dependencies: (s.dependencies || []).filter(d => d !== stepId) }));
      const newNodes = { ...prev.nodes };
      delete newNodes[stepId];
      const newConnections = (prev.connections || []).filter(c => c.from !== stepId && c.to !== stepId);
      return { ...prev, steps: renumberSteps(filtered), nodes: newNodes, connections: newConnections };
    }, 'Delete step');
  }, [setProcessData]);

  const reorderSteps = useCallback((reorderedSteps) => {
    isDirtyRef.current = true;
    setProcessData((prev) => ({ ...prev, steps: renumberSteps(reorderedSteps) }), 'Reorder steps');
  }, [setProcessData]);

  // Atomic reorder + timing — eliminates stale closure / race condition bugs.
  // timingMap: { [stepId]: { start_time, start_time_override, dependencies } }
  const reorderAndTimeSteps = useCallback((reorderedSteps, timingMap) => {
    isDirtyRef.current = true;
    setProcessData((prev) => {
      const renumbered = renumberSteps(reorderedSteps);
      const updated = renumbered.map(s => timingMap?.[s.id] ? { ...s, ...timingMap[s.id] } : s);
      return { ...prev, steps: updated };
    }, 'Reorder & time steps');
  }, [setProcessData]);

  const updateNodePosition = useCallback((stepId, x, y, layerId) => {
    isDirtyRef.current = true;
    setProcessDataSilent(prev => ({
      ...prev,
      nodes: { ...prev.nodes, [stepId]: { x, y, layerId: layerId ?? prev.nodes[stepId]?.layerId ?? 'layer-ground' } },
    }));
  }, [setProcessDataSilent]);

  const updateMapLayers = useCallback((layers) => {
    isDirtyRef.current = true;
    setMapLayers(layers);
  }, []);

  const updateMapBlocked = useCallback((blocked) => {
    isDirtyRef.current = true;
    setMapBlocked(blocked);
  }, []);

  const updateEdgeWaypoints = useCallback((edgeId, waypoints) => {
    isDirtyRef.current = true;
    setProcessData(prev => ({
      ...prev,
      mapEdgeWaypoints: { ...prev.mapEdgeWaypoints, [edgeId]: waypoints }
    }), 'Edit path');
  }, [setProcessData]);

  const batchDeleteSteps = useCallback((stepIds) => {
    isDirtyRef.current = true;
    const idsToDelete = new Set(stepIds);
    setProcessData((prev) => {
      const filtered = prev.steps
        .filter(s => !idsToDelete.has(s.id))
        .map(s => ({ ...s, dependencies: (s.dependencies || []).filter(d => !idsToDelete.has(d)) }));
      const newNodes = { ...prev.nodes };
      idsToDelete.forEach(id => delete newNodes[id]);
      const newConnections = (prev.connections || []).filter(c => !idsToDelete.has(c.from) && !idsToDelete.has(c.to));
      return { ...prev, steps: renumberSteps(filtered), nodes: newNodes, connections: newConnections };
    }, `Delete ${stepIds.length} steps`);
  }, [setProcessData]);

  const clearAllDependencies = useCallback(() => {
    isDirtyRef.current = true;
    setProcessData((prev) => ({
      ...prev,
      steps: prev.steps.map(s => ({ ...s, dependencies: [], start_time: 0, start_time_override: false, start_offset: 0 })),
    }), 'Clear all dependencies');
  }, [setProcessData]);

  // Call this after a node drag ends to commit the silent position update to history
  const commitNodePositions = useCallback((label = 'Move node') => {
    isDirtyRef.current = true;
    commitSilent(label);
  }, [commitSilent]);

  const saveProcess = useCallback(async () => {
    const proc = activeProcessRef.current;
    if (!proc) return;
    if (isSavingRef.current) return;
    const data = processDataRef.current;
    try {
      isSavingRef.current = true;
      setSyncStatus('saving');
      setSyncError(null);

      // Upload steps_data as a file to avoid entity string-field size limits.
      const stepsBlob = new Blob([JSON.stringify(data.steps)], { type: 'application/json' });
      const stepsFile = new File([stepsBlob], `steps-${proc.id}.json`);
      const { file_url } = await appClient.integrations.Core.UploadFile({ file: stepsFile });

      await appClient.entities.Process.update(proc.id, {
        steps_data: file_url,
        nodes_data: JSON.stringify(data.nodes),
        connections_data: JSON.stringify(data.connections),
        map_layers_data: JSON.stringify(mapLayersRef.current),
        map_blocked_data: JSON.stringify(mapBlockedRef.current),
        map_edges_data: JSON.stringify(data.mapEdgeWaypoints),
      });

      isDirtyRef.current = false;
      setLastSavedAt(new Date());
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus(s => s === 'saved' ? 'idle' : s), 2500);
    } catch (err) {
      console.error('Save failed:', err);
      setSyncStatus('error');
      setSyncError(err.message);
      toast.error('Failed to save process');
    } finally {
      isSavingRef.current = false;
    }
  }, []); // stable — uses refs, never stale

  const updateProcessMeta = useCallback(async (metaUpdates) => {
    if (!activeProcess) return;
    try {
      setSyncStatus('saving');
      await appClient.entities.Process.update(activeProcess.id, metaUpdates);
      setActiveProcess(prev => ({ ...prev, ...metaUpdates }));
      setLastSavedAt(new Date());
      setSyncStatus('idle');
    } catch (err) {
      setSyncStatus('error');
      setSyncError(err.message);
    }
  }, [activeProcess]);

  // Auto-sync: only fires after a real user mutation (isDirtyRef.current === true).
  useEffect(() => {
    if (!activeProcessRef.current || !isDirtyRef.current) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    setSyncStatus('pending');
    syncTimerRef.current = setTimeout(() => { saveProcess(); }, 1500);
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  // saveProcess is stable (no deps), so it's safe to omit from deps array
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processData.steps, processData.nodes, processData.connections, processData.mapEdgeWaypoints, mapLayers, mapBlocked, activeProcess]);

  // Wrap undo/redo so travelling through history also marks dirty and triggers a save.
  const undoWithDirty = useCallback(() => { isDirtyRef.current = true; undo(); }, [undo]);
  const redoWithDirty = useCallback(() => { isDirtyRef.current = true; redo(); }, [redo]);

  // Stable key for timing-relevant fields only — avoids cascade recalc on description edits
  // Also includes non-timing display fields (role, section, tool_time_category, internal_external)
  // so that selects whose value comes from allStepsWithTiming stay in sync after edits.
  const timingKey = useMemo(() =>
    processData.steps.map(s =>
      `${s.id}:${s.manual_time}:${s.walking_time}:${s.waiting_time}:${s.machine_time}:${s.inspection_time}:${s.start_time}:${s.start_time_override ? 1 : 0}:${s.start_offset}:${(s.dependencies||[]).join(',')}:${s.role||''}:${s.section||''}:${s.tool_time_category||''}:${s.internal_external||''}:${s.task_description||''}`
    ).join('|'),
    [processData.steps]
  );

  // Compute cascade once here — consumers use this instead of calling cascadeTimings themselves
  const allStepsWithTiming = useMemo(() => {
    if (processData.steps.length === 0) return [];
    const cascaded = cascadeTimings(processData.steps);
    return [...processData.steps]
      .sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0))
      .map(s => {
        const cs = cascaded[s.id] || s;
        const total = getStepTotal(cs);
        const start = cs.start_time ?? 0;
        return { ...cs, _start: start, _total: total, _finish: start + total };
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timingKey]);

  const value = {
    activeProcess, setActiveProcess,
    steps: processData.steps, nodes: processData.nodes, connections: processData.connections,
    allStepsWithTiming,
    schematicUrl, setSchematicUrl,
    mapLayers, setMapLayers, updateMapLayers,
    mapBlocked, setMapBlocked, updateMapBlocked,
    mapEdgeWaypoints: processData.mapEdgeWaypoints, updateEdgeWaypoints,
    syncStatus, syncError, lastSavedAt,
    setProcessData, addStep, insertWaitStep, updateStep, deleteStep, batchDeleteSteps, reorderSteps, reorderAndTimeSteps, updateNodePosition, commitNodePositions, clearAllDependencies,
    loadProcess, saveProcess, updateProcessMeta,
    undo: undoWithDirty, redo: redoWithDirty, canUndo, canRedo, clearHistory,
    lastUndoLabel, lastRedoLabel,
  };

  return (
    <ProcessContext.Provider value={value}>
      {children}
    </ProcessContext.Provider>
  );
};
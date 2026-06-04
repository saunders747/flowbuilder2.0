import { useState, useCallback, useMemo } from 'react';
import { appClient } from '@/api/standaloneClient';
import { toast } from 'sonner';

export const MAX_SLOTS = 1;

export const SLOT_COLORS = [
  { bg: '#006A9D', light: '#e0f0fa', text: '#003d5c' },
  { bg: '#00917B', light: '#d6f5ef', text: '#004d3f' },
  { bg: '#9333ea', light: '#f3e8ff', text: '#5b21b6' },
  { bg: '#d97706', light: '#fef3c7', text: '#7c2d12' },
  { bg: '#db2777', light: '#fce7f3', text: '#831843' },
  { bg: '#0891b2', light: '#e0f6fb', text: '#0c4a6e' },
];

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getStepTotal(s) {
  return (s.manual_time || 0) + (s.walking_time || 0) + (s.waiting_time || 0) + (s.machine_time || 0) + (s.inspection_time || 0);
}

async function parseOrFetch(value) {
  if (!value) return [];
  try {
    if (typeof value === 'string' && value.startsWith('http')) {
      const res = await fetch(value);
      return await res.json();
    }
    if (typeof value === 'string') return JSON.parse(value);
    return value;
  } catch {
    return [];
  }
}

// Cascade finish-to-start dependencies across ALL steps.
// Uses topological sort (Kahn's algorithm) — O(n).
// Steps with start_time_override === true keep their start_time as-is.
export function cascadeTimings(allSteps) {
  const map = Object.fromEntries(allSteps.map(s => [s.id, { ...s }]));

  // Build in-degree and adjacency (dep → dependents)
  const inDegree = {};
  const dependents = {};
  for (const s of allSteps) {
    inDegree[s.id] = inDegree[s.id] ?? 0;
    dependents[s.id] = dependents[s.id] ?? [];
    for (const depId of (s.dependencies || [])) {
      if (depId.startsWith('__break__')) continue; // skip disconnect markers
      inDegree[s.id] = (inDegree[s.id] || 0) + 1;
      dependents[depId] = dependents[depId] ?? [];
      dependents[depId].push(s.id);
    }
  }

  // Kahn's: start with steps that have no dependencies
  const queue = allSteps.filter(s => (inDegree[s.id] || 0) === 0).map(s => s.id);
  const visited = new Set();

  while (queue.length > 0) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);

    const s = map[id];
    if (!s) continue;

    const deps = (s.dependencies || []).filter(d => !d.startsWith('__break__'));
    if (deps.length > 0) {
      const maxFinish = Math.max(0, ...deps.map(depId => {
        const dep = map[depId];
        return dep ? (dep.start_time || 0) + getStepTotal(dep) : 0;
      }));
      // Apply user-set gap offset if they manually positioned this step
      const offset = s.start_time_override && typeof s.start_offset === 'number'
        ? Math.max(0, s.start_offset)
        : 0;
      map[id].start_time = maxFinish + offset;
    } else if (s.start_time_override) {
      // No deps but user dragged it — keep its absolute position (start_time already set)
    }
    // else: no deps, no override — leave start_time at its default

    // Enqueue dependents
    for (const depId of (dependents[id] || [])) {
      inDegree[depId] = (inDegree[depId] || 1) - 1;
      if (inDegree[depId] <= 0) queue.push(depId);
    }
  }

  if (visited.size < allSteps.length) {
    console.warn('[cascadeTimings] Cycle detected in dependencies — some steps may not cascade correctly');
  }

  return map;
}

export function useMultiProcessTable() {
   const [slots, setSlots] = useState([]);
   const [lastSaveTime, setLastSaveTime] = useState(null);

  const addSlot = useCallback(async (process) => {
    if (slots.length >= MAX_SLOTS) { toast.error(`Maximum ${MAX_SLOTS} processes allowed`); return; }
    if (slots.find(s => s.process.id === process.id)) { toast.warning('Already loaded'); return; }
    const steps = await parseOrFetch(process.steps_data);
    // Ensure each step has an id
    const normalised = steps.map((s, i) => ({
      ...s,
      id: s.id || genId(),
      step_number: s.step_number ?? i + 1,
      dependencies: s.dependencies || [],
      start_time: s.start_time || 0,
    }));
    setSlots(prev => [...prev, { process, steps: normalised }]);
    toast.success(`Loaded: ${process.name}`);
  }, [slots]);

  const removeSlot = useCallback((processId) => {
    setSlots(prev => {
      const removedIds = new Set((prev.find(s => s.process.id === processId)?.steps || []).map(s => s.id));
      return prev
        .filter(s => s.process.id !== processId)
        // Clean up cross-process deps pointing to removed steps
        .map(slot => ({
          ...slot,
          steps: slot.steps.map(s => ({
            ...s,
            dependencies: (s.dependencies || []).filter(d => !removedIds.has(d)),
          })),
        }));
    });
  }, []);

  const updateStepInSlot = useCallback((processId, stepId, changes) => {
    setSlots(prev => prev.map(slot => {
      if (slot.process.id !== processId) return slot;
      return { ...slot, steps: slot.steps.map(s => s.id === stepId ? { ...s, ...changes } : s) };
    }));
  }, []);

  const addStepToSlot = useCallback((processId) => {
    setSlots(prev => prev.map(slot => {
      if (slot.process.id !== processId) return slot;
      const stepNum = slot.steps.length + 1;
      return {
        ...slot,
        steps: [...slot.steps, {
          id: genId(),
          step_number: stepNum,
          task_description: `Step ${stepNum}`,
          role: '',
          manual_time: 10,
          walking_time: 0,
          waiting_time: 0,
          machine_time: 0,
          inspection_time: 0,
          tool_time_category: 'tooltime::Tooltime - Planned Maint',
          dependencies: [],
          start_time: 0,
        }],
      };
    }));
  }, []);

  const deleteStepFromSlot = useCallback((processId, stepId) => {
    setSlots(prev => prev.map(slot => {
      // Remove from this slot + renumber, AND clean deps in all slots
      const steps = slot.process.id === processId
        ? slot.steps.filter(s => s.id !== stepId).map((s, i) => ({ ...s, step_number: i + 1 }))
        : slot.steps;
      return {
        ...slot,
        steps: steps.map(s => ({
          ...s,
          dependencies: (s.dependencies || []).filter(d => d !== stepId),
        })),
      };
    }));
  }, []);

  const reorderStepsInSlot = useCallback((processId, newSteps) => {
    setSlots(prev => prev.map(slot => {
      if (slot.process.id !== processId) return slot;
      return { ...slot, steps: newSteps.map((s, i) => ({ ...s, step_number: i + 1 })) };
    }));
  }, []);

  // Move a bar: update start_time (and optionally manual_time for duration change)
  // Duration changes scale the manual_time field; other time fields stay proportional.
  const applyBarMove = useCallback((processId, stepId, newStart, newDuration) => {
    setSlots(prev => prev.map(slot => {
      if (slot.process.id !== processId) return slot;
      return {
        ...slot,
        steps: slot.steps.map(s => {
          if (s.id !== stepId) return s;
          const updates = { start_time: newStart };
          if (newDuration !== undefined) {
            const oldTotal = getStepTotal(s);
            if (oldTotal > 0 && newDuration !== oldTotal) {
              const ratio = newDuration / oldTotal;
              updates.manual_time = Math.round((s.manual_time || 0) * ratio);
              updates.walking_time = Math.round((s.walking_time || 0) * ratio);
              updates.waiting_time = Math.round((s.waiting_time || 0) * ratio);
              updates.machine_time = Math.round((s.machine_time || 0) * ratio);
              updates.inspection_time = Math.round((s.inspection_time || 0) * ratio);
              const newTotal = updates.manual_time + updates.walking_time + updates.waiting_time + updates.machine_time + updates.inspection_time;
              updates.manual_time += newDuration - newTotal;
            } else if (oldTotal === 0) {
              updates.manual_time = newDuration;
            }
          }
          return { ...s, ...updates };
        }),
      };
    }));
  }, []);

  const saveSlot = useCallback(async (processId, currentSlots = slots) => {
    const slot = currentSlots.find(s => s.process.id === processId);
    if (!slot) return;
    try {
      const stepsJson = JSON.stringify(slot.steps);
      const stepsBlob = new Blob([stepsJson], { type: 'application/json' });
      const stepsFile = new File([stepsBlob], `steps-${processId}.json`);
      const { file_url } = await appClient.integrations.Core.UploadFile({ file: stepsFile });
      
      await appClient.entities.Process.update(processId, { steps_data: file_url });
      setLastSaveTime(new Date());
      toast.success(`Saved: ${slot.process.name}`);
    } catch (err) {
      console.error('Save error:', err);
      toast.error(`Failed to save ${slot.process.name}`);
    }
  }, [slots]);

  const saveAll = useCallback(async (currentSlots = slots) => {
    if (currentSlots.length === 0) {
      toast.info('No processes to save');
      return;
    }
    try {
      await Promise.all(currentSlots.map(async (slot) => {
        const stepsJson = JSON.stringify(slot.steps);
        const stepsBlob = new Blob([stepsJson], { type: 'application/json' });
        const stepsFile = new File([stepsBlob], `steps-${slot.process.id}.json`);
        const { file_url } = await appClient.integrations.Core.UploadFile({ file: stepsFile });
        return appClient.entities.Process.update(slot.process.id, { steps_data: file_url });
      }));
      setLastSaveTime(new Date());
      toast.success('All processes saved');
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Save failed');
    }
  }, [slots]);



  const allStepsFlat = useMemo(() =>
    slots.flatMap((slot, slotIdx) =>
      slot.steps.map(s => ({ ...s, _processId: slot.process.id, _processName: slot.process.name, _slotIdx: slotIdx }))
    ),
    [slots]
  );

  return {
    slots, addSlot, removeSlot,
    updateStepInSlot, addStepToSlot, deleteStepFromSlot, reorderStepsInSlot,
    applyBarMove, saveSlot, saveAll,
    allStepsFlat,
    lastSaveTime,
  };
}
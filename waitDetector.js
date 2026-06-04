/**
 * waitDetector.js
 *
 * Detects time gaps in a process where one role is forced to wait for another role's
 * work to finish before they can start their own step.
 *
 * A "wait" exists when:
 *   - Step B has a dependency on Step A (or chain ending in A)
 *   - Step A's role != Step B's role
 *   - The gap (B._start - A._finish) is greater than IGNORE_THRESHOLD minutes
 *   - There is no existing waste/waiting step already covering this gap
 */

const IGNORE_THRESHOLD = 2; // minutes
const WAITING_CATEGORY = 'waste::Waiting for Others';

function buildIndex(stepsWithTiming) {
  const byId = new Map();
  const depsOf = new Map();
  const dependentsOf = new Map();
  for (const s of stepsWithTiming) {
    byId.set(s.id, s);
    depsOf.set(s.id, (s.dependencies || []).filter(d => !String(d).startsWith('__break__')));
    if (!dependentsOf.has(s.id)) dependentsOf.set(s.id, []);
  }
  for (const s of stepsWithTiming) {
    for (const depId of depsOf.get(s.id) || []) {
      if (!dependentsOf.has(depId)) dependentsOf.set(depId, []);
      dependentsOf.get(depId).push(s.id);
    }
  }
  return { byId, depsOf, dependentsOf };
}

function isWaitingStep(step) {
  return (step.tool_time_category || '').toLowerCase().startsWith('waste::') ||
         (step.is_generated_wait === true);
}

/**
 * Main detection entry point.
 * @param {Array} stepsWithTiming - steps with _start, _finish, _total already cascaded
 * @returns {Array} detected wait proposals
 */
export function detectRoleWaits(stepsWithTiming) {
  if (!Array.isArray(stepsWithTiming) || stepsWithTiming.length < 2) return [];

  const { byId, depsOf } = buildIndex(stepsWithTiming);
  const detected = [];
  const seenKeys = new Set();

  for (const toStep of stepsWithTiming) {
    if (isWaitingStep(toStep)) continue;
    if (!toStep.role) continue;

    const toStart = toStep._start ?? 0;
    const directDeps = depsOf.get(toStep.id) || [];
    if (directDeps.length === 0) continue;

    // Find the binding blocker: the dep with the latest finish that belongs to a different role
    let blocker = null;
    let bestFinish = -1;
    for (const depId of directDeps) {
      const dep = byId.get(depId);
      if (!dep) continue;
      const depFinish = dep._finish ?? 0;
      if (depFinish > bestFinish) {
        bestFinish = depFinish;
        blocker = dep;
      }
    }
    if (!blocker || !blocker.role) continue;
    if (blocker.role === toStep.role) continue;

    const gap = toStart - bestFinish;
    if (gap < IGNORE_THRESHOLD) continue;

    const key = `${blocker.id}->${toStep.id}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    // Check if there's already a waiting step bridging these two
    const alreadyHandled = stepsWithTiming.some(s =>
      isWaitingStep(s) &&
      (s.dependencies || []).includes(blocker.id) &&
      (depsOf.get(toStep.id) || []).includes(s.id)
    );
    if (alreadyHandled) continue;

    detected.push({
      key,
      fromStep: blocker,
      toStep,
      fromRole: blocker.role,
      toRole: toStep.role,
      gapMinutes: Math.round(gap),
      gapStart: bestFinish,
      gapEnd: toStart,
      reason: `${toStep.role} (step ${toStep.step_number}) waits ${Math.round(gap)}m for ${blocker.role} (step ${blocker.step_number}) to finish`,
    });
  }

  return detected;
}

/**
 * Build the new waste step payload from a detected wait.
 * The step is inserted BEFORE toStep, takes blocker as its dependency,
 * and becomes toStep's new sole dependency so cascade still works.
 */
export function buildWaitStep(detected) {
  return {
    payload: {
      task_description: `Waiting for ${detected.fromRole} to complete`,
      role: detected.toRole,
      section: detected.toStep.section || '',
      manual_time: 0,
      walking_time: 0,
      waiting_time: detected.gapMinutes,
      machine_time: 0,
      inspection_time: 0,
      tool_time_category: WAITING_CATEGORY,
      internal_external: detected.toStep.internal_external || 'Internal',
      dependencies: [detected.fromStep.id],
      start_time: 0,
      start_offset: 0,
      start_time_override: false,
      is_generated_wait: true,
    },
    beforeStepId: detected.toStep.id,
    rewireDependentIds: [detected.toStep.id],
    originalDependencyId: detected.fromStep.id,
  };
}

// ─── Dismissal persistence ─────────────────────────────────────────────────

export function getDismissedWaits(processId) {
  if (!processId) return new Set();
  try {
    const stored = localStorage.getItem(`hio-waitDismissed-${processId}`);
    if (!stored) return new Set();
    return new Set(JSON.parse(stored));
  } catch {
    return new Set();
  }
}

export function dismissWait(processId, key) {
  if (!processId) return;
  try {
    const set = getDismissedWaits(processId);
    set.add(key);
    localStorage.setItem(`hio-waitDismissed-${processId}`, JSON.stringify([...set]));
  } catch {}
}

export function clearDismissedWaits(processId) {
  if (!processId) return;
  try { localStorage.removeItem(`hio-waitDismissed-${processId}`); } catch {}
}
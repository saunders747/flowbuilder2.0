/**
 * monteCarlo.js
 * Monte Carlo simulation engine for cycle time forecasting based on historical actuals.
 */

const ITERATIONS = 2000;
const MIN_SAMPLES_FOR_DISTRIBUTION = 3;
const FALLBACK_VARIATION = 0.15;

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr, m) {
  if (arr.length < 2) return 0;
  const mu = m ?? mean(arr);
  const variance = arr.reduce((a, b) => a + (b - mu) * (b - mu), 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function randomNormal() {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function sampleTriangular(min, mode, max) {
  const u = Math.random();
  const f = (mode - min) / (max - min);
  if (u < f) return min + Math.sqrt(u * (max - min) * (mode - min));
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

function sampleLogNormal(actuals) {
  const logs = actuals.map(x => Math.log(Math.max(0.5, x)));
  const mu = mean(logs);
  const sigma = stdev(logs, mu);
  const sig = Math.min(sigma, 0.6);
  return Math.exp(mu + sig * randomNormal());
}

function buildSampler(step, actualsByStepId) {
  const actuals = actualsByStepId[step.id] || [];
  const planned = (Number(step.manual_time) || 0)
    + (Number(step.walking_time) || 0)
    + (Number(step.waiting_time) || 0)
    + (Number(step.machine_time) || 0)
    + (Number(step.inspection_time) || 0);

  if (actuals.length >= MIN_SAMPLES_FOR_DISTRIBUTION) {
    return () => sampleLogNormal(actuals);
  }
  const min  = planned * (1 - FALLBACK_VARIATION);
  const max  = planned * (1 + FALLBACK_VARIATION);
  return () => sampleTriangular(min, planned, max);
}

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.floor(sortedArr.length * p));
  return sortedArr[idx];
}

export function runMonteCarlo(steps, actualsByStepId = {}) {
  if (!steps || steps.length === 0) {
    return { p50: 0, p80: 0, p90: 0, p95: 0, mean: 0, minSim: 0, maxSim: 0,
             stepsWithActuals: 0, stepsWithoutActuals: 0, histogram: [], iterations: 0 };
  }

  const samplers = steps.map(s => buildSampler(s, actualsByStepId));
  const stepIndex = new Map(steps.map((s, i) => [s.id, i]));

  const results = new Array(ITERATIONS);

  for (let it = 0; it < ITERATIONS; it++) {
    const finishes = new Array(steps.length).fill(0);
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      let start = 0;
      if (step.start_time_override) {
        start = Number(step.start_time) || 0;
      } else if (step.dependencies && step.dependencies.length > 0) {
        let maxDepFinish = 0;
        for (const depId of step.dependencies) {
          const depIdx = stepIndex.get(depId);
          if (depIdx !== undefined && finishes[depIdx] > maxDepFinish) {
            maxDepFinish = finishes[depIdx];
          }
        }
        start = maxDepFinish;
      } else if (i > 0) {
        start = Number(step.start_time) || finishes[i - 1] || 0;
      }
      finishes[i] = start + samplers[i]();
    }
    results[it] = Math.max(...finishes);
  }

  results.sort((a, b) => a - b);

  const minSim = results[0];
  const maxSim = results[results.length - 1];
  const bucketCount = 20;
  const bucketSize = (maxSim - minSim) / bucketCount || 1;
  const histogram = Array.from({ length: bucketCount }, (_, i) => ({
    bucket: minSim + i * bucketSize,
    bucketEnd: minSim + (i + 1) * bucketSize,
    count: 0,
  }));
  for (const r of results) {
    const idx = Math.min(bucketCount - 1, Math.floor((r - minSim) / bucketSize));
    histogram[idx].count++;
  }

  const stepsWithActuals = steps.filter(s => (actualsByStepId[s.id] || []).length >= MIN_SAMPLES_FOR_DISTRIBUTION).length;

  return {
    p50:  Math.round(percentile(results, 0.50)),
    p80:  Math.round(percentile(results, 0.80)),
    p90:  Math.round(percentile(results, 0.90)),
    p95:  Math.round(percentile(results, 0.95)),
    mean: Math.round(mean(results)),
    minSim: Math.round(minSim),
    maxSim: Math.round(maxSim),
    stepsWithActuals,
    stepsWithoutActuals: steps.length - stepsWithActuals,
    histogram,
    iterations: ITERATIONS,
  };
}

export function simulateResourceAllocation(steps, roleCount = {}) {
  if (!steps || steps.length === 0) return { totalCycle: 0, perRole: [] };

  const orderedSteps = topoSortSteps(steps);
  const finishes = new Map();
  const roleLanes = {};

  for (const step of orderedSteps) {
    const role = step.role || 'Unassigned';
    const lanes = Math.max(1, roleCount[role] || 1);
    if (!roleLanes[role]) roleLanes[role] = new Array(lanes).fill(0);
    if (roleLanes[role].length !== lanes) {
      const sorted = [...roleLanes[role]].sort((a, b) => b - a);
      roleLanes[role] = sorted.slice(0, lanes);
      while (roleLanes[role].length < lanes) roleLanes[role].push(0);
    }

    const duration = (Number(step.manual_time) || 0)
      + (Number(step.walking_time) || 0)
      + (Number(step.waiting_time) || 0)
      + (Number(step.machine_time) || 0)
      + (Number(step.inspection_time) || 0);

    let depFinish = 0;
    for (const depId of (step.dependencies || [])) {
      depFinish = Math.max(depFinish, finishes.get(depId) || 0);
    }
    if (step.start_time_override) {
      depFinish = Math.max(depFinish, Number(step.start_time) || 0);
    }

    let bestLane = 0;
    for (let i = 1; i < roleLanes[role].length; i++) {
      if (roleLanes[role][i] < roleLanes[role][bestLane]) bestLane = i;
    }

    const start = Math.max(depFinish, roleLanes[role][bestLane]);
    const finish = start + duration;
    roleLanes[role][bestLane] = finish;
    finishes.set(step.id, finish);
  }

  const totalCycle = Math.max(0, ...Array.from(finishes.values()));

  const perRole = Object.entries(roleLanes).map(([role, lanes]) => {
    const totalRoleWork = steps
      .filter(s => (s.role || 'Unassigned') === role)
      .reduce((a, s) => a + (Number(s.manual_time) || 0), 0);
    const maxLaneFinish = Math.max(0, ...lanes);
    const capacity = maxLaneFinish * lanes.length;
    return {
      role,
      lanes: lanes.length,
      finish: Math.round(maxLaneFinish),
      utilisation: capacity > 0 ? Math.round((totalRoleWork / capacity) * 100) : 0,
    };
  });

  return { totalCycle: Math.round(totalCycle), perRole };
}

function topoSortSteps(steps) {
  const byId = new Map(steps.map(s => [s.id, s]));
  const visited = new Set();
  const result = [];

  const visit = (step) => {
    if (visited.has(step.id)) return;
    visited.add(step.id);
    for (const depId of (step.dependencies || [])) {
      if (byId.has(depId)) visit(byId.get(depId));
    }
    result.push(step);
  };

  const sortedByNumber = [...steps].sort((a, b) => (a.step_number || 0) - (b.step_number || 0));
  for (const s of sortedByNumber) visit(s);
  return result;
}
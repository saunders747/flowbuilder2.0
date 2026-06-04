import { appClient } from '@/api/standaloneClient';

/**
 * Build a compact process JSON payload for AI analysis.
 * Returns a plain object (not stringified) for use in prompts.
 */
export function buildProcessPayload(activeProcess, steps) {
  if (!activeProcess || !steps?.length) return null;

  const roleTotals = {};
  let totalTime = 0;
  let ttTime = 0;

  steps.forEach(s => {
    const dur = (Number(s.manual_time) || 0) + (Number(s.walking_time) || 0) +
      (Number(s.waiting_time) || 0) + (Number(s.machine_time) || 0) + (Number(s.inspection_time) || 0);
    const role = s.role || 'Unassigned';
    roleTotals[role] = (roleTotals[role] || 0) + dur;
    totalTime += dur;
    if ((s.tool_time_category || '').toLowerCase().startsWith('tooltime')) ttTime += dur;
  });

  const pce = totalTime > 0 ? Math.round((ttTime / totalTime) * 100) : 0;

  return {
    process: {
      id: activeProcess.id,
      name: activeProcess.name,
      fleet_class: activeProcess.fleet_class,
      asset_model: activeProcess.asset_model,
      target_duration_hrs: activeProcess.target_duration_hrs,
      num_maintainers: activeProcess.num_maintainers,
    },
    roles: Object.keys(roleTotals),
    role_totals_minutes: roleTotals,
    pce_percent: pce,
    total_time_minutes: totalTime,
    step_count: steps.length,
    steps: steps.map(s => ({
      id: s.id,
      step_number: s.step_number,
      task_description: s.task_description,
      role: s.role,
      section: s.section,
      manual_time: s.manual_time || 0,
      walking_time: s.walking_time || 0,
      waiting_time: s.waiting_time || 0,
      machine_time: s.machine_time || 0,
      inspection_time: s.inspection_time || 0,
      total_minutes: (Number(s.manual_time) || 0) + (Number(s.walking_time) || 0) +
        (Number(s.waiting_time) || 0) + (Number(s.machine_time) || 0) + (Number(s.inspection_time) || 0),
      tool_time_category: s.tool_time_category || '',
      int_ext: s.internal_external || '',
      dependencies: s.dependencies || [],
      start_time: s._start ?? s.start_time ?? 0,
      finish_time: s._finish ?? null,
    })),
  };
}

/**
 * Create a scenario branch from the active process.
 * Returns the created scenario process record.
 */
export async function createScenarioBranch(activeProcess, processData, mapLayers, mapBlocked, scenarioName, scenarioReason) {
  // Upload steps as file
  const stepsBlob = new Blob([JSON.stringify(processData.steps)], { type: 'application/json' });
  const stepsFile = new File([stepsBlob], `steps-scenario-${Date.now()}.json`);
  const { file_url } = await appClient.integrations.Core.UploadFile({ file: stepsFile });

  const scenarioData = {
    name: scenarioName,
    is_scenario: true,
    parent_process_id: activeProcess.id,
    scenario_reason: scenarioReason || '',
    // Copy all metadata fields
    fleet_group: activeProcess.fleet_group,
    fleet_class: activeProcess.fleet_class,
    asset_model: activeProcess.asset_model,
    asset_number: activeProcess.asset_number,
    service_type: activeProcess.service_type,
    work_order_type: activeProcess.work_order_type,
    location: activeProcess.location,
    target_duration_hrs: activeProcess.target_duration_hrs,
    num_maintainers: activeProcess.num_maintainers,
    trade_mix: activeProcess.trade_mix,
    shift_type: activeProcess.shift_type,
    safety_controls: activeProcess.safety_controls,
    required_tooling: activeProcess.required_tooling,
    required_parts: activeProcess.required_parts,
    required_permits: activeProcess.required_permits,
    sap_reference: activeProcess.sap_reference,
    owner: activeProcess.owner,
    version: activeProcess.version,
    version_type: activeProcess.version_type,
    approval_status: 'Draft',
    state_type: activeProcess.state_type,
    schematic_url: activeProcess.schematic_url,
    // Copy map data
    steps_data: file_url,
    nodes_data: activeProcess.nodes_data,
    connections_data: activeProcess.connections_data,
    map_layers_data: JSON.stringify(mapLayers),
    map_blocked_data: JSON.stringify(mapBlocked),
    map_edges_data: activeProcess.map_edges_data,
  };

  return await appClient.entities.Process.create(scenarioData);
}

/**
 * Merge scenario back into parent:
 * 1. Auto-snapshot the parent's current state
 * 2. Overwrite parent with scenario's steps/nodes/connections/layers/zones
 * 3. Delete the scenario
 */
export async function mergeScenarioIntoParent(scenario, parent, processData, mapLayers, mapBlocked, currentUser) {
  // Step 1: snapshot parent's current data from DB
  const parentFull = await appClient.entities.Process.get(parent.id);

  // Upload parent's current steps as a snapshot
  const stepsBlob = new Blob([JSON.stringify(processData.steps)], { type: 'application/json' });
  const stepsFile = new File([stepsBlob], `steps-pre-merge-${Date.now()}.json`);
  const { file_url: stepsUrl } = await appClient.integrations.Core.UploadFile({ file: stepsFile });

  const existing = await appClient.entities.ProcessRevision.filter(
    { process_id: parent.id }, '-revision_number', 100
  );
  const nextNum = (existing.length > 0 ? Math.max(...existing.map(r => r.revision_number || 0)) : 0) + 1;

  await appClient.entities.ProcessRevision.create({
    process_id: parent.id,
    revision_number: nextNum,
    label: `Pre-merge snapshot (v${nextNum})`,
    change_reason: `Auto-snapshot before merging scenario "${scenario.name}"`,
    changed_by_name: currentUser?.full_name || currentUser?.email || 'System',
    changed_by_email: currentUser?.email || '',
    steps_snapshot: stepsUrl,
    step_count: processData.steps.length,
    nodes_snapshot: JSON.stringify(processData.nodes),
    connections_snapshot: JSON.stringify(processData.connections),
    layers_snapshot: JSON.stringify(mapLayers),
    blocked_snapshot: JSON.stringify(mapBlocked),
  });

  // Step 2: copy scenario's raw data into parent
  await appClient.entities.Process.update(parent.id, {
    steps_data: scenario.steps_data,
    nodes_data: scenario.nodes_data,
    connections_data: scenario.connections_data,
    map_layers_data: scenario.map_layers_data,
    map_blocked_data: scenario.map_blocked_data,
    map_edges_data: scenario.map_edges_data,
  });

  // Step 3: delete scenario
  await appClient.entities.Process.delete(scenario.id);

  // Return updated parent record
  return await appClient.entities.Process.get(parent.id);
}
/**
 * aiAssistantPrompts.js
 *
 * System prompt and helper for the FlowBuilder AI Assistant agent.
 * Used by appClient.agents.createConversation() and addMessage().
 */

export const AGENT_NAME = 'flowbuilder_assistant';

export const SYSTEM_PROMPT = `You are the HIO FlowBuilder AI Assistant — a Lean methodology expert specialising in mining maintenance process improvement.

Your job is to analyse standardised work processes and propose concrete, actionable improvements. You think in Lean terms: PCE (Process Cycle Efficiency), TIMWOOD wastes (Transport, Inventory, Motion, Waiting, Over-production, Over-processing, Defects), and SMED (Single-Minute Exchange of Dies — converting Internal work to External).

## CORE FOCUS AREAS

You analyse processes across these dimensions in priority order:

1. **Skill-level mismatch** — Identify steps where a skilled trade (Fitter, Electrician, Auto-Electrician, Boilermaker) is performing work that an unskilled or lesser-skilled role (Service Person, Trades Assistant, Apprentice) could do. This is the highest-value improvement: it frees skilled trades for skilled work and reduces labour cost per service.

   Steps commonly mis-allocated to skilled trades:
   - Walking to/from the work area
   - Sourcing parts and tools
   - Cleaning, washing, decontamination
   - Documentation, sign-offs (when not safety-critical)
   - Simple inspections (visual only, no diagnosis)
   - Refilling consumables (oil, grease, washer fluid)
   - Setup activities (laying out tools, hanging tags)

   Steps that genuinely require a skilled trade:
   - Diagnosis and fault-finding
   - Torquing to specification
   - Electrical isolation verification
   - Hot work, welding
   - Hydraulic system breakdown
   - Anything that affects warranty or compliance

2. **Role rebalancing** — Look at the Yamazumi balance (total time per role). If one role is significantly overloaded while another sits idle, propose moving specific steps.

3. **Waste elimination** — Find steps categorised as Waste (Waiting for Others, Idle, etc.). Propose elimination, automation, or restructuring.

4. **SMED conversions** — Find Internal steps that could be External (done before shutdown or in parallel with running equipment). This directly reduces downtime.

5. **Sequencing improvements** — Identify illogical orderings, especially where dependencies are loose and resequencing would reduce total cycle.

## OUTPUT FORMAT

Always respond with a structured analysis. Use this exact format with the JSON block at the end:

### Summary
[2-3 sentences describing what you found and the biggest opportunity]

### Detailed Analysis
[Group findings by focus area. Use headings. Cite specific step numbers and names. Be concrete — name the step, name the role change, name the time saving.]

### Recommendations

\`\`\`json
{
  "recommendations": [
    {
      "id": "rec-1",
      "type": "reallocate_role",
      "priority": "high",
      "step_ids": ["step-id-1", "step-id-2"],
      "step_numbers": [12, 13],
      "current_state": "Currently performed by Fitter (skilled trade)",
      "proposed_state": "Reallocate to Service Person",
      "rationale": "Sourcing consumables does not require diagnostic skill. Frees Fitter for Steps 14-18 hands-on work.",
      "estimated_saving_minutes": 15,
      "labour_cost_impact": "high",
      "risk_level": "low",
      "implementation_effort": "low"
    }
  ],
  "totals": {
    "potential_minutes_saved": 0,
    "potential_pce_uplift_percent": 0,
    "skilled_trade_hours_freed": 0
  }
}
\`\`\`

## GUARDRAILS

- NEVER recommend eliminating safety-critical steps (isolations, lockouts, permits, gas tests, JSEAs, toolbox talks).
- NEVER recommend reducing inspection time if the step is for safety-critical equipment (brakes, steering, fall protection).
- ALWAYS flag risk_level: "high" for any reallocation that crosses competency boundaries (e.g., suggesting a Service Person torque a wheel nut).
- ALWAYS prefer many small high-confidence wins over one large speculative reallocation.
- If you cannot find at least 3 recommendations with confidence, say so plainly and explain what data would help (more actuals, role definitions, etc.).
- DO NOT hallucinate role names. Use only the roles present in the provided process data.
- DO NOT change the meaning of safety steps. If a step says "Verify isolation", do not suggest reallocating it to anyone except the qualified isolation role.

## TONE

Concise. Direct. Mining-floor language. Never apologise. Lead with the finding, then the reasoning. Sound like a senior process engineer briefing a supervisor — not like a tutorial.`;

/**
 * Build a compact summary of a process for the agent.
 */
export function buildProcessContext(process, steps, toolTimeGroups, roles) {
  const totalPlanned = steps.reduce((a, s) => a + (Number(s.manual_time) || 0)
    + (Number(s.walking_time) || 0) + (Number(s.waiting_time) || 0)
    + (Number(s.machine_time) || 0) + (Number(s.inspection_time) || 0), 0);

  const totalTooltime = steps
    .filter(s => (s.tool_time_category || '').toLowerCase().startsWith('tooltime'))
    .reduce((a, s) => a + (Number(s.manual_time) || 0), 0);

  const pce = totalPlanned > 0 ? Math.round(totalTooltime / totalPlanned * 100) : 0;

  const roleTotals = {};
  steps.forEach(s => {
    const r = s.role || 'Unassigned';
    const t = (Number(s.manual_time) || 0) + (Number(s.walking_time) || 0)
      + (Number(s.waiting_time) || 0) + (Number(s.machine_time) || 0)
      + (Number(s.inspection_time) || 0);
    roleTotals[r] = (roleTotals[r] || 0) + t;
  });

  const catTotals = {};
  steps.forEach(s => {
    const c = s.tool_time_category || 'Uncategorised';
    catTotals[c] = (catTotals[c] || 0) + (Number(s.manual_time) || 0);
  });

  const intTotal = steps.filter(s => (s.int_ext || '') === 'Internal')
    .reduce((a, s) => a + (Number(s.manual_time) || 0), 0);
  const extTotal = steps.filter(s => (s.int_ext || '') === 'External')
    .reduce((a, s) => a + (Number(s.manual_time) || 0), 0);

  const compactSteps = steps.map(s => ({
    id: s.id,
    n: s.step_number,
    desc: s.task_description,
    role: s.role,
    section: s.section,
    duration_min: (Number(s.manual_time) || 0) + (Number(s.walking_time) || 0)
      + (Number(s.waiting_time) || 0) + (Number(s.machine_time) || 0)
      + (Number(s.inspection_time) || 0),
    category: s.tool_time_category || '',
    int_ext: s.int_ext || '',
    deps: s.dependencies || [],
  }));

  return {
    process_name: process?.name || 'Unnamed',
    target_duration_minutes: process?.target_duration_hours ? process.target_duration_hours * 60 : null,
    total_planned_minutes: totalPlanned,
    total_tooltime_minutes: totalTooltime,
    pce_percent: pce,
    role_totals: roleTotals,
    category_totals: catTotals,
    internal_minutes: intTotal,
    external_minutes: extTotal,
    available_roles: roles || [],
    step_count: steps.length,
    steps: compactSteps,
  };
}

/**
 * Build the initial user message for a kick-off analysis.
 */
export function buildAnalysisRequest(processContext, focus = 'all') {
  const focusLines = {
    'all': 'Run a complete analysis across all focus areas — skill reallocation, role rebalancing, waste elimination, SMED conversions, and sequencing.',
    'reallocation': 'Focus exclusively on skill-level mismatch and role reallocation. Find every step where a skilled trade is doing work an unskilled or lesser-skilled role could do.',
    'smed': 'Focus on SMED — find Internal steps that could be External, and propose how to make the conversion.',
    'waste': 'Focus on waste elimination — find steps that add no value and could be removed or restructured.',
    'critical_path': 'Focus on the critical path — find the longest sequential chain and propose ways to shorten it.',
  };

  return `${focusLines[focus] || focusLines.all}

Here is the full process data:

\`\`\`json
${JSON.stringify(processContext, null, 2)}
\`\`\`

Analyse this process and respond in the structured format defined in your system prompt. Be concrete — cite specific step numbers and durations. End with the JSON block of recommendations.`;
}

/**
 * Extract the structured recommendations JSON from an agent response.
 */
export function extractRecommendations(content) {
  if (!content || typeof content !== 'string') return null;
  const matches = [...content.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (matches.length === 0) return null;
  const lastMatch = matches[matches.length - 1];
  try {
    return JSON.parse(lastMatch[1].trim());
  } catch {
    return null;
  }
}
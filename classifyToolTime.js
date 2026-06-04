/**
 * classifyToolTime — keyword-based tool-time category classifier.
 *
 * Given a task description string and the tool time groups config,
 * returns a category string in the format "groupKey::subcategory"
 * (e.g. "tooltime::Tooltime - Planned Maint") or null if no match.
 *
 * Rules are ordered by priority — first match wins.
 */

const KEYWORD_RULES = [
  // ── Waste ────────────────────────────────────────────────────────────────
  { group: 'waste', sub: 'Waiting for Others',              words: ['wait for', 'waiting for', 'await'] },
  { group: 'waste', sub: 'Waiting for Clearance / Hold Point', words: ['clearance', 'hold point', 'permit to work', 'ptw', 'isolation cert', 'waiting for clearance', 'wait for clearance'] },
  { group: 'waste', sub: 'Idle',                            words: ['idle', 'standby', 'stand by', 'stand-by'] },
  { group: 'waste', sub: 'Not at Work Area',                words: ['not at work', 'away from work area', 'leave area'] },
  { group: 'waste', sub: 'On the Job Waste',               words: ['rework', 're-work', 'redo', 're-do', 'repeat task', 'defect repair'] },

  // ── NVA Activities ────────────────────────────────────────────────────────
  { group: 'nva_activities', sub: 'Sourcing Parts / Spares', words: ['source part', 'sourcing part', 'source spare', 'sourcing spare', 'get part', 'collect part', 'pick part', 'fetch part', 'obtain part', 'retrieve part', 'locate part'] },
  { group: 'nva_activities', sub: 'Sourcing Tools / Equipment', words: ['source tool', 'sourcing tool', 'get tool', 'collect tool', 'fetch tool', 'obtain tool', 'retrieve tool', 'locate tool', 'gather tool', 'source equipment', 'get equipment', 'collect equipment'] },
  { group: 'nva_activities', sub: 'Travel',                 words: ['travel', 'drive to', 'walk to', 'transit', 'mobilise', 'mobilize', 'move to site', 'travel to'] },
  { group: 'nva_activities', sub: 'Breaks',                 words: ['break', 'lunch', 'smoko', 'rest period', 'meal break'] },

  // ── NVA Essential ─────────────────────────────────────────────────────────
  { group: 'nva_essential', sub: 'Admin Tasks (including HSE)', words: ['admin', 'paperwork', 'documentation', 'complete form', 'fill in form', 'hse', 'safety form', 'jsa', 'job safety', 'take five', 'swms', 'risk assessment'] },
  { group: 'nva_essential', sub: 'Meetings (including toolbox)', words: ['toolbox', 'tool box', 'meeting', 'briefing', 'pre-start meeting', 'safety meeting', 'kickoff', 'kick-off'] },
  { group: 'nva_essential', sub: 'Handover',                words: ['handover', 'hand over', 'hand-over', 'shift change', 'shift handover'] },
  { group: 'nva_essential', sub: 'Training',                words: ['training', 'induction', 'on-the-job training', 'ojt', 'mentor', 'coach'] },
  { group: 'nva_essential', sub: 'Supervision of Others',   words: ['supervise', 'supervision', 'oversee', 'direct team', 'coordinate team'] },
  { group: 'nva_essential', sub: 'Other Maintenance Activities', words: ['clean up', 'cleanup', 'housekeeping', 'dispose', 'waste disposal', 'tidy', 'clear area'] },

  // ── Tooltime ─────────────────────────────────────────────────────────────
  // Break-in (unplanned / corrective)
  { group: 'tooltime', sub: 'Tooltime - Break-in Work',    words: ['break-in', 'breakin', 'corrective', 'unplanned', 'breakdown', 'urgent repair', 'fault repair', 'failure repair', 'emergency repair'] },
  // Everything else defaults to Planned Maint — handled via fallback below
];

/**
 * @param {string} description - task description text
 * @param {object} groups - tool time groups from useAppSettings (DEFAULT_TOOL_TIME_GROUPS shape)
 * @returns {string|null} category key like "tooltime::Tooltime - Planned Maint" or null
 */
export function classifyToolTime(description, groups) {
  if (!description) return null;
  const lower = description.toLowerCase();

  for (const rule of KEYWORD_RULES) {
    // Check that the target group/sub actually exists in the current config
    const group = groups?.[rule.group];
    if (!group) continue;
    const sub = group.subcategories?.find(s => s === rule.sub);
    if (!sub) continue;

    if (rule.words.some(w => lower.includes(w))) {
      return `${rule.group}::${sub}`;
    }
  }

  // Default fallback: Tooltime - Planned Maint (if it exists)
  const ttGroup = groups?.tooltime;
  if (ttGroup) {
    const plannedSub = ttGroup.subcategories?.find(s => s.toLowerCase().includes('planned'));
    if (plannedSub) return `tooltime::${plannedSub}`;
    if (ttGroup.subcategories?.length) return `tooltime::${ttGroup.subcategories[0]}`;
  }

  return null;
}
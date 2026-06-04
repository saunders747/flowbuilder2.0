/**
 * When waiting_time changes, auto-assign Waste category if none is set.
 * When tool_time_category is cleared and waiting_time > 0, re-apply default.
 * @param {object} existing - the current step object
 * @param {object} updates  - the proposed updates being applied
 * @returns {object}        - updates with any auto-corrections applied
 */
export function applyWaitingWasteRule(existing, updates) {
  const result = { ...updates };

  // If waiting_time is being set to > 0 and no category is assigned yet
  const newWaitingTime = 'waiting_time' in updates ? updates.waiting_time : (existing.waiting_time || 0);
  const newCategory = 'tool_time_category' in updates ? updates.tool_time_category : (existing.tool_time_category || '');

  if (newWaitingTime > 0 && !newCategory) {
    result.tool_time_category = 'waste::Waiting for Others';
  }

  // If category is being cleared but waiting_time is still > 0, re-apply default
  if ('tool_time_category' in updates && updates.tool_time_category === '' && newWaitingTime > 0) {
    result.tool_time_category = 'waste::Waiting for Others';
  }

  return result;
}
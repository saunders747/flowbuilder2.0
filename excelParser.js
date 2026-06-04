/**
 * excelParser.js
 * Direct structural parser for the HIO/Obzervr combination-table Excel format.
 * Handles 3-sheet workbooks: each sheet has header at row 5, data from row 8.
 *
 * Column layout (0-based):
 *  0  Previous Task No #
 *  1  New Task No #       → step_number
 *  2  Section             → section
 *  3  Task description    → task_description
 *  4  Tooling/Materiel    → tools_required
 *  5  Support Equipment   → (ignored)
 *  6  Consumable          → parts_required
 *  7  Trade               → role
 *  8  Start               → start_time
 *  9  Dur                 → manual_time
 * 10  Fin                 → finish_time
 * 11+ Gantt columns       → ignored
 */
import * as XLSX from 'xlsx';

// The column names that identify the header row
const HEADER_SIGNALS = ['task description', 'task desc', 'description', 'task no', 'task no.'];

// Known columns that should be SKIPPED (admin/delay fields auto-generated on export)
const SKIP_TASK_NAMES = [
  'ensure data entry is up to date',
  'any delays?',
  'delay reason',
  'delay comments',
  'delay duration',
  'confirm data is current',
];

function normalise(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/**
 * Parse one worksheet row → step object (or null to skip).
 * colMap: { stepNumber, section, task, tooling, consumable, trade, start, dur, fin }
 */
function parseRow(row, colMap, sheetLabel) {
  const rawStepNum = colMap.stepNumber !== undefined ? row[colMap.stepNumber] : null;
  const stepNum = toNum(rawStepNum);
  const task    = normalise(row[colMap.task]);

  // Skip rows with no step number or no task
  if (!stepNum || !task) return null;

  // Skip auto-generated admin rows
  const taskLower = task.toLowerCase();
  if (SKIP_TASK_NAMES.some(s => taskLower.includes(s))) return null;

  const section = normalise(row[colMap.section]) || normalise(row[colMap.subsection]);
  const role    = normalise(row[colMap.trade]);
  const start   = toNum(row[colMap.start]);
  const dur     = toNum(row[colMap.dur]);
  const fin     = toNum(row[colMap.fin]);

  return {
    step_number:       stepNum,
    task_description:  task,
    section:           section,
    role:              role,
    start_time:        start,
    manual_time:       dur,
    finish_time:       fin,
    walking_time:      0,
    waiting_time:      0,
    machine_time:      0,
    inspection_time:   0,
    tools_required:    normalise(row[colMap.tooling]),
    parts_required:    normalise(row[colMap.consumable]),
    safety_controls:   '',
    notes:             '',
    source_sheet:      sheetLabel,
  };
}

/**
 * Find the header row index and build a column map for a worksheet's rows array.
 * Returns { headerRowIdx, colMap } or null if not found.
 */
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const row = rows[i];
    if (!row) continue;
    const rowStr = row.map(v => normalise(v).toLowerCase()).join('|');
    if (HEADER_SIGNALS.some(sig => rowStr.includes(sig))) {
      // Build column map by scanning the header row
      const colMap = {};
      row.forEach((cell, idx) => {
        const h = normalise(cell).toLowerCase().replace(/\s+/g, ' ');
        if (h.includes('new task no'))                          colMap.stepNumber = idx;
        else if (h === 'task no.' || h === 'task no' || h === 'task #' || h === 'task number') colMap.stepNumber = idx;
        else if (h.includes('previous task'))                   colMap.prevNumber = idx;
        else if (h === 'section' || h === 'phase' || h === 'work section') colMap.section = idx;
        else if (h === 'subsection / area' || h === 'subsection' || h === 'subsection/area' || h === 'area') colMap.subsection = idx;
        else if (h.includes('task description') || h === 'description' || h === 'task') colMap.task = idx;
        else if (h.includes('tooling') || h.includes('materiel') || h.includes('material')) colMap.tooling = idx;
        else if (h.includes('consumable'))                      colMap.consumable = idx;
        else if (h === 'trade' || h === 'role' || h === 'trades' || h.includes('trade / role') || h.includes('trade/role')) colMap.trade = idx;
        else if (h === 'start' || h === 'start time')           colMap.start     = idx;
        else if (h === 'duration' || h.startsWith('dur'))       colMap.dur       = idx;
        else if (h === 'fin' || h === 'finish' || h === 'end')  colMap.fin       = idx;
      });
      // Fallback to positional defaults only for columns not already detected
      if (colMap.stepNumber === undefined) colMap.stepNumber = colMap.task !== undefined ? 0 : 1;
      if (colMap.section    === undefined) colMap.section    = 2;
      if (colMap.task       === undefined) colMap.task       = 3;
      if (colMap.tooling    === undefined) colMap.tooling    = 4;
      if (colMap.consumable === undefined) colMap.consumable = 6;
      if (colMap.trade      === undefined) colMap.trade      = 7;
      if (colMap.start      === undefined) colMap.start      = 8;
      if (colMap.dur        === undefined) colMap.dur        = 9;
      if (colMap.fin        === undefined) colMap.fin        = 10;
      return { headerRowIdx: i, colMap };
    }
  }
  return null;
}

/**
 * Main entry point.
 * @param {ArrayBuffer} buffer - raw file bytes
 * @returns {{ steps: Array, sheets: string[], warnings: string[] }}
 */
export function parseExcelWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const steps = [];
  const sheets = [];
  const warnings = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    // Convert to array-of-arrays (raw values, no formatting)
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });

    const result = findHeaderRow(rows);
    if (!result) {
      // Sheet has no recognisable header — likely a summary/analysis sheet, skip silently
      continue;
    }

    const { headerRowIdx, colMap } = result;
    sheets.push(sheetName);
    let sheetCount = 0;

    // Parse every row after the header.
    // Some formats have a duplicate sub-header row right after — detect and skip it.
    const firstDataIdx = (() => {
      const nextRow = rows[headerRowIdx + 1];
      if (!nextRow) return headerRowIdx + 1;
      // If the next row has no numeric step number, it's likely a sub-header — skip it
      const maybeStep = nextRow[colMap.stepNumber];
      return (maybeStep === null || maybeStep === undefined || isNaN(Number(maybeStep)) || Number(maybeStep) === 0)
        ? headerRowIdx + 2
        : headerRowIdx + 1;
    })();
    for (let i = firstDataIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      // Skip section-group header rows (only col[2] has content, rest empty)
      const newTaskNum = row[colMap.stepNumber];
      if ((newTaskNum === null || newTaskNum === undefined) &&
          normalise(row[colMap.section]) &&
          !normalise(row[colMap.task])) {
        continue; // section group header, e.g. "PREPARE - EXTERNAL..."
      }

      const step = parseRow(row, colMap, sheetName);
      if (step) {
        steps.push(step);
        sheetCount++;
      }
    }

    if (sheetCount === 0) {
      warnings.push(`Sheet "${sheetName}" — no steps extracted`);
    }
  }

  if (sheets.length === 0) {
    warnings.push('No combination-table sheets found. Check the file has "Previous Task No #" and "Task description" columns.');
  }

  return { steps, sheets, warnings };
}
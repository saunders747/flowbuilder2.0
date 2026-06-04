import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useProcess } from '@/lib/processContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileSpreadsheet, FileText, Check, Loader2, ArrowRight, Plus, Wand2 } from 'lucide-react';
import { appClient } from '@/api/standaloneClient';
import * as XLSX from 'xlsx';
import { parseExcelWorkbook } from '@/lib/excelParser';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useRoles, useSections, useAppSettings } from '@/hooks/useAppSettings';
import { classifyToolTime } from '@/lib/classifyToolTime';
import ProcessSelector from '@/components/ProcessSelector';

export default function ImportData() {
  const { addStep, activeProcess, loadProcess } = useProcess();
  const navigate = useNavigate();
  const { roles, addRole } = useRoles();
  const { sections, addSection } = useSections();
  const { groups: toolTimeGroups } = useAppSettings();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // New process creation from PDF
  const [newProcessName, setNewProcessName] = useState('');
  const [creatingProcess, setCreatingProcess] = useState(false);

  // Default role persistence
  const DEFAULT_ROLE_STORAGE_KEY = 'mm_swb_import_default_role';
  const [defaultRole, setDefaultRole] = useState(() => {
    try { return localStorage.getItem(DEFAULT_ROLE_STORAGE_KEY) || ''; } catch { return ''; }
  });

  useEffect(() => {
    try {
      if (defaultRole) localStorage.setItem(DEFAULT_ROLE_STORAGE_KEY, defaultRole);
      else localStorage.removeItem(DEFAULT_ROLE_STORAGE_KEY);
    } catch {}
  }, [defaultRole]);

  // Auto-register any new roles/sections found in imported data into global settings
  const registerNewRolesAndSections = useCallback((rows) => {
    const newRoles = [...new Set(rows.map(r => (r.role || '').trim()).filter(Boolean))];
    const newSections = [...new Set(rows.map(r => (r.section || '').trim()).filter(Boolean))];
    newRoles.forEach(r => { if (!roles.includes(r)) addRole(r); });
    newSections.forEach(s => { if (!sections.includes(s)) addSection(s); });
    const addedRoles = newRoles.filter(r => !roles.includes(r));
    const addedSections = newSections.filter(s => !sections.includes(s));
    if (addedRoles.length || addedSections.length) {
      const parts = [];
      if (addedRoles.length) parts.push(`${addedRoles.length} role${addedRoles.length !== 1 ? 's' : ''}: ${addedRoles.join(', ')}`);
      if (addedSections.length) parts.push(`${addedSections.length} section${addedSections.length !== 1 ? 's' : ''}: ${addedSections.join(', ')}`);
      toast.info(`Auto-added to global settings — ${parts.join(' · ')}`);
    }
  }, [roles, sections, addRole, addSection]);

  const fileRef = useRef(null);
  const isPdf    = (f) => f?.name?.toLowerCase().endsWith('.pdf');
  const isJson   = (f) => f?.name?.toLowerCase().endsWith('.json');
  const isExcel  = (f) => /\.(xlsx|xls)$/i.test(f?.name || '');

  // Parse an Obzervr JSON export into FlowBuilder steps
  const parseObzervrJson = (parsed) => {
    const steps = [];
    let stepNum = 1;

    const walk = (node, roleCtx, sectionCtx) => {
      if (!node || typeof node !== 'object') return;
      const type = (node.ObjectType || '').toLowerCase();
      const name = (node.Name || '').trim();

      // Determine context from group identifiers
      let role    = roleCtx;
      let section = sectionCtx;
      const ident = (node.Identifier || '').toUpperCase();
      if (type === 'groupfragment' && ident.startsWith('GRP-') && !ident.startsWith('GRP-SOP') && !ident.startsWith('GRP-OPE')) {
        role = name; // GRP-FIT, GRP-ELEC etc → role name
      }
      if (type === 'sectionfragment') {
        section = name;
      }

      // A FieldFragment with Type 'Tiles' = a task step
      if (type === 'fieldfragment' && node.Type === 'Tiles') {
        const helpInfo = node.Information || {};
        const helpText = helpInfo.HelpText || '';
        steps.push({
          step_number:      stepNum++,
          task_description: name,
          role:             '',  // user assigns role in UI
          section:          section || '',
          manual_time:      0,
          walking_time:     0,
          waiting_time:     0,
          machine_time:     0,
          inspection_time:  0,
          notes:            helpText || '',
          tools_required:   '',
          parts_required:   '',
          safety_controls:  '',
          obzervr_id:       node.Id || '',
          obzervr_ident:    node.Identifier || '',
        });
        return; // don't recurse into field children
      }

      // Recurse into children arrays
      const childArrays = ['ContentGroups','SectionFragments','FieldFragments','Fragments'];
      childArrays.forEach(key => {
        if (Array.isArray(node[key])) {
          node[key].forEach(child => walk(child, role, section));
        }
      });
      if (Array.isArray(node)) {
        node.forEach(child => walk(child, role, section));
      }
    };

    // Obzervr JSON is either a root object or an array
    const root = Array.isArray(parsed) ? parsed : [parsed];
    root.forEach(item => walk(item, '', ''));
    return steps;
  };

  const handleFile = async (e) => {
     const f = e.target.files?.[0];
     if (!f) return;

     if (isPdf(f) && f.size > 10 * 1024 * 1024) {
       toast.error('PDF file must be under 10 MB (platform limit). Please compress or split the PDF and try again.');
       return;
     }

     setFile(f);
     setPreview(null);
     setLoading(true);

     // Pre-fill process name from filename
     if (!newProcessName) {
       const baseName = f.name.replace(/\.(pdf|csv|xlsx?|json)$/i, '').replace(/[-_]/g, ' ');
       setNewProcessName(baseName);
     }

    let file_url;
    try {
      ({ file_url } = await appClient.integrations.Core.UploadFile({ file: f }));
    } catch (uploadErr) {
      setLoading(false);
      toast.error('Upload failed: ' + (uploadErr?.message || 'unknown error'));
      return;
    }

    if (isPdf(f)) {
      const result = await appClient.integrations.Core.InvokeLLM({
        prompt: `You are a process engineering assistant. Analyse this maintenance/work procedure PDF and extract ALL task steps.

CRITICAL RULES:
- Copy task descriptions VERBATIM from the document. Do NOT paraphrase, rename, or summarise them.
- Copy section/location names EXACTLY as they appear. Do NOT rename them (e.g. "Tray Tipping" must not become "Tipping Point", "Prepare" must stay "Prepare").
- Do NOT infer or assign roles — always return role as empty string "".
- If a heading says "Operations" that is a section name, not a role.

For each step extract:
- step_number (sequential integer or as written)
- task_description (full task text)
- role: ALWAYS return an empty string "". Do NOT extract trade/role names from the PDF — the user assigns roles separately in the UI.
- location (work location if mentioned)
- manual_time (manual/labour time in minutes as a number — estimate from any duration info, 0 if unknown)
- walking_time (walking/travel time in minutes, 0 if unknown)
- waiting_time (waiting/idle time in minutes, 0 if unknown)
- machine_time (machine/auto time in minutes, 0 if unknown)
- inspection_time (inspection time in minutes, 0 if unknown)
- tools_required (comma-separated tools if mentioned)
- parts_required (comma-separated parts/materials if mentioned)
- safety_controls (PPE, lockout, permits etc if mentioned)
- notes (any other relevant info)
- suggested_process_name (a short descriptive name for this process, based on the document title or content)

Return every distinct task step. Do not skip any. If time values are not given, set them to 0.`,
        file_urls: [file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            suggested_process_name: { type: 'string' },
            rows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  step_number: { type: 'string' },
                  task_description: { type: 'string' },
                  role: { type: 'string' },
                  location: { type: 'string' },
                  manual_time: { type: 'number' },
                  walking_time: { type: 'number' },
                  waiting_time: { type: 'number' },
                  machine_time: { type: 'number' },
                  inspection_time: { type: 'number' },
                  tools_required: { type: 'string' },
                  parts_required: { type: 'string' },
                  safety_controls: { type: 'string' },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
      });

      setLoading(false);
      if (result?.rows?.length > 0) {
        // Always strip PDF-detected roles — user assigns role via the Default Role dropdown
        setPreview(result.rows.map(row => ({ ...row, role: '', section: row.section || row.location || '' })));
        if (result.suggested_process_name) setNewProcessName(result.suggested_process_name);
        toast.success(`Extracted ${result.rows.length} steps from PDF`);
      } else {
        toast.error('Could not extract steps from PDF');
      }
    } else if (isJson(f)) {
      // ── Obzervr JSON import ──────────────────────────────────────────────
      try {
        const text = await f.text();
        const parsed = JSON.parse(text);
        const extracted = parseObzervrJson(parsed);
        setLoading(false);
        if (extracted.length > 0) {
          setPreview(extracted);
          toast.success(`Extracted ${extracted.length} steps from Obzervr JSON`);
        } else {
          toast.error('No task steps found in this JSON. Check it is an Obzervr template export (not a capture result).');
        }
      } catch (err) {
        setLoading(false);
        toast.error('Could not parse JSON file: ' + (err?.message || 'invalid JSON'));
      }
      return;
    } else {
      const isCsv   = f.name.toLowerCase().endsWith('.csv');
      const isXlsxFile = isExcel(f);

      if (!isCsv && !isXlsxFile) {
        setLoading(false);
        setFile(null);
        toast.error('Unsupported file type. Accepted formats: PDF, CSV, XLSX, XLS, JSON.');
        return;
      }

      // ── Parse Excel with structural parser — all sheets, no AI ────────
      if (isXlsxFile) {
        try {
          const buffer = await f.arrayBuffer();
          const { steps: excelSteps, sheets: parsedSheets, warnings } = parseExcelWorkbook(buffer);
          setLoading(false);
          if (warnings.length) warnings.forEach(w => toast.warning(w));
          if (excelSteps.length === 0) {
            toast.error('No steps found. Check the file has "Task description" and "New Task No #" columns.');
            return;
          }
          setPreview(excelSteps);
          registerNewRolesAndSections(excelSteps);
          const sheetLabel = parsedSheets.length + ' sheet' + (parsedSheets.length !== 1 ? 's' : '') + ': ' + parsedSheets.join(', ');
          toast.success('Extracted ' + excelSteps.length + ' steps from ' + sheetLabel);
        } catch (xlsxErr) {
          setLoading(false);
          toast.error('Could not read Excel file: ' + (xlsxErr?.message || 'unknown error'));
        }
        return;
      }
      let csvText;

      if (f.size > 5 * 1024 * 1024) {
        setLoading(false);
        setFile(null);
        toast.error('CSV must be under 5 MB. Please split the file and try again.');
        return;
      }

      // Read CSV as text in the browser (Excel already converted above)
      if (!csvText) {
        try {
          csvText = await f.text();
        } catch (err) {
          setLoading(false);
          toast.error('Could not read CSV file: ' + (err?.message || 'unknown error'));
          return;
        }
      }

      // Truncate extremely long CSVs to keep the prompt within model limits
      const MAX_CSV_CHARS = 120000;
      let truncated = false;
      if (csvText.length > MAX_CSV_CHARS) {
        csvText = csvText.slice(0, MAX_CSV_CHARS);
        truncated = true;
      }

      const result = await appClient.integrations.Core.InvokeLLM({
        prompt: `You are a process engineering assistant. Analyse this CSV spreadsheet content and extract ALL task steps.

COLUMN MAPPING RULES — follow these exactly:
- A column named "Section", "Work Section", "Phase", or similar → map to the "section" field ONLY. NEVER merge its value into task_description.
- A column named "Task", "Description", "Task Description", "Step", "Activity" → map to task_description ONLY. Do NOT append section text to it.
- A column named "Role", "Trade", "Trade", "Crew", "Operator" → map to role.
- A column named "Start" or "Start Time" → map to start_time (number, minutes).
- A column named "Dur", "Duration", "Dur (min)", "Time" → map to manual_time (number, minutes). This is the task duration.
- A column named "Fin", "Finish", "End", "End Time" → map to finish_time (number, minutes). Used for validation only.
- Other time columns (Manual, Walk, Wait, Machine, Inspection) → map to the corresponding time field in minutes.
- If you see a row like: Section="Pre-Start Checks", Task="Inspect fluid levels" → output section="Pre-Start Checks", task_description="Inspect fluid levels". NEVER output task_description="Pre-Start Checks — Inspect fluid levels".

HARD RULE: task_description must contain ONLY the task text. section must contain ONLY the section/phase text. Do not concatenate them.

The CSV may be in one of TWO layouts — detect which:

LAYOUT A — Row-per-step list:
Each row is one task with columns like description, role, section, manual_time, walking_time.
Read each row as one step. Map each column to the correct field per the COLUMN MAPPING RULES above.

LAYOUT B — Combination Table grid (Yamazumi / interval plot):
- Roles/trades down the LEFT column (e.g. SVC, FIT, HV ELEC, BLR, Fitter, Electrician)
- Time intervals ACROSS the top as column headers (e.g. "0-25", "25-50", "50-75" — minutes from start)
- Filled cells or text in cells in each role row indicate when that role works
- Task names labelled inside the cells or in a section below the grid (e.g. "Pre-service (25-31)", "Wash (115-160)", "Main Service (262-373)")
- Numbers like "115-176" inside a cell mean the task spans minutes 115 to 176
- "X mins idle time" annotations may appear in cells beside rows — IGNORE these, they are calculated
- The CSV may contain BOTH "As Is / Before" AND "To Be / After" tables — extract steps from each, indicate via suggested_process_name
- Section headers above the grid (e.g. "Pre-service & Wash", "Main Service") are the section field

For LAYOUT B, convert each filled range or labelled cell into ONE step:
- step_number: order left-to-right, top-to-bottom (sequential integer)
- task_description: the task label only
- role: the role from the leftmost column of that row
- section: the section header above the bar
- manual_time: bar duration in minutes = (end - start) from range "115-176" → 61
- walking_time, waiting_time, machine_time, inspection_time: 0
- notes: include the time range, e.g. "Minutes 115-176"

The CSV may also have:
- Header rows in unusual positions
- Blank rows between sections
- Times in mixed units — convert ALL to MINUTES as numbers
- Multiple sections in one CSV — extract from every section

For each step extract: step_number, task_description, role, section, location, start_time, manual_time, walking_time, waiting_time, machine_time, inspection_time, tools_required, parts_required, safety_controls, notes, suggested_process_name.

Return every distinct task step. Convert all times to minutes as numbers. Missing values: 0 for numbers, "" for strings.

CSV CONTENT:
\`\`\`
${csvText}
\`\`\``,
        response_json_schema: {
          type: 'object',
          properties: {
            suggested_process_name: { type: 'string' },
            rows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  step_number: { type: 'string' },
                  task_description: { type: 'string' },
                  role: { type: 'string' },
                  section: { type: 'string' },
                  location: { type: 'string' },
                  start_time: { type: 'number' },
                  manual_time: { type: 'number' },
                  walking_time: { type: 'number' },
                  waiting_time: { type: 'number' },
                  machine_time: { type: 'number' },
                  inspection_time: { type: 'number' },
                  tools_required: { type: 'string' },
                  parts_required: { type: 'string' },
                  safety_controls: { type: 'string' },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
      });

      setLoading(false);
      if (result?.rows?.length > 0) {
        const csvRows = result.rows.map(row => ({ ...row, section: row.section || '', location: row.location || '' }));
        setPreview(csvRows);
        registerNewRolesAndSections(csvRows);
        if (result.suggested_process_name && !newProcessName) {
          setNewProcessName(result.suggested_process_name);
        }
        const msg = `Extracted ${result.rows.length} steps from CSV` + (truncated ? ' (file was truncated to fit)' : '');
        toast.success(msg);
      } else {
        toast.error('Could not extract steps from CSV');
      }
    }
  };

  const doImportSteps = (rows) => {
    rows.forEach((row, i) => {
      const hasStartTime = row.start_time !== undefined && row.start_time !== null && row.start_time !== '';
      const desc = row.task_description || row.description || `Imported Step ${i + 1}`;
      addStep(null, {
        task_description: desc,
        role: row.role || defaultRole || '',
        section: row.section || '',
        location: row.location || '',
        start_time: hasStartTime ? Number(row.start_time) : 0,
        start_time_override: hasStartTime,
        manual_time: Number(row.manual_time) || 0,
        walking_time: Number(row.walking_time) || 0,
        waiting_time: Number(row.waiting_time) || 0,
        machine_time: Number(row.machine_time) || 0,
        inspection_time: Number(row.inspection_time) || 0,
        tools_required: row.tools_required || '',
        parts_required: row.parts_required || '',
        safety_controls: row.safety_controls || '',
        notes: row.notes || '',
        node_type: 'process',
        tool_time_category: classifyToolTime(desc, toolTimeGroups) || '',
      });
    });
  };

  // Create a new process then import steps into it
  const handleCreateAndImport = async () => {
    if (!preview) return;
    if (!newProcessName.trim()) { toast.error('Please enter a process name.'); return; }
    setCreatingProcess(true);
    try {
      const newProcess = await appClient.entities.Process.create({
        name: newProcessName.trim(),
        approval_status: 'Draft',
        version_type: 'Draft',
        version: 1,
        steps_data: JSON.stringify([]),
      });
      // Generate stable IDs upfront so dependency references match exactly
      const stepIds = preview.map((_, i) => `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`);
      const stepsArray = preview.map((row, i) => {
        const hasStartTime = row.start_time !== undefined && row.start_time !== null && row.start_time !== '';
        const startTime = hasStartTime ? Number(row.start_time) : 0;
        // Duration: prefer explicit dur column, else sum of time sub-fields
        const subTotal = (Number(row.walking_time) || 0) + (Number(row.waiting_time) || 0) + (Number(row.machine_time) || 0) + (Number(row.inspection_time) || 0);
        const manualTime = Number(row.manual_time) || 0;
        const totalDuration = manualTime + subTotal;
        // If no duration at all, default to 5 min manual
        const finalManual = totalDuration > 0 ? manualTime : 5;

        const desc = row.task_description || `Step ${i + 1}`;
        return {
          id: stepIds[i],
          step_number: i + 1,
          task_description: desc,
          role: row.role || defaultRole || '',
          section: row.section || '',
          location: row.location || '',
          start_time: startTime,
          start_time_override: hasStartTime,
          manual_time: finalManual,
          walking_time: Number(row.walking_time) || 0,
          waiting_time: Number(row.waiting_time) || 0,
          machine_time: Number(row.machine_time) || 0,
          inspection_time: Number(row.inspection_time) || 0,
          tools_required: row.tools_required || '',
          parts_required: row.parts_required || '',
          safety_controls: row.safety_controls || '',
          notes: row.notes || '',
          node_type: 'process',
          tool_time_category: classifyToolTime(desc, toolTimeGroups) || '',
          // Use explicit start times if available (no sequential deps needed)
          dependencies: hasStartTime ? [] : (i > 0 ? [stepIds[i - 1]] : []),
        };
      });

      registerNewRolesAndSections(preview);
      const stepsJson = JSON.stringify(stepsArray);
      // Always upload steps as a file to avoid field size limits
      const blob = new Blob([stepsJson], { type: 'application/json' });
      const { file_url: stepsFileUrl } = await appClient.integrations.Core.UploadFile({ file: new File([blob], 'steps.json', { type: 'application/json' }) });

      await appClient.entities.Process.update(newProcess.id, { steps_data: stepsFileUrl });
      const updatedProcess = await appClient.entities.Process.filter({ id: newProcess.id });
      loadProcess(updatedProcess[0] || { ...newProcess, steps_data: stepsFileUrl });
      toast.success(`Created process "${newProcessName}" with ${preview.length} steps — redirecting…`);
      setFile(null); setPreview(null);
      setTimeout(() => navigate('/combination-table'), 1200);
    } catch (err) {
      console.error('Import failed:', err);
      toast.error('Failed to create process: ' + (err?.message || 'unknown error'));
    } finally {
      setCreatingProcess(false);
    }
  };

  // Import into existing active process
  const handleImportIntoActive = async () => {
    if (!preview || !activeProcess) return;
    setImporting(true);
    doImportSteps(preview);
    setImporting(false);
    toast.success(`Imported ${preview.length} steps into "${activeProcess.name}" — redirecting…`);
    setFile(null); setPreview(null);
    setTimeout(() => navigate('/combination-table'), 1200);
  };

  return (
    <div className="space-y-6 max-w-[1000px]">
      <div>
        <h2 className="text-lg font-semibold">Import Data</h2>
        <p className="text-sm text-muted-foreground mt-1">Import from PDF, Excel (.xlsx/.xls), CSV, or Obzervr JSON export. PDF limit: 10 MB — compress large PDFs with ilovepdf.com or split by section.</p>
      </div>

      {/* Upload */}
      <Card>
        <CardContent className="p-6">
          <input ref={fileRef} type="file" accept=".pdf,.csv,.json,.xlsx,.xls" onChange={handleFile} className="hidden" />
          <div
            className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => !loading && fileRef.current?.click()}
          >
            {loading ? (
              <>
                <Loader2 className="w-10 h-10 text-primary mx-auto mb-3 animate-spin" />
                <p className="font-medium">Extracting steps{file && isPdf(file) ? ' from PDF with AI' : ''}…</p>
                <p className="text-sm text-muted-foreground mt-1">This may take a moment</p>
              </>
            ) : (
              <>
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Drop file here or click to browse</p>
                <p className="text-sm text-muted-foreground mt-1">Supported: PDF, CSV. For Excel files, save as CSV first (File → Save As → CSV).</p>
              </>
            )}
          </div>
          {file && !loading && (
            <div className="flex items-center gap-2 mt-4">
              {isPdf(file) ? <FileText className="w-4 h-4 text-primary" /> : <FileSpreadsheet className="w-4 h-4 text-primary" />}
              <span className="text-sm font-medium">{file.name}</span>
              <Badge variant="secondary" className="text-xs">{(file.size / 1024).toFixed(1)} KB</Badge>
              {isPdf(file) && <Badge className="text-xs bg-primary/10 text-primary border-0"><Wand2 className="w-3 h-3 mr-1" />AI extracted</Badge>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview + import actions */}
      {preview && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Check className="w-4 h-4 text-green-600" />
              Preview — {preview.length} steps extracted
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Action A: Create new process */}
             <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
               <p className="text-sm font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Create a new process from this file</p>
               <div className="flex gap-2">
                 <Input
                   value={newProcessName}
                   onChange={e => setNewProcessName(e.target.value)}
                   placeholder="Process name…"
                   className="flex-1"
                 />
                 <Button onClick={handleCreateAndImport} disabled={creatingProcess || !newProcessName.trim()} className="gap-2 shrink-0">
                   {creatingProcess ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                   {creatingProcess ? 'Creating…' : 'Create & Import'}
                 </Button>
               </div>
               <div className="space-y-1">
                 <Label className="text-xs font-medium text-muted-foreground">
                   Default Role / Trade
                   <span className="ml-1 text-[10px] text-muted-foreground/70 font-normal">
                     (applied to all PDF-imported steps; fills gaps for CSV imports)
                   </span>
                 </Label>
                 <Select value={defaultRole || '__none__'} onValueChange={(v) => setDefaultRole(v === '__none__' ? '' : v)}>
                   <SelectTrigger className="h-9">
                     <SelectValue placeholder="No default — leave blank" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="__none__" className="text-xs italic text-muted-foreground">
                       No default — leave blank
                     </SelectItem>
                     {roles.map(r => (
                       <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
                 {defaultRole && (
                   <p className="text-[11px] text-muted-foreground mt-1">
                     All imported steps without a detected role will be assigned: <span className="font-medium text-foreground">{defaultRole}</span>
                   </p>
                 )}
               </div>
             </div>

            {/* Action B: Add to existing process */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2"><ArrowRight className="w-4 h-4" /> Add to an existing process</p>
              <div className="flex items-center gap-2 flex-wrap">
                <ProcessSelector />
                <Button
                  variant="outline"
                  onClick={handleImportIntoActive}
                  disabled={importing || !activeProcess}
                  className="gap-2 shrink-0"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {importing ? 'Importing…' : 'Import into Selected'}
                </Button>
              </div>
              {!activeProcess && <p className="text-xs text-muted-foreground">Select a process from the dropdown above first.</p>}
            </div>

            {/* Preview table */}
            <div className="overflow-x-auto max-h-[360px] overflow-y-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr className="text-muted-foreground text-xs">
                    <th className="p-2 text-center w-8">#</th>
                    <th className="p-2 text-left">Section</th>
                    <th className="p-2 text-left min-w-[200px]">Task</th>
                    <th className="p-2 text-left w-14">Role</th>
                    <th className="p-2 text-center w-14">Start</th>
                    <th className="p-2 text-center w-12">Dur</th>
                    <th className="p-2 text-center w-12">Fin</th>
                    <th className="p-2 text-center w-12">Walk</th>
                    <th className="p-2 text-center w-12">Wait</th>
                    <th className="p-2 text-left">Tools</th>
                    <th className="p-2 text-left">Parts</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className={"border-t border-border/30 hover:bg-muted/20 text-xs " + (i % 2 === 0 ? "" : "bg-muted/10")}>
                      <td className="p-2 font-mono text-muted-foreground text-center">{row.step_number || i + 1}</td>
                      <td className="p-2 max-w-[100px] truncate text-muted-foreground" title={row.section}>{row.section || "—"}</td>
                      <td className="p-2 max-w-[240px] truncate font-medium" title={row.task_description}>{row.task_description || "—"}</td>
                      <td className="p-2">{row.role || "—"}</td>
                      <td className="p-2 text-center font-mono">{(row.start_time != null && row.start_time !== "") ? row.start_time : "—"}</td>
                      <td className="p-2 text-center font-mono font-semibold">{row.manual_time > 0 ? row.manual_time : "0"}</td>
                      <td className="p-2 text-center font-mono text-muted-foreground">{(row.finish_time != null && row.finish_time !== "") ? row.finish_time : "—"}</td>
                      <td className="p-2 text-center">{row.walking_time > 0 ? row.walking_time : "—"}</td>
                      <td className="p-2 text-center">{row.waiting_time > 0 ? row.waiting_time : "—"}</td>
                      <td className="p-2 max-w-[120px] truncate text-muted-foreground" title={row.tools_required}>{row.tools_required || "—"}</td>
                      <td className="p-2 max-w-[120px] truncate text-muted-foreground" title={row.parts_required}>{row.parts_required || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-muted/80 text-xs text-muted-foreground text-center py-1.5 border-t border-border/20">
                {preview.length} steps ready to import
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
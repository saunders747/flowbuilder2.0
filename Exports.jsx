import React from 'react';
import { useProcess } from '@/lib/processContext';
import { appClient } from '@/api/standaloneClient';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileText, Table2, Image, FileJson, BarChart3, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { getStepTotal } from '@/hooks/useMultiProcessTable';
import { useRoles } from '@/hooks/useRoles';

function downloadText(content, filename, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Exports() {
    const { activeProcess, steps, nodes, connections } = useProcess();
    const [selectedId, setSelectedId] = React.useState('');
    const [exportingPdf, setExportingPdf] = React.useState(false);
    const [pdfPaper, setPdfPaper] = React.useState(() => localStorage.getItem('mm_swb_pdf_paper') || 'a3-landscape');
    const [obzervrTemplateLink, setObzervrTemplateLink] = React.useState(
      () => { try { return localStorage.getItem('obzervr_template_link') || ''; } catch { return ''; } }
    );
    const [obzervrRoleFilter, setObzervrRoleFilter] = React.useState('all');
    const { roles } = useRoles();
    const [fetchedSteps, setFetchedSteps] = React.useState(null);
    const [fetchingSteps, setFetchingSteps] = React.useState(false);

  const { data: processes = [] } = useQuery({
    queryKey: ['processes'],
    queryFn: () => appClient.entities.Process.list('-updated_date', 200),
  });

    React.useEffect(() => {
      const proc = selectedId ? processes.find(p => p.id === selectedId) : null;
      if (!proc) { setFetchedSteps(null); return; }
      const sd = proc.steps_data;
      if (!sd) { setFetchedSteps([]); return; }
      if (typeof sd === 'string' && (sd.startsWith('http://') || sd.startsWith('https://'))) {
        setFetchingSteps(true);
        fetch(sd).then(r => r.json()).then(data => {
          setFetchedSteps(Array.isArray(data) ? data : []);
          setFetchingSteps(false);
        }).catch(() => { setFetchedSteps([]); setFetchingSteps(false); });
      } else {
        try { setFetchedSteps(JSON.parse(sd)); } catch { setFetchedSteps([]); }
      }
    }, [selectedId, processes]);

  const targetProcess = selectedId ? processes.find(p => p.id === selectedId) : activeProcess;

  const safeParse = (value) => {
    if (!value) return null;
    if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) return null; // URL — can't parse synchronously
    try { return JSON.parse(value); } catch { return null; }
  };

  const targetSteps = fetchedSteps ?? safeParse(targetProcess?.steps_data) ?? steps;

  const exportCSV = () => {
    const headers = ['Step', 'Task', 'Role', 'Location', 'Manual', 'Walking', 'Waiting', 'Machine', 'Inspection', 'Total', 'Tools', 'Parts', 'Safety', 'Notes'];
    const rows = targetSteps.map(s => [
      s.step_number, s.task_description, s.role, s.location,
      s.manual_time, s.walking_time, s.waiting_time, s.machine_time, s.inspection_time,
      getStepTotal(s), s.tools_required, s.parts_required, s.safety_controls, s.notes,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c || ''}"`).join(',')).join('\n');
    downloadText(csv, `${targetProcess?.name || 'process'}_table.csv`, 'text/csv');
    toast.success('CSV exported');
  };

  const exportJSON = () => {
    const data = {
      process: targetProcess ? { name: targetProcess.name, fleet_class: targetProcess.fleet_class, service_type: targetProcess.service_type, version: targetProcess.version } : {},
      steps: targetSteps,
      nodes: safeParse(targetProcess?.nodes_data) ?? nodes,
      connections: safeParse(targetProcess?.connections_data) ?? connections,
    };
    downloadText(JSON.stringify(data, null, 2), `${targetProcess?.name || 'process'}_data.json`, 'application/json');
    toast.success('JSON exported');
  };

  const exportWasteCSV = () => {
    const headers = ['Step', 'Task', 'Role', 'Walking', 'Waiting', 'Waste Categories', 'Constraint'];
    const rows = targetSteps.map(s => [
      s.step_number, s.task_description, s.role,
      s.walking_time, s.waiting_time,
      (s.waste_categories || []).join('; '), s.constraint_flag ? 'Yes' : 'No',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c || ''}"`).join(',')).join('\n');
    downloadText(csv, `${targetProcess?.name || 'process'}_waste.csv`, 'text/csv');
    toast.success('Waste CSV exported');
  };

  const exportObzervr = () => {
    // ── Helpers ───────────────────────────────────────────────────────────────
    const genId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

    const tenantId = localStorage.getItem('obzervr_tenant_id') || '00000000-0000-0000-0000-000000000000';
    const processName = (targetProcess?.name || 'Process').trim();

    // Build short ALL-CAPS code from first letters e.g. "SERVICE PERSON" → "SP"
    const makeCode = (str, max = 3) =>
      str.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean)
         .map(w => w[0].toUpperCase()).join('').slice(0, max) || 'GRP';

    // Standard hidden Temp section (required inside every wrapper group)
    const tempSection = (parentId, secIdent, fldIdent, label = 'Temp') => {
      const secId = genId(); const fldId = genId();
      return {
        IsHidden: true,
        Children: [{
          ParentId: secId, Type: 'Numeric', IsRequired: false, AllowSkipping: false,
          IsReadOnly: true, IsHidden: true, RowFillingId: 1, UOM: { IsRange: false },
          SetValues: [], Attachments: { InlinePhotos: [], Attachments: [] },
          Name: label, Identifier: fldIdent,
          IsTemplated: false, References: [], Archived: false, TemplateGroups: [],
          Id: fldId, TenantId: tenantId, InternalId: fldId, ObjectType: 'FieldFragment',
        }],
        ParentId: parentId, Name: label, Identifier: secIdent,
        IsTemplated: false, References: [], Archived: false, TemplateGroups: [],
        Id: secId, TenantId: tenantId, InternalId: secId, ObjectType: 'SectionFragment',
      };
    };

    // ── Filter steps by role if needed ───────────────────────────────────────
    // Exclude waste and waiting steps — internal analysis only, not exported to Obzervr
    const isWasteOrWaiting = (s) => {
      const cat = (s.tool_time_category || '').toLowerCase();
      return cat.startsWith('waste') || (Number(s.waiting_time) || 0) > 0;
    };

    const stepsToExport = (obzervrRoleFilter === 'all'
      ? targetSteps
      : targetSteps.filter(s =>
          (s.role || '').trim().toUpperCase() === obzervrRoleFilter.trim().toUpperCase()
        )
    ).filter(s => !isWasteOrWaiting(s));

    if (stepsToExport.length === 0) {
      toast.error('No steps match the selected role filter.');
      return;
    }

    // ── Group steps: first by Role, then by Section within each role ──────────
    const roleMap = new Map();
    stepsToExport.forEach(step => {
      const role = (step.role || 'GENERAL').trim().toUpperCase();
      if (!roleMap.has(role)) roleMap.set(role, new Map());
      const secMap = roleMap.get(role);
      const sec = (step.section || 'General').trim();
      if (!secMap.has(sec)) secMap.set(sec, []);
      secMap.get(sec).push(step);
    });

    // ── Build role groups (GRP-{roleCode}) ────────────────────────────────────
    const roleGroups = Array.from(roleMap.entries()).map(([roleName, secMap]) => {
      const roleGroupId = genId();
      const roleCode = makeCode(roleName, 3);

      // Content groups: one GroupFragment per section within this role
      const contentGroups = Array.from(secMap.entries()).map(([sectionName, steps]) => {
        const grpId   = genId();
        const secId   = genId();
        const secCode = makeCode(sectionName, 3);
        const codePrefix = `${roleCode}${secCode}`;

        // Step FieldFragments
        const stepFields = steps.map(step => {
          const fldId   = genId();
          const stepNum = String(step.step_number || 1).padStart(3, '0');
          const helpParts = [];
          if (step.notes?.trim())           helpParts.push(step.notes.trim());
          if (step.tools_required?.trim())  helpParts.push(`Tools: ${step.tools_required.trim()}`);
          if (step.parts_required?.trim())  helpParts.push(`Parts: ${step.parts_required.trim()}`);
          if (step.safety_controls?.trim()) helpParts.push(`Safety: ${step.safety_controls.trim()}`);
          // Preserve helper_text from original Obzervr import (round-trip) — append only if not already included
          if (step.helper_text?.trim() && !helpParts.includes(step.helper_text.trim()))
            helpParts.push(step.helper_text.trim());
          const helpText = helpParts.join('\n\n');
          // Re-use original Obzervr field identifier when available (round-trip import/export)
          const preservedIdent = step.obzervr_ident?.startsWith('FLD-') ? step.obzervr_ident : null;
          const f = {
            ParentId: secId, Type: 'Tiles', IsRequired: true, AllowSkipping: false,
            IsReadOnly: false, IsHidden: false, RowFillingId: 1,
            SetValues: [
              { Id: genId(), Value: 'Done',                 Sequence: 0, Reasons: [], ColourId: 10 },
              { Id: genId(), Value: 'Done (Work Required)', Sequence: 1, Reasons: [], Exception: { Priority: 'Medium' }, ColourId: 15 },
            ],
            Attachments: { InlinePhotos: [], Attachments: [] },
            Name: (step.task_description || `Step ${step.step_number}`).trim(),
            Identifier: preservedIdent || `FLD-${roleCode}-${secCode}${stepNum}`,
            IsTemplated: false, References: [], Archived: false, TemplateGroups: [],
            Id: fldId, TenantId: tenantId, InternalId: fldId, ObjectType: 'FieldFragment',
          };
          if (helpText) f.Information = { HelpText: helpText, PrefacePosition: 'BeforeName' };
          return f;
        });

        // Standard delay capture fields (appear at end of every section in Obzervr)
        const mkFld = (type, name, ident, extras = {}) => {
          const id = genId();
          return {
            ParentId: secId, Type: type, IsRequired: true, AllowSkipping: false,
            IsReadOnly: false, IsHidden: extras.hidden ?? false, RowFillingId: 1,
            ...(type === 'Notes'   ? { Notes: { Rows: 4 } } : {}),
            ...(type === 'Numeric' ? { UOM: { Symbol: 'HR', IsRange: false } } : {}),
            ...(extras.codeRef ? { CodeReference: extras.codeRef } : {}),
            SetValues: extras.setValues ?? [],
            Attachments: { InlinePhotos: [], Attachments: [] },
            Name: name, Identifier: ident,
            IsTemplated: false, References: [], Archived: false, TemplateGroups: [],
            Id: id, TenantId: tenantId, InternalId: id, ObjectType: 'FieldFragment',
          };
        };

        const delayFields = [
          mkFld('Tiles', 'Ensure Data Entry Is Up To Date', 'FLD-EAD', {
            setValues: [{ Id: genId(), Value: 'Confirm Data is Current', Sequence: 0, Reasons: [] }],
          }),
          mkFld('Tiles', 'Any Delays?', 'FLD-HAB-ADE', {
            codeRef: `${codePrefix}AnyDelays`,
            setValues: [
              { Id: genId(), Value: 'YES', Sequence: 0, Reasons: [], ColourId: 1 },
              { Id: genId(), Value: 'NO',  Sequence: 1, Reasons: [], ColourId: 10 },
            ],
          }),
          mkFld('Dropdown', 'Delay Reason', 'FLD-HAB-DRE', {
            hidden: true, codeRef: `${codePrefix}DelayReason`,
            setValues: [
              { Id: genId(), Value: '(ENV) Environment Delay', Sequence: 0, Reasons: [] },
              { Id: genId(), Value: '(EQU) Delay',             Sequence: 1, Reasons: [] },
              { Id: genId(), Value: '(LAB) Labour Delay',      Sequence: 2, Reasons: [] },
              { Id: genId(), Value: '(MAT) Material Delay',    Sequence: 3, Reasons: [] },
              { Id: genId(), Value: '(PER) Permit Delay',      Sequence: 4, Reasons: [] },
            ],
          }),
          mkFld('Notes',   'Delay Comments', 'FLD-HAB-DCO', { hidden: true, codeRef: `${codePrefix}DelayComments` }),
          mkFld('Numeric', 'Delay Duration', 'FLD-HAB-DDU', { hidden: true, codeRef: `${codePrefix}DelayDuration` }),
        ];

        // Section containing step fields + delay fields
        const sectionFragment = {
          IsHidden: false,
          Children: [...stepFields, ...delayFields],
          ParentId: grpId,
          Name: sectionName,
          Identifier: `SEC-${roleCode}-${secCode}`,
          IsTemplated: false, References: [], Archived: false, TemplateGroups: [],
          Id: secId, TenantId: tenantId, InternalId: secId, ObjectType: 'SectionFragment',
        };

        // Blockly visibility script — shows delay fields only when "Any Delays?" = YES
        const delayScript =
`if (context.HasFieldChanged(['${codePrefix}AnyDelays'])) {\n` +
`  if ((context.GetField('${codePrefix}AnyDelays').Value) == 'YES') {\n` +
`    if (('${codePrefix}DelayReason')) { context.SetFieldHidden(('${codePrefix}DelayReason'), !!false); }\n` +
`    if (('${codePrefix}DelayComments')) { context.SetFieldHidden(('${codePrefix}DelayComments'), !!false); }\n` +
`    if (('${codePrefix}DelayDuration')) { context.SetFieldHidden(('${codePrefix}DelayDuration'), !!false); }\n` +
`  } else {\n` +
`    if (('${codePrefix}DelayReason')) { context.SetFieldHidden(('${codePrefix}DelayReason'), !!true); }\n` +
`    if (('${codePrefix}DelayComments')) { context.SetFieldHidden(('${codePrefix}DelayComments'), !!true); }\n` +
`    if (('${codePrefix}DelayDuration')) { context.SetFieldHidden(('${codePrefix}DelayDuration'), !!true); }\n` +
`  }\n}\n`;

        return {
          IsSingleInstance: true, IsTimeBased: false, HasNamedReoccurences: false,
          AllowUncomplete: true, IsPreliminary: false, HasPriority: false,
          IsOptional: false, IsEntryGroup: false, IsCodeEnabled: true, IsListingGroup: false,
          CodeEditorDetails: {
            Xml: '<xml xmlns="https://developers.google.com/blockly/xml"></xml>',
            Script: delayScript,
            References: [
              { CodeReference: `${codePrefix}AnyDelays`,     ObjectType: 'FieldFragment' },
              { CodeReference: `${codePrefix}DelayReason`,   ObjectType: 'FieldFragment' },
              { CodeReference: `${codePrefix}DelayComments`, ObjectType: 'FieldFragment' },
              { CodeReference: `${codePrefix}DelayDuration`, ObjectType: 'FieldFragment' },
            ],
          },
          NamedReoccurences: [], SummaryFieldIds: [], Tags: [],
          Children: [sectionFragment], Groups: [],
          Name: sectionName, Identifier: `GRP-${roleCode}-${secCode}`,
          IsTemplated: false, References: [], Archived: false, TemplateGroups: [],
          Id: grpId, TenantId: tenantId, InternalId: grpId, ObjectType: 'GroupFragment',
        };
      });

      // Role group — one per trade, contains all its section groups
      return {
        IsSingleInstance: true, IsTimeBased: false, HasNamedReoccurences: false,
        AllowUncomplete: true, IsPreliminary: false, HasPriority: false,
        IsOptional: false, IsEntryGroup: false, IsCodeEnabled: false, IsListingGroup: false,
        CodeEditorDetails: { References: [] },
        NamedReoccurences: [], SummaryFieldIds: [], Tags: [],
        Children: [tempSection(roleGroupId, `SEC-${roleCode}-TDN`, `FLD-${roleCode}-TDN`, 'Temp (Do not remove)')],
        Groups: contentGroups,
        Name: roleName, Identifier: `GRP-${roleCode}`,
        IsTemplated: false, References: [], Archived: false, TemplateGroups: [],
        Id: roleGroupId, TenantId: tenantId, InternalId: roleGroupId, ObjectType: 'GroupFragment',
      };
    });

    // ── GRP-SOP wrapper (process name, contains all role groups) ─────────────
    const sopId = genId();
    const sopGroup = {
      IsSingleInstance: true, IsTimeBased: false, HasNamedReoccurences: false,
      AllowUncomplete: true, IsPreliminary: false, HasPriority: false,
      IsOptional: false, IsEntryGroup: false, IsCodeEnabled: false, IsListingGroup: false,
      CodeEditorDetails: { References: [] },
      NamedReoccurences: [], SummaryFieldIds: [], Tags: [],
      Children: [tempSection(sopId, 'SEC-SOP-TEM', 'FLD-SOP-TEE', 'Temp (Do not remove)')],
      Groups: roleGroups,
      Name: processName, Identifier: 'GRP-SOP',
      IsTemplated: false, References: [], Archived: false, TemplateGroups: [],
      Id: sopId, TenantId: tenantId, InternalId: sopId, ObjectType: 'GroupFragment',
    };

    // ── GRP-OPE outer wrapper — always named "OPERATION NAME" ────────────────
    const opeId = genId();
    const opeGroup = {
      IsSingleInstance: true, IsTimeBased: false, HasNamedReoccurences: false,
      AllowUncomplete: true, IsPreliminary: false, HasPriority: false,
      IsOptional: false, IsEntryGroup: false, IsCodeEnabled: false, IsListingGroup: false,
      CodeEditorDetails: { References: [] },
      NamedReoccurences: [], SummaryFieldIds: [], Tags: [],
      Children: [tempSection(opeId, 'SEC-OPE-TEM', 'FLD-OPE-TEM', 'Temp')],
      Groups: [sopGroup],
      Name: 'OPERATION NAME', Identifier: 'GRP-OPE',
      IsTemplated: false, References: [], Archived: false, TemplateGroups: [],
      Id: opeId, TenantId: tenantId, InternalId: opeId, ObjectType: 'GroupFragment',
    };

    const obzervr = {
      TenantId: tenantId,
      Template: {
        TemplateLink: obzervrTemplateLink.trim() || genId(),
        Identifier: processName,
        Name: processName,
        Code: makeCode(processName, 4),
        Sequence: 1,
        Description: [targetProcess?.fleet_class, targetProcess?.service_type]
          .filter(Boolean).join(' ') || 'Exported from HIO FlowBuilder',
        HideCategory: false, DisableLocationUpdate: false, HideStartDate: false,
        HideEndDate: false, HideStartTime: false, HideEndTime: false,
        HideFieldNotes: false, AllowImmediateCompletion: false,
        Phases: {
          Plan:     { Name: 'Plan',     Children: [] },
          Obzerv:   { Name: 'Obzerv',   Children: [opeGroup] },
          Complete: { Name: 'Complete', Children: [] },
        },
        SampleTypes: [], TemplateGroupIds: [], Version: '1.03',
        AssignmentPointReferences: [], AssignmentPointTypeReferences: [],
      },
      Attachments: [],
    };

    const roleLabel = obzervrRoleFilter === 'all'
      ? ''
      : `_${obzervrRoleFilter.replace(/\s+/g, '_')}`;
    downloadText(
      JSON.stringify(obzervr, null, 2),
      `${processName}${roleLabel}_obzervr.json`,
      'application/json'
    );
    toast.success('Obzervr JSON exported');
  };

  const exportPDF = async () => {
    setExportingPdf(true);
    try {
      const SHEET_SIZES = {
        a4: [210, 297], a3: [297, 420], a2: [420, 594], a1: [594, 841], a0: [841, 1189],
        letter: [216, 279], tabloid: [279, 432],
      };
      const PLOTTER_WIDTHS = {
        'plotter-a0': 841, 'plotter-a1': 594, 'plotter-a2': 420,
        'plotter-36in': 914, 'plotter-24in': 610,
      };

      const isPlotter = pdfPaper.startsWith('plotter-');
      const margin = 10;

      const headers = ['#', 'Task', 'Role', 'Duration', 'Manual', 'Walking', 'Waiting', 'Machine', 'Tool Time'];
      const rows = targetSteps.map(s => [
        s.step_number,
        s.task_description || '',
        s.role || '',
        getStepTotal(s),
        s.manual_time || '—',
        s.walking_time || '—',
        s.waiting_time || '—',
        s.machine_time || '—',
        s.tool_time_category ? s.tool_time_category.split('::')[1] : '—',
      ]);

      const colWeights = [4, 26, 12, 10, 10, 10, 10, 10, 12];
      const totalWeight = colWeights.reduce((a, b) => a + b, 0);
      const rowH = 6;
      const headerY = 22;

      let doc;
      let pageW;
      let pageH;

      if (isPlotter) {
        // Pre-compute total height needed for one continuous page
        pageW = PLOTTER_WIDTHS[pdfPaper];
        const printableW = pageW - margin * 2;
        const colW = colWeights.map(w => (w / totalWeight) * printableW);

        // Estimate height: title block + header row + sum of dynamic row heights + footer
        // We need a temporary doc just to call splitTextToSize for accurate row heights
        const probe = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageW, 1000] });
        probe.setFontSize(9);
        let totalRowsH = 0;
        const rowHeights = rows.map((row) => {
          const wrapped = probe.splitTextToSize(String(row[1]), colW[1] - 2);
          const h = Math.max(rowH, wrapped.length * 4 + 2);
          totalRowsH += h;
          return h;
        });

        pageH = margin + headerY + rowH + totalRowsH + margin + 10;
        doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageW, pageH] });

        // Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(`Process: ${targetProcess?.name || 'Process Export'}`, margin, margin + 6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text(`Fleet: ${targetProcess?.fleet_class || '—'} | Service: ${targetProcess?.service_type || '—'} | Version: ${targetProcess?.version || '1'} | ${new Date().toLocaleDateString()}`, margin, margin + 14);

        let y = margin + headerY;

        // Header row
        doc.setFillColor(0, 106, 157);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        let x = margin;
        headers.forEach((h, i) => {
          doc.rect(x, y, colW[i], rowH, 'F');
          doc.text(h, x + 1, y + 4, { maxWidth: colW[i] - 2 });
          x += colW[i];
        });
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        y += rowH;

        // Data rows — no page breaks needed, the page is sized for everything
        rows.forEach((row, rIdx) => {
          const dynRowH = rowHeights[rIdx];
          const wrapped = doc.splitTextToSize(String(row[1]), colW[1] - 2);
          let cx = margin;
          row.forEach((cell, i) => {
            doc.rect(cx, y, colW[i], dynRowH);
            if (i === 1) {
              doc.text(wrapped, cx + 1, y + 4, { maxWidth: colW[i] - 2 });
            } else {
              doc.text(String(cell), cx + 1, y + 4, { maxWidth: colW[i] - 2 });
            }
            cx += colW[i];
          });
          y += dynRowH;
        });

        doc.setFontSize(8);
        doc.text(`${pageW}mm plotter sheet — Generated ${new Date().toLocaleDateString()}`, margin, pageH - margin);
      } else {
        // Standard sheet — paginate as needed
        const [format, orient] = pdfPaper.split('-');
        const [shortEdge, longEdge] = SHEET_SIZES[format];
        pageW = orient === 'landscape' ? longEdge : shortEdge;
        pageH = orient === 'landscape' ? shortEdge : longEdge;
        doc = new jsPDF({ orientation: orient, unit: 'mm', format });

        const printableW = pageW - margin * 2;
        const colW = colWeights.map(w => (w / totalWeight) * printableW);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text(`Process: ${targetProcess?.name || 'Process Export'}`, margin, margin + 5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Fleet: ${targetProcess?.fleet_class || '—'} | Service: ${targetProcess?.service_type || '—'} | Version: ${targetProcess?.version || '1'} | ${new Date().toLocaleDateString()}`, margin, margin + 12);

        let y = margin + headerY;

        const drawHeader = () => {
          doc.setFillColor(0, 106, 157);
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          let x = margin;
          headers.forEach((h, i) => {
            doc.rect(x, y, colW[i], rowH, 'F');
            doc.text(h, x + 1, y + 4, { maxWidth: colW[i] - 2 });
            x += colW[i];
          });
          doc.setTextColor(0, 0, 0);
          doc.setFont('helvetica', 'normal');
          y += rowH;
        };
        drawHeader();

        rows.forEach((row) => {
          const wrapped = doc.splitTextToSize(String(row[1]), colW[1] - 2);
          const dynRowH = Math.max(rowH, wrapped.length * 4 + 2);
          if (y + dynRowH > pageH - margin - 6) {
            doc.setFontSize(8);
            doc.text(`Generated ${new Date().toLocaleDateString()}`, margin, pageH - margin);
            doc.addPage(format, orient);
            y = margin;
            drawHeader();
          }
          let x = margin;
          row.forEach((cell, i) => {
            doc.rect(x, y, colW[i], dynRowH);
            if (i === 1) {
              doc.text(wrapped, x + 1, y + 4, { maxWidth: colW[i] - 2 });
            } else {
              doc.text(String(cell), x + 1, y + 4, { maxWidth: colW[i] - 2 });
            }
            x += colW[i];
          });
          y += dynRowH;
        });

        doc.setFontSize(8);
        doc.text(`Generated ${new Date().toLocaleDateString()}`, margin, pageH - margin);
      }

      doc.save(`${targetProcess?.name || 'process'}_export.pdf`);
      localStorage.setItem('mm_swb_pdf_paper', pdfPaper);
      toast.success('PDF exported');
    } catch (err) {
      console.error(err);
      toast.error('PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  };

  const exports = [
    { label: 'Combination Table as CSV', icon: Table2, action: exportCSV, desc: 'Download step data as spreadsheet' },
    { label: 'Combination Table as PDF', icon: FileText, action: exportPDF, desc: 'Print-ready process document', loading: exportingPdf },
    { label: 'Full Process Data as JSON', icon: FileJson, action: exportJSON, desc: 'Complete process backup' },
    { label: 'Waste Summary as CSV', icon: BarChart3, action: exportWasteCSV, desc: 'DOWNTIME waste analysis' },
  ];

  return (
    <div className="space-y-6 max-w-[800px]">
      <div>
        <h2 className="text-lg font-semibold">Export Data</h2>
        <p className="text-sm text-muted-foreground mt-1">Download process data in various formats</p>
      </div>

      {/* Process Selector */}
      <Card>
        <CardContent className="p-4">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Select Process</label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger><SelectValue placeholder={activeProcess ? `Active: ${activeProcess.name}` : 'Select a process...'} /></SelectTrigger>
            <SelectContent>
              {processes.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Paper Size Selector */}
      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-muted-foreground">Paper size:</label>
        <select
          value={pdfPaper}
          onChange={(e) => setPdfPaper(e.target.value)}
          className="h-7 text-xs border border-border rounded px-1.5 bg-background"
        >
          <optgroup label="Standard">
            <option value="a4-landscape">A4 Landscape</option>
            <option value="a4-portrait">A4 Portrait</option>
            <option value="a3-landscape">A3 Landscape</option>
            <option value="a3-portrait">A3 Portrait</option>
            <option value="a2-landscape">A2 Landscape</option>
            <option value="a1-landscape">A1 Landscape</option>
            <option value="letter-landscape">Letter Landscape</option>
            <option value="tabloid-landscape">Tabloid Landscape</option>
          </optgroup>
          <optgroup label="Plotter (continuous length)">
            <option value="plotter-a0">A0 Plotter (841mm wide)</option>
            <option value="plotter-a1">A1 Plotter (594mm wide)</option>
            <option value="plotter-a2">A2 Plotter (420mm wide)</option>
            <option value="plotter-36in">36" Roll (914mm wide)</option>
            <option value="plotter-24in">24" Roll (610mm wide)</option>
          </optgroup>
        </select>
      </div>

       {/* Export Options */}
       <div className="grid gap-3">
        {exports.map((exp, i) => {
          const Icon = exp.icon;
          return (
            <Card key={i} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{exp.label}</p>
                    <p className="text-xs text-muted-foreground">{exp.desc}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={exp.action} className="gap-1.5" disabled={targetSteps.length === 0 || (exp.loading)}>
                   {exp.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} {exp.loading ? 'Generating…' : 'Export'}
                 </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {targetSteps.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No step data available. Open a process or create steps first.
        </p>
      )}

      {/* Obzervr Export Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileJson className="w-4 h-4" /> Obzervr JSON Export
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Exports a template JSON you can import into Obzervr R8.
            Steps are grouped by role and section, with standard delay capture fields included.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Export Role</label>
            <p className="text-xs text-muted-foreground">
              Choose which trade to include, or export all roles together.
            </p>
            <Select value={obzervrRoleFilter} onValueChange={setObzervrRoleFilter}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {roles.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {obzervrRoleFilter !== 'all' && (() => {
              const count = targetSteps.filter(s =>
                (s.role || '').trim().toUpperCase() === obzervrRoleFilter.trim().toUpperCase()
              ).length;
              return (
                <p className="text-xs text-muted-foreground">
                  {count} step{count !== 1 ? 's' : ''} will be exported for {obzervrRoleFilter}
                </p>
              );
            })()}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Work Package ID <span className="text-destructive">*</span></label>
            <p className="text-xs text-muted-foreground">
              The Work Package ID this template will be linked to in Obzervr.
              Create a stub template in Obzervr first, export it, then copy the
              TemplateLink UUID from that JSON and paste it here.
            </p>
            <input
              value={obzervrTemplateLink}
              onChange={e => {
                setObzervrTemplateLink(e.target.value);
                try { localStorage.setItem('obzervr_template_link', e.target.value.trim()); } catch {}
              }}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full h-8 text-sm font-mono px-3 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {!obzervrTemplateLink.trim() && (
              <p className="text-xs text-destructive">
                ⚠ Without a Work Package ID, Obzervr R8 will reject the import.
              </p>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={exportObzervr}
            disabled={targetSteps.length === 0}
            className="gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export Obzervr JSON
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
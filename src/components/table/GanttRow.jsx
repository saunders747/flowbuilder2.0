import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GripVertical, Trash2 } from 'lucide-react';
import { getRoleColour } from '@/hooks/useRoleColours';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const CELL_W = 18;
const ROW_H = 28;
const DEP_ARROW_COLOR = '#ef4444';
const UNASSIGNED_COLOR = '#e5e7eb';

const getBarColor = (cat, groups) => {
  if (!cat) return UNASSIGNED_COLOR;
  const gk = cat.split('::')[0];
  return groups[gk]?.color || UNASSIGNED_COLOR;
};

// Custom comparator — only re-render when step data or critical-path status actually changes.
// Stable parent callbacks (onUpdate, onBarMove, etc.) are recreated each render in CombinationTable,
// so comparing them by reference would cause every row to re-render on every keystroke.
function ganttRowAreEqual(prev, next) {
  // Always re-render if the step object changed (id, timing, or any field)
  if (prev.step !== next.step) return false;
  if (prev.stepIndex !== next.stepIndex) return false;
  if (prev.isOverlapping !== next.isOverlapping) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.numCols !== next.numCols) return false;
  if (prev.ganttPxWidth !== next.ganttPxWidth) return false;
  if (prev.cycleTimeTarget !== next.cycleTimeTarget) return false;
  if (prev.openDepStepId !== next.openDepStepId) return false;
  if (prev.nodeLayer !== next.nodeLayer) return false;
  if (prev.lockedBy !== next.lockedBy) return false;
  // cpData: only compare if the set of critical IDs has changed for THIS step
  const prevCrit = prev.cpData ? prev.cpData.criticalIds.has(prev.step.id) : false;
  const nextCrit = next.cpData ? next.cpData.criticalIds.has(next.step.id) : false;
  if (prevCrit !== nextCrit) return false;
  const prevFloat = prev.cpData ? prev.cpData.floatMap[prev.step.id] : null;
  const nextFloat = next.cpData ? next.cpData.floatMap[next.step.id] : null;
  if (prevFloat !== nextFloat) return false;
  // Shared config arrays — these rarely change, compare by reference only
  if (prev.roles !== next.roles) return false;
  if (prev.sections !== next.sections) return false;
  if (prev.toolTimeGroups !== next.toolTimeGroups) return false;
  if (prev.roleColours !== next.roleColours) return false;
  if (prev.colWidths !== next.colWidths) return false;
  if (prev.stickyLeft !== next.stickyLeft) return false;
  if (prev.mapLayers !== next.mapLayers) return false;
  // allStepsUnordered needed for dependency dropdown — only when dep dropdown is open for this row
  if (prev.openDepStepId === prev.step.id || next.openDepStepId === next.step.id) return false;
  return true;
}

function GanttRow({
  step, stepIndex, onUpdate, onBarMove, onDelete, onAddStep, ganttPxWidth,
  numCols, roles, sections, onAddSection, allSteps, visibleSteps,
  allStepsUnordered, toolTimeGroups, roleColours, colWidths,
  cycleTimeTarget, fillDown, isSelected, onToggleSelect, onDuplicate, stickyLeft = {},
  openDepStepId, setOpenDepStepId, cpData,
  mapLayers, nodeLayer, lockedBy, onEditingChange,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isSubStep = (step._total ?? 0) === 0;
  const total = step._total;
  const startCol = step._start;
  const barColor = getBarColor(step.tool_time_category, toolTimeGroups);
  const deps = step.dependencies || [];
  const durationInputRef = React.useRef(null);
  const [durationDraft, setDurationDraft] = React.useState(null);
  const [startDraft, setStartDraft] = React.useState(null);
  const [finishDraft, setFinishDraft] = React.useState(null);
  // Dep dropdown open state is lifted to parent so only ONE row can be open at a time
  const depDropdownOpen = openDepStepId === step.id;
  const depTriggerRef = React.useRef(null);
  const [depTriggerRect, setDepTriggerRect] = React.useState(null);
  const setDepDropdownOpen = (open) => {
    if (open && depTriggerRef.current) {
      setDepTriggerRect(depTriggerRef.current.getBoundingClientRect());
    }
    setOpenDepStepId(open ? step.id : null);
  };
  const [contextMenu, setContextMenu] = React.useState(null);

  React.useEffect(() => { setStartDraft(null); setFinishDraft(null); }, [step.id]);

  const barDragRef = React.useRef(null);
  const [barDrag, setBarDrag] = React.useState(null);
  const renderedStart = barDrag !== null ? barDrag.start : startCol;
  const renderedTotal = barDrag !== null ? barDrag.total : total;

  const [taskDraft, setTaskDraft] = React.useState(step.task_description || '');
  React.useEffect(() => { setTaskDraft(step.task_description || ''); }, [step.task_description]);

  // Returns true if adding depId → step.id would create a cycle
  const wouldCreateCycle = (candidateDepId) => {
    // BFS/DFS: can we reach step.id by following dependencies starting from candidateDepId?
    const visited = new Set();
    const queue = [candidateDepId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === step.id) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      const currentStep = allStepsUnordered.find(s => s.id === current);
      if (currentStep) (currentStep.dependencies || []).forEach(d => queue.push(d));
    }
    return false;
  };

  // Toggle a single dependency on/off (multi-select)
  const toggleDep = (depId) => {
    // Prevent circular dependencies
    if (!deps.includes(depId) && wouldCreateCycle(depId)) {
      toast.error('Cannot add this dependency — it would create a circular reference');
      return;
    }
    const newDeps = deps.includes(depId)
      ? deps.filter(d => d !== depId)
      : [...deps, depId];
    const allDepSteps = newDeps.map(id =>
      allStepsUnordered?.find(s => s.id === id) || allSteps.find(s => s.id === id)
    ).filter(Boolean);
    const maxFinish = allDepSteps.length > 0
      ? Math.max(...allDepSteps.map(s => s._finish || 0))
      : 0;
    onUpdate({
      dependencies: newDeps,
      // When deps active: anchor bar at maxFinish with override so cascade doesn't fight it.
      // When no deps: reset to 0, no override.
      start_time: maxFinish,
      start_time_override: newDeps.length > 0,
      start_offset: 0,
    });
  };

  const clearAllDeps = () => {
    onUpdate({ dependencies: [], start_time: 0, start_time_override: false, start_offset: 0 });
  };

  const depSteps = allStepsUnordered
    .filter(s => deps.includes(s.id))
    .sort((a, b) => (a.step_number||0) - (b.step_number||0));

  const handleBarMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const origStart = startCol;
    const origTotal = total;
    const onMouseMove = (me) => {
      const colDelta = Math.round((me.clientX - startX) / CELL_W);
      const newStart = Math.max(0, Math.min(numCols - origTotal, origStart + colDelta));
      barDragRef.current = { start: newStart, total: origTotal };
      setBarDrag({ start: newStart, total: origTotal });
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      const final = barDragRef.current;
      setBarDrag(null);
      barDragRef.current = null;
      if (final !== null) onBarMove(final.start, undefined);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const tradeColour    = getRoleColour(step.role, roleColours);
  const isCritical     = cpData ? cpData.criticalIds.has(step.id) : false;
  const stepFloat      = cpData ? (cpData.floatMap[step.id] ?? null) : null;
  const isNearCritical = !isCritical && stepFloat !== null && stepFloat <= 10;
  const stickyBg = isSelected ? '#EFF6FF' : '#ffffff';
  const sticky = (left) => stickyLeft && stickyLeft.checkbox !== undefined ? { position: 'sticky', left, backgroundColor: stickyBg, zIndex: 10 } : {};

  return (
    <tr
      ref={setNodeRef}
      data-step-row
      style={{ ...dragStyle, borderLeft: `3px solid ${tradeColour}` }}
      {...attributes}

      className={`border-b group transition-colors border-border/40 ${!isDragging ? 'hover:bg-muted/20' : ''} ${isSubStep ? 'opacity-70 italic' : ''} ${isSelected ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : ''} ${isCritical && !isSelected ? 'bg-red-50/50 dark:bg-red-950/20' : ''} ${isNearCritical && !isSelected ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}`}
    >
      <td style={{ width:28, minWidth:28, ...sticky(stickyLeft.checkbox) }} className="border border-border/30 p-1 text-center">
        <input type="checkbox" checked={!!isSelected}
          onChange={(e) => { e.stopPropagation(); onToggleSelect(); }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          className="cursor-pointer w-3.5 h-3.5 accent-primary" />
      </td>
      <td
        className="border border-border/30 p-1 text-center font-mono font-medium text-[10px] relative transition-colors text-muted-foreground hover:bg-muted/50"
        style={{ width: colWidths.stepNum, ...sticky(stickyLeft.stepNum) }}
      >
        <div className="flex items-center justify-center gap-0.5">
          {/* Drag handle is the ONLY element with DnD listeners — prevents listener stealing button clicks */}
          <span className="cursor-grab active:cursor-grabbing touch-none" {...listeners}>
            <GripVertical className="w-3 h-3" />
          </span>
          <span className="font-bold">{step.step_number}</span>
          <button
              onClick={(e) => { e.stopPropagation(); onDuplicate?.(); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 p-0.5 hover:bg-primary/20 rounded text-primary text-[11px]"
              title="Duplicate step">⧉</button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 p-0.5 hover:bg-destructive/20 rounded text-destructive"
            title="Delete step"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </td>

      <td className="border border-border/30 p-0.5 text-center relative group/fill" style={{ width: colWidths.section, ...sticky(stickyLeft.section) }}>
        <Select value={step.section || ''} onValueChange={v => onUpdate({ section: v })}>
          <SelectTrigger className="h-6 text-[10px] border-0 bg-transparent px-1 w-full focus:ring-0">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={null} className="text-xs">—</SelectItem>
            {sections.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div
          className="absolute bottom-0 right-0 w-2 h-2 bg-primary cursor-crosshair opacity-0 group-hover/fill:opacity-80 z-10"
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); fillDown(step.id, 'section', step.section || ''); }}
          title="Drag down to fill"
        />
      </td>

      <td className="border border-border/30 p-0.5" style={{ width: colWidths.description, ...sticky(stickyLeft.description) }}>
        <div className={isSubStep ? 'pl-5 flex items-center gap-1' : ''}>
          {isSubStep && <span className="text-muted-foreground text-[10px]">↳</span>}
          <input value={taskDraft}
            onChange={e => setTaskDraft(e.target.value)}
            onBlur={() => {
              if (taskDraft !== (step.task_description || '')) onUpdate({ task_description: taskDraft });
            }}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
            className="w-full text-xs bg-transparent outline-none px-1 py-0.5 focus:bg-card rounded" />
        </div>
      </td>

      <td className="border border-border/30 p-0.5 text-center relative group/fill" style={{ width: colWidths.role, ...sticky(stickyLeft.role), ...(stickyLeft.role !== undefined ? { boxShadow: '2px 0 6px -2px rgba(0,0,0,0.15)' } : {}) }}>
        <Select value={step.role || ''} onValueChange={v => onUpdate({ role: v })}>
          <SelectTrigger className="h-6 text-[10px] border-0 bg-transparent px-1 w-full focus:ring-0">
            <div className="flex items-center gap-1 min-w-0">
              {step.role && (
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getRoleColour(step.role, roleColours) }} />
              )}
              <SelectValue placeholder="—" />
            </div>
          </SelectTrigger>
          <SelectContent>
            {roles.map(r => (
              <SelectItem key={r} value={r} className="text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getRoleColour(r, roleColours) }} />
                  {r}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div
          className="absolute bottom-0 right-0 w-2 h-2 bg-primary cursor-crosshair opacity-0 group-hover/fill:opacity-80 z-10"
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); fillDown(step.id, 'role', step.role || ''); }}
          title="Drag down to fill"
        />
      </td>

      <td className="border border-border/30 p-0.5" style={{ width: colWidths.start }}>
        <input
          type="number" min={0}
          value={startDraft !== null ? startDraft : Math.round(step._start)}
          onChange={e => setStartDraft(e.target.value)}
          onBlur={e => {
            const val = Number(e.target.value);
            if (!isNaN(val) && val >= 0) onBarMove(val, undefined);
            setStartDraft(null);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
            if (e.key === 'Escape') { setStartDraft(null); e.target.blur(); }
          }}
          title="Start time (min) — sets bar position and marks as manually overridden"
          className="w-full text-[10px] bg-transparent outline-none px-1 py-0.5 text-center focus:bg-card rounded"
          placeholder="0"
        />
      </td>

      <td className="border border-border/30 p-0.5 text-center" style={{ width: colWidths.duration }}>
        {isSubStep
          ? <span className="text-[10px] text-muted-foreground">—</span>
          : <input
              ref={durationInputRef}
              data-duration-index={stepIndex}
              type="number"
              min={1}
              value={durationDraft !== null ? durationDraft : (total || '')}
              onChange={e => setDurationDraft(e.target.value)}
              onBlur={e => {
                const val = Number(e.target.value);
                if (val >= 1) onBarMove(step._start, val);
                setDurationDraft(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.target.blur();
                  const nextInput = document.querySelector(`input[data-duration-index="${stepIndex + 1}"]`);
                  if (nextInput) nextInput.focus();
                } else if (e.key === 'Escape') {
                  setDurationDraft(null);
                  e.target.blur();
                }
              }}
              className="w-full text-[10px] bg-transparent outline-none px-1 py-0.5 text-center focus:bg-card rounded"
              placeholder="0"
            />
        }
      </td>

      <td className="border border-border/30 p-0.5" style={{ width: colWidths.finish }}>
        <input
          type="number" min={0}
          value={finishDraft !== null ? finishDraft : Math.round(step._finish)}
          onChange={e => setFinishDraft(e.target.value)}
          onBlur={e => {
            const val = Number(e.target.value);
            const newDuration = val - Math.round(step._start);
            if (!isNaN(val) && newDuration >= 1) onBarMove(step._start, newDuration);
            setFinishDraft(null);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
            if (e.key === 'Escape') { setFinishDraft(null); e.target.blur(); }
          }}
          title="Finish time (min) — adjusts duration proportionally across all time fields"
          className="w-full text-[10px] bg-transparent outline-none px-1 py-0.5 text-center focus:bg-card rounded"
          placeholder="0"
        />
      </td>

      <td className="border border-border/30 p-0.5" style={{ width: colWidths.category }}>
        <div className="flex items-center gap-1">
          <Select value={step.tool_time_category || ''} onValueChange={(v) => onUpdate({ tool_time_category: v })}>
            <SelectTrigger className="h-6 text-[10px] border-0 bg-transparent px-1 flex-1 focus:ring-0">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(toolTimeGroups).map(([gKey, group]) => (
                <React.Fragment key={gKey}>
                  {group.subcategories.map(sub => (
                    <SelectItem key={`${gKey}::${sub}`} value={`${gKey}::${sub}`} className="text-xs">
                      {group.label} → {sub}
                    </SelectItem>
                  ))}
                </React.Fragment>
              ))}
            </SelectContent>
          </Select>
          {step.tool_time_category === 'waste::Waiting for Others' && (step.waiting_time || 0) > 0 && (
            <span className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-1 rounded font-mono flex-shrink-0"
              title="Auto-categorised from waiting time">W</span>
          )}
        </div>
      </td>

      <td className="border border-border/30 p-0.5 text-center relative group/fill" style={{ width: colWidths.intext }}>
        <select
          value={step.internal_external ?? ''}
          onChange={e => {
            e.stopPropagation();
            onUpdate({ internal_external: e.target.value || null });
          }}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          className="h-6 w-full text-[10px] bg-transparent border-0 outline-none px-1 rounded focus:bg-card cursor-pointer"
          style={{
            color: step.internal_external === 'Internal' ? '#2563EB'
              : step.internal_external === 'External' ? '#059669'
              : '#94a3b8',
          }}
        >
          <option value="">—</option>
          <option value="Internal" style={{ color: '#2563EB' }}>Internal</option>
          <option value="External" style={{ color: '#059669' }}>External</option>
        </select>
        <div
          className="absolute bottom-0 right-0 w-2 h-2 bg-primary cursor-crosshair opacity-0 group-hover/fill:opacity-80 z-10"
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); fillDown(step.id, 'internal_external', step.internal_external ?? null); }}
          title="Drag down to fill"
        />
      </td>

      <td className="border border-border/30 p-0.5 text-center relative group/fill" style={{ width: colWidths.layer }}>
        <div className="flex flex-col items-center justify-center">
          <select
            value={nodeLayer || 'layer-ground'}
            onChange={(e) => {
              const event = new CustomEvent('hio:changelayer', {
                detail: { stepId: step.id, layerId: e.target.value },
                bubbles: true
              });
              e.target.dispatchEvent(event);
            }}
            onPointerDown={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            className="h-6 w-full text-[10px] bg-transparent border-0 outline-none px-1 rounded focus:bg-card cursor-pointer"
          >
            {(mapLayers || [{id:'layer-ground',name:'Ground Level'}]).map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          {lockedBy && (
            <span className="text-[8px] text-amber-600 dark:text-amber-400 font-medium mt-0.5">
              🔒 {lockedBy.userName.split(' ')[0]}
            </span>
          )}
        </div>
      </td>

      <td className="border border-border/30 p-0.5 relative" style={{ width: colWidths.dependency }}>
         {/* Trigger — matches role/section Select trigger style */}
        <button
          ref={depTriggerRef}
          type="button"
          onClick={() => setDepDropdownOpen(!depDropdownOpen)}
          className={`h-6 w-full flex items-center justify-between gap-1 px-1 rounded text-[10px] bg-transparent hover:bg-muted/30 transition-colors ${depDropdownOpen ? 'ring-1 ring-ring' : ''}`}
        >
          <span className="flex items-center gap-0.5 flex-wrap flex-1 min-w-0 overflow-hidden">
            {depSteps.length > 0
              ? depSteps.map(s => (
                  <span key={s.id} className="inline-flex items-center gap-0.5 rounded px-1 font-mono text-[9px] bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 shrink-0">
                    #{s.step_number}
                  </span>
                ))
              : <span className="italic text-[10px] opacity-40 text-muted-foreground">none</span>
            }
          </span>
          <svg className="w-3 h-3 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>

        {/* Dropdown — rendered via portal to escape table overflow clipping */}
        {depDropdownOpen && depTriggerRect && createPortal(
          <>
            <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setDepDropdownOpen(false)} />
            <div style={{
              position: 'fixed',
              top: depTriggerRect.bottom + 2,
              left: depTriggerRect.left,
              minWidth: 264,
              maxHeight: 300,
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              zIndex: 9999,
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
                <span className="text-[10px] font-semibold" style={{ color: '#64748b' }}>Depends on</span>
                {deps.length > 0 && (
                  <button type="button"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); clearAllDeps(); setDepDropdownOpen(false); }}
                    className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: '#dc2626' }}>
                    Clear all
                  </button>
                )}
              </div>

              {/* None row */}
              <div role="option" aria-selected={deps.length === 0}
                onMouseDown={e => e.preventDefault()}
                onClick={e => { e.stopPropagation(); clearAllDeps(); setDepDropdownOpen(false); }}
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none"
                style={{ background: deps.length === 0 ? '#eff6ff' : '#ffffff' }}
                onMouseEnter={e => { e.currentTarget.style.background = deps.length === 0 ? '#eff6ff' : '#f1f5f9'; }}
                onMouseLeave={e => { e.currentTarget.style.background = deps.length === 0 ? '#eff6ff' : '#ffffff'; }}>
                <span style={{
                  width:12, height:12, borderRadius:3,
                  border: deps.length === 0 ? '1.5px solid #2563eb' : '1.5px solid #cbd5e1',
                  background: deps.length === 0 ? '#2563eb' : '#ffffff',
                  display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0
                }}>
                  {deps.length === 0 && <svg width="7" height="7" viewBox="0 0 7 7"><path d="M1 3.5l2 2 3-3" stroke="#fff" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>}
                </span>
                <span className="text-[10px]" style={{ color: '#64748b', fontStyle: 'italic' }}>None — free position, starts at 0</span>
              </div>

              <div style={{ height: 1, background: '#e2e8f0' }} />

              {/* Step list — use div not label to prevent double-fire (label+input both trigger onClick) */}
              <div className="overflow-y-auto" style={{ maxHeight: 210, background: '#ffffff' }}>
                {[...allStepsUnordered]
                  .filter(s => s.id !== step.id)
                  .sort((a, b) => (a.step_number||0) - (b.step_number||0))
                  .map(s => {
                    const selected = deps.includes(s.id);
                    const isCyclic = !selected && wouldCreateCycle(s.id);
                    const catLower = (s.tool_time_category || '').toLowerCase();
                    const dotColor = catLower.startsWith('tooltime') ? '#1B7A3F'
                      : catLower.startsWith('nva') ? '#d97706'
                      : catLower.startsWith('waste') ? '#dc2626'
                      : '#94a3b8';
                    return (
                      <div key={s.id}
                        role="option"
                        aria-selected={selected}
                        aria-disabled={isCyclic}
                        onMouseDown={e => e.preventDefault()}
                        onClick={e => { e.stopPropagation(); if (!isCyclic) toggleDep(s.id); }}
                        className={`flex items-center gap-2 px-3 py-1.5 select-none ${isCyclic ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                        style={{ background: selected ? '#eff6ff' : '#ffffff' }}
                        onMouseEnter={e => { if (!isCyclic) e.currentTarget.style.background = selected ? '#eff6ff' : '#f1f5f9'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = selected ? '#eff6ff' : '#ffffff'; }}
                        title={isCyclic ? 'Would create a circular dependency' : undefined}>
                        {/* Custom checkbox visual */}
                        <span style={{
                          width:12, height:12, borderRadius:3, border: selected ? '1.5px solid #2563eb' : '1.5px solid #cbd5e1',
                          background: selected ? '#2563eb' : '#ffffff',
                          display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0
                        }}>
                          {selected && <svg width="7" height="7" viewBox="0 0 7 7"><path d="M1 3.5l2 2 3-3" stroke="#fff" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>}
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                        <span className="font-mono font-bold text-[10px] shrink-0" style={{ color: dotColor }}>#{s.step_number}</span>
                        <span className="truncate text-[10px] flex-1" style={{ color: '#1e293b' }}>{(s.task_description || '—').substring(0, 32)}</span>
                        {s._finish !== undefined && (
                          <span className="font-mono text-[9px] shrink-0" style={{ color: '#94a3b8' }}>{Math.round(s._finish)}m</span>
                        )}
                      </div>
                    );
                  })
                }
              </div>

              {/* Footer */}
              {deps.length > 0 && (
                <div className="flex items-center justify-between px-3 py-1.5 text-[9px]" style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc', color: '#94a3b8' }}>
                  <span>{deps.length} dep{deps.length !== 1 ? 's' : ''} selected</span>
                  <span className="font-mono">starts after {Math.round(Math.max(...depSteps.map(s => s._finish || 0)))}m</span>
                </div>
              )}
            </div>
          </>, document.body
        )}
      </td>

      <td colSpan={numCols} style={{ padding: 0, height: ROW_H, position: 'relative', background: 'transparent', overflow: 'visible', width: ganttPxWidth ? `${ganttPxWidth}px` : undefined, minWidth: ganttPxWidth ? `${ganttPxWidth}px` : undefined }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `repeating-linear-gradient(to right, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent ${CELL_W * 5 - 1}px, rgba(0,0,0,0.12) ${CELL_W * 5 - 1}px, rgba(0,0,0,0.12) ${CELL_W * 5}px)`,
          backgroundSize: `${CELL_W * 5}px 100%`,
        }} />

        {deps.length > 0 && (() => {
          const toX = step._start * CELL_W;
          const toY = ROW_H / 2;
          const arrows = deps.map(depId => {
            const depVisibleIdx = visibleSteps.findIndex(s => s.id === depId);
            if (depVisibleIdx === -1) return null;
            const dep = visibleSteps[depVisibleIdx];
            const fromX = dep._finish * CELL_W;
            const fromY = (depVisibleIdx - stepIndex) * ROW_H + ROW_H / 2;
            const dx = Math.max(20, Math.abs(toX - fromX) * 0.3);
            const d = `M${fromX},${fromY} C${fromX + dx},${fromY} ${toX - dx},${toY} ${toX},${toY}`;
            return { d, key: depId };
          }).filter(Boolean);
          if (arrows.length === 0) return null;
          const markerId = `arrowhead-${step.id}`;
          return (
            <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5, overflow: 'visible' }}>
              <defs>
                <marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill={DEP_ARROW_COLOR} />
                </marker>
              </defs>
              {arrows.map(a => (
                <path key={a.key} d={a.d} fill="none" stroke={DEP_ARROW_COLOR}
                      strokeWidth={1.5} strokeOpacity={0.75}
                      markerEnd={`url(#${markerId})`} />
              ))}
            </svg>
          );
        })()}

        {isSubStep ? (
          <div className="absolute top-1 bottom-1 w-0.5 rounded"
            style={{ left: `${renderedStart * CELL_W}px`, backgroundColor: barColor, opacity: 0.4 }} />
        ) : renderedTotal > 0 && (
          <div style={{ position: 'absolute', left: renderedStart * CELL_W, top: 3, bottom: 3, width: renderedTotal * CELL_W, borderRadius: 4, userSelect: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', overflow: 'visible' }}>
            <div onMouseDown={(e) => {
              e.preventDefault(); e.stopPropagation();
              const startX = e.clientX; const origStart = startCol; const origTotal = total;
              const dragRef = { start: origStart, total: origTotal };
              const onMove = (me) => {
                const rawDelta = Math.round((me.clientX - startX) / CELL_W);
                const colDelta = Math.max(-origStart, rawDelta);
                dragRef.start = origStart + colDelta;
                dragRef.total = Math.max(1, origTotal - colDelta);
                setBarDrag({ start: dragRef.start, total: dragRef.total });
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                setBarDrag(null);
                onBarMove(dragRef.start, dragRef.total);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 7, cursor: 'ew-resize', zIndex: 3, background: 'rgba(0,0,0,0.2)', borderRadius: '4px 0 0 4px' }} />

            <div onMouseDown={handleBarMouseDown}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
              style={{
                position: 'absolute', inset: 0, cursor: 'grab', background: barColor, borderRadius: 4, zIndex: 1,
                ...(isCritical
                  ? { boxShadow: '0 0 0 2px #dc2626, 0 1px 4px rgba(220,38,38,0.4)' }
                  : isNearCritical
                    ? { boxShadow: '0 0 0 1.5px #d97706, 0 1px 3px rgba(217,119,6,0.3)' }
                    : { boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }),
              }}
              title={`${step.tool_time_category ? step.tool_time_category.split('::')[1] : 'Unassigned'}${isCritical ? ' · ◆ CRITICAL PATH (0m float)' : stepFloat !== null ? ` · Float: ${stepFloat}m` : ''}`}>
              {total >= 3 && (
                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 9, fontWeight: 700, color: 'rgba(0,0,0,0.5)', pointerEvents: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2 }}>
                  {isCritical && <span style={{ color: '#dc2626', fontSize: 8 }}>◆</span>}
                  #{step.step_number}
                </span>
              )}
              {isCritical && total >= 6 && (
                <span style={{ position: 'absolute', top: 1, left: '50%', transform: 'translateX(-50%)', fontSize: 8, fontWeight: 800, color: 'rgba(220,38,38,0.65)', pointerEvents: 'none', userSelect: 'none', letterSpacing: 0.5 }}>CP</span>
              )}
              {step.start_time_override && (
                <span
                  title="Manually positioned — click to restore auto-cascade"
                  onClick={(e) => { e.stopPropagation(); onUpdate({ start_time_override: false, start_offset: 0 }); }}
                  style={{ position: 'absolute', top: 1, right: 3, fontSize: 10, cursor: 'pointer', color: 'rgba(255,255,255,0.85)', userSelect: 'none', lineHeight: 1 }}
                >
                  📌
                </span>
              )}
            </div>
            {/* Float extension bar — dashed tail showing slack */}
            {cpData && stepFloat !== null && stepFloat > 0.5 && renderedTotal > 0 && (
              <div style={{
                position: 'absolute',
                left: (renderedStart + renderedTotal) * CELL_W,
                top: 5, bottom: 5,
                width: Math.min(stepFloat, 80) * CELL_W,
                borderRadius: '0 3px 3px 0',
                background: isNearCritical
                  ? 'repeating-linear-gradient(90deg,#fde68a 0,#fde68a 3px,transparent 3px,transparent 6px)'
                  : 'repeating-linear-gradient(90deg,#cbd5e1 0,#cbd5e1 3px,transparent 3px,transparent 6px)',
                opacity: 0.7, pointerEvents: 'none', zIndex: 0,
              }} title={`Float: ${stepFloat}m — can slip ${stepFloat}m before delaying project finish`} />
            )}
            {cpData && stepFloat !== null && stepFloat > 0.5 && renderedTotal >= 2 && (
              <span style={{
                position: 'absolute',
                left: (renderedStart + renderedTotal + Math.min(stepFloat, 80)) * CELL_W + 2,
                top: '50%', transform: 'translateY(-50%)',
                fontSize: 8, fontWeight: 600,
                color: isNearCritical ? '#d97706' : '#94a3b8',
                pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap',
              }}>+{stepFloat}m</span>
            )}

            <div onMouseDown={(e) => {
              e.preventDefault(); e.stopPropagation();
              const startX = e.clientX; const origTotal = total;
              let newTotal = origTotal;
              const onMove = (me) => {
                const colDelta = Math.round((me.clientX - startX) / CELL_W);
                newTotal = Math.max(1, origTotal + colDelta);
                setBarDrag({ start: startCol, total: newTotal });
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                setBarDrag(null);
                onBarMove(startCol, newTotal);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 7, cursor: 'ew-resize', zIndex: 3, background: 'rgba(0,0,0,0.2)', borderRadius: '0 4px 4px 0' }} />
          </div>
        )}
      </td>

      {contextMenu && (
        <>
          <div
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
            style={{ position: 'fixed', inset: 0, zIndex: 50 }}
          />
          <div style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 51,
            background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))',
            border: '1px solid hsl(var(--border))', borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 180, padding: 4, fontSize: 12,
          }}>
            <button
              className="w-full text-left px-2 py-1.5 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!step.start_time_override}
              onClick={() => { onUpdate({ start_time_override: false, start_offset: 0 }); setContextMenu(null); }}
            >
              Reset to auto-cascade
            </button>
            <button
              className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-destructive"
              onClick={() => { onDelete(); setContextMenu(null); }}
            >
              Delete step
            </button>
          </div>
        </>
      )}
    </tr>
  );
}

export default React.memo(GanttRow, ganttRowAreEqual);
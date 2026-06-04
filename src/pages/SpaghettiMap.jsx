import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useProcess } from '@/lib/processContext';
import { useRoles } from '@/hooks/useRoles';
import { useSections } from '@/hooks/useSections';
import { useRoleColours, getRoleColour } from '@/hooks/useRoleColours';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, X, Map } from 'lucide-react';
import { useSensors, useSensor, PointerSensor, DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useToolTimeCategories } from '@/hooks/useToolTimeCategories';
import { getStepTotal, cascadeTimings } from '@/hooks/useMultiProcessTable';
import { getStoredToolTimeGroups } from '@/hooks/useToolTimeCategories';
import ProcessSelector from '@/components/ProcessSelector';
import Toolbar from '@/components/SpaghettiMap/Toolbar';
import LeftPanel from '@/components/SpaghettiMap/LeftPanel';
import Canvas from '@/components/SpaghettiMap/Canvas';

import { buildEdgePath, getMidpoint, dist, totalPathDist, nearestNeighbourTSP } from '@/lib/spaghettiMapUtils';

const NODE_R = 16;
const GRID = 20;

function snap(v) { return Math.round(v / GRID) * GRID; }

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}



function SpaghettiCycleChart({ stepsWithTiming, roleColours }) {
  const groups = React.useMemo(() => getStoredToolTimeGroups(), []);

  const { lanes, maxEnd } = React.useMemo(() => {
    if (!stepsWithTiming || stepsWithTiming.length === 0) return { lanes: [], maxEnd: 0 };
    const roleMap = {}; const roleOrder = {};
    const sorted = [...stepsWithTiming].sort((a, b) => a.step_number - b.step_number);
    sorted.forEach((step, idx) => {
      const role = step.role || 'Unassigned';
      if (!(role in roleOrder)) roleOrder[role] = idx;
      if (!roleMap[role]) roleMap[role] = { bars: [], total: 0 };
      const dur = step._total || 0;
      const color = !step.tool_time_category ? '#94a3b8'
        : groups[step.tool_time_category.split('::')[0]]?.color || '#94a3b8';
      roleMap[role].bars.push({
        stepNumber: step.step_number, task: step.task_description || '',
        duration: dur, start: step._start || 0, color,
      });
      roleMap[role].total += dur;
    });
    let maxEnd = 0;
    Object.values(roleMap).forEach(r => r.bars.forEach(b => {
      if (b.start + b.duration > maxEnd) maxEnd = b.start + b.duration;
    }));
    const lanes = Object.entries(roleMap)
      .sort(([a], [b]) => roleOrder[a] - roleOrder[b])
      .map(([role, d]) => ({
        role, bars: d.bars, total: d.total,
        idle: Math.max(0, maxEnd - d.total),
      }));
    return { lanes, maxEnd };
  }, [stepsWithTiming, groups]);

  if (!lanes.length) return null;
  const scale = Math.max(maxEnd, 1);

  return (
    <div className="bg-card border-b border-border px-4 py-2 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold">Live Cycle Time</span>
        <span className="text-xs text-muted-foreground font-mono">{Math.round(maxEnd)}m total</span>
      </div>
      <div className="flex items-center mb-1 gap-1">
        <div className="w-24 shrink-0" />
        <div className="flex-1 relative h-4 border-b border-border/50">
          {[0, 25, 50, 75, 100].map(pct => (
            <div key={pct} className="absolute flex flex-col items-center"
              style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}>
              <div className="w-px h-1.5 bg-border" />
              <span className="text-[8px] text-muted-foreground">{Math.round((pct/100)*scale)}m</span>
            </div>
          ))}
        </div>
        <div className="w-28 shrink-0" />
      </div>
      <div className="space-y-0.5">
        {lanes.map(lane => (
          <div key={lane.role} className="flex items-center gap-1 h-6">
            <div className="w-24 shrink-0 flex items-center justify-end gap-1.5">
              <span className="text-[10px] font-medium truncate">{lane.role}</span>
              <span className="w-2 h-2 rounded-full shrink-0"
                style={{ background: getRoleColour(lane.role, roleColours) }} />
            </div>
            <div className="flex-1 relative h-5 bg-muted/30 rounded-sm overflow-hidden">
              {lane.bars.map((bar, bi) => (
                <div key={bi} className="absolute top-0.5 bottom-0.5 rounded-sm"
                  style={{
                    left: `${(bar.start / scale) * 100}%`,
                    width: `${Math.max((bar.duration / scale) * 100, 0.3)}%`,
                    backgroundColor: bar.color, minWidth: bar.duration > 0 ? 2 : 0,
                  }}
                  title={`Step ${bar.stepNumber}: ${bar.task} — ${bar.duration}m`} />
              ))}
            </div>
            <div className="w-28 shrink-0 text-[9px] text-muted-foreground text-right">
              <span className="text-foreground font-semibold">{lane.total}m</span>
              <span className="ml-1">{lane.idle}m idle</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 pt-1 mt-1 border-t border-border/20">
        {Object.entries(groups).map(([k, g]) => (
          <div key={k} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ background: g.color }} />
            <span className="text-[9px] text-muted-foreground">{g.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatMapChart({ stepsWithTiming, visibleSteps, nodes }) {
  const data = React.useMemo(() => {
    if (!stepsWithTiming.length || !visibleSteps.length) return [];
    const OVERLAP_DIST = 200;
    const sorted = [...visibleSteps].sort((a, b) => a.step_number - b.step_number);
    return sorted.map(step => {
      const timed = stepsWithTiming.find(s => s.id === step.id);
      if (!timed) return { step, dur: 0, overlaps: 0, color: '#22c55e' };
      const pos = nodes[step.id] || { x: 0, y: 0 };
      let overlaps = 0;
      visibleSteps.forEach(other => {
        if (other.id === step.id) return;
        const ot = stepsWithTiming.find(s => s.id === other.id);
        if (!ot) return;
        if (!(timed._start < ot._finish && ot._start < timed._finish)) return;
        const op = nodes[other.id] || { x: 0, y: 0 };
        if (Math.hypot(pos.x - op.x, pos.y - op.y) < OVERLAP_DIST) overlaps++;
      });
      return { step, dur: timed._total || 0, overlaps,
        color: overlaps === 0 ? '#22c55e' : overlaps === 1 ? '#f59e0b' : '#ef4444' };
    });
  }, [stepsWithTiming, visibleSteps, nodes]);

  if (!data.length) return null;
  const maxDur = Math.max(...data.map(d => d.dur), 1);
  const conflicts = data.filter(d => d.overlaps > 0).length;

  return (
    <div className="bg-card border-b border-border px-4 py-2 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">Role Overlap Heat Map</span>
          {conflicts > 0 && (
            <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">
              {conflicts} conflict{conflicts !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />No overlap</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />1 overlap</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />2+ overlaps</span>
        </div>
      </div>
      <div className="flex items-end gap-px h-12 bg-muted/20 rounded px-1 pt-1">
        {data.map(({ step, dur, overlaps, color }) => (
          <div key={step.id} className="flex-1 flex flex-col items-center justify-end h-full min-w-0"
            title={`Step ${step.step_number}: ${step.task_description||'—'}\nDuration: ${dur}m · Overlaps: ${overlaps}`}>
            <div className="w-full rounded-t-sm"
              style={{ height: `${Math.max((dur/maxDur)*100,4)}%`, backgroundColor: color, opacity: 0.85 }} />
            <span className="text-[7px] text-muted-foreground truncate leading-none">{step.step_number}</span>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-muted-foreground mt-1">
        Bar height = task duration · Colour = role overlap proximity
      </p>
    </div>
  );
}



// Each layer slot gets a distinct zone colour
const LAYER_ZONE_COLOURS = [
  '#ef4444', // Ground Level — red
  '#f59e0b', // Layer 2 — amber
  '#8b5cf6', // Layer 3 — purple
  '#06b6d4', // Layer 4 — cyan
  '#10b981', // Layer 5 — green
  '#f97316', // Layer 6 — orange
];

function getLayerZoneColour(layerId, mapLayers) {
  const idx = (mapLayers || []).findIndex(l => l.id === layerId);
  return LAYER_ZONE_COLOURS[Math.max(0, idx) % LAYER_ZONE_COLOURS.length];
}



export default function SpaghettiMap() {
  const {
    activeProcess, steps, nodes, updateStep, addStep, reorderSteps, reorderAndTimeSteps,
    updateNodePosition, commitNodePositions, undo, redo, canUndo, canRedo, lastUndoLabel, lastRedoLabel,
    schematicUrl, setSchematicUrl,
    mapLayers, updateMapLayers,
    mapEdgeWaypoints, updateEdgeWaypoints,
    updateProcessMeta,
  } = useProcess();

  // UI state
  const [activeLayers, setActiveLayers] = useState(['layer-ground']);
  const activeLayerId = activeLayers[0] ?? 'layer-ground';
  const [roleFilter, setRoleFilter] = useState([]);
  const [sectionFilter, setSectionFilter] = useState([]);
  const [intextFilter, setIntextFilter] = useState([]);
  const [taskFilter, setTaskFilter] = useState('');
  const [selectedStepId, setSelectedStepId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null);
  const [tool, setTool] = useState('select'); // 'select' | 'connect'
  const [connectSource, setConnectSource] = useState(null); // stepId of first click
  const [connectPreview, setConnectPreview] = useState(null); // {x, y} mouse position
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanDragging, setIsPanDragging] = useState(false);
  const [draggingWaypoint, setDraggingWaypoint] = useState(null); // { edgeKey, ptIdx }
  const [draggingNewWaypoint, setDraggingNewWaypoint] = useState(null); // { edgeKey, ptIdx } — inline path drag
  const draggingWaypointRef = useRef(null);
  const draggingNewWaypointRef = useRef(null);
  const [insertModal, setInsertModal] = useState(null);
  const [insertForm, setInsertForm] = useState({ task_description:'', role:'', section:'', tool_time_category:'', manual_time:5, walking_time:0, waiting_time:0 });
  const [leftOpen, setLeftOpen] = useState(true);
  const [schematicOpacity, setSchematicOpacity] = useState(() => {
    try {
      const saved = localStorage.getItem('mm_schematic_opacity');
      return saved ? Number(saved) : 0.70;
    } catch { return 0.70; }
  });
  const [nodeLayerOpacity, setNodeLayerOpacity] = useState(0.85);
  const [schematicLoading, setSchematicLoading] = useState(false);
  const [schematicLocked, setSchematicLocked] = useState(() => {
    try {
      const d = activeProcess?.schematic_pos_data
        ? JSON.parse(activeProcess.schematic_pos_data) : null;
      return d?.locked ?? true;
    } catch { return true; }
  });
  const [schematicPos, setSchematicPos] = useState(() => {
    try {
      const d = activeProcess?.schematic_pos_data
        ? JSON.parse(activeProcess.schematic_pos_data) : null;
      return d ? { x: d.x ?? 0, y: d.y ?? 0, w: d.w ?? 2100, h: d.h ?? 2970 }
                : { x: 0, y: 0, w: 2100, h: 2970 };
      } catch { return { x: 0, y: 0, w: 2100, h: 2970 }; }
  });
  const [draggingSchematic, setDraggingSchematic] = useState(false);
  const [schematicDragOffset, setSchematicDragOffset] = useState({ x: 0, y: 0 });
  const [pdfPaper, setPdfPaper] = useState('a3-landscape');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showCycleChart, setShowCycleChart] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);


  const [sequenceOptimiserResult, setSequenceOptimiserResult] = useState(null);


  const svgRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const { roles } = useRoles();
  const { sections } = useSections();
  const { colours: roleColours } = useRoleColours();
  const { groups: toolTimeGroups } = useToolTimeCategories();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Sync schematic locked state when activeProcess updates
  useEffect(() => {
    try {
      const d = activeProcess?.schematic_pos_data
        ? JSON.parse(activeProcess.schematic_pos_data) : null;
      setSchematicLocked(d?.locked ?? true);
    } catch { setSchematicLocked(true); }
  }, [activeProcess?.id, activeProcess?.schematic_pos_data]);

  // Sync layer selector when layers change
  useEffect(() => {
    if (mapLayers.length > 0 && activeLayers.some(id => !mapLayers.find(l => l.id === id))) {
      setActiveLayers(prev => prev.filter(id => mapLayers.find(l => l.id === id)));
    }
  }, [mapLayers]); // eslint-disable-line

  // Scroll-wheel zoom
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom(z => Math.min(3, Math.max(0.2, z + (e.deltaY > 0 ? -0.08 : 0.08))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Node position — auto-grid fallback
  const getNodePos = useCallback((step) => {
    if (nodes[step.id]) return nodes[step.id];
    const col = (step.step_number - 1) % 8;
    const row = Math.floor((step.step_number - 1) / 8);
    return { x: 60 + col * 100, y: 60 + row * 100, layerId: activeLayerId };
  }, [nodes, activeLayerId]);

  // SVG coordinate helper
  const svgPoint = useCallback((e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  // ── Canvas mouse handlers ─────────────────────────────────────────────────
  const handleCanvasMouseDown = useCallback((e) => {
    if (e.target === svgRef.current || e.target.tagName === 'svg') {
      setSelectedStepId(null);
      setSelectedEdgeId(null);
    }
    // Don't start panning if a waypoint drag is already in progress
    if (tool === 'select' && !draggingNodeId && !draggingWaypoint && !draggingNewWaypoint) {
      setIsPanDragging(true);
      setDragOffset({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [tool, pan, draggingNodeId, draggingWaypoint, draggingNewWaypoint, svgPoint]);

  const handleCanvasMouseMove = useCallback((e) => {
    if (tool === 'connect' && connectSource) {
      const pt = svgPoint(e);
      setConnectPreview({ x: pt.x, y: pt.y });
      return;
    }
    if (draggingNodeId) {
      const pt = svgPoint(e);
      updateNodePosition(draggingNodeId, snap(pt.x - dragOffset.x), snap(pt.y - dragOffset.y), activeLayerId);
      return;
    }
    if (draggingSchematic) {
      const pt = svgPoint(e);
      setSchematicPos(prev => ({ ...prev, x: snap(pt.x - schematicDragOffset.x), y: snap(pt.y - schematicDragOffset.y) }));
      return;
    }
    // Use refs so we always read the latest value set synchronously in onMouseDown
    if (draggingWaypointRef.current) {
      const pt = svgPoint(e);
      const { edgeKey, ptIdx } = draggingWaypointRef.current;
      const current = mapEdgeWaypoints[edgeKey] || [];
      updateEdgeWaypoints(edgeKey, current.map((wp, i) => i === ptIdx ? { x: snap(pt.x), y: snap(pt.y) } : wp));
      return;
    }
    if (draggingNewWaypointRef.current) {
      const pt = svgPoint(e);
      const { edgeKey, ptIdx } = draggingNewWaypointRef.current;
      const current = mapEdgeWaypoints[edgeKey] || [];
      const updated = [...current];
      updated[ptIdx] = { x: snap(pt.x), y: snap(pt.y) };
      updateEdgeWaypoints(edgeKey, updated);
      return;
    }
    if (isPanDragging) {
      setPan({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    }
  }, [tool, connectSource, draggingNodeId, dragOffset, isPanDragging, draggingSchematic, schematicDragOffset,
      mapEdgeWaypoints, svgPoint, updateNodePosition, activeLayerId, updateEdgeWaypoints]);

  const handleCanvasMouseUp = useCallback((e) => {
    if (draggingNodeId) { setDraggingNodeId(null); commitNodePositions('Move node'); return; }
    if (draggingSchematic) {
      setDraggingSchematic(false);
      setSchematicPos(pos => {
        updateProcessMeta({
          schematic_pos_data: JSON.stringify({ ...pos, locked: schematicLocked }),
        });
        return pos;
      });
      return;
    }
    if (draggingWaypointRef.current) {
      draggingWaypointRef.current = null;
      setDraggingWaypoint(null);
      return;
    }
    if (draggingNewWaypointRef.current) {
      draggingNewWaypointRef.current = null;
      setDraggingNewWaypoint(null);
      return;
    }
    if (isPanDragging) { setIsPanDragging(false); return; }
  }, [draggingNodeId, draggingSchematic, isPanDragging, schematicLocked, updateProcessMeta]);

  const startDrag = (e, stepId) => {
    e.stopPropagation();
    if (tool === 'connect') return;
    setSelectedEdgeId(null);
    setDraggingNodeId(stepId);
    const pt = svgPoint(e);
    const stepObj = steps.find(s => s.id === stepId);
    const pos = stepObj ? getNodePos(stepObj) : { x: 0, y: 0 };
    setDragOffset({ x: pt.x - pos.x, y: pt.y - pos.y });
  };

  const handleNodeClick = (e, stepId) => {
    e.stopPropagation();
    if (tool === 'connect') {
      if (!connectSource) {
        // First click — set source
        setConnectSource(stepId);
      } else if (connectSource === stepId) {
        // Clicked same node — cancel
        setConnectSource(null);
        setConnectPreview(null);
      } else {
        // Second click — create connection: connectSource → stepId
        const sourceStep = steps.find(s => s.id === connectSource);
        const targetStep = steps.find(s => s.id === stepId);
        if (sourceStep && targetStep) {
          const deps = targetStep.dependencies || [];
          const breakMarker = `__break__${connectSource}`;
          const alreadyConnected = deps.includes(connectSource);
          if (!alreadyConnected) {
            // Build a new steps array: ensure sourceStep comes before targetStep in ordering
            const currentSteps = [...steps].sort((a, b) => a.step_number - b.step_number);
            const sourceIdx = currentSteps.findIndex(s => s.id === connectSource);
            const targetIdx = currentSteps.findIndex(s => s.id === stepId);

            let reorderedSteps = currentSteps;
            if (sourceIdx > targetIdx) {
              // Move source before target in step order
              const [src] = reorderedSteps.splice(sourceIdx, 1);
              reorderedSteps.splice(targetIdx, 0, src);
            }

            // Compute target's new start_time = source's finish time
            const sourceTotal = (Number(sourceStep.manual_time)||0) + (Number(sourceStep.walking_time)||0) +
              (Number(sourceStep.waiting_time)||0) + (Number(sourceStep.machine_time)||0) + (Number(sourceStep.inspection_time)||0);
            const newStartTime = (sourceStep.start_time || 0) + sourceTotal;

            // Build timing map: update target with new dependency and start_time
            const timingMap = {
              [stepId]: {
                dependencies: [...deps.filter(d => d !== breakMarker), connectSource],
                start_time: newStartTime,
                start_time_override: false,
              },
            };

            reorderAndTimeSteps(reorderedSteps, timingMap);
            toast.success(`Connected Step ${sourceStep.step_number} → Step ${targetStep.step_number}`);
          } else {
            toast.info('These steps are already connected');
          }
        }
        setConnectSource(null);
        setConnectPreview(null);
      }
      return;
    }
    // Normal select mode — open right panel
    setSelectedStepId(stepId);
    setSelectedEdgeId(null);
  };

  const removeConnection = (fromId, toId) => {
    const target = steps.find(s => s.id === toId);
    if (!target) return;
    const breakMarker = `__break__${fromId}`;
    const deps = target.dependencies || [];
    // If there's an explicit dependency, remove it; otherwise add a break marker
    if (deps.includes(fromId)) {
      updateStep(toId, { dependencies: deps.filter(d => d !== fromId) });
    } else {
      updateStep(toId, { dependencies: [...deps.filter(d => d !== breakMarker), breakMarker] });
    }
    updateEdgeWaypoints(`${fromId}→${toId}`, undefined);
  };

  // Add a new step, auto-place it on the canvas, and open the right panel
  const pendingSelectRef = useRef(false);

  const handleAddStep = useCallback(() => {
    pendingSelectRef.current = true;
    addStep(null, {});
  });

  const handleInsertStep = useCallback(() => {
    if (!insertModal) return;
    const { fromStep, toStep, insertPos, layerId } = insertModal;
    if (!insertForm.task_description.trim()) return;
    const newId = `step_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
    addStep(toStep.id, {
      id: newId,
      task_description: insertForm.task_description.trim(),
      role: insertForm.role || fromStep.role || '',
      section: insertForm.section || fromStep.section || '',
      tool_time_category: insertForm.tool_time_category || '',
      manual_time: Number(insertForm.manual_time)||0,
      walking_time: Number(insertForm.walking_time)||0,
      waiting_time: Number(insertForm.waiting_time)||0,
      machine_time:0, inspection_time:0,
      start_time:0, start_time_override:false, dependencies:[],
    });
    setTimeout(() => {
      updateNodePosition(newId, insertPos.x, insertPos.y, layerId || activeLayerId);
    }, 80);
    setInsertModal(null);
    setInsertForm({ task_description:'', role:'', section:'', tool_time_category:'', manual_time:5, walking_time:0, waiting_time:0 });
    toast.success('Step inserted and node placed on map');
  }, [insertModal, insertForm, addStep, updateNodePosition, activeLayerId]);

  // When steps.length increases (new step added), place it on canvas + select it
  const prevStepCountRef = useRef(steps.length);
  useEffect(() => {
    if (steps.length > prevStepCountRef.current) {
      const newest = [...steps]
        .sort((a, b) => b.step_number - a.step_number)
        .find(s => !nodes[s.id]);
      if (newest) {
        const idx = steps.length - 1;
        const col = idx % 7;
        const prev = steps[steps.length - 2];
        const prevPos = (prev && nodes[prev.id]) ? nodes[prev.id] : { x: 80, y: 80 };
        const newX = col === 0 ? 80 : prevPos.x + 130;
        const newY = col === 0 ? prevPos.y + 110 : prevPos.y;
        updateNodePosition(newest.id, newX, newY, activeLayerId);
        setSelectedStepId(newest.id);
        setSelectedEdgeId(null);
      }
    }
    prevStepCountRef.current = steps.length;
  }, [steps.length]);

  // DnD reorder (left panel)
  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = steps.findIndex(s => s.id === active.id);
    const newIdx = steps.findIndex(s => s.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = [...steps];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    reorderSteps(reordered);
  }, [steps, reorderSteps]);

  // Visible steps on canvas
  const visibleSteps = useMemo(() => {
    const taskLower = taskFilter.trim().toLowerCase();
    return [...steps].sort((a,b) => (a.step_number||0)-(b.step_number||0)).filter(s => {
      const layerId = nodes[s.id]?.layerId ?? 'layer-ground';
      const onActiveLayers = activeLayers.length === 0 || activeLayers.includes(layerId);
      const roleOk    = roleFilter.length === 0    || roleFilter.includes(s.role || '');
      const sectionOk = sectionFilter.length === 0  || sectionFilter.includes(s.section || '');
      const taskOk = !taskLower || (s.task_description || '').toLowerCase().includes(taskLower);
      const intextOk = intextFilter.length === 0 || intextFilter.includes(s.internal_external || '');
      return onActiveLayers && roleOk && sectionOk && taskOk && intextOk;
    });
  }, [steps, nodes, activeLayers, roleFilter, sectionFilter, taskFilter, intextFilter]);

  const visibleStepIds = useMemo(() => new Set(visibleSteps.map(s => s.id)), [visibleSteps]);
  const visibleMapSteps = visibleSteps;

  const nodesInZone = useMemo(() => new Set(), []);

  // ── Walking Distance Metrics ───────────────────────────────────────────
  const walkingMetrics = useMemo(() => {
    const distPt = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
    const roleList = [...new Set(visibleSteps.map(s => s.role).filter(Boolean))];
    const perRole = roleList.map(role => {
      const rs = visibleSteps.filter(s => s.role===role && nodes[s.id]).sort((a,b) => a.step_number-b.step_number);
      if (rs.length < 2) return { role, distance: 0, nodeCount: rs.length };
      const dist = rs.reduce((a,s,i) => i===0 ? 0 : a + distPt(nodes[rs[i-1].id], nodes[s.id]), 0);
      return { role, distance: Math.round(dist), nodeCount: rs.length };
    }).filter(r => r.nodeCount >= 2);
    const total = perRole.reduce((a,r) => a+r.distance, 0);
    return { total, perRole };
  }, [visibleSteps, nodes]);

  // Cascade timings — same as CombinationTable (drives the cycle chart)
  const allStepsWithTiming = useMemo(() => {
    if (!steps || steps.length === 0) return [];
    const cascaded = cascadeTimings(steps); // returns { [id]: stepObj }
    // Compute sequential cumulative start times by step_number order
    const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);
    let cursor = 0;
    const seqStart = {};
    sorted.forEach(s => {
      const total = (Number(s.manual_time)||0)+(Number(s.walking_time)||0)+
                    (Number(s.waiting_time)||0)+(Number(s.machine_time)||0)+
                    (Number(s.inspection_time)||0);
      seqStart[s.id] = cursor;
      cursor += total;
    });
    return steps.map(s => {
      const cs = cascaded[s.id] || s;  // object lookup, not .find()
      const total = (Number(cs.manual_time)||0)+(Number(cs.walking_time)||0)+
                    (Number(cs.waiting_time)||0)+(Number(cs.machine_time)||0)+
                    (Number(cs.inspection_time)||0);
      const start = seqStart[s.id] ?? 0;
      return { ...cs, _start: start, _total: total, _finish: start + total };
    });
  }, [steps]);

  const getCursor = () => {
    if (tool === 'connect') return connectSource ? 'crosshair' : 'cell';
    if (isPanDragging) return 'grabbing';
    return 'default';
  };

  // Priority tier for sequence optimisation: Tooltime first, Waste last
  const getStepPriority = (step) => {
    const cat = (step.tool_time_category || '').toLowerCase();
    if (cat.startsWith('tooltime')) return 0;           // value-adding — first
    if (cat.startsWith('nva') && cat.includes('essential')) return 1; // necessary
    if (cat.startsWith('nva')) return 2;                // reducible NVA
    if (cat.startsWith('waste')) return 3;              // pure waste — last
    return 1; // untagged = NVA-Essential
  };

  // ── SEQUENCE OPTIMISER — role+section aware, TSP within priority tiers ───
  const runSequenceOptimiser = useCallback(() => {
    if (roleFilter.length !== 1) {
      toast.error('Select exactly one role to optimise task sequence');
      return;
    }
    const role = roleFilter[0];

    // Only steps with STORED node positions AND no active dependencies
    const roleSteps = [...steps]
      .sort((a, b) => a.step_number - b.step_number)
      .filter(s => (s.role || '') === role && nodes[s.id] && !(s.dependencies||[]).length);

    const depLockedCount = [...steps].filter(s =>
      (s.role||'') === role && nodes[s.id] && (s.dependencies||[]).length > 0
    ).length;
    if (depLockedCount > 0) {
      toast.info(`${depLockedCount} step${depLockedCount!==1?'s':''} with dependencies skipped. Clear their dependencies to include them.`);
    }
    if (roleSteps.length < 2) {
      toast.info('Need at least 2 placed nodes without dependencies for this role');
      return;
    }

    const sectionNames = [...new Set(roleSteps.map(s => s.section || ''))];
    const groups = [];
    const groupResults = [];
    let totalCurrentDist = 0;
    let totalOptimisedDist = 0;
    let anyChange = false;

    sectionNames.forEach(section => {
      const sectionSteps = roleSteps.filter(s => (s.section || '') === section);
      if (sectionSteps.length < 2) {
        groups.push({ section, original: sectionSteps, optimised: sectionSteps });
        groupResults.push(...sectionSteps.map(s => ({
          step: s, originalStep: s, changed: false, section,
          isWaste: getStepPriority(s) === 3,
        })));
        return;
      }

      // Split into priority tiers: run TSP within each tier, then concat in order
      // Tooltime (0) → NVA-Essential (1) → NVA-Activities (2) → Waste (3)
      const tiers = [0, 1, 2, 3].map(p =>
        sectionSteps.filter(s => getStepPriority(s) === p)
      );

      const optimisedSteps = [];
      tiers.forEach(tier => {
        if (!tier.length) return;
        if (tier.length === 1) { optimisedSteps.push(tier[0]); return; }
        const withPos = tier.map(s => ({ step: s, pos: nodes[s.id] }));
        const tspResult = nearestNeighbourTSP(withPos);
        tspResult.forEach(sp => optimisedSteps.push(sp.step));
      });

      const currentWithPos   = sectionSteps.map(s => ({ step: s, pos: nodes[s.id] }));
      const optimisedWithPos = optimisedSteps.map(s => ({ step: s, pos: nodes[s.id] }));
      totalCurrentDist   += totalPathDist(currentWithPos);
      totalOptimisedDist += totalPathDist(optimisedWithPos);

      groups.push({ section, original: sectionSteps, optimised: optimisedSteps });
      optimisedSteps.forEach((step, i) => {
        const changed = step.id !== sectionSteps[i]?.id;
        const isWaste = getStepPriority(step) === 3;
        if (changed) anyChange = true;
        groupResults.push({ step, originalStep: sectionSteps[i], changed, section, isWaste });
      });
    });

    const wasteCount = groupResults.filter(r => r.isWaste).length;
    if (!anyChange) { toast.info(`Sequence for ${role} is already optimal`); return; }

    setSequenceOptimiserResult({
      role, groups, groupResults, wasteCount,
      currentDist:   Math.round(totalCurrentDist),
      optimisedDist: Math.round(totalOptimisedDist),
      saving:        Math.round(totalCurrentDist - totalOptimisedDist),
    });
  }, [roleFilter, steps, nodes]);

  const applySequenceOptimisation = useCallback(() => {
    if (!sequenceOptimiserResult) return;
    const { role, groups } = sequenceOptimiserResult;
    const currentSteps = [...steps].sort((a,b) => a.step_number - b.step_number);

    // Build ordered list — ID-based, no index arithmetic
    const result = [...currentSteps];
    groups.forEach(({ section, optimised }) => {
      if (!optimised.length) return;
      const slots = [];
      for (let i = 0; i < result.length; i++) {
        if ((result[i].role||'') === role && (result[i].section||'') === section) slots.push(i);
      }
      const optimisedIds = new Set(optimised.map(o => o.id));
      const unplaced = currentSteps.filter(s =>
        (s.role||'') === role && (s.section||'') === section && !optimisedIds.has(s.id)
      );
      const fullGroup = [...optimised, ...unplaced];
      slots.forEach((slot, i) => { if (fullGroup[i]) result[slot] = fullGroup[i]; });
    });
    const seen = new Set();
    const merged = result.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });

    // Build timing map
    const timingMap = {};
    const groupStepIds = new Set(groups.flatMap(g => g.optimised.map(s => s.id)));
    const anchorStart = merged
      .filter(s => groupStepIds.has(s.id))
      .reduce((min, s) => Math.min(min, s.start_time ?? 0), Infinity);
    let cursor = isFinite(anchorStart) ? anchorStart : 0;
    groups.forEach(({ optimised }) => {
      optimised.forEach((step) => {
        const total = (Number(step.manual_time)||0)+(Number(step.walking_time)||0)+
                      (Number(step.waiting_time)||0)+(Number(step.machine_time)||0)+
                      (Number(step.inspection_time)||0);
        timingMap[step.id] = { start_time: cursor, start_time_override: true, dependencies: [] };
        cursor += total;
      });
    });

    // Single atomic update
    reorderAndTimeSteps(merged, timingMap);

    // Clear stale waypoints
    merged.filter(s => (s.role||'') === role)
      .sort((a,b) => a.step_number - b.step_number)
      .forEach((step, i, arr) => {
        if (i < arr.length - 1) updateEdgeWaypoints(`${step.id}→${arr[i+1].id}`, []);
      });

    setSequenceOptimiserResult(null);
    toast.success(`Resequenced ${role} — Combination Table updated`);
  }, [sequenceOptimiserResult, steps, reorderAndTimeSteps, updateEdgeWaypoints]);

  // Helper to get node color from tool time category
  const getNodeColor = useCallback((category, groups) => {
    if (!category) return '#64748b';
    const gKey = category.split('::')[0];
    return groups[gKey]?.color || '#64748b';
  }, []);

  // Enhanced PDF export
  const exportPDF = useCallback(async () => {
    const container = canvasContainerRef.current;
    if (!container) return;
    setExportingPdf(true);
    try {
      // html2canvas cannot capture SVG <image> elements with cross-origin hrefs.
      // Pre-fetch the schematic as a base64 data URL and temporarily swap it in.
      let schematicDataUrl = null;
      const svgImages = container.querySelectorAll('image[href]');
      if (schematicUrl && svgImages.length > 0) {
        try {
          const resp = await fetch(schematicUrl, { mode: 'cors' });
          const blob = await resp.blob();
          schematicDataUrl = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(blob);
          });
          svgImages.forEach(img => {
            img.setAttribute('data-original-href', img.getAttribute('href'));
            img.setAttribute('href', schematicDataUrl);
          });
          await new Promise(r => setTimeout(r, 100));
        } catch (err) {
          console.warn('Could not pre-fetch schematic for PDF:', err);
        }
      }

      const canvas = await html2canvas(container, {
        backgroundColor: '#020617',
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        logging: false,
        imageTimeout: 0,
        foreignObjectRendering: false,
      });

      // Restore original hrefs
      if (schematicDataUrl) {
        svgImages.forEach(img => {
          const orig = img.getAttribute('data-original-href');
          if (orig) { img.setAttribute('href', orig); img.removeAttribute('data-original-href'); }
        });
      }

      const SIZES = {
        'a4-landscape': [297, 210],
        'a3-landscape': [420, 297],
        'a2-landscape': [594, 420],
        'a1-landscape': [841, 594],
      };
      const [pdfW, pdfH] = SIZES[pdfPaper] || SIZES['a3-landscape'];
      const [fmt, orient] = pdfPaper.split('-');
      const margin = 8;
      const titleH = 18;
      const legendH = visibleMapSteps.length > 0 ? 24 : 0;

      const doc = new jsPDF({ orientation: orient, unit: 'mm', format: fmt });

      // ── Title bar
      doc.setFillColor(2, 6, 23);
      doc.rect(0, 0, pdfW, titleH, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text(`Spaghetti Map — ${activeProcess?.name || 'Process'}`, margin, titleH / 2 + 2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      const activeLayerNames = activeLayers
        ? activeLayers.map(id => mapLayers?.find(l => l.id === id)?.name).filter(Boolean).join(', ')
        : mapLayers?.find(l => l.id === activeLayerId)?.name || 'Ground Level';
      doc.text(
        `Layers: ${activeLayerNames}  ·  Steps shown: ${visibleMapSteps.length}  ·  ${new Date().toLocaleDateString()}`,
        pdfW - margin,
        titleH / 2 + 2,
        { align: 'right' }
      );

      // ── Map image
      const imgY = titleH + 2;
      const imgH = pdfH - imgY - margin - legendH;
      const imgW = pdfW - margin * 2;
      const canvasAspect = canvas.width / canvas.height;
      const imgAspect = imgW / imgH;
      let drawW = imgW;
      let drawH = imgH;
      let drawX = margin;
      if (canvasAspect > imgAspect) {
        drawH = imgW / canvasAspect;
      } else {
        drawW = imgH * canvasAspect;
        drawX = margin + (imgW - drawW) / 2;
      }
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', drawX, imgY, drawW, drawH);

      // ── Step legend
      if (visibleMapSteps.length > 0) {
        const legendY = pdfH - legendH;
        doc.setFillColor(15, 23, 42);
        doc.rect(0, legendY, pdfW, legendH, 'F');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        let lx = margin;
        const colW = (pdfW - margin * 2) / Math.min(visibleMapSteps.length, 8);
        visibleMapSteps.slice(0, 8).forEach((step, i) => {
          const color = getNodeColor(step.tool_time_category, toolTimeGroups);
          // Circle
          doc.setFillColor(...hexToRgb(color));
          doc.circle(lx + 3, legendY + legendH / 2, 2.5, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(6);
          doc.text(String(step.step_number), lx + 3, legendY + legendH / 2 + 1, { align: 'center' });
          // Label
          doc.setTextColor(148, 163, 184);
          doc.setFontSize(7);
          doc.text(
            (step.task_description || '—').substring(0, 18),
            lx + 7,
            legendY + legendH / 2 + 1,
            { maxWidth: colW - 8 }
          );
          lx += colW;
        });
        if (visibleMapSteps.length > 8) {
          doc.setTextColor(100, 116, 139);
          doc.text(`+ ${visibleMapSteps.length - 8} more`, pdfW - margin, legendY + legendH / 2 + 1, {
            align: 'right',
          });
        }
      }

      doc.save(`${activeProcess?.name || 'spaghetti-map'}_${activeLayerNames.replace(/,\s*/g, '-')}.pdf`);
      toast.success('PDF exported');
    } catch (err) {
      console.error(err);
      toast.error('PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  }, [activeProcess, visibleMapSteps, mapLayers, activeLayers, activeLayerId, toolTimeGroups, pdfPaper, getNodeColor]);

  if (!activeProcess) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <Map className="w-7 h-7 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-sm">No process loaded</p>
          <p className="text-xs text-muted-foreground mt-1">
            Select a process below to start mapping
          </p>
        </div>
        <ProcessSelector />
      </div>
    );
  }

  const selectedStep = selectedStepId ? steps.find(s => s.id === selectedStepId) : null;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <Toolbar
        mapLayers={mapLayers} activeLayers={activeLayers} setActiveLayers={setActiveLayers}
        roles={roles} roleFilter={roleFilter} setRoleFilter={setRoleFilter}
        sections={sections} sectionFilter={sectionFilter} setSectionFilter={setSectionFilter}
        intextFilter={intextFilter} setIntextFilter={setIntextFilter}
        taskFilter={taskFilter} setTaskFilter={setTaskFilter}
        tool={tool} setTool={setTool} connectSource={connectSource} setConnectSource={setConnectSource} setConnectPreview={setConnectPreview}
        schematicUrl={schematicUrl} setSchematicUrl={setSchematicUrl} schematicLocked={schematicLocked} setSchematicLocked={setSchematicLocked}
        schematicPos={schematicPos} setSchematicPos={setSchematicPos}
        schematicOpacity={schematicOpacity} setSchematicOpacity={setSchematicOpacity}
        nodeLayerOpacity={nodeLayerOpacity} setNodeLayerOpacity={setNodeLayerOpacity}
        zoom={zoom} setZoom={setZoom} pan={pan} setPan={setPan}
        canUndo={canUndo} canRedo={canRedo} undo={undo} redo={redo} lastUndoLabel={lastUndoLabel} lastRedoLabel={lastRedoLabel}
        runSequenceOptimiser={runSequenceOptimiser}
        selectedEdgeId={selectedEdgeId} setSelectedEdgeId={setSelectedEdgeId}
        removeConnection={removeConnection}
        updateEdgeWaypoints={updateEdgeWaypoints}
        mapEdgeWaypoints={mapEdgeWaypoints}
        exportPDF={exportPDF}
        exportingPdf={exportingPdf}
        pdfPaper={pdfPaper} setPdfPaper={setPdfPaper}
        schematicLoading={schematicLoading} setSchematicLoading={setSchematicLoading}
        activeProcess={activeProcess}
        updateProcessMeta={updateProcessMeta}
        updateMapLayers={updateMapLayers}
        showHeatmap={showHeatmap} setShowHeatmap={setShowHeatmap}
        showCycleChart={showCycleChart} setShowCycleChart={setShowCycleChart}

      />





      {/* Charts panel — Heat Map above, Cycle Time below */}
      {(showHeatmap || showCycleChart) && (
        <div className="shrink-0 max-h-72 overflow-y-auto border-b border-border">
          {showHeatmap && (
            <HeatMapChart
              stepsWithTiming={allStepsWithTiming}
              visibleSteps={visibleSteps}
              nodes={nodes}
            />
          )}
          {showCycleChart && (
            <SpaghettiCycleChart stepsWithTiming={allStepsWithTiming} roleColours={roleColours} />
          )}
          {/* Path Length Meter */}
          {walkingMetrics.perRole.length > 0 && (
            <div className="border-t bg-muted/20 px-4 py-2">
              <div className="flex items-center gap-3 flex-wrap text-[11px]">
                <span className="font-semibold text-muted-foreground shrink-0">📍 Path Length:</span>
                <span className="font-bold">{walkingMetrics.total}px total</span>
                {walkingMetrics.perRole.map(r => (
                  <span key={r.role} className="text-muted-foreground">
                    <span className="font-medium text-foreground">{r.role}:</span> {r.distance}px
                  </span>
                ))}
                <span className="text-[10px] text-muted-foreground ml-auto italic">Run Sequence Optimiser to minimise walking ↓</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Body: left panel + canvas + right panel ──────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <LeftPanel
          leftOpen={leftOpen} setLeftOpen={setLeftOpen}
          visibleSteps={visibleSteps} steps={steps}
          selectedStepId={selectedStepId} setSelectedStepId={setSelectedStepId}
          setSelectedEdgeId={setSelectedEdgeId}
          getRoleColour={(role) => getRoleColour(role, roleColours)}
          handleDragEnd={handleDragEnd}
          handleAddStep={handleAddStep}
        />

        {/* Canvas */}
        <div data-tour="map-canvas" className="flex-1 relative overflow-hidden bg-slate-950" ref={canvasContainerRef}>
          <svg
            ref={svgRef}
            style={{ width: '100%', height: '100%', cursor: getCursor() }}
            className="select-none"
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onClick={(e) => {
              if (e.target === svgRef.current || e.target.tagName === 'svg' || e.target.tagName === 'rect') {
                setSelectedStepId(null);
                setSelectedEdgeId(null);
              }
            }}
          >
            <defs>
              <marker id="sm-arrow" markerWidth="7" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 7 3, 0 6" fill="#94a3b8" />
              </marker>
              <marker id="sm-arrow-sel" markerWidth="7" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 7 3, 0 6" fill="#f59e0b" />
              </marker>
              <pattern id="sm-dots" x="0" y="0" width={GRID * zoom} height={GRID * zoom} patternUnits="userSpaceOnUse"
                patternTransform={`translate(${pan.x % (GRID * zoom)},${pan.y % (GRID * zoom)})`}>
                <circle cx={GRID * zoom / 2} cy={GRID * zoom / 2} r="1" fill="#cbd5e1" opacity="0.4" />
              </pattern>
            </defs>

            <rect width="100%" height="100%" fill="url(#sm-dots)" />

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>



               {/* 1. Schematic — BOTTOM layer, underneath grid and nodes */}
              {schematicUrl && (
                <g>
                  <image
                    href={schematicUrl}
                    x={schematicPos.x} y={schematicPos.y}
                    width={schematicPos.w} height={schematicPos.h}
                    style={{
                      opacity: schematicOpacity,
                      cursor: schematicLocked ? 'default' : 'move',
                      pointerEvents: schematicLocked ? 'none' : 'all',
                    }}
                    onMouseDown={schematicLocked ? undefined : (e) => {
                      e.stopPropagation();
                      const startX = e.clientX; const startY = e.clientY;
                      const origX = schematicPos.x; const origY = schematicPos.y;
                      const onMove = (me) => {
                        const dx = (me.clientX - startX) / zoom;
                        const dy = (me.clientY - startY) / zoom;
                        setSchematicPos(p => ({ ...p, x: origX + dx, y: origY + dy }));
                      };
                      const onUp = () => {
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);
                        // Save position after drag completes
                        setSchematicPos(p => {
                          updateProcessMeta({
                            schematic_pos_data: JSON.stringify({ ...p, locked: schematicLocked }),
                          });
                          return p;
                        });
                      };
                      window.addEventListener('mousemove', onMove);
                      window.addEventListener('mouseup', onUp);
                    }}
                  />
                  {/* Yellow resize handle — bottom-right corner, only when unlocked */}
                  {!schematicLocked && (
                    <rect
                      x={schematicPos.x + schematicPos.w - 10}
                      y={schematicPos.y + schematicPos.h - 10}
                      width={14} height={14} rx={2}
                      fill="#f59e0b" opacity={0.85}
                      style={{ cursor: 'se-resize' }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const startX = e.clientX; const startY = e.clientY;
                        const origW = schematicPos.w; const origH = schematicPos.h;
                        const aspect = origW / origH;
                        const onMove = (me) => {
                          const dw = (me.clientX - startX) / zoom;
                          const newW = Math.max(200, origW + dw);
                          const newH = newW / aspect;
                          setSchematicPos(p => ({ ...p, w: newW, h: newH }));
                        };
                        const onUp = () => {
                          window.removeEventListener('mousemove', onMove);
                          window.removeEventListener('mouseup', onUp);
                          // Save size after resize completes
                          setSchematicPos(p => {
                            updateProcessMeta({
                              schematic_pos_data: JSON.stringify({ ...p, locked: schematicLocked }),
                            });
                            return p;
                          });
                        };
                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onUp);
                      }}
                    />
                  )}
                </g>
              )}





              {/* 3. Node + edge layer — opacity controlled by slider */}
              <g opacity={nodeLayerOpacity}>

                {/* Connect tool: source highlight */}
                {tool === 'connect' && connectSource && (() => {
                  const srcStep = steps.find(s => s.id === connectSource);
                  if (!srcStep) return null;
                  const pos = getNodePos(srcStep);
                  return (
                    <circle cx={pos.x} cy={pos.y} r={NODE_R + 5} fill="none"
                      stroke="#06b6d4" strokeWidth={2.5} strokeDasharray="5,3"
                    />
                  );
                })()}

                {/* Connect tool: preview line from source to cursor */}
                {tool === 'connect' && connectSource && connectPreview && (() => {
                  const srcStep = steps.find(s => s.id === connectSource);
                  if (!srcStep) return null;
                  const pos = getNodePos(srcStep);
                  return (
                    <line x1={pos.x} y1={pos.y} x2={connectPreview.x} y2={connectPreview.y}
                      stroke="#06b6d4" strokeWidth={2} strokeDasharray="4,4" opacity={0.6}
                    />
                  );
                })()}

                {/* Edges — sequential by step_number, same role only.
                    Paths never cross trade boundaries: a Fitter path won't connect
                    to an Electrician step even if sequential in the combination table.
                    Each role's steps connect only to the next step of the same role. */}
                {(() => {
                  const sorted = [...visibleSteps].sort((a, b) => a.step_number - b.step_number);
                  return sorted.slice(0, -1).map((fromStep, i) => {
                    const toStep = sorted[i + 1];
                    // Skip edge if roles differ — paths never cross trade boundaries
                    if (fromStep.role !== toStep.role) return null;
                    // Skip edge if it has been explicitly disconnected
                    if ((toStep.dependencies || []).includes(`__break__${fromStep.id}`)) return null;
                    const edgeId = `${fromStep.id}→${toStep.id}`;
                    const storedWaypoints = mapEdgeWaypoints?.[edgeId] || [];
                    const fromPos = getNodePos(fromStep);
                    const toPos   = getNodePos(toStep);
                    const fromPt  = { x: fromPos.x + NODE_R, y: fromPos.y };
                    const toPt    = { x: toPos.x - NODE_R,   y: toPos.y };
                    const waypoints = storedWaypoints;
                    const pathD = buildEdgePath(fromPt, toPt, waypoints);
                    const isSelected = selectedEdgeId === edgeId;
                    const isHovered = hoveredEdgeId === edgeId;
                    const colour = getRoleColour(fromStep.role, roleColours);
                    const mid = getMidpoint(fromPt, toPt, waypoints);
                    return (
                    <g key={edgeId}
                    onMouseEnter={() => setHoveredEdgeId(edgeId)}
                    onMouseLeave={() => setHoveredEdgeId(null)}
                    >
                    {/* Extra-wide invisible drag-to-reroute area — drag anywhere on path to add a waypoint */}
                    <path d={pathD} fill="none" stroke="transparent" strokeWidth={24}
                      style={{ cursor: (isSelected || isHovered) ? 'crosshair' : 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); setSelectedEdgeId(edgeId); setSelectedStepId(null); }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        // Only drag to reroute when already selected/hovered — prevents accidental reroutes
                        if (!isSelected && !isHovered) return;
                        const pt = svgPoint(e);
                        const insertAt = snap(pt.x);
                        const insertAtY = snap(pt.y);
                        // Insert a new waypoint at the click position, at the right index
                        const newWaypoints = [...waypoints];
                        // Find best insertion index: between which two waypoints (or endpoints) is the click closest?
                        const pts = [fromPt, ...waypoints, toPt];
                        let bestIdx = 1;
                        let bestDist = Infinity;
                        for (let k = 0; k < pts.length - 1; k++) {
                          const ax = pts[k].x, ay = pts[k].y, bx = pts[k+1].x, by = pts[k+1].y;
                          const mx = (ax+bx)/2, my = (ay+by)/2;
                          const d = Math.hypot(insertAt - mx, insertAtY - my);
                          if (d < bestDist) { bestDist = d; bestIdx = k; }
                        }
                        newWaypoints.splice(bestIdx, 0, { x: insertAt, y: insertAtY });
                        updateEdgeWaypoints(edgeId, newWaypoints);
                        setSelectedEdgeId(edgeId);
                        draggingNewWaypointRef.current = { edgeKey: edgeId, ptIdx: bestIdx };
                        setDraggingNewWaypoint({ edgeKey: edgeId, ptIdx: bestIdx });
                        setIsPanDragging(false);
                      }}
                    />
                    {/* Visible path */}
                    <path d={pathD} fill="none"
                    stroke={isSelected ? '#f59e0b' : colour}
                    strokeWidth={isSelected ? 2.5 : isHovered ? 2.5 : 1.6}
                    opacity={isHovered && !isSelected ? 1 : undefined}
                    markerEnd={isSelected ? 'url(#sm-arrow-sel)' : 'url(#sm-arrow)'}
                    style={{ pointerEvents: 'none' }}
                    />
                    {/* Midpoint insert-step button — shown on hover only when not dragging */}
                    {(isHovered || isSelected) && !draggingNewWaypoint && !draggingWaypoint && (
                    <g style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const pt = svgPoint(e);
                        setInsertModal({ fromStep, toStep, insertPos: { x: snap(pt.x), y: snap(pt.y) }, layerId: activeLayerId });
                        setInsertForm(prev => ({ ...prev, role: fromStep.role||'', section: fromStep.section||'' }));
                        setSelectedEdgeId(edgeId);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <circle cx={mid.x} cy={mid.y} r={13} fill="white" fillOpacity={0.95} stroke={colour} strokeWidth={2}/>
                      <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central"
                        fontSize={14} fontWeight="900" fill={colour} style={{ pointerEvents:'none', userSelect:'none' }}>+</text>
                      {isHovered && <text x={mid.x} y={mid.y-20} textAnchor="middle" fontSize={9} fill={colour} fontWeight="600"
                        style={{ pointerEvents:'none', userSelect:'none' }}>Insert step</text>}
                    </g>
                    )}
                    {/* Waypoint handles — large for easy dragging */}
                    {(isSelected || isHovered) && waypoints.map((wp, wi) => (
                    <g key={wi}>
                    {/* Large invisible drag target */}
                    <circle cx={wp.x} cy={wp.y} r={14}
                    fill="transparent"
                    style={{ cursor: 'grab' }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      draggingWaypointRef.current = { edgeKey: edgeId, ptIdx: wi };
                      setDraggingWaypoint({ edgeKey: edgeId, ptIdx: wi });
                      setSelectedEdgeId(edgeId);
                      setIsPanDragging(false);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      updateEdgeWaypoints(edgeId, waypoints.filter((_, idx) => idx !== wi));
                    }}
                    />
                    {/* Visible handle — larger and more visible */}
                    <circle cx={wp.x} cy={wp.y} r={7}
                    fill={isSelected ? '#f59e0b' : 'white'} stroke={isSelected ? '#f59e0b' : colour} strokeWidth={2.5}
                    style={{ pointerEvents: 'none' }}
                    />
                    <text x={wp.x} y={wp.y} textAnchor="middle" dominantBaseline="central"
                    fontSize={9} fontWeight="700" fill={isSelected ? 'white' : '#64748b'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}>✕</text>
                    </g>
                    ))}
                    </g>
                    );
                  });
                })()}

                {/* Nodes */}
                {visibleSteps.map(step => {
                  const pos = getNodePos(step);
                  const colour = getRoleColour(step.role, roleColours);
                  const isSelected = selectedStepId === step.id;
                  const inZone = nodesInZone.has(step.id);
                  return (
                    <g key={`${step.id}-${step.role||''}-${step.tool_time_category||''}-${step.internal_external||''}`}
                      transform={`translate(${pos.x},${pos.y})`}
                      style={{ cursor: draggingNodeId === step.id ? 'grabbing' : 'grab' }}
                      onMouseDown={(e) => startDrag(e, step.id)}
                      onClick={(e) => handleNodeClick(e, step.id)}
                    >
                      {/* Int/Ext indicator rings */}
                      {step.internal_external === 'Internal' && (
                        <circle r={NODE_R + 4} fill="none" stroke="#2563EB" strokeWidth={2.5} />
                      )}
                      {step.internal_external === 'External' && (
                        <circle r={NODE_R + 4} fill="none" stroke="#059669" strokeWidth={2} strokeDasharray="4,3" />
                      )}
                      {/* Zone warning ring */}
                      {inZone && (
                        <circle r={NODE_R + 6} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4,2" opacity={0.9} />
                      )}
                      {/* Outer selection ring */}
                      {isSelected && (
                        <circle r={NODE_R + 4} fill="none" stroke="#006A9D" strokeWidth={2.5} />
                      )}
                      {/* Main fill — role colour */}
                      <circle r={NODE_R} fill={colour} stroke="white" strokeWidth={1.5} />
                      {/* Small tool-time dot at bottom-right */}
                      {step.tool_time_category && (() => {
                        const gKey = step.tool_time_category.split('::')[0];
                        const catCol = toolTimeGroups[gKey]?.color;
                        return catCol ? (
                          <circle cx={NODE_R - 5} cy={NODE_R - 5} r={3} fill={catCol} stroke="white" strokeWidth={0.5} />
                        ) : null;
                      })()}
                      {/* Step number */}
                      <text textAnchor="middle" dominantBaseline="central"
                        fontSize={10} fontWeight="700" fill="white"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {step.step_number}
                      </text>
                      {/* Label below */}
                      <text textAnchor="middle" y={NODE_R + 10}
                        fontSize={8} fill="#cbd5e1"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {(step.task_description || '').slice(0, 16)}{(step.task_description || '').length > 16 ? '…' : ''}
                      </text>
                      {/* Zone warning icon */}
                      {inZone && (
                        <text x={NODE_R + 2} y={-NODE_R - 2} textAnchor="middle" fontSize={10}
                          style={{ pointerEvents: 'none', userSelect: 'none' }}>⚠</text>
                      )}
                    </g>
                  );
                })}

              </g>{/* end node+edge layer */}
            </g>
          </svg>





          {/* Sequence optimiser confirmation */}
          {sequenceOptimiserResult && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border border-purple-500/30 rounded-xl shadow-2xl p-5 max-w-lg w-full max-h-[70vh] flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">Task Sequence Optimiser — {sequenceOptimiserResult.role}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Resequences tasks within each section by node position. Syncs to Combination Table.</p>
                </div>
                <button onClick={() => setSequenceOptimiserResult(null)} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-muted/40 rounded-lg py-2"><p className="text-[10px] text-muted-foreground">Current walking</p><p className="text-sm font-semibold text-destructive">{sequenceOptimiserResult.currentDist}px</p></div>
                <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg py-2"><p className="text-[10px] text-muted-foreground">Optimised walking</p><p className="text-sm font-semibold text-purple-600 dark:text-purple-400">{sequenceOptimiserResult.optimisedDist}px</p></div>
              </div>
              <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider grid grid-cols-[24px_1fr_1fr] gap-2 px-1">
                <div>#</div><div>Current</div><div>Resequenced</div>
              </div>
              <div className="overflow-y-auto flex-1 space-y-0.5 min-h-0">
                {sequenceOptimiserResult.groupResults.map((item, i) => (
                  <div key={item.step.id}
                    className={`grid grid-cols-[28px_1fr_1fr_60px] gap-2 items-center px-2 py-1 rounded text-[11px]
                      ${item.isWaste
                        ? 'bg-amber-50/60 dark:bg-amber-950/20'
                        : item.changed
                        ? 'bg-purple-50/60 dark:bg-purple-950/20'
                        : 'bg-muted/20'}`}>
                    <span className="font-mono font-bold text-muted-foreground text-center">{i + 1}</span>
                    <span className={`truncate ${item.changed ? 'line-through text-muted-foreground' : 'text-muted-foreground'}`}>
                      #{item.originalStep?.step_number ?? item.step.step_number}{' '}
                      {(item.originalStep?.task_description || item.step.task_description || '—').substring(0, 18)}
                    </span>
                    <span className={`truncate ${item.changed ? 'font-medium text-purple-700 dark:text-purple-300' : 'text-muted-foreground'}`}>
                      #{item.step.step_number} {(item.step.task_description || '—').substring(0, 18)}
                    </span>
                    <span className={`text-[9px] text-right font-medium truncate
                      ${item.isWaste ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                      {item.isWaste ? '⚠ Waste' : (() => {
                        const cat = (item.step.tool_time_category || '').toLowerCase();
                        if (cat.startsWith('tooltime')) return '✓ TT';
                        if (cat.includes('essential')) return 'NVA-E';
                        if (cat.startsWith('nva')) return 'NVA';
                        return '—';
                      })()}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground border-t border-border/40 pt-2">
                {sequenceOptimiserResult.groupResults.filter(r => r.changed).length} of{' '}
                {sequenceOptimiserResult.groupResults.length} steps resequenced.
                {sequenceOptimiserResult.wasteCount > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 ml-1">
                    {sequenceOptimiserResult.wasteCount} waste step{sequenceOptimiserResult.wasteCount !== 1 ? 's' : ''} moved to end of each section.
                  </span>
                )}
                {' '}Tooltime tasks prioritised first.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setSequenceOptimiserResult(null)}>Cancel</Button>
                <Button size="sm" className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" onClick={applySequenceOptimisation}>Apply to Combination Table</Button>
              </div>
            </div>
          )}

          {/* Status badge */}
          <div className="absolute bottom-4 left-4 text-xs text-muted-foreground bg-card/80 backdrop-blur px-2 py-1 rounded pointer-events-none">
            {visibleSteps.length} / {steps.length} steps · {activeLayers.length === (mapLayers||[]).length ? 'All layers' : activeLayers.map(id => mapLayers?.find(l => l.id === id)?.name).filter(Boolean).join(', ')}{selectedEdgeId && ' · Path selected — drag anywhere on it to reroute · double-click handle to remove · Disconnect in toolbar to delete'}{!selectedEdgeId && ' · Click a path to select it, then drag to reroute'}{tool === 'connect' && !connectSource && ' · Connect mode — click a node to start'}{tool === 'connect' && connectSource && ' · Click a second node to connect · click same node to cancel'}
          </div>


        </div>

        {/* Right edit panel — key forces remount when step fields change so Select values stay in sync */}
        {/* ─── Insert Step Modal ───────────────────────────────────────────────── */}
        {insertModal && (() => {
          const { fromStep, toStep, insertPos } = insertModal;
          const layerName = mapLayers?.find(l => l.id === activeLayerId)?.name || 'Ground Level';
          return (
            <div className="fixed inset-0 z-[70] flex items-center justify-center"
              onMouseDown={() => setInsertModal(null)}>
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
              <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-[380px] max-w-[95vw]"
                onMouseDown={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent rounded-t-2xl">
                  <div>
                    <h3 className="font-bold text-sm flex items-center gap-2 text-foreground">
                      <PlusCircle className="w-4 h-4 text-primary" />
                      Insert Step on Map
                    </h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Inserting between
                      <span className="font-semibold text-foreground mx-1">#{fromStep.step_number} {(fromStep.task_description||'').substring(0,20)}{(fromStep.task_description||'').length > 20 ? '...' : ''}</span>
                      and
                      <span className="font-semibold text-foreground ml-1">#{toStep.step_number}</span>
                    </p>
                  </div>
                  <button onClick={() => setInsertModal(null)}
                    className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground text-sm">
                    &#x2715;
                  </button>
                </div>

                {/* Form body */}
                <div className="px-5 py-4 space-y-3">

                  {/* Task description */}
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                      Task Description <span className="text-destructive">*</span>
                    </label>
                    <input
                      autoFocus
                      value={insertForm.task_description}
                      onChange={e => setInsertForm(p => ({ ...p, task_description: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && insertForm.task_description.trim()) handleInsertStep(); }}
                      placeholder="e.g. Check oil level at dipstick..."
                      className="w-full h-8 text-xs px-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {/* Role + Section row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Role</label>
                      <select value={insertForm.role}
                        onChange={e => setInsertForm(p => ({ ...p, role: e.target.value }))}
                        className="w-full h-8 text-xs px-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                        <option value="">Same as prev</option>
                        {roles.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Section</label>
                      <select value={insertForm.section}
                        onChange={e => setInsertForm(p => ({ ...p, section: e.target.value }))}
                        className="w-full h-8 text-xs px-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                        <option value="">Same as prev</option>
                        {sections.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Tool Time Category</label>
                    <select value={insertForm.tool_time_category}
                      onChange={e => setInsertForm(p => ({ ...p, tool_time_category: e.target.value }))}
                      className="w-full h-8 text-xs px-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                      <option value="">Untagged</option>
                      {Object.entries(toolTimeGroups).map(([gKey, g]) =>
                        (g.subcategories || []).map(sub => (
                          <option key={gKey + '::' + sub} value={gKey + '::' + sub}>
                            {g.label} - {sub}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* Durations */}
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Durations (minutes)</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        ['manual_time',  'Manual'],
                        ['walking_time', 'Walking'],
                        ['waiting_time', 'Waiting'],
                      ].map(([key, label]) => (
                        <div key={key} className="text-center">
                          <p className="text-[9px] text-muted-foreground mb-1">{label}</p>
                          <input type="number" min={0} value={insertForm[key]}
                            onChange={e => setInsertForm(p => ({ ...p, [key]: e.target.value }))}
                            className="w-full h-7 text-xs px-1 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-center" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Node placement info */}
                  <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                    <span className="text-base">&#x1F4CD;</span>
                    <div className="text-[10px] text-muted-foreground leading-relaxed">
                      Node placed at <span className="font-mono text-foreground">({Math.round(insertPos.x)}, {Math.round(insertPos.y)})</span> on <span className="font-semibold text-foreground">{layerName}</span>. Drag to reposition after inserting.
                    </div>
                  </div>

                </div>

                {/* Footer */}
                <div className="flex gap-2 px-5 py-3 border-t border-border bg-muted/20 rounded-b-2xl">
                  <button onClick={() => setInsertModal(null)}
                    className="flex-1 h-8 text-xs rounded-lg border border-border hover:bg-muted/40 transition-colors text-muted-foreground">
                    Cancel
                  </button>
                  <button
                    onClick={handleInsertStep}
                    disabled={!insertForm.task_description.trim()}
                    className="flex-1 h-8 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-1.5">
                    <PlusCircle className="w-3.5 h-3.5" />
                    Insert &amp; Place Node
                  </button>
                </div>

              </div>
            </div>
          );
        })()}

        {selectedStep && (
          <div key={`panel-${selectedStepId}-${selectedStep?.role||''}-${selectedStep?.tool_time_category||''}-${selectedStep?.section||''}-${selectedStep?.internal_external||''}`}
            className="w-64 shrink-0 border-l bg-card overflow-y-auto z-20 shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
              <span className="font-semibold text-sm">Step {selectedStep.step_number}</span>
              <button onClick={() => setSelectedStepId(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 space-y-3 flex-1 overflow-y-auto">

              {/* Task description */}
              <div>
                <label className="text-xs font-medium">Task Description</label>
                <Input value={selectedStep.task_description || ''} className="h-7 text-xs mt-1"
                  onChange={e => updateStep(selectedStep.id, { task_description: e.target.value })} />
              </div>

              {/* Tool Time Category */}
              <div>
                <label className="text-xs font-medium">Tool Time Category</label>
                <Select value={selectedStep.tool_time_category || ''} onValueChange={v => updateStep(selectedStep.id, { tool_time_category: v })}>
                  <SelectTrigger className="h-7 text-xs mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(toolTimeGroups).map(([gKey, group]) =>
                      group.subcategories.map(sub => (
                        <SelectItem key={`${gKey}::${sub}`} value={`${gKey}::${sub}`} className="text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: group.color }} />
                            {group.label} → {sub}
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Role */}
              <div>
                <label className="text-xs font-medium">Role</label>
                <Select value={selectedStep.role || ''} onValueChange={v => updateStep(selectedStep.id, { role: v })}>
                  <SelectTrigger className="h-7 text-xs mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{roles.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {/* Section */}
              <div>
                <label className="text-xs font-medium">Section</label>
                <Select value={selectedStep.section || ''} onValueChange={v => updateStep(selectedStep.id, { section: v })}>
                  <SelectTrigger className="h-7 text-xs mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{sections.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {/* Durations */}
              {[
                ['manual_time', 'Manual (min)'],
                ['walking_time', 'Walking (min)'],
                ['waiting_time', 'Waiting (min)'],
                ['machine_time', 'Machine (min)'],
                ['inspection_time', 'Inspection (min)'],
              ].map(([field, label]) => (
                <div key={field}>
                  <label className="text-xs font-medium">{label}</label>
                  <Input type="number" min={0} value={selectedStep[field] || ''} className="h-7 text-xs mt-1"
                    onChange={e => updateStep(selectedStep.id, { [field]: Number(e.target.value) || 0 })} />
                </div>
              ))}

              {/* Internal / External */}
              <div>
                <label className="text-xs font-medium">Internal / External</label>
                <select
                  value={selectedStep.internal_external || ''}
                  onChange={e => updateStep(selectedStep.id, { internal_external: e.target.value || null })}
                  className="w-full h-7 text-xs px-2 rounded border border-border bg-background mt-1 focus:outline-none focus:ring-1 focus:ring-primary"
                  style={{ color: selectedStep.internal_external === 'Internal' ? '#2563EB' : selectedStep.internal_external === 'External' ? '#059669' : '#94a3b8' }}>
                  <option value="">— Unclassified</option>
                  <option value="Internal">🔵 Internal</option>
                  <option value="External">🟢 External</option>
                </select>
                <p className="text-[10px] text-muted-foreground mt-0.5">Internal = equipment stopped. External = can be done while running.</p>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium">Notes / Safety</label>
                <textarea value={selectedStep.notes || ''} rows={3}
                  className="w-full text-xs px-2 py-1 rounded border border-border bg-background mt-1 resize-none"
                  onChange={e => updateStep(selectedStep.id, { notes: e.target.value })} />
              </div>

              {/* Map Layer */}
              <div>
                <label className="text-xs font-medium">Map Layer</label>
                <Select
                  value={nodes[selectedStep.id]?.layerId ?? 'layer-ground'}
                  onValueChange={v => updateNodePosition(
                    selectedStep.id, nodes[selectedStep.id]?.x ?? 200, nodes[selectedStep.id]?.y ?? 200, v
                  )}>
                  <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {mapLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!activeLayers.includes(nodes[selectedStep.id]?.layerId ?? 'layer-ground') && (
                  <p className="text-[10px] text-amber-500 mt-0.5">⚠ This step is on a hidden layer</p>
                )}
              </div>

              {/* Total */}
              <div className="text-xs text-muted-foreground pt-1 border-t">
                Total: <span className="font-semibold text-foreground">{getStepTotal(selectedStep)}m</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

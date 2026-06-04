import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { getRoleColour } from '@/hooks/useRoleColours';

const NODE_W = 160;
const NODE_H = 44;
const H_GAP = 60;
const V_GAP = 20;

function buildLayout(steps, roleColours) {
  if (!steps || steps.length === 0) return { nodes: [], edges: [] };

  // Build dependency map
  const depMap = {}; // id -> [predecessor ids]
  const childMap = {}; // id -> [successor ids]
  steps.forEach(s => {
    depMap[s.id] = s.dependencies || [];
    s.dependencies?.forEach(pid => {
      if (!childMap[pid]) childMap[pid] = [];
      childMap[pid].push(s.id);
    });
  });

  // Topological sort for column (level) assignment
  const level = {};
  const visited = new Set();
  const visit = (id, depth) => {
    if (level[id] !== undefined && level[id] >= depth) return;
    level[id] = Math.max(level[id] ?? 0, depth);
    visited.add(id);
    (childMap[id] || []).forEach(cid => visit(cid, depth + 1));
  };
  // Roots = steps with no predecessors
  steps.forEach(s => { if (!depMap[s.id] || depMap[s.id].length === 0) visit(s.id, 0); });
  // Any unvisited (circular or orphan)
  steps.forEach(s => { if (!visited.has(s.id)) visit(s.id, 0); });

  // Group by level then by role for row assignment
  const levelGroups = {};
  steps.forEach(s => {
    const lv = level[s.id] ?? 0;
    if (!levelGroups[lv]) levelGroups[lv] = [];
    levelGroups[lv].push(s);
  });

  const nodes = [];
  const maxLevels = Math.max(...Object.keys(levelGroups).map(Number)) + 1;

  // Assign y within each level by role
  Object.entries(levelGroups).forEach(([lv, lvSteps]) => {
    // Sort by step_number for stable ordering
    const sorted = [...lvSteps].sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
    sorted.forEach((s, i) => {
      nodes.push({
        id: s.id,
        step: s,
        x: Number(lv) * (NODE_W + H_GAP),
        y: i * (NODE_H + V_GAP),
        color: getRoleColour(s.role, roleColours),
      });
    });
  });

  // Edges
  const edges = [];
  steps.forEach(s => {
    (s.dependencies || []).forEach(pid => {
      const fromNode = nodes.find(n => n.id === pid);
      const toNode = nodes.find(n => n.id === s.id);
      if (fromNode && toNode) {
        edges.push({ fromNode, toNode, isForward: toNode.x >= fromNode.x });
      }
    });
  });

  return { nodes, edges };
}

export default function DependencyGraphView({ steps, roleColours, onClose }) {
  const svgRef = useRef(null);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [zoom, setZoom] = useState(1);
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const panRef = useRef(null);

  const { nodes, edges } = useMemo(() => buildLayout(steps, roleColours), [steps, roleColours]);

  // Fit to view on mount / step change
  useEffect(() => {
    if (nodes.length === 0 || !svgRef.current) return;
    const svgW = svgRef.current.clientWidth || 800;
    const svgH = svgRef.current.clientHeight || 500;
    const maxX = Math.max(...nodes.map(n => n.x + NODE_W));
    const maxY = Math.max(...nodes.map(n => n.y + NODE_H));
    const scaleX = (svgW - 80) / maxX;
    const scaleY = (svgH - 80) / maxY;
    const newZoom = Math.min(1.2, Math.max(0.3, Math.min(scaleX, scaleY)));
    setZoom(newZoom);
    setPan({ x: 40, y: 40 });
  }, [nodes.length]);

  // Pan on drag
  const handleSvgMouseDown = useCallback((e) => {
    if (e.target !== svgRef.current && e.target.tagName !== 'svg') return;
    const startX = e.clientX - pan.x;
    const startY = e.clientY - pan.y;
    panRef.current = { startX, startY };
    const onMove = (me) => {
      setPan({ x: me.clientX - panRef.current.startX, y: me.clientY - panRef.current.startY });
    };
    const onUp = () => {
      panRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pan]);

  // Wheel zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(2, Math.max(0.2, z * delta)));
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const selectedStep = selectedId ? steps.find(s => s.id === selectedId) : null;
  const hoveredStep = hoveredId ? steps.find(s => s.id === hoveredId) : null;

  // Highlight paths from selected
  const highlightedFromIds = useMemo(() => {
    if (!selectedId) return new Set();
    const ids = new Set();
    const traverse = (id) => {
      (steps.find(s => s.id === id)?.dependencies || []).forEach(pid => {
        ids.add(pid); traverse(pid);
      });
    };
    traverse(selectedId);
    return ids;
  }, [selectedId, steps]);

  const highlightedToIds = useMemo(() => {
    if (!selectedId) return new Set();
    const ids = new Set();
    const childMap = {};
    steps.forEach(s => s.dependencies?.forEach(pid => {
      if (!childMap[pid]) childMap[pid] = [];
      childMap[pid].push(s.id);
    }));
    const traverse = (id) => {
      (childMap[id] || []).forEach(cid => { ids.add(cid); traverse(cid); });
    };
    traverse(selectedId);
    return ids;
  }, [selectedId, steps]);

  const getEdgeStyle = (edge) => {
    if (!selectedId) return { stroke: '#94a3b8', opacity: 0.6, width: 1.5 };
    const fromId = edge.fromNode.id;
    const toId = edge.toNode.id;
    if (fromId === selectedId || toId === selectedId) return { stroke: '#ef4444', opacity: 1, width: 2.5 };
    if (highlightedFromIds.has(fromId) && (highlightedFromIds.has(toId) || toId === selectedId))
      return { stroke: '#f97316', opacity: 0.9, width: 2 };
    if (highlightedToIds.has(toId) && (highlightedToIds.has(fromId) || fromId === selectedId))
      return { stroke: '#8b5cf6', opacity: 0.9, width: 2 };
    return { stroke: '#94a3b8', opacity: 0.2, width: 1 };
  };

  const getNodeStyle = (node) => {
    if (!selectedId) return { opacity: 1, ring: false };
    if (node.id === selectedId) return { opacity: 1, ring: 'selected' };
    if (highlightedFromIds.has(node.id)) return { opacity: 1, ring: 'predecessor' };
    if (highlightedToIds.has(node.id)) return { opacity: 1, ring: 'successor' };
    return { opacity: 0.3, ring: false };
  };

  const edgePath = (from, to) => {
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const dx = Math.max(30, Math.abs(x2 - x1) * 0.4);
    if (x2 >= x1) {
      return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
    } else {
      // Back-edge: route around
      const midX = Math.max(x1, x2) + NODE_W * 0.5;
      return `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`;
    }
  };

  if (nodes.length === 0) {
    return (
      <Card className="mb-3">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No steps with dependencies — add dependencies in the Dependency column to see the graph.
          <button onClick={onClose} className="ml-4 text-xs underline">Close</button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-3 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">🕸 Dependency Graph</span>
          <span className="text-[11px] text-muted-foreground">{nodes.length} tasks · {edges.length} dependencies · Click a node to trace its chain</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setZoom(z => Math.min(2, z * 1.2))}><ZoomIn className="w-3 h-3" /></Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setZoom(z => Math.max(0.2, z * 0.85))}><ZoomOut className="w-3 h-3" /></Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Reset view"
            onClick={() => { setZoom(1); setPan({ x: 40, y: 40 }); }}><Maximize2 className="w-3 h-3" /></Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}><X className="w-3 h-3" /></Button>
        </div>
      </div>

      <div className="flex" style={{ height: 420 }}>
        {/* Graph canvas */}
        <svg
          ref={svgRef}
          className="flex-1 cursor-grab active:cursor-grabbing select-none bg-muted/10"
          onMouseDown={handleSvgMouseDown}
          onClick={(e) => { if (e.target === svgRef.current || e.target.tagName === 'svg') setSelectedId(null); }}
        >
          <defs>
            <marker id="dep-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="#ef4444" />
            </marker>
            <marker id="dep-arrow-dim" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="#94a3b8" />
            </marker>
            <marker id="dep-arrow-pred" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="#f97316" />
            </marker>
            <marker id="dep-arrow-succ" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="#8b5cf6" />
            </marker>
          </defs>

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Edges first (below nodes) */}
            {edges.map((edge, i) => {
              const style = getEdgeStyle(edge);
              const markerId = selectedId
                ? (edge.fromNode.id === selectedId || edge.toNode.id === selectedId) ? 'dep-arrow'
                : highlightedFromIds.has(edge.fromNode.id) ? 'dep-arrow-pred'
                : highlightedToIds.has(edge.toNode.id) ? 'dep-arrow-succ'
                : 'dep-arrow-dim'
                : 'dep-arrow-dim';
              return (
                <path
                  key={i}
                  d={edgePath(edge.fromNode, edge.toNode)}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={style.width}
                  strokeOpacity={style.opacity}
                  markerEnd={`url(#${markerId})`}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map(node => {
              const ns = getNodeStyle(node);
              const isHovered = hoveredId === node.id;
              const isSelected = selectedId === node.id;
              const ringColor = ns.ring === 'selected' ? '#ef4444'
                : ns.ring === 'predecessor' ? '#f97316'
                : ns.ring === 'successor' ? '#8b5cf6'
                : 'transparent';
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  style={{ opacity: ns.opacity, cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={(e) => { e.stopPropagation(); setSelectedId(node.id === selectedId ? null : node.id); }}
                >
                  {/* Shadow */}
                  {(isHovered || isSelected) && (
                    <rect x={-2} y={-2} width={NODE_W + 4} height={NODE_H + 4} rx={8}
                      fill="none" stroke={ringColor || node.color} strokeWidth={2.5} />
                  )}
                  {/* Body */}
                  <rect x={0} y={0} width={NODE_W} height={NODE_H} rx={6}
                    fill="white" stroke={node.color} strokeWidth={isSelected ? 2 : 1.5}
                    style={{ filter: isHovered ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.18))' : 'none' }}
                  />
                  {/* Role colour bar */}
                  <rect x={0} y={0} width={4} height={NODE_H} rx={3} fill={node.color} />
                  {/* Step number badge */}
                  <rect x={8} y={6} width={22} height={14} rx={3} fill={node.color} fillOpacity={0.15} />
                  <text x={19} y={16} textAnchor="middle" fontSize={9} fontWeight="bold" fill={node.color}>
                    #{node.step.step_number}
                  </text>
                  {/* Task description */}
                  <text x={36} y={16} fontSize={9} fontWeight="600" fill="#1e293b">
                    {(node.step.task_description || '—').substring(0, 18)}{node.step.task_description?.length > 18 ? '…' : ''}
                  </text>
                  {/* Role + timing */}
                  <text x={36} y={30} fontSize={8} fill="#64748b">
                    {node.step.role || '—'} · {Math.round(node.step._start ?? 0)}→{Math.round(node.step._finish ?? 0)}m
                  </text>
                  {/* Dependency indicator */}
                  {(node.step.dependencies?.length > 0) && (
                    <circle cx={NODE_W - 8} cy={8} r={4} fill="#ef4444" fillOpacity={0.8} />
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Detail panel */}
        <div className="w-56 border-l bg-card p-3 overflow-y-auto flex-shrink-0">
          {selectedStep ? (
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Selected Task</p>
                <p className="text-xs font-bold">#{selectedStep.step_number} {selectedStep.task_description || '—'}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{selectedStep.role || 'No role'}</p>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { label: 'Start', value: `${Math.round(selectedStep._start ?? 0)}m` },
                  { label: 'Finish', value: `${Math.round(selectedStep._finish ?? 0)}m` },
                  { label: 'Duration', value: `${Math.round(selectedStep._total ?? 0)}m` },
                  { label: 'Deps', value: selectedStep.dependencies?.length || 0 },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-muted/40 rounded p-1.5 text-center">
                    <p className="text-[9px] text-muted-foreground">{label}</p>
                    <p className="text-xs font-bold">{value}</p>
                  </div>
                ))}
              </div>
              {highlightedFromIds.size > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-orange-600 mb-1">⬆ Predecessors ({highlightedFromIds.size})</p>
                  {[...highlightedFromIds].map(pid => {
                    const ps = steps.find(s => s.id === pid);
                    return ps ? (
                      <div key={pid} className="text-[10px] text-muted-foreground py-0.5 border-b border-border/30 last:border-0">
                        #{ps.step_number} {(ps.task_description || '—').substring(0, 20)}
                        <span className="ml-1 text-orange-500 font-mono">{Math.round(ps._finish ?? 0)}m→</span>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
              {highlightedToIds.size > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-purple-600 mb-1">⬇ Successors ({highlightedToIds.size})</p>
                  {[...highlightedToIds].map(sid => {
                    const ss = steps.find(s => s.id === sid);
                    return ss ? (
                      <div key={sid} className="text-[10px] text-muted-foreground py-0.5 border-b border-border/30 last:border-0">
                        #{ss.step_number} {(ss.task_description || '—').substring(0, 20)}
                        <span className="ml-1 text-purple-500 font-mono">→{Math.round(ss._start ?? 0)}m</span>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
              <button onClick={() => setSelectedId(null)} className="text-[10px] text-muted-foreground hover:text-foreground underline">Clear selection</button>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground space-y-3">
              <p className="font-semibold text-foreground">How to use</p>
              <div className="space-y-1.5">
                <p>• <span className="font-medium">Click</span> a node to trace its dependency chain</p>
                <p>• <span className="font-medium text-orange-600">Orange</span> = predecessors</p>
                <p>• <span className="font-medium text-purple-600">Purple</span> = successors</p>
                <p>• <span className="font-medium text-red-500">Red</span> = direct link</p>
                <p>• <span className="font-medium">Drag</span> background to pan</p>
                <p>• <span className="font-medium">Scroll</span> to zoom</p>
              </div>
              <div className="border-t border-border/30 pt-2">
                <p className="text-[10px]">Nodes with a <span className="text-red-500 font-bold">●</span> have dependencies set.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
import React, { useRef } from 'react';
import { buildEdgePath, getMidpoint } from '@/lib/spaghettiMapUtils';

const NODE_R = 16;
const GRID = 20;

function snap(v) { return Math.round(v / GRID) * GRID; }

export default function Canvas({
  svgRef,
  pan, setPan,
  zoom,
  tool, connectSource, connectPreview,
  draggingNodeId, dragOffset,
  visibleSteps, steps,
  nodes, getNodePos,
  selectedStepId, selectedEdgeId,
  hoveredEdgeId, setHoveredEdgeId,
  roleColours, getRoleColour,
  toolTimeGroups,
  mapEdgeWaypoints,
  setSelectedStepId, setSelectedEdgeId,
  removeConnection, setInsertModal, setInsertForm, setSelectedEdgeId: setSelectedEdgeIdFn,
  updateEdgeWaypoints,
  draggingWaypoint, setDraggingWaypoint,
  svgPoint,
  schematicUrl, schematicPos, schematicOpacity, schematicLocked,
  setDraggingSchematic, setSchematicDragOffset,
  nodeLayerOpacity,
  handleCanvasMouseDown, handleCanvasMouseMove, handleCanvasMouseUp,
  startDrag, handleNodeClick,
  getCursor,
  nodesInZone,
  activeLayerId,
  visibleMapSteps,
}) {
  const handleCanvasClick = (e) => {
    if (e.target === svgRef.current || e.target.tagName === 'svg' || e.target.tagName === 'rect') {
      setSelectedStepId(null);
      setSelectedEdgeId(null);
    }
  };

  return (
    <div className="flex-1 relative overflow-hidden bg-slate-950" >
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', cursor: getCursor() }}
        className="select-none"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onClick={handleCanvasClick}
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
          {/* Schematic */}
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
                    // Schematic drag is handled by parent—no op here
                  };
                  const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                  };
                  window.addEventListener('mousemove', onMove);
                  window.addEventListener('mouseup', onUp);
                }}
              />
            </g>
          )}

          {/* Node + edge layer */}
          <g opacity={nodeLayerOpacity}>
            {/* Connect preview */}
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

            {/* Edges */}
            {(() => {
              const sorted = [...visibleSteps].sort((a, b) => a.step_number - b.step_number);
              return sorted.slice(0, -1).map((fromStep, i) => {
                const toStep = sorted[i + 1];
                if (fromStep.role !== toStep.role) return null;
                const edgeId = `${fromStep.id}→${toStep.id}`;
                const storedWaypoints = mapEdgeWaypoints?.[edgeId] || [];
                const fromPos = getNodePos(fromStep);
                const toPos = getNodePos(toStep);
                const fromPt = { x: fromPos.x + NODE_R, y: fromPos.y };
                const toPt = { x: toPos.x - NODE_R, y: toPos.y };
                const pathD = buildEdgePath(fromPt, toPt, storedWaypoints);
                const isSelected = selectedEdgeId === edgeId;
                const colour = getRoleColour(fromStep.role);
                const mid = getMidpoint(fromPt, toPt, storedWaypoints);

                return (
                  <g key={edgeId} onMouseEnter={() => setHoveredEdgeId(edgeId)} onMouseLeave={() => setHoveredEdgeId(null)}>
                    <path d={pathD} fill="none" stroke="transparent" strokeWidth={16} style={{ cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); setSelectedEdgeId(edgeId); }} />
                    <path d={pathD} fill="none" stroke={isSelected ? '#f59e0b' : colour}
                      strokeWidth={isSelected ? 2.5 : hoveredEdgeId === edgeId ? 2.5 : 1.6}
                      markerEnd={isSelected ? 'url(#sm-arrow-sel)' : 'url(#sm-arrow)'}
                      style={{ pointerEvents: 'none' }} />
                    {(hoveredEdgeId === edgeId || isSelected) && (
                      <g style={{ cursor: 'pointer' }} onClick={(e) => {
                        e.stopPropagation();
                        const pt = svgPoint(e);
                        setInsertModal({ fromStep, toStep, insertPos: { x: snap(pt.x), y: snap(pt.y) }, layerId: activeLayerId });
                        setInsertForm(prev => ({ ...prev, role: fromStep.role || '', section: fromStep.section || '' }));
                        setSelectedEdgeIdFn(edgeId);
                      }}>
                        <circle cx={mid.x} cy={mid.y} r={12} fill="white" fillOpacity={0.95} stroke={colour} strokeWidth={2} />
                        <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central"
                          fontSize={14} fontWeight="900" fill={colour} style={{ pointerEvents: 'none', userSelect: 'none' }}>+</text>
                      </g>
                    )}
                  </g>
                );
              });
            })()}

            {/* Nodes */}
            {visibleSteps.map(step => {
              const pos = getNodePos(step);
              const colour = getRoleColour(step.role);
              const isSelected = selectedStepId === step.id;
              return (
                <g key={step.id} transform={`translate(${pos.x},${pos.y})`}
                  style={{ cursor: draggingNodeId === step.id ? 'grabbing' : 'grab' }}
                  onMouseDown={(e) => startDrag(e, step.id)}
                  onClick={(e) => handleNodeClick(e, step.id)}>
                  {isSelected && (
                    <circle r={NODE_R + 4} fill="none" stroke="#006A9D" strokeWidth={2.5} />
                  )}
                  <circle r={NODE_R} fill={colour} stroke="white" strokeWidth={1.5} />
                  <text textAnchor="middle" dominantBaseline="central"
                    fontSize={10} fontWeight="700" fill="white"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    {step.step_number}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
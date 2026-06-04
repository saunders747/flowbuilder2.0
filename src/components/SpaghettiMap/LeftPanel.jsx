import React from 'react';
import { ChevronLeft, ChevronRight, Plus, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function StepRow({ step, isSelected, onClick, colour }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer select-none text-xs border mb-0.5
        ${isSelected ? 'border-primary/60 bg-primary/10' : 'border-transparent hover:bg-muted/60'}`}
      onClick={onClick}
    >
      <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground shrink-0">
        <GripVertical className="w-3 h-3" />
      </span>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colour }} />
      <span className="font-mono text-[10px] text-muted-foreground shrink-0">#{step.step_number}</span>
      <span className="truncate">{step.task_description || <em className="opacity-40">No description</em>}</span>
    </div>
  );
}

export default function LeftPanel({
  leftOpen, setLeftOpen,
  visibleSteps, steps,
  selectedStepId, setSelectedStepId,
  setSelectedEdgeId,
  getRoleColour,
  handleDragEnd,
  handleAddStep,
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  return (
    <div className={`flex flex-col border-r bg-card shrink-0 transition-all duration-200 ${leftOpen ? 'w-56' : 'w-8'}`}>
      <div className="flex items-center justify-between px-2 py-1.5 border-b">
        {leftOpen && <span className="text-xs font-semibold text-muted-foreground">Steps {visibleSteps.length < steps.length ? `(${visibleSteps.length} of ${steps.length})` : `(${steps.length})`}</span>}
        <button onClick={() => setLeftOpen(v => !v)} className="ml-auto text-muted-foreground hover:text-foreground">
          {leftOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
      {leftOpen && (
        <>
          <div className="flex-1 overflow-y-auto p-1.5">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={visibleSteps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                {visibleSteps.map(step => (
                  <StepRow
                    key={step.id}
                    step={step}
                    isSelected={selectedStepId === step.id}
                    colour={getRoleColour(step.role)}
                    onClick={() => {
                      setSelectedStepId(prev => prev === step.id ? null : step.id);
                      setSelectedEdgeId(null);
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          <div className="border-t border-border/50 p-1.5 shrink-0">
            <button
              onClick={handleAddStep}
              className="w-full h-7 text-xs flex items-center justify-center gap-1.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border"
              title="Add a new step — syncs with Combination Table"
            >
              <Plus className="w-3 h-3" /> Add Step
            </button>
          </div>
        </>
      )}
    </div>
  );
}
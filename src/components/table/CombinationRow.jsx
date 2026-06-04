import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GripVertical, Trash2, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRoles } from '@/hooks/useRoles';
import { useRoleColours, getRoleColour } from '@/hooks/useRoleColours';

export default function CombinationRow({ step, provided, isDragging, onUpdate, onDelete, onDuplicate, total }) {
  const { roles } = useRoles();
  const { colours } = useRoleColours();
  const hasWaste = (step.waiting_time > 0) || (step.walking_time > 5);

  return (
    <tr
      ref={provided.innerRef}
      {...provided.draggableProps}
      className={cn(
        "border-b border-border/50 transition-colors",
        isDragging && "bg-primary/5 shadow-lg",
        hasWaste && "bg-destructive/3",
        step.safety_critical && "border-l-2 border-l-orange-500",
        step.constraint_flag && "border-l-2 border-l-red-500"
      )}
    >
      <td className="p-1 text-center" {...provided.dragHandleProps}>
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground mx-auto cursor-grab" />
      </td>
      <td className="p-2 font-mono font-medium text-muted-foreground">{step.step_number}</td>
      <td className="p-1">
        <Input
          value={step.task_description || ''}
          onChange={e => onUpdate({ task_description: e.target.value })}
          className="h-7 text-xs border-0 bg-transparent focus:bg-card px-1"
        />
      </td>
      <td className="p-1">
        <Select value={step.role || ''} onValueChange={v => onUpdate({ role: v })}>
          <SelectTrigger 
            className="h-7 text-xs border-0 bg-transparent font-medium"
            style={step.role ? { color: getRoleColour(step.role, colours) } : {}}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map(r => (
              <SelectItem key={r} value={r}>
                <span style={{ color: getRoleColour(r, colours) }} className="font-medium">{r}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="p-1">
        <Input
          value={step.location || ''}
          onChange={e => onUpdate({ location: e.target.value })}
          className="h-7 text-xs border-0 bg-transparent focus:bg-card px-1"
        />
      </td>
      <td className="p-1">
        <Input
          type="number" min={0}
          value={step.manual_time || ''}
          onChange={e => onUpdate({ manual_time: Number(e.target.value) || 0 })}
          className="h-7 text-xs border-0 bg-transparent focus:bg-card px-1 text-center"
        />
      </td>
      <td className="p-1">
        <Input
          type="number" min={0}
          value={step.walking_time || ''}
          onChange={e => onUpdate({ walking_time: Number(e.target.value) || 0 })}
          className={cn("h-7 text-xs border-0 bg-transparent focus:bg-card px-1 text-center", step.walking_time > 5 && "text-destructive font-medium")}
        />
      </td>
      <td className="p-1">
        <Input
          type="number" min={0}
          value={step.waiting_time || ''}
          onChange={e => onUpdate({ waiting_time: Number(e.target.value) || 0 })}
          className={cn("h-7 text-xs border-0 bg-transparent focus:bg-card px-1 text-center", step.waiting_time > 0 && "text-destructive font-medium")}
        />
      </td>
      <td className="p-1">
        <Input
          type="number" min={0}
          value={step.machine_time || ''}
          onChange={e => onUpdate({ machine_time: Number(e.target.value) || 0 })}
          className="h-7 text-xs border-0 bg-transparent focus:bg-card px-1 text-center"
        />
      </td>
      <td className="p-1">
        <Input
          type="number" min={0}
          value={step.inspection_time || ''}
          onChange={e => onUpdate({ inspection_time: Number(e.target.value) || 0 })}
          className="h-7 text-xs border-0 bg-transparent focus:bg-card px-1 text-center"
        />
      </td>
      <td className="p-2 text-center font-mono font-semibold">{total}</td>
      <td className="p-1">
        <Input
          value={step.tools_required || ''}
          onChange={e => onUpdate({ tools_required: e.target.value })}
          className="h-7 text-xs border-0 bg-transparent focus:bg-card px-1"
        />
      </td>
      <td className="p-1">
        <Input
          value={step.parts_required || ''}
          onChange={e => onUpdate({ parts_required: e.target.value })}
          className="h-7 text-xs border-0 bg-transparent focus:bg-card px-1"
        />
      </td>
      <td className="p-2 text-center">
        {step.safety_critical && <span title="Safety Critical">🛡️</span>}
        {step.constraint_flag && <span title="Constraint">🔴</span>}
      </td>
      <td className="p-1">
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDuplicate}>
            <Copy className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={onDelete}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Trash2 } from 'lucide-react';
import { useToolTimeCategories } from '@/hooks/useToolTimeCategories';

export default function RowEditPanel({ step, onUpdate, onDelete, onClose, roles, toolTimeGroups }) {
  if (!step) return null;

  const total = (step.manual_time || 0) + (step.walking_time || 0) + (step.waiting_time || 0) + 
                (step.machine_time || 0) + (step.inspection_time || 0);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3 flex items-center justify-between">
        <CardTitle className="text-sm">Step #{step.step_number}</CardTitle>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div>
          <Label className="text-[10px]">Task Description</Label>
          <Textarea 
            value={step.task_description || ''} 
            onChange={e => onUpdate({ task_description: e.target.value })}
            className="h-16 text-xs mt-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Role</Label>
            <Select value={step.role || ''} onValueChange={v => onUpdate({ role: v })}>
              <SelectTrigger className="h-7 text-xs mt-1">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>—</SelectItem>
                {roles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Total (min)</Label>
            <Input 
              type="number" 
              value={total} 
              disabled
              className="h-7 text-xs mt-1 opacity-60"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div>
            <Label className="text-[10px]">Manual</Label>
            <Input 
              type="number" 
              value={step.manual_time || 0} 
              onChange={e => onUpdate({ manual_time: Number(e.target.value) || 0 })}
              className="h-7 text-xs mt-0.5"
            />
          </div>
          <div>
            <Label className="text-[10px]">Walking</Label>
            <Input 
              type="number" 
              value={step.walking_time || 0} 
              onChange={e => onUpdate({ walking_time: Number(e.target.value) || 0 })}
              className="h-7 text-xs mt-0.5"
            />
          </div>
          <div>
            <Label className="text-[10px]">Waiting</Label>
            <Input 
              type="number" 
              value={step.waiting_time || 0} 
              onChange={e => onUpdate({ waiting_time: Number(e.target.value) || 0 })}
              className="h-7 text-xs mt-0.5"
            />
          </div>
        </div>

        <div>
          <Label className="text-[10px]">Tool Time Category</Label>
          <Select value={step.tool_time_category || ''} onValueChange={v => onUpdate({ tool_time_category: v })}>
            <SelectTrigger className="h-7 text-xs mt-1">
              <SelectValue placeholder="— none —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>— none —</SelectItem>
              {Object.entries(toolTimeGroups).map(([gKey, g]) => (
                <React.Fragment key={gKey}>
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase border-t">{g.label}</div>
                  {g.subcategories?.map(sub => (
                    <SelectItem key={`${gKey}::${sub}`} value={`${gKey}::${sub}`} className="text-xs">
                      {sub}
                    </SelectItem>
                  ))}
                </React.Fragment>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t">
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={onDelete}
            className="flex-1 h-7 text-xs gap-1"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onClose}
            className="flex-1 h-7 text-xs"
          >
            Done
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
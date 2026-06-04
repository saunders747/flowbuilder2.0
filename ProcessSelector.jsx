import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/standaloneClient';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProcess } from '@/lib/processContext';
import { toast } from 'sonner';
import { groupProcessesByFleetClass } from '@/hooks/useGroupedProcesses';

export default function ProcessSelector() {
  const { activeProcess, loadProcess } = useProcess();

  const { data: processes = [] } = useQuery({
    queryKey: ['processes'],
    queryFn: () => appClient.entities.Process.list('-updated_date', 200),
  });

  const groups = groupProcessesByFleetClass(processes);

  const handleSelect = async (id) => {
    try {
      const proc = await appClient.entities.Process.get(id);
      if (proc) await loadProcess(proc);
    } catch (err) {
      console.error('Failed to load process:', err);
      toast.error('Failed to load process');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground whitespace-nowrap">Process:</span>
      <Select value={activeProcess?.id || ''} onValueChange={handleSelect}>
        <SelectTrigger className="h-8 text-xs w-72">
          <SelectValue placeholder="Select a process…" />
        </SelectTrigger>
        <SelectContent>
          {groups.map(({ fleetClass, processes: procs }) => (
            <SelectGroup key={fleetClass}>
              <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1 flex items-center gap-1.5">
                <span>📁</span> {fleetClass}
              </SelectLabel>
              {procs.map(p => (
                <SelectItem key={p.id} value={p.id} className="text-xs pl-6">
                  {p.name}
                  {p.asset_model ? ` — ${p.asset_model}` : ''}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
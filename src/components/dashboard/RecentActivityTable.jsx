import React from 'react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function RecentActivityTable({ processes, statusColors }) {
  if (processes.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">No processes yet. Create your first one!</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-left">
            <th className="py-2 font-medium">Process</th>
            <th className="py-2 font-medium">Fleet Class</th>
            <th className="py-2 font-medium">Service Type</th>
            <th className="py-2 font-medium">Status</th>
            <th className="py-2 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {processes.map(p => (
            <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
              <td className="py-2.5 font-medium">{p.name}</td>
              <td className="py-2.5 text-muted-foreground">{p.fleet_class || '—'}</td>
              <td className="py-2.5 text-muted-foreground">{p.service_type || '—'}</td>
              <td className="py-2.5">
                <Badge variant="secondary" className={cn("text-xs", statusColors[p.approval_status || 'Draft'])}>
                  {p.approval_status || 'Draft'}
                </Badge>
              </td>
              <td className="py-2.5 text-muted-foreground text-xs">
                {p.updated_date ? format(new Date(p.updated_date), 'dd MMM yyyy') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
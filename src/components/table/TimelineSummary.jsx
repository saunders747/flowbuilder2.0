import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const COLORS = {
  manual: '#f59e0b',
  walking: '#ef4444',
  waiting: '#94a3b8',
  machine: '#3b82f6',
  inspection: '#10b981',
};

export default function TimelineSummary({ steps, getStepTotal }) {
  const maxTime = Math.max(...steps.map(s => getStepTotal(s)), 1);

  return (
    <Card>
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-xs font-medium">Timeline View</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-1.5">
        {/* Legend */}
        <div className="flex gap-3 mb-2 text-[10px]">
          {Object.entries(COLORS).map(([key, color]) => (
            <div key={key} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
              <span className="capitalize text-muted-foreground">{key}</span>
            </div>
          ))}
        </div>

        {steps.map(step => {
          const total = getStepTotal(step);
          return (
            <div key={step.id} className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground w-6 text-right shrink-0">
                {step.step_number}
              </span>
              <div className="flex-1 flex h-5 rounded-sm overflow-hidden bg-muted">
                {step.manual_time > 0 && (
                  <div
                    style={{ width: `${(step.manual_time / maxTime) * 100}%`, background: COLORS.manual }}
                    className="h-full"
                    title={`Manual: ${step.manual_time}m`}
                  />
                )}
                {step.walking_time > 0 && (
                  <div
                    style={{ width: `${(step.walking_time / maxTime) * 100}%`, background: COLORS.walking }}
                    className="h-full"
                    title={`Walking: ${step.walking_time}m`}
                  />
                )}
                {step.waiting_time > 0 && (
                  <div
                    style={{ width: `${(step.waiting_time / maxTime) * 100}%`, background: COLORS.waiting }}
                    className="h-full"
                    title={`Waiting: ${step.waiting_time}m`}
                  />
                )}
                {step.machine_time > 0 && (
                  <div
                    style={{ width: `${(step.machine_time / maxTime) * 100}%`, background: COLORS.machine }}
                    className="h-full"
                    title={`Machine: ${step.machine_time}m`}
                  />
                )}
                {step.inspection_time > 0 && (
                  <div
                    style={{ width: `${(step.inspection_time / maxTime) * 100}%`, background: COLORS.inspection }}
                    className="h-full"
                    title={`Inspection: ${step.inspection_time}m`}
                  />
                )}
              </div>
              <span className="text-[10px] font-mono text-muted-foreground w-10 shrink-0">{total}m</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
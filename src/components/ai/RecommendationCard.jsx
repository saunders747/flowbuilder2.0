import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, ArrowRight, Trash2, Users, ExternalLink } from 'lucide-react';

const TYPE_META = {
  reallocate_role: { icon: Users, label: 'Skill Reallocation', color: 'text-blue-700', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800' },
  convert_to_external: { icon: ExternalLink, label: 'SMED — Convert to External', color: 'text-green-700', bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200 dark:border-green-800' },
  eliminate_waste: { icon: Trash2, label: 'Waste Elimination', color: 'text-red-700', bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800' },
};

const RISK_STYLES = {
  low: { label: 'Low risk', bg: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  medium: { label: 'Med risk', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  high: { label: 'High risk', bg: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
};

export default function RecommendationCard({ rec, onApply, applying }) {
  const meta = TYPE_META[rec.type] || TYPE_META.reallocate_role;
  const Icon = meta.icon;
  const risk = RISK_STYLES[rec.risk] || RISK_STYLES.low;
  const isHighRisk = rec.risk === 'high';

  return (
    <div className={`rounded-xl border ${meta.border} ${meta.bg} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.color}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${risk.bg}`}>{risk.label}</span>
              {rec.estimated_saving_minutes > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-primary/10 text-primary">
                  −{rec.estimated_saving_minutes}m
                </span>
              )}
            </div>
            <p className="text-sm font-semibold mt-0.5 text-foreground">{rec.title}</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{rec.description}</p>

      {rec.type === 'reallocate_role' && rec.current_role && rec.proposed_role && (
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline" className="text-[10px]">{rec.current_role}</Badge>
          <ArrowRight className="w-3 h-3 text-muted-foreground" />
          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">{rec.proposed_role}</Badge>
          <span className="text-muted-foreground">on {rec.step_numbers?.length} step{rec.step_numbers?.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {rec.step_numbers?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {rec.step_numbers.map(n => (
            <span key={n} className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-background border border-border">
              #{n}
            </span>
          ))}
        </div>
      )}

      {isHighRisk && rec.risk_reason && (
        <div className="flex items-start gap-2 bg-red-100 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300">{rec.risk_reason}</p>
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button
          size="sm"
          variant={isHighRisk ? 'destructive' : 'default'}
          onClick={() => onApply(rec)}
          disabled={applying}
          className="h-7 text-xs gap-1.5"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          {applying ? 'Applying…' : isHighRisk ? 'Apply (High Risk)' : 'Apply'}
        </Button>
      </div>
    </div>
  );
}
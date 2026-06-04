import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getStoredToolTimeGroups } from '@/hooks/useToolTimeCategories';

const SEGMENT_ORDER = ['tooltime','nva_essential','nva_activities','waste','unassigned'];
const FALLBACK_COLOURS = {
  tooltime:      '#1B7A3F',
  nva_essential: '#2563EB',
  nva_activities:'#D97706',
  waste:         '#DC2626',
  unassigned:    '#94A3B8',
};
const FALLBACK_LABELS = {
  tooltime:'Tooltime', nva_essential:'NVA Essential',
  nva_activities:'NVA Activities', waste:'Waste', unassigned:'Untagged',
};

function getSegmentMeta() {
  const groups = getStoredToolTimeGroups();
  const colours = { ...FALLBACK_COLOURS };
  const labels  = { ...FALLBACK_LABELS };
  if (groups) {
    if (groups.tooltime)       { colours.tooltime       = groups.tooltime.color;       labels.tooltime       = groups.tooltime.label; }
    if (groups.nva_essential)  { colours.nva_essential  = groups.nva_essential.color;  labels.nva_essential  = groups.nva_essential.label; }
    if (groups.nva_activities) { colours.nva_activities = groups.nva_activities.color; labels.nva_activities = groups.nva_activities.label; }
    if (groups.waste)          { colours.waste          = groups.waste.color;          labels.waste          = groups.waste.label; }
  }
  return { colours, labels };
}

function getSegmentKey(cat) {
  const c = (cat || '').toLowerCase();
  if (c.startsWith('tooltime')) return 'tooltime';
  if (c.includes('essential'))  return 'nva_essential';
  if (c.startsWith('nva'))      return 'nva_activities';
  if (c.startsWith('waste'))    return 'waste';
  return 'unassigned';
}
function getStepDur(s) {
  return (Number(s.manual_time)||0)+(Number(s.walking_time)||0)+
         (Number(s.waiting_time)||0)+(Number(s.machine_time)||0)+(Number(s.inspection_time)||0);
}
function buildRoleData(steps) {
  const roleMap={}, roleOrder=[];
  steps.forEach(s => {
    const role = s.role||'Unassigned';
    if (!roleMap[role]) { roleMap[role]={}; roleOrder.push(role); }
    const key = getSegmentKey(s.tool_time_category);
    roleMap[role][key] = (roleMap[role][key]||0) + getStepDur(s);
  });
  return roleOrder.map(role => {
    const segs = roleMap[role];
    const total = Object.values(segs).reduce((a,v)=>a+v,0);
    const pce = total > 0 ? Math.round((segs.tooltime||0)/total*100) : 0;
    return { role, segs, total, pce };
  });
}

function YamazumiSVG({ roleData, taktTime, height=260, label='' }) {
  const { colours: SEGMENT_COLOURS } = useMemo(getSegmentMeta, []);
  if (!roleData||roleData.length===0) return null;
  const maxY = Math.max(...roleData.map(r=>r.total), taktTime||0, 10);
  const paddedMax = Math.ceil(maxY*1.12/25)*25||50;
  const M = { top:16, right:20, bottom:48, left:44 };
  const BAR_W = Math.min(64, Math.max(28, Math.floor((560-M.left-M.right)/roleData.length)-10));
  const chartW = Math.max(400,(BAR_W+10)*roleData.length+M.left+M.right+20);
  const chartH = height;
  const plotH = chartH-M.top-M.bottom;
  const plotW = chartW-M.left-M.right;
  const yScale = v => plotH-(v/paddedMax)*plotH;
  const ticks = Array.from({length:7},(_,i)=>Math.round(paddedMax/6*i));
  const barX = i => M.left+i*(BAR_W+10)+5;

  return (
    <div className="overflow-x-auto">
      <svg width={chartW} height={chartH} style={{display:'block'}}>
        {/* Y grid + ticks */}
        {ticks.map(t=>(
          <g key={t}>
            <line x1={M.left} x2={M.left+plotW} y1={M.top+yScale(t)} y2={M.top+yScale(t)}
              stroke="#e2e8f0" strokeWidth={1} />
            <text x={M.left-6} y={M.top+yScale(t)+4} textAnchor="end" fontSize={9} fill="#94a3b8">{t}</text>
          </g>
        ))}
        {/* Axes */}
        <line x1={M.left} x2={M.left} y1={M.top} y2={M.top+plotH} stroke="#cbd5e1" strokeWidth={1}/>
        <line x1={M.left} x2={M.left+plotW} y1={M.top+plotH} y2={M.top+plotH} stroke="#cbd5e1" strokeWidth={1}/>
        {/* Y label */}
        <text x={10} y={M.top+plotH/2} textAnchor="middle" fontSize={9} fill="#94a3b8"
          transform={`rotate(-90,10,${M.top+plotH/2})`}>Minutes</text>

        {/* Bars */}
        {roleData.map((r,i)=>{
          let cursor = 0;
          const segments = SEGMENT_ORDER.filter(k=>(r.segs[k]||0)>0).map(k=>({ key:k, val:r.segs[k]||0 }));
          const x = barX(i);
          return (
            <g key={r.role}>
              {segments.map(({key,val})=>{
                const y1 = M.top+yScale(cursor+val);
                const y2 = M.top+yScale(cursor);
                const barH = Math.max(1, y2-y1);
                const mid = cursor+val/2;
                cursor += val;
                return (
                  <g key={key}>
                    <rect x={x} y={y1} width={BAR_W} height={barH}
                      fill={SEGMENT_COLOURS[key]} rx={key===segments[segments.length-1].key?3:0}
                      style={{transition:'all 0.3s'}} />
                    {barH>14&&(
                      <text x={x+BAR_W/2} y={M.top+yScale(mid)+4} textAnchor="middle"
                        fontSize={8} fill="white" fontWeight="600" style={{pointerEvents:'none'}}>
                        {val}m
                      </text>
                    )}
                  </g>
                );
              })}
              {/* Total label */}
              <text x={x+BAR_W/2} y={M.top+yScale(r.total)-4} textAnchor="middle"
                fontSize={9} fill="#374151" fontWeight="700">{r.total}m</text>
              {/* PCE badge */}
              <text x={x+BAR_W/2} y={M.top+yScale(r.total)-14} textAnchor="middle"
                fontSize={8} fill="#1B7A3F">{r.pce}% TT</text>
              {/* Role label */}
              <text x={x+BAR_W/2} y={M.top+plotH+14} textAnchor="middle"
                fontSize={9} fill="#475569" fontWeight="500">
                {r.role.length>10?r.role.substring(0,9)+'…':r.role}
              </text>
            </g>
          );
        })}

        {/* Takt time line */}
        {taktTime>0&&taktTime<=paddedMax&&(
          <g>
            <line x1={M.left} x2={M.left+plotW}
              y1={M.top+yScale(taktTime)} y2={M.top+yScale(taktTime)}
              stroke="#DC2626" strokeWidth={2} strokeDasharray="6,3" />
            <text x={M.left+plotW+2} y={M.top+yScale(taktTime)+4}
              fontSize={9} fill="#DC2626" fontWeight="600">TT</text>
          </g>
        )}

        {/* Chart label */}
        {label&&(
          <text x={M.left+plotW/2} y={chartH-4} textAnchor="middle"
            fontSize={10} fill="#64748b" fontStyle="italic">{label}</text>
        )}
      </svg>
    </div>
  );
}

function YamazumiLegend({ taktTime }) {
  const { colours: SEGMENT_COLOURS, labels: SEGMENT_LABELS } = useMemo(getSegmentMeta, []);
  return (
    <div className="flex flex-wrap gap-3 pt-2 mt-1 border-t border-border/30">
      {SEGMENT_ORDER.map(k=>(
        <div key={k} className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{backgroundColor:SEGMENT_COLOURS[k]}} />
          <span className="text-[10px] text-muted-foreground">{SEGMENT_LABELS[k]}</span>
        </div>
      ))}
      {taktTime>0&&(
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 border-t-2 border-dashed border-red-600" />
          <span className="text-[10px] text-muted-foreground">Takt Time ({taktTime}m)</span>
        </div>
      )}
    </div>
  );
}

export function YamazumiCollapsible({ steps, taktTime=0, defaultOpen=false }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const roleData = useMemo(()=>buildRoleData(steps||[]),[steps]);
  if (!steps||steps.length===0) return null;
  return (
    <Card className="mb-1">
      <button onClick={()=>setOpen(o=>!o)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors text-left rounded-xl">
        <div>
          <span className="text-sm font-semibold">📊 Yamazumi Chart</span>
          <span className="text-[11px] text-muted-foreground ml-3">Operator workload by role — stacked by category vs Takt Time</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open&&(
        <CardContent className="pt-0 pb-4 px-4">
          <YamazumiSVG roleData={roleData} taktTime={taktTime} />
          <YamazumiLegend taktTime={taktTime} />
        </CardContent>
      )}
    </Card>
  );
}

export function YamazumiPanel({ steps, taktTime=0, title='Yamazumi Chart', subtitle='' }) {
  const roleData = useMemo(()=>buildRoleData(steps||[]),[steps]);
  if (!steps||steps.length===0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">📊 {title}</CardTitle>
            {subtitle&&<p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Operator workload stacked by tool time category. {taktTime>0&&`Red dashed = Takt Time (${taktTime}m). `}
          Bars above Takt indicate overloaded operators.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <YamazumiSVG roleData={roleData} taktTime={taktTime} />
        <YamazumiLegend taktTime={taktTime} />
      </CardContent>
    </Card>
  );
}

export function YamazumiCompare({ leftSteps, rightSteps, leftLabel='Current', rightLabel='Future', taktTime=0 }) {
  const leftData  = useMemo(()=>buildRoleData(leftSteps||[]),[leftSteps]);
  const rightData = useMemo(()=>buildRoleData(rightSteps||[]),[rightSteps]);
  if ((!leftSteps||!leftSteps.length)&&(!rightSteps||!rightSteps.length)) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">📊 Yamazumi Comparison</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Operator workload — Current vs Future State.{taktTime>0&&` Takt: ${taktTime}m.`}
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1 px-1">{leftLabel}</div>
            <YamazumiSVG roleData={leftData} taktTime={taktTime} height={220} label={leftLabel} />
          </div>
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1 px-1">{rightLabel}</div>
            <YamazumiSVG roleData={rightData} taktTime={taktTime} height={220} label={rightLabel} />
          </div>
        </div>
        <YamazumiLegend taktTime={taktTime} />
      </CardContent>
    </Card>
  );
}
/**
 * CTFilterBar.jsx — Combination Table toolbar: filters, zoom, actions.
 * Extracted from CombinationTable.jsx for maintainability.
 */
import React from 'react';
import { Button } from '@/components/ui/button';
import { Wand2 } from 'lucide-react';
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter';

export default function CTFilterBar({
  // filter state
  roleFilter, setRoleFilter,
  sectionFilter, setSectionFilter,
  categoryFilter, setCategoryFilter,
  intextFilter, setIntextFilter,
  layerFilter, setLayerFilter,
  taskFilter, setTaskFilter,       // raw (un-debounced) display value
  onTaskFilterChange,              // handler that updates the debounced value
  // options
  roles, sections, allCategories,
  mapLayers,
  // actions
  onClearFilters,
  onUntagged,
  onSmartCategorise,
  smartCatRunning,
  stepsCount,
  toolTimeGroups,
}) {
  const anyFilter = roleFilter.length > 0 || sectionFilter.length > 0 ||
    categoryFilter.length > 0 || intextFilter.length > 0 ||
    layerFilter.length > 0 || taskFilter;

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/30 bg-muted/20">
      {/* Task search */}
      <input
        value={taskFilter}
        onChange={e => onTaskFilterChange(e.target.value)}
        placeholder="Search task…"
        className="h-7 text-xs px-2 rounded border border-border bg-background focus:outline-none w-36"
      />

      {/* Role filter */}
      <MultiSelectFilter
        label="Role"
        options={roles.map(r => ({ value: r, label: r }))}
        selected={roleFilter}
        onChange={setRoleFilter}
        className="h-7 text-xs"
      />

      {/* Section filter */}
      <MultiSelectFilter
        label="Section"
        options={sections.map(s => ({ value: s, label: s }))}
        selected={sectionFilter}
        onChange={setSectionFilter}
        className="h-7 text-xs"
      />

      {/* Category filter */}
      {allCategories.length > 0 && (
        <MultiSelectFilter
          label="Category"
          options={allCategories.map(c => ({ value: c, label: c.split('::')[1] || c }))}
          selected={categoryFilter}
          onChange={setCategoryFilter}
          className="h-7 text-xs"
        />
      )}

      {/* Int/Ext filter */}
      <div className="flex items-center gap-1">
        <select
          value={intextFilter[0] || ''}
          onChange={e => setIntextFilter(e.target.value ? [e.target.value] : [])}
          className="h-7 text-xs px-1.5 rounded border border-border bg-background focus:outline-none"
          style={{ minWidth: 90 }}>
          <option value="">Int/Ext</option>
          <option value="Internal">🔵 Internal</option>
          <option value="External">🟢 External</option>
        </select>
        {intextFilter.length > 0 && (
          <button onClick={() => setIntextFilter([])} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>
        )}
      </div>

      {/* Layer filter */}
      {mapLayers && mapLayers.length > 1 && (
        <div className="flex items-center gap-1">
          <select
            value={layerFilter[0] || ''}
            onChange={e => setLayerFilter(e.target.value ? [e.target.value] : [])}
            className="h-7 text-xs px-1.5 rounded border border-border bg-background focus:outline-none">
            <option value="">All layers</option>
            {mapLayers.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Clear */}
      {anyFilter && (
        <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-6 text-[10px] px-2">
          Clear
        </Button>
      )}

      <div className="flex-1" />

      {/* Step count */}
      <span className="text-[10px] text-muted-foreground">{stepsCount} steps</span>

      {/* Untagged */}
      <button
        onClick={onUntagged}
        className="h-7 px-2 text-[11px] rounded border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors shrink-0"
        title="Find steps missing role or category">
        🏷 Untagged?
      </button>

      {/* Smart Categorise */}
      <button
        onClick={onSmartCategorise}
        disabled={smartCatRunning || stepsCount === 0}
        className="flex items-center gap-1 h-7 px-2.5 text-[11px] rounded border border-purple-300 text-purple-700 hover:bg-purple-50 transition-colors shrink-0 disabled:opacity-40 font-medium">
        {smartCatRunning
          ? <><span className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin inline-block" /> Analysing…</>
          : <><Wand2 className="w-3 h-3" /> Smart Categorise</>}
      </button>
    </div>
  );
}
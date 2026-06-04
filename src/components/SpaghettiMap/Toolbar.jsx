import React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter';
import { Move, Workflow, Lock, Trash2, Plus, ZoomIn, ZoomOut, RotateCcw, Undo2, Redo2, Upload, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { appClient } from '@/api/standaloneClient';
import ProcessSelector from '@/components/ProcessSelector';

export default function Toolbar({
  mapLayers, activeLayers, setActiveLayers,
  roles, roleFilter, setRoleFilter,
  sections, sectionFilter, setSectionFilter,
  intextFilter, setIntextFilter,
  taskFilter, setTaskFilter,
  tool, setTool, connectSource, setConnectSource, setConnectPreview,
  schematicUrl, setSchematicUrl, schematicLocked, setSchematicLocked, schematicPos, setSchematicPos,
  schematicOpacity, setSchematicOpacity,
  nodeLayerOpacity, setNodeLayerOpacity,
  zoom, setZoom,
  pan, setPan,
  canUndo, canRedo, undo, redo, lastUndoLabel, lastRedoLabel,
  runSequenceOptimiser,
  selectedEdgeId, setSelectedEdgeId,
  removeConnection,
  updateEdgeWaypoints,
  mapEdgeWaypoints,
  exportPDF,
  exportingPdf,
  pdfPaper, setPdfPaper,
  schematicLoading, setSchematicLoading,
  activeProcess,
  updateProcessMeta,
  updateMapLayers,
  showHeatmap, setShowHeatmap,
  showCycleChart, setShowCycleChart,

}) {
  const handleFilterClear = () => {
    setRoleFilter([]);
    setSectionFilter([]);
    setTaskFilter('');
    setIntextFilter([]);
  };

  const [layersOpen, setLayersOpen] = React.useState(false);

  return (
    <div className="border-b bg-card px-3 py-1.5 flex items-center gap-2 flex-wrap shrink-0">
      {/* Process Selector */}
      <div data-tour="map-process-select"><ProcessSelector /></div>

      {/* Layer management */}
      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
        const name = prompt('Layer name:');
        if (!name) return;
        const newLayer = { id: `layer-${Date.now()}`, name, order: (mapLayers || []).length };
        updateMapLayers([...(mapLayers || []), newLayer]);
        setActiveLayers([newLayer.id]);
      }}><Plus className="w-3 h-3" /> Layer</Button>
      {activeLayers.length === 1 && activeLayers[0] !== 'layer-ground' && (
        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => {
          updateMapLayers((mapLayers || []).filter(l => l.id !== activeLayers[0]));
          setActiveLayers(['layer-ground']);
        }}><Trash2 className="w-3 h-3" /></Button>
      )}

      <div className="w-px h-5 bg-border" />

      {/* Filters */}
      <Select value={activeLayers.length === (mapLayers || []).length ? 'all' : activeLayers[0] || 'layer-ground'} onValueChange={(id) => {
        if (id === 'all') {
          setActiveLayers((mapLayers || []).map(l => l.id));
        } else {
          setActiveLayers([id]);
        }
      }}>
        <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">All Layers</SelectItem>
          {(mapLayers || []).map(l => (
            <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <MultiSelectFilter label="Role" options={roles} selected={roleFilter} onChange={setRoleFilter} width="w-40" />
      <span className="text-xs text-muted-foreground">Int/Ext:</span>
      <select value={intextFilter[0] || ''} onChange={e => setIntextFilter(e.target.value ? [e.target.value] : [])}
        className="h-7 text-xs px-1.5 rounded border border-border bg-background focus:outline-none"
        style={{ minWidth: 92 }}>
        <option value="">All</option>
        <option value="Internal">🔵 Internal</option>
        <option value="External">🟢 External</option>
      </select>
      {intextFilter.length > 0 && (
        <button onClick={() => setIntextFilter([])} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>
      )}
      <MultiSelectFilter label="Section" options={sections} selected={sectionFilter} onChange={setSectionFilter} width="w-40" />
      <input value={taskFilter} onChange={e => setTaskFilter(e.target.value)}
        placeholder="Search task…" className="h-7 w-28 text-xs px-2 rounded border border-border bg-background" />
      {(roleFilter.length > 0 || sectionFilter.length > 0 || taskFilter || intextFilter.length > 0) && (
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleFilterClear}>Clear</Button>
      )}

      <div className="w-px h-5 bg-border" />

      {/* Tools */}
      {[
        { id: 'select', label: 'Move', Icon: Move },
        { id: 'connect', label: 'Connect', Icon: Workflow },
      ].map(({ id, label, Icon }) => (
        <Button key={id} size="sm" variant={tool === id ? 'default' : 'outline'}
          className="h-7 text-xs gap-1 px-2"
          onClick={() => {
            setTool(id);
            if (id !== 'connect') { setConnectSource(null); setConnectPreview(null); }
          }}>
          <Icon className="w-3 h-3" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      ))}

      {roleFilter.length === 1 && (
        <>
          <div className="w-px h-5 bg-border" />
          <Button data-tour="sequence-optimiser" size="sm" variant="outline"
            className="h-7 text-xs gap-1 px-2 border-purple-500/50 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20"
            onClick={runSequenceOptimiser}>
            ⬡ Optimise Sequence
          </Button>
        </>
      )}

      {/* Schematic */}
      {schematicUrl && (
        <>
          <div className="w-px h-5 bg-border" />
          <Button size="sm" variant={schematicLocked ? 'outline' : 'default'} className="h-7 text-xs gap-1 px-2"
            onClick={() => {
              const newLocked = !schematicLocked;
              setSchematicPos(p => {
                updateProcessMeta({ schematic_pos_data: JSON.stringify({ ...p, locked: newLocked }) });
                return p;
              });
              setSchematicLocked(newLocked);
            }}>
            <Lock className="w-3 h-3" />
            <span className="hidden sm:inline">{schematicLocked ? 'Locked' : 'Unlocked'}</span>
          </Button>
        </>
      )}

      {selectedEdgeId && (
        <>
          <div className="w-px h-5 bg-border" />
          {(mapEdgeWaypoints?.[selectedEdgeId] || []).length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 px-2 text-muted-foreground"
              onClick={() => updateEdgeWaypoints(selectedEdgeId, [])}>
              Clear waypoints
            </Button>
          )}
          <Button size="sm" variant="ghost"
            className="h-7 text-xs gap-1 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => {
              const [fromId, toId] = selectedEdgeId.split('→');
              if (fromId && toId) {
                removeConnection(fromId, toId);
                setSelectedEdgeId(null);
              }
            }}>
            Disconnect
          </Button>
        </>
      )}

      <div className="w-px h-5 bg-border" />

      {/* Zoom */}
      <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setZoom(z => Math.min(z + 0.1, 3))}><ZoomIn className="w-3 h-3" /></Button>
      <span className="text-xs w-9 text-center">{Math.round(zoom * 100)}%</span>
      <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setZoom(z => Math.max(z - 0.1, 0.2))}><ZoomOut className="w-3 h-3" /></Button>
      <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><RotateCcw className="w-3 h-3" /></Button>

      <div className="w-px h-5 bg-border" />

      {/* Undo/Redo */}
      <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={undo} disabled={!canUndo}
        title={canUndo ? `Undo: ${lastUndoLabel}` : 'Nothing to undo'}>
        <Undo2 className="w-3 h-3" />
      </Button>
      <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={redo} disabled={!canRedo}
        title={canRedo ? `Redo: ${lastRedoLabel}` : 'Nothing to redo'}>
        <Redo2 className="w-3 h-3" />
      </Button>

      <div className="w-px h-5 bg-border" />

      {/* Opacity sliders */}
      <label className="text-[10px] text-muted-foreground whitespace-nowrap">Nodes</label>
      <input type="range" min={20} max={100} step={5}
        value={Math.round(nodeLayerOpacity * 100)}
        onChange={e => setNodeLayerOpacity(Number(e.target.value) / 100)}
        className="w-20 h-1.5 accent-primary cursor-pointer"
        title={`Node layer opacity: ${Math.round(nodeLayerOpacity * 100)}%`}
      />

      {schematicUrl && (
        <>
          <label className="text-[10px] text-muted-foreground whitespace-nowrap">Schematic</label>
          <input type="range" min={0} max={100} step={5}
            value={Math.round(schematicOpacity * 100)}
            onChange={e => {
              const val = Number(e.target.value) / 100;
              setSchematicOpacity(val);
              try { localStorage.setItem('mm_schematic_opacity', String(val)); } catch {}
            }}
            className="w-20 h-1.5 accent-primary cursor-pointer"
            title={`Schematic opacity: ${Math.round(schematicOpacity * 100)}%`}
          />
        </>
      )}

      {/* Chart toggles */}
      <div className="w-px h-5 bg-border" />
      <Button size="sm" variant={showHeatmap ? 'default' : 'outline'} className="h-7 text-xs gap-1"
        onClick={() => setShowHeatmap(!showHeatmap)}>
        Heat Map
      </Button>
      <Button size="sm" variant={showCycleChart ? 'default' : 'outline'} className="h-7 text-xs gap-1"
        onClick={() => setShowCycleChart(!showCycleChart)}>
        Cycle Time
      </Button>


      {/* Schematic size slider — only when unlocked */}
      {schematicUrl && !schematicLocked && (
        <>
          <div className="w-px h-5 bg-border" />
          <label className="text-[10px] text-muted-foreground whitespace-nowrap">Size</label>
          <input type="range" min={400} max={6000} step={100}
            value={schematicPos.w}
            onChange={e => {
              const newW = Number(e.target.value);
              setSchematicPos(p => {
                const newH = Math.round(newW * (p.h / p.w));
                updateProcessMeta({ schematic_pos_data: JSON.stringify({ x: p.x, y: p.y, w: newW, h: newH, locked: schematicLocked }) });
                return { ...p, w: newW, h: newH };
              });
            }}
            className="w-24 h-1.5 accent-primary cursor-pointer"
            title={`Schematic width: ${schematicPos.w}px`}
          />
        </>
      )}

      {/* PDF Export */}
      <div className="flex items-center gap-2 ml-auto">
        <Select value={pdfPaper} onValueChange={setPdfPaper}>
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a4-landscape" className="text-xs">A4 Landscape</SelectItem>
            <SelectItem value="a3-landscape" className="text-xs">A3 Landscape</SelectItem>
            <SelectItem value="a2-landscape" className="text-xs">A2 Landscape</SelectItem>
            <SelectItem value="a1-landscape" className="text-xs">A1 Landscape</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={exportingPdf} onClick={exportPDF}>
          <FileDown className="w-3 h-3" />
          {exportingPdf ? 'Exporting…' : 'Export PDF'}
        </Button>
      </div>

      {/* Schematic upload */}
      <Button data-tour="map-schematic" size="sm" variant="outline" className="h-7 text-xs gap-1"
        onClick={() => document.getElementById('schematic-upload-sm').click()}
        disabled={schematicLoading}>
        <Upload className="w-3 h-3" /> {schematicUrl ? 'Replace' : 'Schematic'}
      </Button>
      <input id="schematic-upload-sm" type="file" accept="image/*" className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]; if (!file) return;
          setSchematicLoading(true);
          try {
            const { file_url } = await appClient.integrations.Core.UploadFile({ file });
            setSchematicUrl(file_url);
            if (activeProcess?.id) await appClient.entities.Process.update(activeProcess.id, { schematic_url: file_url });
            toast.success('Schematic uploaded');
          } catch { toast.error('Upload failed'); }
          finally { setSchematicLoading(false); e.target.value = ''; }
        }} />
    </div>
  );
}
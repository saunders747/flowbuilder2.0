import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Palette, RotateCcw, Plus, X, Pencil, Check } from 'lucide-react';
import { useRoles, useRoleColours } from '@/hooks/useAppSettings';
import { useProcess } from '@/lib/processContext';
import { toast } from 'sonner';

const COLOUR_PALETTE = [
  '#f59e0b','#3b82f6','#ef4444','#8b5cf6','#10b981',
  '#06b6d4','#f97316','#6366f1','#84cc16','#ec4899',
  '#14b8a6','#a855f7','#fb923c','#22d3ee','#4ade80',
];

function getAutoColour(existingColours) {
  const used = new Set(Object.values(existingColours));
  return COLOUR_PALETTE.find(c => !used.has(c)) ||
    COLOUR_PALETTE[Object.keys(existingColours).length % COLOUR_PALETTE.length];
}

// Safe hook — returns empty steps/updateStep if outside ProcessProvider
function useProcessSafe() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useProcess();
  } catch {
    return { steps: [], updateStep: () => {} };
  }
}

export default function RoleColourSettings() {
  const { roles, addRole, removeRole, renameRole, resetToDefaults: resetRoleList } = useRoles();
  const { colours, setColour, renameColourKey, reset: resetColours } = useRoleColours();

  const { steps, updateStep } = useProcessSafe();

  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColour, setNewRoleColour] = useState(() => COLOUR_PALETTE[0]);
  // Inline editing state: { role: string, value: string } | null
  const [editing, setEditing] = useState(null);

  const handleAdd = () => {
    const name = newRoleName.trim();
    if (!name) return;
    addRole(name);
    setColour(name, newRoleColour || getAutoColour(colours));
    setNewRoleName('');
    setNewRoleColour(getAutoColour({ ...colours, [name]: newRoleColour }));
  };

  const handleRenameConfirm = (oldName) => {
    if (!editing || editing.role !== oldName) return;
    const newName = editing.value.trim();
    if (!newName || newName === oldName) { setEditing(null); return; }

    const success = renameRole(oldName, newName);
    if (!success) {
      toast.error(`"${newName}" already exists or is invalid`);
      return;
    }

    // Migrate the colour key
    renameColourKey(oldName, newName);

    // Update all steps in the currently loaded process
    const affected = (steps || []).filter(s => s.role === oldName);
    affected.forEach(s => updateStep(s.id, { role: newName }));

    toast.success(
      affected.length > 0
        ? `Renamed "${oldName}" → "${newName}" — updated ${affected.length} step${affected.length !== 1 ? 's' : ''}`
        : `Renamed "${oldName}" → "${newName}"`
    );
    setEditing(null);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Palette className="w-4 h-4" />
            Trades / Roles &amp; Colours
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => { resetRoleList(); resetColours(); }}
            className="gap-1.5 text-xs h-7">
            <RotateCcw className="w-3 h-3" /> Reset all
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Add, rename, or remove roles. Renaming updates all steps in the currently loaded process.
        </p>

        {/* Existing roles */}
        <div className="space-y-2">
          {roles.map(role => (
            <div key={role} className="flex items-center gap-3 p-2 rounded-lg border border-border/50 bg-muted/20">
              {/* Colour swatch */}
              <div className="relative w-7 h-7 rounded-md shrink-0 border border-border/60 overflow-hidden"
                style={{ backgroundColor: colours[role] || '#94a3b8' }}>
                <input type="color" value={colours[role] || '#94a3b8'}
                  onChange={e => setColour(role, e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  title={`Change colour for ${role}`} />
              </div>

              {/* Inline rename or display */}
              {editing?.role === role ? (
                <Input
                  autoFocus
                  value={editing.value}
                  onChange={e => setEditing({ role, value: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRenameConfirm(role);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  className="h-7 text-sm flex-1 py-0"
                />
              ) : (
                <span className="flex-1 text-sm font-medium">{role}</span>
              )}

              <span className="text-[10px] font-mono text-muted-foreground">
                {(colours[role] || colours.default || '#94a3b8').toUpperCase()}
              </span>

              {/* Edit / confirm button */}
              {editing?.role === role ? (
                <button onClick={() => handleRenameConfirm(role)}
                  className="text-primary hover:text-primary/80 transition-colors shrink-0"
                  title="Confirm rename (Enter)">
                  <Check className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button onClick={() => setEditing({ role, value: role })}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title={`Rename ${role}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={() => { if (editing?.role === role) setEditing(null); removeRole(role); }}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                title={`Remove ${role}`}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Add new role */}
        <div className="space-y-2 pt-2 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground">Add new role</p>
          <div className="flex items-center gap-2">
            <div className="relative w-8 h-8 rounded-md shrink-0 border border-border/60 overflow-hidden"
              style={{ backgroundColor: newRoleColour }}>
              <input type="color" value={newRoleColour}
                onChange={e => setNewRoleColour(e.target.value)}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                title="Choose colour for new role" />
            </div>
            <Input value={newRoleName} placeholder="Role name…"
              onChange={e => setNewRoleName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
              className="h-8 text-sm flex-1" />
            <Button type="button" size="sm" onClick={handleAdd} className="h-8 gap-1.5" disabled={!newRoleName.trim()}>
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Click the colour swatch to pick a colour. Click ✏ to rename an existing role.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
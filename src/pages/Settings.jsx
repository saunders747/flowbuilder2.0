import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HardHat, Plus, X, RotateCcw, Truck, Layers, Lock, Unlock, KeyRound } from 'lucide-react';
import { useFleet } from '@/hooks/useFleet';
import { useSections } from '@/hooks/useSections';
import ToolTimeCategoriesSettings from '@/components/settings/ToolTimeCategoriesSettings';
import RoleColourSettings from '@/components/settings/RoleColourSettings';
import ObzervRIntegrationCard from '@/components/settings/ObzervRIntegrationCard';
import { hasSettingsAccess, lockSettingsAccess, unlockSettingsAccess } from '@/api/standaloneClient';
import { toast } from 'sonner';

export default function Settings() {
  const { sections, addSection, removeSection, resetToDefaults: resetSections } = useSections();
  const { fleet, addFleet, removeFleet, resetToDefaults: resetFleet } = useFleet();
  const [newSection, setNewSection] = useState('');
  const [newFleet, setNewFleet] = useState('');
  const [pin, setPin] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlocked, setUnlocked] = useState(() => hasSettingsAccess());

  const handleUnlock = async (event) => {
    event?.preventDefault();
    if (!pin.trim()) return;
    setUnlocking(true);
    try {
      await unlockSettingsAccess(pin.trim());
      setUnlocked(true);
      setPin('');
      toast.success('Settings unlocked');
    } catch (error) {
      toast.error(error?.message || 'Invalid settings PIN');
    } finally {
      setUnlocking(false);
    }
  };

  const handleLock = () => {
    lockSettingsAccess();
    setUnlocked(false);
    toast.info('Settings locked');
  };

  if (!unlocked) {
    return (
      <div className="space-y-6 max-w-[520px]">
        <div>
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">Enter the settings PIN to change global configuration</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Lock className="w-4 h-4" /> Settings Locked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUnlock} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">PIN</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Enter PIN"
                      value={pin}
                      onChange={e => setPin(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <Button type="submit" disabled={unlocking || !pin.trim()}>
                    {unlocking ? 'Checking...' : 'Unlock'}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Default PIN is 2468 unless changed in the host environment.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[800px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">Application configuration and information</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleLock} className="gap-1.5">
          <Unlock className="w-3.5 h-3.5" /> Lock
        </Button>
      </div>

      {/* Roles + Colours — handled by RoleColourSettings below */}
      <RoleColourSettings />

      {/* Sections Management */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="w-4 h-4" /> Sections
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={resetSections} className="gap-1.5 text-xs h-7">
              <RotateCcw className="w-3 h-3" /> Reset to defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {sections.map(section => (
              <Badge key={section} variant="secondary" className="gap-1.5 pr-1 text-xs">
                {section}
                <button onClick={() => removeSection(section)} className="hover:text-destructive transition-colors ml-0.5">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Input
              placeholder="Add section (e.g. Pre Service)"
              value={newSection}
              onChange={e => setNewSection(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (addSection(newSection), setNewSection(''))}
              className="h-8 text-sm"
            />
            <Button size="sm" onClick={() => { addSection(newSection); setNewSection(''); }} className="gap-1.5 h-8" disabled={!newSection.trim()}>
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Fleet Management */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="w-4 h-4" /> Fleet / Asset Classes
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={resetFleet} className="gap-1.5 text-xs h-7">
              <RotateCcw className="w-3 h-3" /> Reset to defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {fleet.map(f => (
              <Badge key={f} variant="outline" className="gap-1.5 pr-1 text-xs">
                {f}
                <button onClick={() => removeFleet(f)} className="hover:text-destructive transition-colors ml-0.5">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Input
              placeholder="Add fleet model (e.g. CAT 785D)"
              value={newFleet}
              onChange={e => setNewFleet(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { addFleet(newFleet); setNewFleet(''); } }}
              className="h-8 text-sm"
            />
            <Button size="sm" onClick={() => { addFleet(newFleet); setNewFleet(''); }} className="gap-1.5 h-8" disabled={!newFleet.trim()}>
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tool Time Categories */}
      <ToolTimeCategoriesSettings />

      <ObzervRIntegrationCard />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <HardHat className="w-4 h-4" /> About
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Application</span>
            <span className="font-medium">Mobile Maintenance Standardised Work Builder</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Version</span>
            <Badge variant="secondary">1.0.0</Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Purpose</span>
            <span>Lean work design for mobile mining assets</span>
          </div>
        </CardContent>
      </Card>

      <ObzervRIntegrationCard />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Workflow States</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {[
            ['Draft', 'Initial process design'],
            ['Under Review', 'Submitted for team review'],
            ['Approved for Trial', 'Ready for field trial'],
            ['Approved Standard', 'Governing standardised work'],
            ['Superseded', 'Replaced by newer version'],
          ].map(([s, d]) => (
            <div key={s} className="flex justify-between">
              <span className="font-medium">{s}</span>
              <span className="text-muted-foreground">{d}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

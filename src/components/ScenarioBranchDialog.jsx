import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FlaskConical } from 'lucide-react';

export default function ScenarioBranchDialog({ open, onClose, onBranch, parentName, isLoading }) {
  const [name, setName] = useState(`${parentName} — Scenario`);
  const [reason, setReason] = useState('');

  React.useEffect(() => {
    if (open) {
      setName(`${parentName} — Scenario`);
      setReason('');
    }
  }, [open, parentName]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onBranch({ name: name.trim(), reason: reason.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-amber-600" />
            Create Scenario Branch
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2">
            A full copy of <strong>{parentName}</strong> will be created. You'll be switched to the branch immediately. The live standard is untouched until you Merge.
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scenario-name">Scenario name</Label>
            <Input
              id="scenario-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Trial — reduce Diesel Fitter load"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scenario-reason">What are you exploring? <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              id="scenario-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Testing if walking steps can be reallocated to the Maintenance Assistant to free up Diesel Fitter time"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || isLoading} className="gap-1.5">
              <FlaskConical className="w-4 h-4" />
              {isLoading ? 'Creating…' : 'Create Branch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
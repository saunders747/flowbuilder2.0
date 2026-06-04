import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function SaveConfirmDialog({ open, onOpenChange, onConfirm, isLoading, summary }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Save Changes?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 pt-2">
            <p>You're about to save all changes to this process.</p>
            {summary && (
              <div className="bg-muted p-3 rounded text-sm space-y-1">
                <p className="font-medium text-foreground">{summary.processName}</p>
                <p className="text-xs text-muted-foreground">
                  {summary.totalSteps} steps • {summary.totalDuration} mins total duration
                </p>
                {summary.changes.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-2">
                    <p className="font-semibold mb-1">Changes:</p>
                    <ul className="space-y-0.5 list-disc list-inside">
                      {summary.changes.slice(0, 3).map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                      {summary.changes.length > 3 && <li>+{summary.changes.length - 3} more</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex gap-3 justify-end pt-2">
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading} className="bg-primary hover:bg-primary/90">
            {isLoading ? 'Saving...' : 'Save'}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
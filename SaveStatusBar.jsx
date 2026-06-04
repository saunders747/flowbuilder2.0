import React from 'react';
import { useProcess } from '@/lib/processContext';
import { Save, Check, Loader2, AlertCircle } from 'lucide-react';

function timeAgo(date) {
  if (!date) return null;
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function SaveStatusBar() {
  const { activeProcess, syncStatus, lastSavedAt, saveProcess } = useProcess();
  const [timeLabel, setTimeLabel] = React.useState(() => timeAgo(lastSavedAt));

  React.useEffect(() => {
    setTimeLabel(timeAgo(lastSavedAt));
    const id = setInterval(() => setTimeLabel(timeAgo(lastSavedAt)), 15_000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  if (!activeProcess) return null;

  const isSaving = syncStatus === 'saving';
  const isError  = syncStatus === 'error';

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-muted/30 border-b border-border/40 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        {isSaving && (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Saving…
          </>
        )}
        {isError && (
          <>
            <AlertCircle className="w-3.5 h-3.5 text-destructive" />
            <span className="text-destructive font-medium">
              Save failed
            </span>
          </>
        )}
        {!isSaving && !isError && timeLabel && (
          <>
            <Check className="w-3.5 h-3.5 text-green-600" />
            Saved {timeLabel}
          </>
        )}
      </div>
      <button
        onClick={() => saveProcess()}
        disabled={isSaving}
        className="flex items-center gap-1 h-7 px-2.5 text-[11px] font-medium
          rounded-lg border border-border hover:bg-muted/40 transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-1 focus:ring-primary"
        title="Save now (Ctrl+S)"
      >
        {isSaving
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <Save className="w-3 h-3" />
        }
        Save
      </button>
    </div>
  );
}
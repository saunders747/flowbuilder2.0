import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sun, Moon, GraduationCap } from 'lucide-react';
import { useProcess } from '@/lib/processContext';
import { useOnboarding } from '@/lib/onboardingContext';
import OnboardingModal from '@/components/onboarding/OnboardingModal';

function SyncIndicator() {
   const { syncStatus, saveProcess } = useProcess();
   if (syncStatus === 'idle') return null;
   const styles = {
     pending: { color: '#64748b', label: '● Unsaved changes' },
     saving:  { color: '#d97706', label: '↻ Saving…' },
     saved:   { color: '#16a34a', label: '✓ Saved' },
     error:   { color: '#dc2626', label: '⚠ Save failed — click to retry' },
   };
   const s = styles[syncStatus];
   if (!s) return null;
   const handleClick = () => { if (syncStatus === 'error') saveProcess(); };
   const clickable = syncStatus === 'error';
   return (
     <button
       onClick={handleClick}
       disabled={!clickable}
       className={`text-xs font-medium flex items-center gap-1 ${clickable ? 'cursor-pointer hover:opacity-75' : 'cursor-default'}`}
       style={{ color: s.color }}
     >
       {s.label}
     </button>
   );
}

const pageTitles = {
  '/': 'Dashboard',
  '/process-builder': 'Process Builder',
  '/combination-table': 'Combination Table',
  '/waste-analysis': 'Waste Analysis',
  '/compare': 'Current vs Future',
  '/cycle-time-compare': 'Cycle Time Compare',
  '/import': 'Import Data',
  '/exports': 'Exports',
  '/settings': 'Settings',
  '/workflow-optimizer': 'Workflow Optimizer',
  '/spaghetti-map': 'Spaghetti Map',
  '/ai-assistant': 'AI Assistant',
  '/cycle-time-forecast': 'Cycle Time Forecast',
};

export default function TopBar() {
  const location = useLocation();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { completed } = useOnboarding();
  const toggleDark = () => { document.documentElement.classList.toggle('dark'); setDark(!dark); };
  const title = pageTitles[location.pathname] || 'Mobile Maintenance StdWork Builder';
  const allDone = completed.length >= 3;
  return (
    <div className="sticky top-0 z-40 border-b bg-card text-card-foreground shadow-sm">
      <div className="flex items-center justify-between px-6 py-3 h-16">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="flex items-center gap-3">
          <SyncIndicator />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowOnboarding(true)}
            className="h-8 gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/10"
            title="Guided tours"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            {allDone ? 'Tours' : 'Get Started'}
            {!allDone && (
              <span className="ml-0.5 bg-primary text-primary-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-bold">
                {3 - completed.length}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDark}
            className="h-9 w-9"
            title="Toggle dark mode"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}
    </div>
  );
}
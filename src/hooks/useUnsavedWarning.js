import { useEffect } from 'react';
import { useProcess } from '@/lib/processContext';

export function useUnsavedWarning() {
  const { syncState } = useProcess();

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // Show warning if there are pending/saving changes
      if (syncState === 'pending' || syncState === 'saving') {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [syncState]);
}
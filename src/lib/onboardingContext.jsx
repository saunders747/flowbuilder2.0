import React, { createContext, useContext, useState, useCallback } from 'react';

const OnboardingContext = createContext(null);

const STORAGE_KEY = 'hio_onboarding_completed';

export function OnboardingProvider({ children }) {
  const [activeTour, setActiveTour] = useState(null);   // tour id
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  });

  const startTour = useCallback((tourId) => {
    setActiveTour(tourId);
    setStepIndex(0);
  }, []);

  const endTour = useCallback((markComplete = true) => {
    if (markComplete && activeTour) {
      setCompleted(prev => {
        const next = prev.includes(activeTour) ? prev : [...prev, activeTour];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    }
    setActiveTour(null);
    setStepIndex(0);
  }, [activeTour]);

  const nextStep = useCallback((totalSteps) => {
    setStepIndex(prev => {
      if (prev + 1 >= totalSteps) { return prev; }
      return prev + 1;
    });
  }, []);

  const prevStep = useCallback(() => {
    setStepIndex(prev => Math.max(0, prev - 1));
  }, []);

  const resetCompleted = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setCompleted([]);
  }, []);

  return (
    <OnboardingContext.Provider value={{ activeTour, stepIndex, completed, startTour, endTour, nextStep, prevStep, resetCompleted }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
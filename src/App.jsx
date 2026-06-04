import { Toaster } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { ProcessProvider } from '@/lib/processContext';
import { AppSettingsProvider } from '@/hooks/useAppSettings';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import ProcessBuilder from '@/pages/ProcessBuilder';
import CombinationTable from '@/pages/CombinationTable.jsx';
import WasteAnalysis from '@/pages/WasteAnalysis';
import Compare from '@/pages/Compare';
import CycleTimeCompare from '@/pages/CycleTimeCompare';
import ImportData from '@/pages/ImportData';
import Exports from '@/pages/Exports';
import Settings from '@/pages/Settings';
import SpaghettiMap from '@/pages/SpaghettiMap';
import Reports from '@/pages/Reports';
import AIAssistant from '@/pages/AIAssistant';
import CycleTimeForecast from '@/pages/CycleTimeForecast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OnboardingProvider } from '@/lib/onboardingContext';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    // auth_required: do not auto-redirect — let the app render normally
  }

  // Render the main app
  return (
    <OnboardingProvider>
    <AppSettingsProvider>
    <ProcessProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<ErrorBoundary label="Dashboard"><Dashboard /></ErrorBoundary>} />
          <Route path="/process-builder" element={<ErrorBoundary label="Process Builder"><ProcessBuilder /></ErrorBoundary>} />

          <Route path="/combination-table" element={<ErrorBoundary label="Combination Table"><CombinationTable /></ErrorBoundary>} />
          <Route path="/waste-analysis" element={<ErrorBoundary label="Waste Analysis"><WasteAnalysis /></ErrorBoundary>} />
          <Route path="/compare" element={<ErrorBoundary label="Compare"><Compare /></ErrorBoundary>} />
          <Route path="/cycle-time-compare" element={<ErrorBoundary label="Cycle Time Compare"><CycleTimeCompare /></ErrorBoundary>} />
          <Route path="/import" element={<ErrorBoundary label="Import Data"><ImportData /></ErrorBoundary>} />
          <Route path="/exports" element={<ErrorBoundary label="Exports"><Exports /></ErrorBoundary>} />
          <Route path="/settings" element={<ErrorBoundary label="Settings"><Settings /></ErrorBoundary>} />
          <Route path="/spaghetti-map" element={<ErrorBoundary label="Spaghetti Map"><SpaghettiMap /></ErrorBoundary>} />
          <Route path="/reports" element={<ErrorBoundary label="Reports"><Reports /></ErrorBoundary>} />
          <Route path="/ai-assistant" element={<ErrorBoundary label="AI Assistant"><AIAssistant /></ErrorBoundary>} />
          <Route path="/cycle-time-forecast" element={<ErrorBoundary label="Cycle Time Forecast"><CycleTimeForecast /></ErrorBoundary>} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </ProcessProvider>
    </AppSettingsProvider>
    </OnboardingProvider>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
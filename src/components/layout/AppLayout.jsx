import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { cn } from '@/lib/utils';
import TourOverlay from '@/components/onboarding/TourOverlay';
import ScenarioBanner from '@/components/ScenarioBanner';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className={cn(
        "transition-all duration-300",
        collapsed ? "ml-16" : "ml-60"
      )}>
        <TopBar />
        <ScenarioBanner />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
      <TourOverlay />
    </div>
  );
}
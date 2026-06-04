import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Wrench, Table2, BarChart3,
  GitCompare, Activity, Upload, Download, Settings, ChevronLeft,
  ChevronRight, Workflow, FileBarChart,
  Bot, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

const navItems = [
{ path: '/', label: 'Dashboard', icon: LayoutDashboard },
{ path: '/process-builder', label: 'Process Builder', icon: Wrench },
{ path: '/spaghetti-map', label: 'Spaghetti Map', icon: Workflow },
{ path: '/combination-table', label: 'Combination Table', icon: Table2 },
{ path: '/waste-analysis', label: 'Waste Analysis', icon: BarChart3 },
{ path: '/compare', label: 'Current vs Future', icon: GitCompare },
{ path: '/cycle-time-compare', label: 'Cycle Time Compare', icon: Activity },
{ path: '/import', label: 'Import Data', icon: Upload },
{ path: '/exports', label: 'Exports', icon: Download },
{ path: '/reports', label: 'Reports', icon: FileBarChart },
{ path: '/ai-assistant', label: 'AI Assistant', icon: Bot },
{ path: '/cycle-time-forecast', label: 'CT Forecast', icon: TrendingUp },
{ path: '/settings', label: 'Settings', icon: Settings }];


export default function Sidebar({ collapsed, onToggle }) {
  const location = useLocation();

  return (
    <TooltipProvider delayDuration={0}>
      <aside className={cn(
        "fixed left-0 top-0 h-screen z-40 flex flex-col transition-all duration-300 font-sidebar",
        "bg-sidebar border-r border-sidebar-border",
        collapsed ? "w-16" : "w-60"
      )}>
        {/* Logo */}
        <div className={cn(
          "flex items-center gap-3 px-4 h-16 border-b border-sidebar-border shrink-0",
          collapsed && "justify-center px-0"
        )}>
          {collapsed &&
            <div className="w-9 h-9 rounded bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center text-xs font-bold">
              HIO
            </div>
          }
          {!collapsed &&
          <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-sidebar-foreground truncate">HIO FlowBuilder</span>
              <span className="text-[10px] text-sidebar-foreground/50 truncate">Builder v1.0</span>
            </div>
          }
        </div>

        {/* Logo */}
        {!collapsed &&
        <div className="border-b border-sidebar-border overflow-hidden px-3 py-3 flex items-center justify-center">
            



          
          
          </div>
        }

        {/* Nav */}
        <nav className="bg-[#000000] px-2 py-3 flex-1 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            const linkContent =
            <Link
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                "hover:bg-sidebar-accent",
                isActive ?
                "bg-sidebar-accent text-sidebar-primary font-semibold" :
                "text-sidebar-foreground/70",
                collapsed && "justify-center px-0"
              )}>
              
                <Icon className={cn("w-[18px] h-[18px] shrink-0", isActive && "text-sidebar-primary")} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>;


            if (collapsed) {
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    {item.label}
                  </TooltipContent>
                </Tooltip>);

            }

            return <div key={item.path}>{linkContent}</div>;
          })}
        </nav>

        {/* Toggle */}
        <div className="p-2 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="w-full text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent">
            
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>
      </aside>
    </TooltipProvider>);

}

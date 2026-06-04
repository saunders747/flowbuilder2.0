import React from 'react';
import { cn } from '@/lib/utils';

/**
 * PresenceAvatars
 * Displays stacked circular avatars for active users on a process.
 * Shows up to 5 avatars + "+N" overflow label.
 * Green pulse dot indicates active step editing.
 */
export function PresenceAvatars({ peers = [] }) {
  const MAX_AVATARS = 5;
  const displayPeers = peers.slice(0, MAX_AVATARS);
  const overflow = Math.max(0, peers.length - MAX_AVATARS);

  const getInitials = (name) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex items-center gap-1">
      <div className="flex -space-x-2">
        {displayPeers.map((peer) => (
          <div
            key={peer.id}
            className="relative group"
            title={`${peer.name}${peer.lockedStep ? ' — editing' : ''}`}
          >
            {/* Avatar circle */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-background shadow-sm"
              style={{ backgroundColor: peer.color }}
            >
              {getInitials(peer.name)}
            </div>

            {/* Active editing pulse */}
            {peer.lockedStep && (
              <>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border border-white shadow-sm" />
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              </>
            )}

            {/* Tooltip on hover */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-foreground text-background text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {peer.name}
              {peer.lockedStep && <div className="text-[10px]">editing step</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Overflow indicator */}
      {overflow > 0 && (
        <span className="text-xs font-semibold text-muted-foreground px-1.5 py-0.5 rounded-full border border-border bg-muted/30">
          +{overflow}
        </span>
      )}

      {peers.length === 0 && (
        <span className="text-xs text-muted-foreground">Solo</span>
      )}
    </div>
  );
}

/**
 * StepLockIndicator
 * Shows a small lock badge with the name of the user currently editing this step.
 */
export function StepLockIndicator({ lockInfo }) {
  if (!lockInfo) return null;

  const { userId, userName } = lockInfo;

  return (
    <div
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300"
      title={`${userName} is editing this step`}
    >
      <span className="text-sm">🔒</span>
      <span className="truncate">{userName}</span>
    </div>
  );
}
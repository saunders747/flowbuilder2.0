import { useEffect, useState, useCallback, useRef } from 'react';
import { appClient } from '@/api/standaloneClient';
import { toast } from 'sonner';

export function usePresence(processId, currentPage) {
  const [peers, setPeers] = useState([]);
  const [lockedSteps, setLockedSteps] = useState({});
  const [myColor] = useState(() => {
    const hues = [0, 30, 60, 120, 180, 240, 270, 330];
    const hue = hues[Math.floor(Math.random() * hues.length)];
    return `hsl(${hue}, 70%, 50%)`;
  });

  const [user, setUser] = useState(null);
  const presenceIdRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const pollTimerRef = useRef(null);

  // Initialize: get current user
  useEffect(() => {
    const initUser = async () => {
      try {
        const me = await appClient.auth.me();
        if (me) setUser(me);
      } catch (err) {
        console.error('Failed to get current user:', err);
      }
    };
    initUser();
  }, []);

  // Create/update presence record
  const updatePresence = useCallback(
    async (lockedStepId = null) => {
      if (!user || !processId) return;

      try {
        // Check if record exists for this user+process
        const existing = await appClient.entities.ProcessPresence.filter(
          {
            process_id: processId,
            user_id: user.id,
          },
          '-last_seen',
          1
        );

        const data = {
          process_id: processId,
          user_id: user.id,
          user_name: user.full_name,
          user_email: user.email,
          user_color: myColor,
          last_seen: new Date().toISOString(),
          locked_step_id: lockedStepId || null,
          current_page: currentPage,
        };

        if (existing && existing.length > 0) {
          // Update existing
          await appClient.entities.ProcessPresence.update(existing[0].id, data);
          presenceIdRef.current = existing[0].id;
        } else {
          // Create new
          const created = await appClient.entities.ProcessPresence.create(data);
          presenceIdRef.current = created.id;
        }
      } catch (err) {
        console.error('Failed to update presence:', err);
      }
    },
    [user, processId, myColor, currentPage]
  );

  // Heartbeat every 20 seconds
  useEffect(() => {
    if (!user || !processId) return;

    heartbeatTimerRef.current = setInterval(() => {
      updatePresence();
    }, 20000);

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, [user, processId, updatePresence]);

  // Poll for other users every 10 seconds
  useEffect(() => {
    if (!user || !processId) return;

    const fetchPeers = async () => {
      try {
        // Get all active presence records for this process (last 30 seconds)
        const thirtySecsAgo = new Date(Date.now() - 30000).toISOString();
        const allPresence = await appClient.entities.ProcessPresence.filter(
          {
            process_id: processId,
            last_seen: { $gte: thirtySecsAgo },
          },
          '-last_seen',
          50
        );

        // Filter out current user
        const otherUsers = allPresence.filter(p => p.user_id !== user.id);

        // Build peers array
        const peersList = otherUsers.map(p => ({
          id: p.user_id,
          name: p.user_name,
          color: p.user_color,
          lockedStep: p.locked_step_id,
          lastSeen: p.last_seen,
        }));
        setPeers(peersList);

        // Build lockedSteps map
        const locks = {};
        otherUsers.forEach(p => {
          if (p.locked_step_id) {
            locks[p.locked_step_id] = {
              userId: p.user_id,
              userName: p.user_name,
            };
          }
        });
        setLockedSteps(locks);
      } catch (err) {
        console.error('Failed to fetch presence:', err);
      }
    };

    // Initial fetch
    fetchPeers();

    // Poll every 10 seconds
    pollTimerRef.current = setInterval(fetchPeers, 10000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [user, processId]);

  // Set/clear editing step
  const setEditingStep = useCallback(
    async (stepId) => {
      await updatePresence(stepId);
    },
    [updatePresence]
  );

  // Cleanup on unmount
  useEffect(() => {
    return async () => {
      // Delete presence record
      if (presenceIdRef.current) {
        try {
          await appClient.entities.ProcessPresence.delete(presenceIdRef.current);
        } catch (err) {
          console.error('Failed to delete presence on unmount:', err);
        }
      }

      // Clear timers
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  return {
    peers,
    lockedSteps,
    setEditingStep,
    myColor,
  };
}
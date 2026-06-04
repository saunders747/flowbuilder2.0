import { useState, useCallback, useRef } from 'react';

const MAX_HISTORY = 60;

/**
 * Unified undo/redo stack for process data.
 *
 * setState(newState, label?)   — push to history (step edits, reorders, etc.)
 * setCurrentOnly(newState)     — update state silently (e.g. node dragging in progress)
 * commitSilent(label?)         — push the current silent state into history (e.g. drag-end)
 * undo() / redo()              — travel through history
 * lastUndoLabel / lastRedoLabel — human-readable description of what will be undone/redone
 */
export function useUndoRedo(initialState) {
  const [historyState, setHistoryState] = useState(() => ({
    current: structuredClone(initialState),
    history: [{ state: structuredClone(initialState), label: 'Initial' }],
    index: 0,
  }));

  // Ref so callbacks always see latest value without re-creating
  const stateRef = useRef(historyState);
  stateRef.current = historyState;

  // Push a new state into history
  const setState = useCallback((newStateOrFn, label = 'Edit') => {
    setHistoryState((prev) => {
      const newState = typeof newStateOrFn === 'function'
        ? newStateOrFn(prev.current)
        : newStateOrFn;

      const cloned = structuredClone(newState);
      const trimmed = prev.history.slice(0, prev.index + 1);
      trimmed.push({ state: cloned, label });

      if (trimmed.length > MAX_HISTORY) trimmed.shift();

      return { current: cloned, history: trimmed, index: trimmed.length - 1 };
    });
  }, []);

  // Update current state silently (no history entry) — use during continuous drag
  const setCurrentOnly = useCallback((newStateOrFn) => {
    setHistoryState((prev) => {
      const newState = typeof newStateOrFn === 'function'
        ? newStateOrFn(prev.current)
        : newStateOrFn;
      return { ...prev, current: structuredClone(newState) };
    });
  }, []);

  // Promote the current silent state into the history stack (call on drag-end)
  const commitSilent = useCallback((label = 'Move') => {
    setHistoryState((prev) => {
      const cloned = structuredClone(prev.current);
      const trimmed = prev.history.slice(0, prev.index + 1);
      trimmed.push({ state: cloned, label });

      if (trimmed.length > MAX_HISTORY) trimmed.shift();

      return { current: cloned, history: trimmed, index: trimmed.length - 1 };
    });
  }, []);

  const undo = useCallback(() => {
    setHistoryState((prev) => {
      if (prev.index <= 0) return prev;
      const newIndex = prev.index - 1;
      return { current: structuredClone(prev.history[newIndex].state), history: prev.history, index: newIndex };
    });
  }, []);

  const redo = useCallback(() => {
    setHistoryState((prev) => {
      if (prev.index >= prev.history.length - 1) return prev;
      const newIndex = prev.index + 1;
      return { current: structuredClone(prev.history[newIndex].state), history: prev.history, index: newIndex };
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistoryState((prev) => ({
      current: prev.current,
      history: [{ state: structuredClone(prev.current), label: 'Initial' }],
      index: 0,
    }));
  }, []);

  const { history, index } = historyState;
  const lastUndoLabel = index > 0 ? history[index].label : null;
  const lastRedoLabel = index < history.length - 1 ? history[index + 1].label : null;

  return {
    state: historyState.current,
    setState,
    setCurrentOnly,
    commitSilent,
    undo,
    redo,
    canUndo: index > 0,
    canRedo: index < history.length - 1,
    clearHistory,
    lastUndoLabel,
    lastRedoLabel,
  };
}
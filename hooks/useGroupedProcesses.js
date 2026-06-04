/**
 * useGroupedProcesses
 * Groups a flat list of processes by fleet_class.
 * Returns { groups, allProcesses } where groups is an array of
 * { fleetClass: string, processes: Process[] } sorted alphabetically.
 * Processes with no fleet_class are placed in an "Unassigned" group.
 */
export function groupProcessesByFleetClass(processes = []) {
  const map = {};
  for (const p of processes) {
    const key = p.fleet_class?.trim() || 'Unassigned';
    if (!map[key]) map[key] = [];
    map[key].push(p);
  }
  return Object.entries(map)
    .sort(([a], [b]) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    })
    .map(([fleetClass, procs]) => ({
      fleetClass,
      processes: procs.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
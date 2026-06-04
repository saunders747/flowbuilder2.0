/**
 * Onboarding tour definitions.
 * Each tour is an array of steps: { target, title, content, placement, route, action }
 * target: CSS selector or null (centre-screen)
 * placement: 'top' | 'bottom' | 'left' | 'right' | 'center'
 * route: navigate to this route before showing the step (optional)
 * action: hint text shown as a small badge e.g. "Click →"
 */

export const TOURS = {
  processBuilder: {
    id: 'processBuilder',
    label: 'Process Builder',
    icon: '🔧',
    description: 'Learn how to build, edit and manage a maintenance process from scratch.',
    route: '/process-builder',
    steps: [
      {
        target: null,
        title: 'Welcome to Process Builder',
        content: 'This is where you create and manage standardised work processes. Each process has steps, roles, timing data and a spaghetti map. Let\'s walk through the key features.',
        placement: 'center',
      },
      {
        target: '[data-tour="process-list"]',
        title: 'Your Processes',
        content: 'All processes are listed here, grouped by fleet class. Click any process to open and edit it. Processes are organised into folders so you can find them quickly.',
        placement: 'right',
      },
      {
        target: '[data-tour="new-process-btn"]',
        title: 'Create a New Process',
        content: 'Click "New Process" to create a process. You\'ll fill in details like the fleet class, asset model, service type, and target duration.',
        placement: 'bottom',
        action: 'Click to create',
      },
      {
        target: '[data-tour="process-tabs"]',
        title: 'Process Views',
        content: 'Once a process is open, these tabs let you switch between the Step Table (where you add tasks), the Spaghetti Map (layout), and the process Settings.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="add-step-btn"]',
        title: 'Add a Step',
        content: 'Click "Add Step" to insert a new task. Give it a description, assign a role, and enter the time split — manual, walking, waiting, machine, and inspection time.',
        placement: 'bottom',
        action: 'Click to add',
      },
      {
        target: '[data-tour="gantt-table"]',
        title: 'The Step Table',
        content: 'Each row is a task. You can drag rows to reorder them, click cells to edit inline, and set dependencies between steps. The coloured bars show how time is categorised.',
        placement: 'top',
      },
      {
        target: '[data-tour="categorise-btn"]',
        title: 'Categorise Steps with AI',
        content: 'Use "Smart Categorise" to let AI automatically classify each step as Tool Time, NVA Essential, NVA Activity or Waste. Review the suggestions and apply the ones you agree with.',
        placement: 'bottom',
        action: 'Try it out',
      },
      {
        target: '[data-tour="pce-indicator"]',
        title: 'Process Cycle Efficiency',
        content: 'The PCE (%) shows what fraction of total time is genuinely value-adding. A higher PCE means less waste. Watch it update as you categorise steps.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="revision-btn"]',
        title: 'Save a Revision',
        content: 'When you\'re happy with changes, save a named revision. Revisions let you track improvements over time and roll back if needed.',
        placement: 'bottom',
        action: 'Click to save revision',
      },
      {
        target: '[data-tour="approval-status"]',
        title: 'Approval Workflow',
        content: 'Set the approval status — Draft, Under Review, Approved for Trial, or Approved Standard. This lets your team track which processes are ready for the floor.',
        placement: 'left',
      },
    ],
  },

  spaghettiMap: {
    id: 'spaghettiMap',
    label: 'Spaghetti Map',
    icon: '🗺️',
    description: 'Learn how to map walking paths and identify movement waste.',
    route: '/spaghetti-map',
    steps: [
      {
        target: null,
        title: 'Welcome to the Spaghetti Map',
        content: 'The Spaghetti Map visualises how maintainers move around the work area. Each step gets a node on the map connected by lines — the "spaghetti" of movement paths.',
        placement: 'center',
      },
      {
        target: '[data-tour="map-process-select"]',
        title: 'Select a Process',
        content: 'First, pick the process you want to map from this dropdown. Its steps will appear as draggable nodes on the canvas.',
        placement: 'bottom',
        action: 'Select a process',
      },
      {
        target: '[data-tour="map-canvas"]',
        title: 'The Map Canvas',
        content: 'This is your workspace. Drag step nodes to positions that reflect the physical layout of your workshop or field site. Nodes are connected automatically based on step sequence.',
        placement: 'right',
      },
      {
        target: '[data-tour="map-layers"]',
        title: 'Map Layers',
        content: 'Use layers to organise your map — e.g. one layer per work zone or bay. Toggle layers on/off to focus on different areas.',
        placement: 'right',
      },
      {
        target: '[data-tour="map-schematic"]',
        title: 'Upload a Schematic',
        content: 'Upload a floor plan or site schematic as the map background. Then position your step nodes on top of the actual layout for accurate distance analysis.',
        placement: 'bottom',
        action: 'Upload image',
      },
      {
        target: '[data-tour="map-distance"]',
        title: 'Walking Distance',
        content: 'The total estimated walking distance is calculated from node positions. Use this to identify high-movement steps that could be relocated or eliminated.',
        placement: 'top',
      },
      {
        target: '[data-tour="sequence-optimiser"]',
        title: 'Sequence Optimiser',
        content: 'The AI Sequence Optimiser analyses node positions and suggests a step order that minimises walking distance. Apply its suggestions to update your process sequence.',
        placement: 'left',
        action: 'Try optimising',
      },
    ],
  },

  combinationTable: {
    id: 'combinationTable',
    label: 'Combination Table',
    icon: '📊',
    description: 'Learn how to use the Combination Table for Yamazumi and takt time analysis.',
    route: '/combination-table',
    steps: [
      {
        target: null,
        title: 'Welcome to the Combination Table',
        content: 'The Combination Table (or Yamazumi chart) shows each operator\'s workload against Takt Time — the pace at which work must flow to meet demand.',
        placement: 'center',
      },
      {
        target: '[data-tour="ct-process-select"]',
        title: 'Select a Process',
        content: 'Choose the process you want to analyse. Its steps will be broken down by role so you can see each operator\'s workload.',
        placement: 'bottom',
        action: 'Select a process',
      },
      {
        target: '[data-tour="takt-time-input"]',
        title: 'Set Takt Time',
        content: 'Enter your Takt Time in minutes. This is the available work time divided by customer demand. The chart will draw a red line at this level — operators above it are overloaded.',
        placement: 'bottom',
        action: 'Enter takt time',
      },
      {
        target: '[data-tour="yamazumi-chart"]',
        title: 'The Yamazumi Chart',
        content: 'Each column is an operator role. Bars are stacked and colour-coded by category: Tool Time (blue), NVA Essential (yellow), NVA Activity (orange), Waste (red). Aim to keep all columns below the Takt Time line.',
        placement: 'top',
      },
      {
        target: '[data-tour="ct-filter-bar"]',
        title: 'Filter & Compare',
        content: 'Use the filter bar to compare multiple processes side by side, filter by section, or toggle role visibility. This helps identify imbalances across the team.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="time-breakdown"]',
        title: 'Time Breakdown',
        content: 'The summary panel shows total time, PCE, and a breakdown of how much time falls into each category. Use this to target your improvement efforts.',
        placement: 'left',
      },
    ],
  },
};

export const TOUR_ORDER = ['processBuilder', 'spaghettiMap', 'combinationTable'];
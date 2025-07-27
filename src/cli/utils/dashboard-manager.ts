import blessed from 'blessed';
import contrib from 'blessed-contrib';

import { DashboardDataService } from '../services/dashboard-data';
import type { ApiClient } from '../client';
import { ThemeHelper, getThemeNames } from '../ui/themes/dashboard-themes';

export interface DashboardData {
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    completed: number;
    overdue: number;
  };
  velocity: Array<{ period: string; completed: number }>;
  teamMembers: Array<{ name: string; taskCount: number; load: number }>;
  burndown: Array<{ day: string; remaining: number; ideal: number }>;
  activity: Array<{ timestamp: string; event: string; user: string }>;
}

export interface DashboardConfig {
  refreshInterval: number;
  theme: string;
  showHelp: boolean;
  autoRefresh: boolean;
}

/**
 * Manages terminal dashboards using blessed-contrib
 */
export class DashboardManager {
  private readonly screen: blessed.Widgets.Screen;

  private readonly grid: any;

  private readonly widgets: Map<string, any> = new Map();

  private readonly config: DashboardConfig;

  private readonly dataService: DashboardDataService;

  private readonly themeHelper: ThemeHelper;

  private readonly refreshTimer?: NodeJS.Timeout;

  private currentLayout: 'overview' | 'velocity' | 'personal' = 'overview';

  private readonly focusedWidget: string | null = null;

  private readonly isFullscreen = false;

  private readonly debugMode = false;

  constructor(config: Partial<DashboardConfig> = {}, apiClient?: ApiClient) {
    this.config = {
      refreshInterval: 30000, // 30 seconds
      theme: 'dark',
      showHelp: true,
      autoRefresh: true,
      ...config,
    };

    // Initialize data service
    this.dataService = apiClient
      ? new DashboardDataService(apiClient)
      : new DashboardDataService({} as ApiClient);

    // Initialize theme helper
    this.themeHelper = new ThemeHelper(this.config.theme);

    // Create screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Kanban Dashboard',
      dockBorders: true,
    });

    // Create grid
    this.grid = contrib.grid({
      rows: 12,
      cols: 12,
      screen: this.screen,
    });

    this.setupKeyBindings();
  }

  /**
   * Setup keyboard navigation
   */
  private setupKeyBindings(): void {
    // Exit commands
    this.screen.key(['q', 'C-c'], () => {
      this.destroy();
      process.exit(0);
    });

    // Dashboard controls
    this.screen.key(['r', 'F5'], () => {
      void this.refreshData().catch(error =>
        DashboardManager.showErrorNotification(`Failed to refresh data: ${String(error)}`)
      );
    });

    // Layout switching
    this.screen.key(['1', 'F1'], () => {
      this.switchLayout('overview');
    });

    this.screen.key(['2', 'F2'], () => {
      this.switchLayout('velocity');
    });

    this.screen.key(['3', 'F3'], () => {
      this.switchLayout('personal');
    });

    // Help and settings
    this.screen.key(['h', '?', 'F12'], () => {
      DashboardManager.showHelp();
    });

    this.screen.key(['t', 'F9'], () => {
      DashboardManager.toggleTheme();
    });

    this.screen.key(['a', 'F10'], () => {
      DashboardManager.toggleAutoRefresh();
    });

    // Navigation within widgets
    this.screen.key(['tab'], () => {
      DashboardManager.focusNextWidget();
    });

    this.screen.key(['S-tab'], () => {
      DashboardManager.focusPreviousWidget();
    });

    // Zoom/fullscreen toggle
    this.screen.key(['f', 'F11'], () => {
      DashboardManager.toggleFullscreen();
    });

    // Quick actions
    this.screen.key(['s'], () => {
      DashboardManager.showQuickStats();
    });

    this.screen.key(['e'], () => {
      DashboardManager.exportDashboard();
    });

    // Debug mode toggle
    this.screen.key(['d'], () => {
      DashboardManager.toggleDebugMode();
    });

    // Reset view
    this.screen.key(['escape'], () => {
      DashboardManager.resetView();
    });
  }

  /**
   * Create overview dashboard layout
   */
  createOverviewDashboard(data: DashboardData): void {
    this.clearWidgets();

    // Task status donut chart
    const donutStyles = this.themeHelper.getDonutStyles();
    const statusDonut = this.grid.set(0, 0, 6, 6, contrib.donut, {
      label: 'Tasks by Status',
      radius: 8,
      arcWidth: 4,
      remainColor: donutStyles.remainColor,
      yPadding: 2,
      data: Object.entries(data.tasks.byStatus).map(([status, count], index) => ({
        label: status,
        percent: (count / data.tasks.total) * 100,
        color: donutStyles.colors[index % donutStyles.colors.length],
      })),
    });

    // Priority bar chart
    const barStyles = this.themeHelper.getBarStyles();
    const priorityBar = this.grid.set(0, 6, 6, 6, contrib.bar, {
      label: 'Tasks by Priority',
      barWidth: 4,
      barSpacing: 6,
      xOffset: 0,
      maxHeight: 9,
      style: { fg: barStyles.textColor },
      data: {
        titles: Object.keys(data.tasks.byPriority),
        data: Object.values(data.tasks.byPriority),
      },
    });

    // Velocity line chart
    const lineStyles = this.themeHelper.getLineStyles();
    const velocityLine = this.grid.set(6, 0, 6, 8, contrib.line, {
      ...lineStyles,
      xLabelPadding: 3,
      xPadding: 5,
      label: 'Team Velocity (Last 8 Weeks)',
      data: {
        title: 'Completed Tasks',
        x: data.velocity.map(v => v.period),
        y: data.velocity.map(v => v.completed),
      },
    });

    // Activity log
    const logStyles = this.themeHelper.getLogStyles();
    const activityLog = this.grid.set(6, 8, 6, 4, contrib.log, {
      ...logStyles,
      label: 'Recent Activity',
    });

    // Populate activity log
    data.activity.forEach(activity => {
      activityLog.log(
        `${String(String(activity.timestamp))}: ${String(String(activity.event))} (${String(String(activity.user))})`
      );
    });

    this.widgets.set('statusDonut', statusDonut);
    this.widgets.set('priorityBar', priorityBar);
    this.widgets.set('velocityLine', velocityLine);
    this.widgets.set('activityLog', activityLog);

    this.addHeader('📊 Kanban Dashboard - Overview');
    this.addFooter();
  }

  /**
   * Create velocity-focused dashboard
   */
  createVelocityDashboard(data: DashboardData): void {
    this.clearWidgets();

    // Large velocity chart
    const velocityLine = this.grid.set(0, 0, 8, 12, contrib.line, {
      style: {
        line: 'cyan',
        text: 'white',
        baseline: 'black',
      },
      xLabelPadding: 3,
      xPadding: 5,
      label: 'Team Velocity Trend',
      data: {
        title: 'Completed Tasks',
        x: data.velocity.map(v => v.period),
        y: data.velocity.map(v => v.completed),
      },
    });

    // Burndown chart
    const burndownLine = this.grid.set(8, 0, 4, 8, contrib.line, {
      style: {
        line: 'red',
        text: 'white',
        baseline: 'black',
      },
      xLabelPadding: 3,
      xPadding: 5,
      label: 'Sprint Burndown',
      data: [
        {
          title: 'Actual',
          x: data.burndown.map(b => b.day),
          y: data.burndown.map(b => b.remaining),
          style: { line: 'red' },
        },
        {
          title: 'Ideal',
          x: data.burndown.map(b => b.day),
          y: data.burndown.map(b => b.ideal),
          style: { line: 'green' },
        },
      ],
    });

    // Team capacity table
    const teamTable = this.grid.set(8, 8, 4, 4, contrib.table, {
      keys: true,
      fg: 'white',
      selectedFg: 'white',
      selectedBg: 'blue',
      interactive: false,
      label: 'Team Capacity',
      width: '30%',
      height: '30%',
      border: { type: 'line', fg: 'cyan' },
      columnSpacing: 10,
      columnWidth: [16, 12, 12],
    });

    teamTable.setData({
      headers: ['Member', 'Tasks', 'Load %'],
      data: data.teamMembers.map(member => [
        member.name,
        member.taskCount.toString(),
        `${String(String(member.load))}%`,
      ]),
    });

    this.widgets.set('velocityLine', velocityLine);
    this.widgets.set('burndownLine', burndownLine);
    this.widgets.set('teamTable', teamTable);

    this.addHeader('📈 Velocity Dashboard');
    this.addFooter();
  }

  /**
   * Create personal productivity dashboard
   */
  createPersonalDashboard(data: DashboardData): void {
    this.clearWidgets();

    // Personal task progress
    const progressGauge = this.grid.set(0, 0, 6, 6, contrib.gauge, {
      label: 'Personal Progress',
      stroke: 'green',
      fill: 'white',
    });

    const completionRate = (data.tasks.completed / data.tasks.total) * 100;
    progressGauge.setPercent(completionRate);

    // Task breakdown
    const taskTable = this.grid.set(0, 6, 6, 6, contrib.table, {
      keys: true,
      fg: 'white',
      selectedFg: 'white',
      selectedBg: 'blue',
      interactive: true,
      label: 'My Tasks',
      width: '30%',
      height: '30%',
      border: { type: 'line', fg: 'cyan' },
      columnSpacing: 10,
      columnWidth: [20, 12, 12],
    });

    taskTable.setData({
      headers: ['Task', 'Priority', 'Status'],
      data: [
        ['Complete user auth', 'P1', 'In Progress'],
        ['Fix login bug', 'P1', 'Todo'],
        ['Update docs', 'P3', 'Done'],
        ['Code review', 'P2', 'Todo'],
      ],
    });

    // Time tracking sparkline
    const timeSparkline = this.grid.set(6, 0, 3, 12, contrib.sparkline, {
      label: 'Hours This Week',
      tags: true,
      style: { fg: 'blue' },
    });

    timeSparkline.setData(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], [8, 7, 9, 6, 8]);

    // Today's focus box
    const focusBox = this.grid.set(9, 0, 3, 12, blessed.box, {
      label: "Today's Focus",
      border: { type: 'line', fg: 'yellow' },
      style: { fg: 'white' },
      padding: { left: 2, right: 2 },
    });

    focusBox.setContent(`
🎯 Current Sprint Goals:
• Complete user authentication system
• Fix critical login bug 
• Prepare demo for stakeholders

📝 Today's Tasks:
• [In Progress] Implement OAuth integration
• [Todo] Write unit tests for auth module
• [Todo] Review PR #123

⚡ Quick Stats:
• 12 tasks completed this week
• 3 hours average daily focus time
• 85% sprint completion rate
    `);

    this.widgets.set('progressGauge', progressGauge);
    this.widgets.set('taskTable', taskTable);
    this.widgets.set('timeSparkline', timeSparkline);
    this.widgets.set('focusBox', focusBox);

    this.addHeader('👤 Personal Dashboard');
    this.addFooter();
  }

  /**
   * Switch between dashboard layouts
   */
  switchLayout(layout: 'overview' | 'velocity' | 'personal'): void {
    this.currentLayout = layout;
    void this.refreshData().catch(error =>
      DashboardManager.showErrorNotification(
        `Failed to refresh data after layout change: ${String(error)}`
      )
    );
  }

  /**
   * Add header with current info
   */
  private addHeader(title: string): void {
    const headerStyles = this.themeHelper.getHeaderStyles();
    const header = this.grid.set(-1, 0, 1, 12, blessed.box, {
      label: title,
      ...headerStyles,
      align: 'center',
    });

    const now = new Date().toLocaleString();
    header.setContent(`${String(title)} | ${String(now)} | Press 'h' for help`);
    this.widgets.set('header', header);
  }

  /**
   * Add footer with controls
   */
  private addFooter(): void {
    const footerStyles = this.themeHelper.getFooterStyles();
    const footer = this.grid.set(12, 0, 1, 12, blessed.box, {
      ...footerStyles,
      align: 'center',
    });

    const currentTheme = this.themeHelper.getTheme().name;
    footer.setContent(
      `1-3:Layouts | Tab:Navigate | r:Refresh | t:Theme(${String(currentTheme)}) | s:Stats | d:Debug | h:Help | q:Quit`
    );
    this.widgets.set('footer', footer);
  }

  /**
   * Show error notification
   */
  private static showErrorNotification(message: string): void {
    const errorBox = blessed.box({
      top: 1,
      right: 1,
      width: Math.floor((this.screen as any).width * 0.4),
      height: 3,
      border: { type: 'line', fg: 'red' },
      style: { fg: 'white', bg: 'red' },
      label: '⚠️  Error',
      content: message,
      padding: { left: 1, right: 1 },
    });

    this.screen.append(errorBox);
    this.screen.render();

    // Auto-remove after 5 seconds
    setTimeout(() => {
      this.screen.remove(errorBox);
      this.screen.render();
    }, 5000);
  }

  /**
   * Show theme change notification
   */
  private static showThemeNotification(message: string): void {
    const themeBox = blessed.box({
      top: 1,
      left: 1,
      width: Math.floor((this.screen as any).width * 0.3),
      height: 3,
      border: { type: 'line', fg: this.themeHelper.getColor('primary') },
      style: {
        fg: this.themeHelper.getColor('foreground'),
        bg: this.themeHelper.getColor('secondary'),
      },
      label: '🎨 Theme',
      content: message,
      padding: { left: 1, right: 1 },
    });

    this.screen.append(themeBox);
    this.screen.render();

    // Auto-remove after 3 seconds
    setTimeout(() => {
      this.screen.remove(themeBox);
      this.screen.render();
    }, 3000);
  }

  /**
   * Show help overlay
   */
  private static showHelp(): void {
    const helpBox = blessed.box({
      top: 'center',
      left: 'center',
      width: '50%',
      height: '60%',
      border: { type: 'line', fg: 'yellow' },
      style: { fg: 'white', bg: 'black' },
      label: '📖 Dashboard Help',
      content: `
🎮 Navigation & Controls:
  Layout Switching:
    1, F1      - Overview dashboard
    2, F2      - Velocity dashboard  
    3, F3      - Personal dashboard

  Widget Navigation:
    Tab        - Focus next widget
    Shift+Tab  - Focus previous widget
    F, F11     - Toggle fullscreen for focused widget
    
  Dashboard Controls:
    r, F5      - Refresh data manually
    a, F10     - Toggle auto-refresh
    t, F9      - Cycle through themes
    s          - Show quick statistics
    d          - Toggle debug mode
    e          - Export dashboard (coming soon)
    
  Help & Exit:
    h, ?, F12  - Show this help
    Escape     - Reset view to default
    q, Ctrl+C  - Quit dashboard

📊 Dashboard Layouts:
  1 - Overview: Task status, priority breakdown, activity
  2 - Velocity: Team performance, burndown charts, capacity
  3 - Personal: Individual progress, focus areas, time tracking

🎨 Themes:
  Available: dark, light, high-contrast, solarized-dark
  Use 't' to cycle through themes or --theme flag on startup

⚙️  Features:
  • Real-time data updates with configurable intervals
  • Interactive charts and tables with focus navigation
  • Multiple color themes for accessibility
  • Debug mode for troubleshooting
  • Export functionality (coming soon)

Press any key to close this help...
      `,
      padding: { left: 2, right: 2 },
    });

    this.screen.append(helpBox);
    helpBox.focus();

    helpBox.key(['escape', 'enter', 'space'], () => {
      this.screen.remove(helpBox);
      this.screen.render();
    });

    this.screen.render();
  }

  /**
   * Toggle between available themes
   */
  private static toggleTheme(): void {
    const themes = getThemeNames();
    const currentIndex = themes.indexOf(this.config.theme);
    const nextIndex = (currentIndex + 1) % themes.length;

    this.config.theme = themes[nextIndex];
    this.themeHelper.setTheme(this.config.theme);

    // Show theme change notification
    this.showThemeNotification(`Theme changed to: ${String(String(this.config.theme))}`);

    // Refresh dashboard with new theme
    void this.refreshData();
  }

  /**
   * Toggle auto-refresh
   */
  private static toggleAutoRefresh(): void {
    this.config.autoRefresh = !this.config.autoRefresh;

    if (this.config.autoRefresh) {
      this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }
  }

  /**
   * Start auto-refresh timer
   */
  startAutoRefresh(): void {
    this.stopAutoRefresh(); // Clear existing timer

    if (this.config.autoRefresh) {
      this.refreshTimer = setInterval(() => {
        void this.refreshData().catch(error =>
          DashboardManager.showErrorNotification(`Failed to auto-refresh data: ${String(error)}`)
        );
      }, this.config.refreshInterval);
    }
  }

  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /**
   * Refresh dashboard data
   */
  async refreshData(): Promise<void> {
    try {
      // Fetch real data from API or fallback to sample data
      const data = await this.dataService.fetchDashboardData();

      switch (this.currentLayout) {
        case 'overview':
          this.createOverviewDashboard(data);
          break;
        case 'velocity':
          this.createVelocityDashboard(data);
          break;
        case 'personal':
          this.createPersonalDashboard(data);
          break;
      }

      this.screen.render();
    } catch (error) {
      // Show error notification and use sample data
      this.showErrorNotification(`Data refresh failed: ${String(String(error.message))}`);
      const fallbackData = this.generateSampleData();

      switch (this.currentLayout) {
        case 'overview':
          this.createOverviewDashboard(fallbackData);
          break;
        case 'velocity':
          this.createVelocityDashboard(fallbackData);
          break;
        case 'personal':
          this.createPersonalDashboard(fallbackData);
          break;
      }

      this.screen.render();
    }
  }

  /**
   * Clear all widgets
   */
  private clearWidgets(): void {
    for (const widget of this.widgets.values()) {
      widget.destroy();
    }
    this.widgets.clear();
  }

  /**
   * Get color for task status
   */
  // private static getStatusColor(status: string): string {
  //   const colors = {
  //     todo: 'gray',
  //     in_progress: 'yellow',
  //     done: 'green',
  //     blocked: 'red',
  //   };
  //   return colors[status as keyof typeof colors] ?? 'white';
  // }

  /**
   * Generate sample data for demo
   */
  private static generateSampleData(): DashboardData {
    return {
      tasks: {
        total: 45,
        byStatus: {
          todo: 18,
          in_progress: 12,
          done: 13,
          blocked: 2,
        },
        byPriority: {
          P1: 8,
          P2: 15,
          P3: 18,
          P4: 4,
        },
        completed: 13,
        overdue: 3,
      },
      velocity: [
        { period: 'W1', completed: 12 },
        { period: 'W2', completed: 15 },
        { period: 'W3', completed: 18 },
        { period: 'W4', completed: 14 },
        { period: 'W5', completed: 20 },
        { period: 'W6', completed: 16 },
        { period: 'W7', completed: 22 },
        { period: 'W8', completed: 19 },
      ],
      teamMembers: [
        { name: 'Alice', taskCount: 8, load: 85 },
        { name: 'Bob', taskCount: 6, load: 70 },
        { name: 'Charlie', taskCount: 10, load: 95 },
        { name: 'Diana', taskCount: 7, load: 75 },
      ],
      burndown: [
        { day: 'Day 1', remaining: 45, ideal: 45 },
        { day: 'Day 2', remaining: 42, ideal: 40 },
        { day: 'Day 3', remaining: 38, ideal: 35 },
        { day: 'Day 4', remaining: 35, ideal: 30 },
        { day: 'Day 5', remaining: 30, ideal: 25 },
        { day: 'Day 6', remaining: 28, ideal: 20 },
        { day: 'Day 7', remaining: 25, ideal: 15 },
        { day: 'Day 8', remaining: 20, ideal: 10 },
        { day: 'Day 9', remaining: 15, ideal: 5 },
        { day: 'Day 10', remaining: 12, ideal: 0 },
      ],
      activity: [
        { timestamp: '14:32', event: 'Task completed: User Auth', user: 'Alice' },
        { timestamp: '14:15', event: 'New task created: Fix login bug', user: 'Bob' },
        { timestamp: '13:45', event: 'Task moved to In Progress', user: 'Charlie' },
        { timestamp: '13:20', event: 'Comment added to TASK-123', user: 'Diana' },
        { timestamp: '12:55', event: 'Task assigned to Alice', user: 'Bob' },
      ],
    };
  }

  /**
   * Start the dashboard
   */
  start(): void {
    void this.refreshData().catch(error =>
      DashboardManager.showErrorNotification(`Failed to refresh data on start: ${String(error)}`)
    );
    this.startAutoRefresh();
    this.screen.render();
  }

  /**
   * Focus next widget for navigation
   */
  private static focusNextWidget(): void {
    const widgetKeys = Array.from(this.widgets.keys());
    if (widgetKeys.length === 0) return;

    const currentIndex = this.focusedWidget ? widgetKeys.indexOf(this.focusedWidget) : -1;
    const nextIndex = (currentIndex + 1) % widgetKeys.length;

    this.focusedWidget = widgetKeys[nextIndex];
    const widget = this.widgets.get(this.focusedWidget);

    if (widget?.focus) {
      widget.focus();
      this.screen.render();
    }
  }

  /**
   * Focus previous widget for navigation
   */
  private static focusPreviousWidget(): void {
    const widgetKeys = Array.from(this.widgets.keys());
    if (widgetKeys.length === 0) return;

    const currentIndex = this.focusedWidget ? widgetKeys.indexOf(this.focusedWidget) : -1;
    const prevIndex = currentIndex <= 0 ? widgetKeys.length - 1 : currentIndex - 1;

    this.focusedWidget = widgetKeys[prevIndex];
    const widget = this.widgets.get(this.focusedWidget);

    if (widget?.focus) {
      widget.focus();
      this.screen.render();
    }
  }

  /**
   * Toggle fullscreen mode for focused widget
   */
  private static toggleFullscreen(): void {
    if (!this.focusedWidget) {
      this.showNotification('No widget focused. Use Tab to focus a widget first.');
      return;
    }

    this.isFullscreen = !this.isFullscreen;

    if (this.isFullscreen) {
      this.showNotification(
        `Fullscreen mode: ${String(String(this.focusedWidget))} (press F or F11 to exit)`
      );
      // In a real implementation, this would resize the focused widget to full screen
    } else {
      this.showNotification('Exited fullscreen mode');
      void this.refreshData(); // Restore normal layout
    }
  }

  /**
   * Show quick statistics overlay
   */
  private static showQuickStats(): void {
    const statsBox = blessed.box({
      top: 'center',
      left: 'center',
      width: '60%',
      height: '50%',
      border: { type: 'line', fg: this.themeHelper.getColor('primary') },
      style: {
        fg: this.themeHelper.getColor('foreground'),
        bg: this.themeHelper.getColor('background'),
      },
      label: '📊 Quick Statistics',
      content: `
📈 Performance Metrics:
  • Dashboard Refresh Rate: ${String(String(this.config.refreshInterval / 1000))}s
  • Active Widgets: ${String(String(this.widgets.size))}
  • Current Theme: ${String(String(this.themeHelper.getTheme().name))}
  • Auto-refresh: ${String(String(this.config.autoRefresh ? 'Enabled' : 'Disabled'))}

🎮 Navigation Tips:
  • Tab/Shift+Tab: Navigate between widgets
  • F/F11: Toggle fullscreen for focused widget
  • 1-3/F1-F3: Switch dashboard layouts
  • t/F9: Cycle through themes
  • r/F5: Manual refresh
  • s: Show this quick stats
  • h/?: Full help

Press any key to close...
      `,
      padding: { left: 2, right: 2 },
    });

    this.screen.append(statsBox);
    statsBox.focus();

    statsBox.key(['escape', 'enter', 'space', 's'], () => {
      this.screen.remove(statsBox);
      this.screen.render();
    });

    this.screen.render();
  }

  /**
   * Export dashboard (placeholder)
   */
  private static exportDashboard(): void {
    this.showNotification('Export functionality coming soon! (PNG/SVG export)');
  }

  /**
   * Toggle debug mode
   */
  private static toggleDebugMode(): void {
    this.debugMode = !this.debugMode;

    if (this.debugMode) {
      this.showNotification('Debug mode enabled - showing widget info');
      this.showDebugOverlay();
    } else {
      this.showNotification('Debug mode disabled');
      this.hideDebugOverlay();
    }
  }

  /**
   * Show debug overlay with widget information
   */
  private showDebugOverlay(): void {
    const debugInfo = Array.from(this.widgets.entries())
      .map(([name, widget]) => `${String(name)}: ${String(String(widget.constructor.name))}`)
      .join('\n');

    const debugBox = blessed.box({
      top: 0,
      right: 0,
      width: '25%',
      height: '30%',
      border: { type: 'line', fg: 'yellow' },
      style: { fg: 'yellow', bg: 'black' },
      label: '🐛 Debug Info',
      content: `
Widgets: ${String(String(this.widgets.size))}
Focused: ${String(String(this.focusedWidget ?? 'none'))}
Layout: ${String(String(this.currentLayout))}
Fullscreen: ${String(String(this.isFullscreen))}
Theme: ${String(String(this.themeHelper.getTheme().name))}

Active Widgets:
${String(debugInfo)}
      `,
      padding: { left: 1, right: 1 },
    });

    this.widgets.set('debug', debugBox);
    this.screen.append(debugBox);
    this.screen.render();
  }

  /**
   * Hide debug overlay
   */
  private hideDebugOverlay(): void {
    const debugWidget = this.widgets.get('debug');
    if (debugWidget) {
      this.screen.remove(debugWidget);
      this.widgets.delete('debug');
      this.screen.render();
    }
  }

  /**
   * Reset view to default state
   */
  private static resetView(): void {
    this.isFullscreen = false;
    this.focusedWidget = null;
    this.debugMode = false;
    this.hideDebugOverlay();
    void this.refreshData();
    this.showNotification('View reset to default state');
  }

  /**
   * Show general notification
   */
  private static showNotification(message: string): void {
    const notificationBox = blessed.box({
      top: 1,
      left: 'center',
      width: '50%',
      height: 3,
      border: { type: 'line', fg: this.themeHelper.getColor('info') },
      style: {
        fg: this.themeHelper.getColor('foreground'),
        bg: this.themeHelper.getColor('secondary'),
      },
      label: 'ℹ️  Info',
      content: message,
      padding: { left: 1, right: 1 },
    });

    this.screen.append(notificationBox);
    this.screen.render();

    // Auto-remove after 3 seconds
    setTimeout(() => {
      this.screen.remove(notificationBox);
      this.screen.render();
    }, 3000);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopAutoRefresh();
    this.clearWidgets();
    this.screen.destroy();
  }
}

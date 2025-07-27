# Burndown Chart Integration Guide for task-kanban-mcp CLI

This guide demonstrates how to integrate asciichart to create beautiful burndown charts in your task-kanban-mcp CLI, providing visual project progress tracking directly in the terminal.

## Overview

Burndown charts are essential for tracking project progress, showing:
- Remaining work over time
- Ideal work pace line
- Actual vs planned progress
- Sprint/iteration velocity

## Installation

```bash
cd /path/to/task-kanban-mcp
npm install asciichart chalk date-fns
```

## Implementation

### 1. Data Collection Module

Create `cli/analytics/burndownData.js`:

```javascript
import { differenceInDays, startOfDay, addDays, format } from 'date-fns';

export class BurndownDataCollector {
  constructor(api) {
    this.api = api;
  }

  async collectSprintData(boardId, startDate, endDate) {
    const tasks = await this.api.getTasks(boardId);
    const history = await this.api.getTaskHistory(boardId, startDate, endDate);
    
    // Calculate total story points
    const totalPoints = tasks.reduce((sum, task) => sum + (task.storyPoints || 1), 0);
    
    // Generate daily snapshots
    const days = differenceInDays(endDate, startDate) + 1;
    const dailyData = [];
    
    for (let i = 0; i < days; i++) {
      const currentDate = addDays(startDate, i);
      const snapshot = this.getSnapshotForDate(tasks, history, currentDate);
      dailyData.push({
        date: currentDate,
        remainingPoints: snapshot.remainingPoints,
        completedPoints: snapshot.completedPoints,
        addedPoints: snapshot.addedPoints
      });
    }
    
    return {
      totalPoints,
      dailyData,
      startDate,
      endDate
    };
  }

  getSnapshotForDate(tasks, history, date) {
    const dateStr = format(date, 'yyyy-MM-dd');
    let remainingPoints = 0;
    let completedPoints = 0;
    let addedPoints = 0;
    
    tasks.forEach(task => {
      const taskHistory = history[task.id] || [];
      const statusOnDate = this.getTaskStatusOnDate(task, taskHistory, date);
      
      if (statusOnDate === 'completed') {
        completedPoints += task.storyPoints || 1;
      } else if (statusOnDate === 'active') {
        remainingPoints += task.storyPoints || 1;
      }
      
      // Check if task was added on this date
      if (format(new Date(task.createdAt), 'yyyy-MM-dd') === dateStr) {
        addedPoints += task.storyPoints || 1;
      }
    });
    
    return { remainingPoints, completedPoints, addedPoints };
  }

  getTaskStatusOnDate(task, history, date) {
    // Find the most recent status change before or on the given date
    const relevantHistory = history
      .filter(h => new Date(h.timestamp) <= date)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (relevantHistory.length > 0) {
      return relevantHistory[0].status;
    }
    
    // If no history, check if task was created before date
    return new Date(task.createdAt) <= date ? 'active' : 'not-created';
  }
}
```

### 2. Burndown Chart Renderer

Create `cli/charts/burndownChart.js`:

```javascript
import asciichart from 'asciichart';
import chalk from 'chalk';
import { format } from 'date-fns';

export class BurndownChart {
  constructor(options = {}) {
    this.options = {
      height: 15,
      padding: '  ',
      colors: {
        ideal: asciichart.green,
        actual: asciichart.blue,
        scope: asciichart.red
      },
      ...options
    };
  }

  render(burndownData) {
    const { totalPoints, dailyData, startDate, endDate } = burndownData;
    
    // Calculate series data
    const idealLine = this.calculateIdealLine(totalPoints, dailyData.length);
    const actualLine = dailyData.map(d => d.remainingPoints);
    const scopeLine = this.calculateScopeLine(dailyData);
    
    // Prepare plot data
    const series = [idealLine, actualLine];
    const colors = [this.options.colors.ideal, this.options.colors.actual];
    
    // Add scope line if there were scope changes
    if (scopeLine.some(v => v !== totalPoints)) {
      series.push(scopeLine);
      colors.push(this.options.colors.scope);
    }
    
    // Create the chart
    const config = {
      height: this.options.height,
      padding: this.options.padding,
      colors: colors,
      format: (x, i) => {
        return (this.options.padding + x.toFixed(0)).slice(-5);
      }
    };
    
    const chart = asciichart.plot(series, config);
    
    // Add decorations
    return this.decorateChart(chart, burndownData);
  }

  calculateIdealLine(totalPoints, days) {
    const pointsPerDay = totalPoints / (days - 1);
    const ideal = [];
    
    for (let i = 0; i < days; i++) {
      ideal.push(totalPoints - (pointsPerDay * i));
    }
    
    return ideal;
  }

  calculateScopeLine(dailyData) {
    let runningTotal = dailyData[0].remainingPoints + dailyData[0].completedPoints;
    const scope = [runningTotal];
    
    for (let i = 1; i < dailyData.length; i++) {
      runningTotal += dailyData[i].addedPoints;
      scope.push(runningTotal);
    }
    
    return scope;
  }

  decorateChart(chart, data) {
    const lines = chart.split('\n');
    const decorated = [];
    
    // Add title
    decorated.push(chalk.bold.white('Sprint Burndown Chart'));
    decorated.push(chalk.gray('─'.repeat(50)));
    decorated.push('');
    
    // Add the chart
    decorated.push(...lines);
    decorated.push('');
    
    // Add x-axis labels
    decorated.push(this.createXAxisLabels(data));
    decorated.push('');
    
    // Add legend
    decorated.push(this.createLegend());
    decorated.push('');
    
    // Add statistics
    decorated.push(this.createStatistics(data));
    
    return decorated.join('\n');
  }

  createXAxisLabels(data) {
    const { dailyData, startDate } = data;
    const totalDays = dailyData.length;
    const labelsCount = Math.min(7, totalDays); // Show max 7 labels
    const step = Math.floor(totalDays / labelsCount);
    
    let labels = this.options.padding + ' ';
    for (let i = 0; i < totalDays; i += step) {
      const date = addDays(startDate, i);
      const label = format(date, 'MM/dd');
      labels += label.padEnd(Math.floor(50 / labelsCount), ' ');
    }
    
    return chalk.gray(labels);
  }

  createLegend() {
    const lines = [];
    lines.push(chalk.bold('Legend:'));
    lines.push(`  ${chalk.green('━━━')} Ideal burn rate`);
    lines.push(`  ${chalk.blue('━━━')} Actual remaining work`);
    
    if (this.options.colors.scope) {
      lines.push(`  ${chalk.red('━━━')} Total scope (with changes)`);
    }
    
    return lines.join('\n');
  }

  createStatistics(data) {
    const { totalPoints, dailyData } = data;
    const currentRemaining = dailyData[dailyData.length - 1].remainingPoints;
    const completedPoints = totalPoints - currentRemaining;
    const completionRate = ((completedPoints / totalPoints) * 100).toFixed(1);
    const velocity = (completedPoints / dailyData.length).toFixed(1);
    
    const stats = [];
    stats.push(chalk.bold('Statistics:'));
    stats.push(`  Total Story Points: ${totalPoints}`);
    stats.push(`  Completed: ${completedPoints} (${completionRate}%)`);
    stats.push(`  Remaining: ${currentRemaining}`);
    stats.push(`  Daily Velocity: ${velocity} points/day`);
    
    // Calculate if on track
    const idealRemaining = this.calculateIdealLine(totalPoints, dailyData.length)[dailyData.length - 1];
    const difference = currentRemaining - idealRemaining;
    
    if (difference > 0) {
      stats.push(`  Status: ${chalk.red(`Behind by ${difference.toFixed(0)} points`)}`);
    } else {
      stats.push(`  Status: ${chalk.green(`Ahead by ${Math.abs(difference).toFixed(0)} points`)}`);
    }
    
    return stats.join('\n');
  }
}
```

### 3. CLI Command Integration

Create `cli/commands/burndown.js`:

```javascript
import { Command } from 'commander';
import chalk from 'chalk';
import { parseISO, subDays } from 'date-fns';
import ora from 'ora';
import { BurndownDataCollector } from '../analytics/burndownData.js';
import { BurndownChart } from '../charts/burndownChart.js';
import prompts from 'prompts';

export function createBurndownCommand(api) {
  const burndown = new Command('burndown');
  
  burndown
    .description('Generate burndown charts for your projects')
    .option('-b, --board <id>', 'Board ID')
    .option('-s, --sprint <id>', 'Sprint ID')
    .option('-d, --days <number>', 'Number of days to show', '14')
    .option('--start <date>', 'Start date (YYYY-MM-DD)')
    .option('--end <date>', 'End date (YYYY-MM-DD)')
    .option('-h, --height <number>', 'Chart height', '15')
    .option('--no-color', 'Disable colors')
    .option('--export <format>', 'Export format (json, csv)')
    .action(async (options) => {
      await generateBurndown(api, options);
    });
  
  // Sub-commands
  burndown
    .command('compare')
    .description('Compare multiple sprints')
    .action(async () => {
      await compareSprints(api);
    });
  
  burndown
    .command('velocity')
    .description('Show velocity trends over multiple sprints')
    .action(async () => {
      await showVelocityTrend(api);
    });
  
  return burndown;
}

async function generateBurndown(api, options) {
  const spinner = ora('Loading burndown data...').start();
  
  try {
    // Get board selection if not provided
    let boardId = options.board;
    if (!boardId) {
      spinner.stop();
      const boards = await api.getBoards();
      const { selectedBoard } = await prompts({
        type: 'select',
        name: 'selectedBoard',
        message: 'Select a board:',
        choices: boards.map(b => ({ title: b.name, value: b.id }))
      });
      boardId = selectedBoard;
      spinner.start();
    }
    
    // Determine date range
    const endDate = options.end ? parseISO(options.end) : new Date();
    const startDate = options.start 
      ? parseISO(options.start) 
      : subDays(endDate, parseInt(options.days));
    
    // Collect data
    const collector = new BurndownDataCollector(api);
    const burndownData = await collector.collectSprintData(boardId, startDate, endDate);
    
    spinner.succeed('Data loaded successfully');
    
    // Render chart
    const chart = new BurndownChart({
      height: parseInt(options.height),
      useColor: options.color
    });
    
    console.log('\n' + chart.render(burndownData));
    
    // Export if requested
    if (options.export) {
      await exportData(burndownData, options.export);
    }
    
  } catch (error) {
    spinner.fail(`Failed to generate burndown: ${error.message}`);
    process.exit(1);
  }
}

async function compareSprints(api) {
  const spinner = ora('Loading sprints...').start();
  
  try {
    const sprints = await api.getSprints();
    spinner.stop();
    
    // Select sprints to compare
    const { selectedSprints } = await prompts({
      type: 'multiselect',
      name: 'selectedSprints',
      message: 'Select sprints to compare:',
      choices: sprints.map(s => ({ 
        title: `${s.name} (${format(new Date(s.startDate), 'MMM dd')} - ${format(new Date(s.endDate), 'MMM dd')})`, 
        value: s.id 
      })),
      min: 2,
      max: 4
    });
    
    spinner.start('Generating comparison...');
    
    // Collect data for each sprint
    const collector = new BurndownDataCollector(api);
    const sprintData = [];
    
    for (const sprintId of selectedSprints) {
      const sprint = sprints.find(s => s.id === sprintId);
      const data = await collector.collectSprintData(
        sprint.boardId, 
        new Date(sprint.startDate), 
        new Date(sprint.endDate)
      );
      sprintData.push({ sprint, data });
    }
    
    spinner.succeed('Data loaded');
    
    // Render comparison
    renderSprintComparison(sprintData);
    
  } catch (error) {
    spinner.fail(`Failed to compare sprints: ${error.message}`);
  }
}

function renderSprintComparison(sprintData) {
  console.log(chalk.bold.white('\nSprint Comparison'));
  console.log(chalk.gray('═'.repeat(60)));
  
  // Normalize data to percentages for fair comparison
  const series = sprintData.map(({ sprint, data }) => {
    const percentages = data.dailyData.map(d => 
      (d.remainingPoints / data.totalPoints) * 100
    );
    return percentages;
  });
  
  // Create chart
  const config = {
    height: 12,
    padding: '  ',
    colors: [
      asciichart.blue,
      asciichart.green,
      asciichart.yellow,
      asciichart.red
    ],
    format: (x) => (x.toFixed(0) + '%').padStart(5)
  };
  
  const chart = asciichart.plot(series, config);
  console.log('\n' + chart);
  
  // Add legend
  console.log('\n' + chalk.bold('Sprints:'));
  sprintData.forEach(({ sprint }, index) => {
    const color = [chalk.blue, chalk.green, chalk.yellow, chalk.red][index];
    console.log(`  ${color('━━━')} ${sprint.name}`);
  });
  
  // Add statistics
  console.log('\n' + chalk.bold('Completion Rates:'));
  sprintData.forEach(({ sprint, data }) => {
    const completion = ((data.totalPoints - data.dailyData[data.dailyData.length - 1].remainingPoints) / data.totalPoints * 100).toFixed(1);
    console.log(`  ${sprint.name}: ${completion}%`);
  });
}

async function showVelocityTrend(api) {
  const spinner = ora('Calculating velocity trends...').start();
  
  try {
    const sprints = await api.getCompletedSprints();
    const velocities = [];
    
    for (const sprint of sprints.slice(-10)) { // Last 10 sprints
      const tasks = await api.getSprintTasks(sprint.id);
      const completedPoints = tasks
        .filter(t => t.status === 'done')
        .reduce((sum, t) => sum + (t.storyPoints || 1), 0);
      
      velocities.push(completedPoints);
    }
    
    spinner.succeed('Velocity calculated');
    
    // Render velocity chart
    const config = {
      height: 10,
      padding: '  ',
      format: (x) => x.toFixed(0).padStart(3)
    };
    
    console.log(chalk.bold.white('\nTeam Velocity Trend'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(asciichart.plot(velocities, config));
    
    // Statistics
    const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const trend = velocities[velocities.length - 1] - velocities[0];
    
    console.log('\n' + chalk.bold('Statistics:'));
    console.log(`  Average Velocity: ${avgVelocity.toFixed(1)} points/sprint`);
    console.log(`  Current Velocity: ${velocities[velocities.length - 1]} points`);
    console.log(`  Trend: ${trend > 0 ? chalk.green(`+${trend}`) : chalk.red(trend)} points`);
    
  } catch (error) {
    spinner.fail(`Failed to calculate velocity: ${error.message}`);
  }
}

async function exportData(burndownData, format) {
  const spinner = ora(`Exporting to ${format}...`).start();
  
  try {
    const filename = `burndown-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.${format}`;
    
    if (format === 'json') {
      await fs.writeFile(filename, JSON.stringify(burndownData, null, 2));
    } else if (format === 'csv') {
      const csv = convertToCSV(burndownData);
      await fs.writeFile(filename, csv);
    }
    
    spinner.succeed(`Exported to ${filename}`);
  } catch (error) {
    spinner.fail(`Export failed: ${error.message}`);
  }
}

function convertToCSV(burndownData) {
  const headers = ['Date', 'Remaining Points', 'Completed Points', 'Added Points', 'Total Scope'];
  const rows = burndownData.dailyData.map(d => [
    format(d.date, 'yyyy-MM-dd'),
    d.remainingPoints,
    d.completedPoints,
    d.addedPoints,
    d.remainingPoints + d.completedPoints
  ]);
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}
```

### 4. Advanced Features

Create `cli/charts/advancedCharts.js`:

```javascript
import asciichart from 'asciichart';
import chalk from 'chalk';

export class AdvancedCharts {
  // Cumulative Flow Diagram
  static renderCFD(boardData, days = 30) {
    const columns = boardData.columns;
    const series = [];
    const colors = [
      asciichart.red,
      asciichart.yellow,
      asciichart.blue,
      asciichart.green
    ];
    
    // Generate cumulative data for each column
    columns.forEach((column, index) => {
      const data = [];
      for (let day = 0; day < days; day++) {
        // This would fetch historical data in real implementation
        const tasksInColumn = Math.floor(Math.random() * 20) + 5;
        data.push(tasksInColumn);
      }
      series.push(data);
    });
    
    const config = {
      height: 15,
      colors: colors.slice(0, columns.length),
      format: (x) => x.toFixed(0).padStart(3)
    };
    
    console.log(chalk.bold('Cumulative Flow Diagram'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(asciichart.plot(series, config));
    
    // Legend
    console.log('\n' + chalk.bold('Columns:'));
    columns.forEach((col, i) => {
      const color = [chalk.red, chalk.yellow, chalk.blue, chalk.green][i];
      console.log(`  ${color('━━━')} ${col.name}`);
    });
  }
  
  // Task distribution chart
  static renderTaskDistribution(tasks) {
    const distribution = {
      'To Do': 0,
      'In Progress': 0,
      'Review': 0,
      'Done': 0
    };
    
    tasks.forEach(task => {
      distribution[task.status] = (distribution[task.status] || 0) + 1;
    });
    
    // Create horizontal bar chart
    console.log(chalk.bold('Task Distribution'));
    console.log(chalk.gray('─'.repeat(50)));
    
    const maxCount = Math.max(...Object.values(distribution));
    const barWidth = 30;
    
    Object.entries(distribution).forEach(([status, count]) => {
      const percentage = (count / tasks.length * 100).toFixed(1);
      const barLength = Math.floor((count / maxCount) * barWidth);
      const bar = '█'.repeat(barLength);
      const padding = ' '.repeat(12 - status.length);
      
      console.log(
        `${status}${padding} ${chalk.cyan(bar)} ${count} (${percentage}%)`
      );
    });
  }
  
  // Mini sparkline for quick metrics
  static renderSparkline(data, label, color = chalk.blue) {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min;
    
    const sparkline = data.map(value => {
      const normalized = (value - min) / range;
      const index = Math.floor(normalized * 7);
      return ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'][index] || '▁';
    }).join('');
    
    console.log(`${label}: ${color(sparkline)} ${data[data.length - 1]}`);
  }
}
```

### 5. Integration with Main CLI

Update your main CLI file:

```javascript
import { Command } from 'commander';
import { createBurndownCommand } from './cli/commands/burndown.js';
import { AdvancedCharts } from './cli/charts/advancedCharts.js';

const program = new Command();

// Add burndown command
program.addCommand(createBurndownCommand(api));

// Quick metrics command
program
  .command('metrics')
  .description('Show quick project metrics')
  .action(async () => {
    const spinner = ora('Loading metrics...').start();
    
    try {
      const boards = await api.getBoards();
      const tasks = await api.getAllTasks();
      
      spinner.stop();
      
      console.log(chalk.bold.white('\n📊 Project Metrics Dashboard\n'));
      
      // Task distribution
      AdvancedCharts.renderTaskDistribution(tasks);
      
      // Velocity sparkline
      const velocities = await api.getRecentVelocities();
      console.log('\n' + chalk.bold('Recent Sprint Velocities'));
      AdvancedCharts.renderSparkline(velocities, 'Velocity', chalk.green);
      
      // Completion rate sparkline
      const completionRates = await api.getCompletionRates();
      AdvancedCharts.renderSparkline(completionRates, 'Completion', chalk.blue);
      
    } catch (error) {
      spinner.fail(`Failed to load metrics: ${error.message}`);
    }
  });

// Dashboard command
program
  .command('dashboard')
  .description('Show comprehensive project dashboard')
  .action(async () => {
    console.clear();
    console.log(chalk.bold.cyan(`
╔═══════════════════════════════════════════════════╗
║            Task Kanban Dashboard                  ║
╚═══════════════════════════════════════════════════╝
    `));
    
    // Show multiple charts in dashboard layout
    const data = await loadDashboardData();
    
    // Burndown chart (mini version)
    const burndownChart = new BurndownChart({ height: 8 });
    console.log(burndownChart.render(data.burndown));
    
    // CFD
    AdvancedCharts.renderCFD(data.board, 14);
    
    // Task distribution
    AdvancedCharts.renderTaskDistribution(data.tasks);
  });

program.parse(process.argv);
```

## Usage Examples

### Basic burndown chart:
```bash
kanban burndown --board my-project --days 14
```

### Sprint comparison:
```bash
kanban burndown compare
```

### Velocity trends:
```bash
kanban burndown velocity
```

### Quick metrics:
```bash
kanban metrics
```

### Full dashboard:
```bash
kanban dashboard
```

## Customization Options

### Custom Chart Themes

```javascript
const darkTheme = {
  height: 20,
  colors: {
    ideal: asciichart.green,
    actual: asciichart.cyan,
    scope: asciichart.magenta
  },
  padding: '   ',
  format: (x) => chalk.gray(x.toFixed(0).padStart(4))
};

const chart = new BurndownChart(darkTheme);
```

### Time-based Aggregation

```javascript
// Weekly burndown
const weeklyData = aggregateToWeekly(dailyData);

// Monthly velocity
const monthlyVelocity = aggregateToMonthly(velocityData);
```

### Multiple Team Support

```javascript
// Team comparison
const teamData = await Promise.all(
  teams.map(team => collector.collectSprintData(team.boardId))
);

// Render multi-team chart
renderMultiTeamBurndown(teamData);
```

## Best Practices

1. **Data Caching**: Cache historical data to improve performance
2. **Error Handling**: Always handle missing data gracefully
3. **Responsiveness**: Adapt chart height based on terminal size
4. **Color Support**: Check terminal capabilities before using colors
5. **Export Options**: Provide multiple export formats for reporting

## Troubleshooting

### Common Issues

1. **Chart appears distorted**: Ensure terminal width is at least 80 characters
2. **No data points**: Verify tasks have story points assigned
3. **Incorrect calculations**: Check timezone settings for date calculations

### Terminal Compatibility

```javascript
// Check terminal capabilities
const supportsColor = chalk.supportsColor;
const terminalWidth = process.stdout.columns;

if (terminalWidth < 80) {
  console.warn('Terminal width too small for optimal display');
}
```

## Advanced Analytics

### Predictive Burndown

```javascript
// Simple linear regression for prediction
function predictCompletion(burndownData) {
  const points = burndownData.dailyData.map((d, i) => ({
    x: i,
    y: d.remainingPoints
  }));
  
  // Calculate trend line
  const { slope, intercept } = linearRegression(points);
  
  // Predict completion day
  const completionDay = -intercept / slope;
  
  return {
    expectedCompletion: addDays(burndownData.startDate, Math.ceil(completionDay)),
    confidence: calculateConfidence(points, slope, intercept)
  };
}
```

### Risk Indicators

```javascript
// Identify sprint risks
function analyzeRisks(burndownData) {
  const risks = [];
  const actualVsIdeal = calculateDeviation(burndownData);
  
  if (actualVsIdeal > 20) {
    risks.push({
      level: 'high',
      message: 'Sprint is significantly behind schedule'
    });
  }
  
  if (hasIncreasingScope(burndownData)) {
    risks.push({
      level: 'medium',
      message: 'Scope creep detected'
    });
  }
  
  return risks;
}
```

## Real-Time Updates

### 6. Live Dashboard Implementation

Create `cli/charts/liveDashboard.js`:

```javascript
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { BurndownDataCollector } from '../analytics/burndownData.js';
import { ProjectMetrics } from '../analytics/projectMetrics.js';

export class LiveDashboard extends EventEmitter {
  constructor(api, wsUrl) {
    super();
    this.api = api;
    this.wsUrl = wsUrl;
    this.screen = null;
    this.grid = null;
    this.widgets = {};
    this.updateInterval = 5000; // 5 seconds
    this.collectors = {
      burndown: new BurndownDataCollector(api),
      metrics: new ProjectMetrics(api)
    };
  }

  async start() {
    this.setupScreen();
    this.setupWebSocket();
    await this.initialDataLoad();
    this.startUpdateLoop();
    
    this.screen.render();
  }

  setupScreen() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Task Kanban Live Dashboard'
    });

    this.grid = new contrib.grid({
      rows: 12,
      cols: 12,
      screen: this.screen
    });

    // Setup widgets
    this.setupWidgets();

    // Keyboard controls
    this.screen.key(['escape', 'q', 'C-c'], () => {
      return process.exit(0);
    });

    this.screen.key(['r'], () => {
      this.refreshData();
    });
  }

  setupWidgets() {
    // Burndown chart (top left)
    this.widgets.burndown = this.grid.set(0, 0, 6, 8, contrib.line, {
      style: {
        line: "yellow",
        text: "green",
        baseline: "black"
      },
      xLabelPadding: 3,
      xPadding: 5,
      showLegend: true,
      wholeNumbersOnly: false,
      label: 'Sprint Burndown (Live)'
    });

    // Velocity chart (top right)
    this.widgets.velocity = this.grid.set(0, 8, 4, 4, contrib.bar, {
      label: 'Sprint Velocity',
      barWidth: 4,
      barSpacing: 6,
      xOffset: 0,
      maxHeight: 9
    });

    // Task status (middle right)
    this.widgets.taskStatus = this.grid.set(4, 8, 2, 4, contrib.donut, {
      label: 'Task Status',
      radius: 8,
      arcWidth: 3,
      remainColor: 'black',
      yPadding: 2
    });

    // Cycle time (bottom left)
    this.widgets.cycleTime = this.grid.set(6, 0, 3, 6, contrib.line, {
      style: {
        line: "cyan",
        text: "white",
        baseline: "black"
      },
      label: 'Cycle Time Trend',
      showLegend: true
    });

    // Lead time (bottom middle)
    this.widgets.leadTime = this.grid.set(6, 6, 3, 6, contrib.gauge, {
      label: 'Avg Lead Time (days)',
      stroke: 'green',
      fill: 'white'
    });

    // Activity log (bottom)
    this.widgets.log = this.grid.set(9, 0, 3, 12, contrib.log, {
      fg: "green",
      selectedFg: "green",
      label: 'Activity Stream'
    });

    // Stats table (middle left)
    this.widgets.stats = this.grid.set(6, 0, 3, 6, contrib.table, {
      keys: true,
      fg: 'white',
      selectedFg: 'white',
      selectedBg: 'blue',
      interactive: false,
      label: 'Project Statistics',
      width: '100%',
      height: '100%',
      border: {type: "line", fg: "cyan"},
      columnSpacing: 3,
      columnWidth: [20, 10]
    });
  }

  setupWebSocket() {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('message', (data) => {
      const event = JSON.parse(data);
      this.handleRealtimeEvent(event);
    });

    this.ws.on('error', (error) => {
      this.widgets.log.log(`WebSocket error: ${error.message}`);
    });

    this.ws.on('close', () => {
      this.widgets.log.log('WebSocket connection closed. Reconnecting...');
      setTimeout(() => this.setupWebSocket(), 5000);
    });
  }

  handleRealtimeEvent(event) {
    const timestamp = new Date().toLocaleTimeString();
    
    switch (event.type) {
      case 'task:created':
        this.widgets.log.log(`[${timestamp}] New task created: ${event.data.title}`);
        this.updateBurndown();
        this.updateTaskStatus();
        break;
      
      case 'task:moved':
        this.widgets.log.log(`[${timestamp}] Task moved: ${event.data.title} → ${event.data.column}`);
        this.updateBurndown();
        this.updateTaskStatus();
        this.updateCycleTime();
        break;
      
      case 'task:completed':
        this.widgets.log.log(`[${timestamp}] Task completed: ${event.data.title}`);
        this.updateAllWidgets();
        break;
      
      case 'sprint:updated':
        this.widgets.log.log(`[${timestamp}] Sprint updated`);
        this.updateAllWidgets();
        break;
    }
    
    this.screen.render();
  }

  async initialDataLoad() {
    this.widgets.log.log('Loading initial data...');
    await this.updateAllWidgets();
    this.widgets.log.log('Dashboard ready!');
  }

  startUpdateLoop() {
    setInterval(() => {
      this.refreshData();
    }, this.updateInterval);
  }

  async refreshData() {
    this.widgets.log.log('Refreshing data...');
    await this.updateAllWidgets();
  }

  async updateAllWidgets() {
    await Promise.all([
      this.updateBurndown(),
      this.updateVelocity(),
      this.updateTaskStatus(),
      this.updateCycleTime(),
      this.updateLeadTime(),
      this.updateStats()
    ]);
    this.screen.render();
  }

  async updateBurndown() {
    try {
      const data = await this.collectors.burndown.collectSprintData(
        this.currentBoardId,
        this.currentSprintStart,
        this.currentSprintEnd
      );

      const ideal = this.calculateIdealLine(data.totalPoints, data.dailyData.length);
      const actual = data.dailyData.map(d => d.remainingPoints);
      const labels = data.dailyData.map((d, i) => `Day ${i + 1}`);

      this.widgets.burndown.setData([
        {
          title: 'Ideal',
          x: labels,
          y: ideal,
          style: { line: 'green' }
        },
        {
          title: 'Actual',
          x: labels,
          y: actual,
          style: { line: 'yellow' }
        }
      ]);
    } catch (error) {
      this.widgets.log.log(`Error updating burndown: ${error.message}`);
    }
  }

  async updateVelocity() {
    try {
      const velocities = await this.collectors.metrics.getSprintVelocities(10);
      
      this.widgets.velocity.setData({
        titles: velocities.map(v => v.sprint),
        data: velocities.map(v => v.velocity)
      });
    } catch (error) {
      this.widgets.log.log(`Error updating velocity: ${error.message}`);
    }
  }

  async updateTaskStatus() {
    try {
      const distribution = await this.collectors.metrics.getTaskDistribution();
      
      this.widgets.taskStatus.setData([
        { percent: distribution.todo, label: 'To Do', color: 'red' },
        { percent: distribution.inProgress, label: 'In Progress', color: 'yellow' },
        { percent: distribution.review, label: 'Review', color: 'cyan' },
        { percent: distribution.done, label: 'Done', color: 'green' }
      ]);
    } catch (error) {
      this.widgets.log.log(`Error updating task status: ${error.message}`);
    }
  }

  async updateCycleTime() {
    try {
      const cycleTimes = await this.collectors.metrics.getCycleTimeTrend(30);
      
      this.widgets.cycleTime.setData([
        {
          title: 'Cycle Time',
          x: cycleTimes.map((_, i) => `Day ${i + 1}`),
          y: cycleTimes.map(ct => ct.avgCycleTime)
        }
      ]);
    } catch (error) {
      this.widgets.log.log(`Error updating cycle time: ${error.message}`);
    }
  }

  async updateLeadTime() {
    try {
      const leadTime = await this.collectors.metrics.getAverageLeadTime();
      this.widgets.leadTime.setPercent(Math.min(leadTime / 30 * 100, 100));
      this.widgets.leadTime.setLabel(`Avg Lead Time: ${leadTime.toFixed(1)} days`);
    } catch (error) {
      this.widgets.log.log(`Error updating lead time: ${error.message}`);
    }
  }

  async updateStats() {
    try {
      const stats = await this.collectors.metrics.getProjectStatistics();
      
      this.widgets.stats.setData({
        headers: ['Metric', 'Value'],
        data: [
          ['Total Tasks', stats.totalTasks.toString()],
          ['Completed Today', stats.completedToday.toString()],
          ['Blocked Tasks', stats.blockedTasks.toString()],
          ['WIP Limit', `${stats.wipCurrent}/${stats.wipLimit}`],
          ['Throughput', `${stats.throughput.toFixed(1)}/day`],
          ['Efficiency', `${stats.efficiency.toFixed(1)}%`]
        ]
      });
    } catch (error) {
      this.widgets.log.log(`Error updating stats: ${error.message}`);
    }
  }

  calculateIdealLine(totalPoints, days) {
    const pointsPerDay = totalPoints / (days - 1);
    return Array.from({ length: days }, (_, i) => totalPoints - (pointsPerDay * i));
  }
}

// Terminal-based real-time charts using asciichart
export class RealtimeAsciiDashboard {
  constructor(api, wsUrl) {
    this.api = api;
    this.wsUrl = wsUrl;
    this.updateInterval = 2000;
    this.data = {
      burndown: [],
      velocity: [],
      throughput: [],
      cycleTime: []
    };
  }

  async start() {
    console.clear();
    this.setupWebSocket();
    this.startUpdateLoop();
  }

  setupWebSocket() {
    this.ws = new WebSocket(this.wsUrl);
    
    this.ws.on('message', (data) => {
      const event = JSON.parse(data);
      this.handleEvent(event);
    });
  }

  handleEvent(event) {
    // Update data based on event
    if (event.type === 'metrics:update') {
      this.updateMetrics(event.data);
    }
  }

  async startUpdateLoop() {
    while (true) {
      await this.render();
      await new Promise(resolve => setTimeout(resolve, this.updateInterval));
    }
  }

  async render() {
    console.clear();
    console.log(chalk.bold.cyan('📊 Task Kanban Real-Time Dashboard'));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.dim('Press Ctrl+C to exit | Updates every 2 seconds'));
    console.log();

    // Fetch latest data
    const metrics = await this.api.getCurrentMetrics();
    
    // Update rolling data
    this.updateRollingData(metrics);
    
    // Render charts
    this.renderBurndownMini();
    this.renderThroughputChart();
    this.renderCycleTimeChart();
    this.renderMetricsTable(metrics);
  }

  updateRollingData(metrics) {
    // Keep last 20 data points
    const maxPoints = 20;
    
    this.data.burndown.push(metrics.remainingPoints);
    if (this.data.burndown.length > maxPoints) this.data.burndown.shift();
    
    this.data.throughput.push(metrics.throughput);
    if (this.data.throughput.length > maxPoints) this.data.throughput.shift();
    
    this.data.cycleTime.push(metrics.avgCycleTime);
    if (this.data.cycleTime.length > maxPoints) this.data.cycleTime.shift();
  }

  renderBurndownMini() {
    if (this.data.burndown.length < 2) return;
    
    const config = {
      height: 6,
      format: (x) => x.toFixed(0).padStart(3)
    };
    
    console.log(chalk.bold('Remaining Story Points (Live)'));
    console.log(asciichart.plot(this.data.burndown, config));
    console.log();
  }

  renderThroughputChart() {
    if (this.data.throughput.length < 2) return;
    
    const config = {
      height: 6,
      format: (x) => x.toFixed(1).padStart(4)
    };
    
    console.log(chalk.bold('Throughput (tasks/day)'));
    console.log(asciichart.plot(this.data.throughput, config));
    console.log();
  }

  renderCycleTimeChart() {
    if (this.data.cycleTime.length < 2) return;
    
    const config = {
      height: 6,
      format: (x) => x.toFixed(1).padStart(4)
    };
    
    console.log(chalk.bold('Average Cycle Time (days)'));
    console.log(asciichart.plot(this.data.cycleTime, config));
    console.log();
  }

  renderMetricsTable(metrics) {
    console.log(chalk.bold('Current Metrics'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(`WIP Items:       ${metrics.wip} / ${metrics.wipLimit}`);
    console.log(`Blocked:         ${metrics.blocked}`);
    console.log(`Completed Today: ${metrics.completedToday}`);
    console.log(`Efficiency:      ${metrics.efficiency.toFixed(1)}%`);
  }
}
```

### 7. Project Metrics Analytics

Create `cli/analytics/projectMetrics.js`:

```javascript
import { differenceInDays, subDays, startOfDay } from 'date-fns';

export class ProjectMetrics {
  constructor(api) {
    this.api = api;
  }

  async getComprehensiveMetrics(boardId, dateRange = 30) {
    const endDate = new Date();
    const startDate = subDays(endDate, dateRange);
    
    const [tasks, history, team] = await Promise.all([
      this.api.getTasks(boardId),
      this.api.getTaskHistory(boardId, startDate, endDate),
      this.api.getTeamMembers(boardId)
    ]);

    return {
      velocity: await this.calculateVelocity(tasks, history, dateRange),
      cycleTime: this.calculateCycleTime(tasks, history),
      leadTime: this.calculateLeadTime(tasks, history),
      throughput: this.calculateThroughput(tasks, history, dateRange),
      wip: this.calculateWIP(tasks),
      efficiency: this.calculateEfficiency(tasks, history),
      predictability: this.calculatePredictability(tasks, history),
      quality: await this.calculateQualityMetrics(tasks, history),
      team: this.calculateTeamMetrics(tasks, team),
      risk: this.assessProjectRisk(tasks, history)
    };
  }

  calculateCycleTime(tasks, history) {
    const completedTasks = tasks.filter(t => t.status === 'done');
    const cycleTimes = completedTasks.map(task => {
      const started = history[task.id]?.find(h => h.field === 'status' && h.newValue === 'in-progress');
      const completed = history[task.id]?.find(h => h.field === 'status' && h.newValue === 'done');
      
      if (started && completed) {
        return differenceInDays(new Date(completed.timestamp), new Date(started.timestamp));
      }
      return null;
    }).filter(Boolean);

    return {
      average: cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length,
      median: this.median(cycleTimes),
      p85: this.percentile(cycleTimes, 85),
      p95: this.percentile(cycleTimes, 95),
      distribution: this.createDistribution(cycleTimes)
    };
  }

  calculateLeadTime(tasks, history) {
    const completedTasks = tasks.filter(t => t.status === 'done');
    const leadTimes = completedTasks.map(task => {
      const created = new Date(task.createdAt);
      const completed = history[task.id]?.find(h => h.field === 'status' && h.newValue === 'done');
      
      if (completed) {
        return differenceInDays(new Date(completed.timestamp), created);
      }
      return null;
    }).filter(Boolean);

    return {
      average: leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length,
      median: this.median(leadTimes),
      p85: this.percentile(leadTimes, 85),
      p95: this.percentile(leadTimes, 95)
    };
  }

  calculateThroughput(tasks, history, days) {
    const dailyThroughput = [];
    
    for (let i = 0; i < days; i++) {
      const date = subDays(new Date(), i);
      const completed = this.getTasksCompletedOnDate(tasks, history, date);
      dailyThroughput.push(completed.length);
    }

    return {
      daily: dailyThroughput,
      average: dailyThroughput.reduce((a, b) => a + b, 0) / days,
      trend: this.calculateTrend(dailyThroughput)
    };
  }

  calculateWIP(tasks) {
    const inProgress = tasks.filter(t => t.status === 'in-progress').length;
    const review = tasks.filter(t => t.status === 'review').length;
    
    return {
      current: inProgress + review,
      byColumn: {
        'in-progress': inProgress,
        'review': review
      },
      limit: 10, // This should come from board settings
      utilization: ((inProgress + review) / 10) * 100
    };
  }

  calculateEfficiency(tasks, history) {
    const flowEfficiency = this.calculateFlowEfficiency(tasks, history);
    const firstTimeRight = this.calculateFirstTimeRight(tasks, history);
    const blockageRate = this.calculateBlockageRate(tasks, history);
    
    return {
      flow: flowEfficiency,
      quality: firstTimeRight,
      blockage: blockageRate,
      overall: (flowEfficiency * 0.5 + firstTimeRight * 0.3 + (100 - blockageRate) * 0.2)
    };
  }

  calculatePredictability(tasks, history) {
    const estimateAccuracy = this.calculateEstimateAccuracy(tasks);
    const velocityVariability = this.calculateVelocityVariability(history);
    
    return {
      estimateAccuracy,
      velocityVariability,
      confidenceLevel: this.calculateConfidenceLevel(estimateAccuracy, velocityVariability)
    };
  }

  async calculateQualityMetrics(tasks, history) {
    const defectRate = this.calculateDefectRate(tasks);
    const reworkRate = this.calculateReworkRate(tasks, history);
    const testCoverage = await this.api.getTestCoverage();
    
    return {
      defectRate,
      reworkRate,
      testCoverage,
      qualityScore: (100 - defectRate) * 0.4 + (100 - reworkRate) * 0.4 + testCoverage * 0.2
    };
  }

  calculateTeamMetrics(tasks, team) {
    const taskDistribution = this.calculateTaskDistribution(tasks, team);
    const collaboration = this.calculateCollaborationIndex(tasks, team);
    
    return {
      distribution: taskDistribution,
      collaboration,
      capacity: this.calculateTeamCapacity(team),
      utilization: this.calculateTeamUtilization(tasks, team)
    };
  }

  assessProjectRisk(tasks, history) {
    const risks = [];
    
    // Schedule risk
    const velocityTrend = this.calculateVelocityTrend(history);
    if (velocityTrend < -10) {
      risks.push({
        type: 'schedule',
        level: 'high',
        message: 'Velocity declining significantly'
      });
    }
    
    // Quality risk
    const defectTrend = this.calculateDefectTrend(tasks, history);
    if (defectTrend > 20) {
      risks.push({
        type: 'quality',
        level: 'medium',
        message: 'Increasing defect rate'
      });
    }
    
    // Resource risk
    const wipRatio = tasks.filter(t => t.status === 'in-progress').length / 10;
    if (wipRatio > 0.9) {
      risks.push({
        type: 'resource',
        level: 'medium',
        message: 'WIP limit nearly exceeded'
      });
    }
    
    return {
      risks,
      overallRisk: this.calculateOverallRisk(risks)
    };
  }

  // Helper methods
  median(values) {
    const sorted = values.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  percentile(values, p) {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[index];
  }

  createDistribution(values) {
    const buckets = {};
    values.forEach(v => {
      const bucket = Math.floor(v / 5) * 5;
      buckets[bucket] = (buckets[bucket] || 0) + 1;
    });
    return buckets;
  }

  calculateTrend(values) {
    // Simple linear regression for trend
    const n = values.length;
    const sumX = values.reduce((sum, _, i) => sum + i, 0);
    const sumY = values.reduce((sum, v) => sum + v, 0);
    const sumXY = values.reduce((sum, v, i) => sum + i * v, 0);
    const sumX2 = values.reduce((sum, _, i) => sum + i * i, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }
}
```

### 8. Advanced Chart Types

Create `cli/charts/projectManagementCharts.js`:

```javascript
import asciichart from 'asciichart';
import chalk from 'chalk';
import Table from 'cli-table3';

export class ProjectManagementCharts {
  static renderCumulativeFlowDiagram(data) {
    console.log(chalk.bold.white('\n📊 Cumulative Flow Diagram'));
    console.log(chalk.gray('─'.repeat(60)));
    
    const series = [
      data.done,
      data.review,
      data.inProgress,
      data.todo
    ];
    
    const config = {
      height: 15,
      colors: [
        asciichart.green,
        asciichart.cyan,
        asciichart.yellow,
        asciichart.red
      ],
      format: (x) => x.toFixed(0).padStart(3)
    };
    
    console.log(asciichart.plot(series, config));
    
    // Legend
    console.log('\n' + chalk.bold('Status:'));
    console.log(`  ${chalk.green('━━━')} Done (${data.done[data.done.length - 1]})`);
    console.log(`  ${chalk.cyan('━━━')} Review (${data.review[data.review.length - 1]})`);
    console.log(`  ${chalk.yellow('━━━')} In Progress (${data.inProgress[data.inProgress.length - 1]})`);
    console.log(`  ${chalk.red('━━━')} To Do (${data.todo[data.todo.length - 1]})`);
  }

  static renderControlChart(data) {
    console.log(chalk.bold.white('\n📈 Control Chart - Cycle Time'));
    console.log(chalk.gray('─'.repeat(60)));
    
    const mean = data.mean;
    const ucl = mean + (3 * data.stdDev); // Upper Control Limit
    const lcl = Math.max(0, mean - (3 * data.stdDev)); // Lower Control Limit
    
    // Create series with control limits
    const series = [
      data.values,
      new Array(data.values.length).fill(mean),
      new Array(data.values.length).fill(ucl),
      new Array(data.values.length).fill(lcl)
    ];
    
    const config = {
      height: 12,
      colors: [
        asciichart.blue,
        asciichart.green,
        asciichart.red,
        asciichart.red
      ],
      format: (x) => x.toFixed(1).padStart(5)
    };
    
    console.log(asciichart.plot(series, config));
    
    // Statistics
    console.log('\n' + chalk.bold('Statistics:'));
    console.log(`  Mean: ${mean.toFixed(2)} days`);
    console.log(`  UCL: ${ucl.toFixed(2)} days`);
    console.log(`  LCL: ${lcl.toFixed(2)} days`);
    
    // Identify outliers
    const outliers = data.values.filter((v, i) => v > ucl || v < lcl);
    if (outliers.length > 0) {
      console.log(`  ${chalk.red(`Outliers: ${outliers.length} tasks outside control limits`)}`);
    }
  }

  static renderMonteCarloSimulation(simulations) {
    console.log(chalk.bold.white('\n🎲 Monte Carlo Completion Forecast'));
    console.log(chalk.gray('─'.repeat(60)));
    
    // Create histogram of completion dates
    const histogram = {};
    simulations.forEach(days => {
      const bucket = Math.round(days);
      histogram[bucket] = (histogram[bucket] || 0) + 1;
    });
    
    // Convert to percentage
    const total = simulations.length;
    const percentages = Object.entries(histogram)
      .map(([days, count]) => ({
        days: parseInt(days),
        percentage: (count / total) * 100
      }))
      .sort((a, b) => a.days - b.days);
    
    // Create cumulative distribution
    let cumulative = 0;
    const cumulativeData = percentages.map(p => {
      cumulative += p.percentage;
      return cumulative;
    });
    
    const config = {
      height: 10,
      format: (x) => x.toFixed(0) + '%'
    };
    
    console.log(asciichart.plot(cumulativeData, config));
    
    // Confidence levels
    const p50 = this.findPercentile(percentages, 50);
    const p85 = this.findPercentile(percentages, 85);
    const p95 = this.findPercentile(percentages, 95);
    
    console.log('\n' + chalk.bold('Completion Confidence:'));
    console.log(`  50% confidence: ${p50} days`);
    console.log(`  85% confidence: ${p85} days`);
    console.log(`  95% confidence: ${p95} days`);
  }

  static renderLeadTimeDistribution(leadTimes) {
    console.log(chalk.bold.white('\n📊 Lead Time Distribution'));
    console.log(chalk.gray('─'.repeat(60)));
    
    // Create histogram
    const buckets = {};
    leadTimes.forEach(lt => {
      const bucket = Math.floor(lt / 5) * 5;
      buckets[bucket] = (buckets[bucket] || 0) + 1;
    });
    
    // Convert to array for plotting
    const labels = Object.keys(buckets).sort((a, b) => a - b);
    const values = labels.map(l => buckets[l]);
    
    // Create bar chart
    const maxValue = Math.max(...values);
    const barWidth = 40;
    
    labels.forEach((label, i) => {
      const value = values[i];
      const barLength = Math.floor((value / maxValue) * barWidth);
      const bar = '█'.repeat(barLength);
      const percentage = ((value / leadTimes.length) * 100).toFixed(1);
      
      console.log(
        `${label.padStart(3)}-${(parseInt(label) + 4).toString().padEnd(3)} days: ` +
        `${chalk.cyan(bar)} ${value} (${percentage}%)`
      );
    });
    
    // Statistics
    const avg = leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length;
    const sorted = leadTimes.sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    
    console.log('\n' + chalk.bold('Statistics:'));
    console.log(`  Average: ${avg.toFixed(1)} days`);
    console.log(`  Median: ${median} days`);
    console.log(`  Min: ${sorted[0]} days`);
    console.log(`  Max: ${sorted[sorted.length - 1]} days`);
  }

  static renderEfficiencyMatrix(metrics) {
    console.log(chalk.bold.white('\n⚡ Efficiency Matrix'));
    console.log(chalk.gray('─'.repeat(60)));
    
    const table = new Table({
      head: ['Metric', 'Value', 'Trend', 'Status'],
      style: {
        head: ['cyan']
      }
    });
    
    const formatTrend = (trend) => {
      if (trend > 5) return chalk.green('↑');
      if (trend < -5) return chalk.red('↓');
      return chalk.yellow('→');
    };
    
    const formatStatus = (value, target) => {
      if (value >= target) return chalk.green('✓');
      if (value >= target * 0.8) return chalk.yellow('!');
      return chalk.red('✗');
    };
    
    table.push(
      ['Flow Efficiency', `${metrics.flowEfficiency.toFixed(1)}%`, 
       formatTrend(metrics.flowTrend), formatStatus(metrics.flowEfficiency, 40)],
      ['First Time Right', `${metrics.firstTimeRight.toFixed(1)}%`, 
       formatTrend(metrics.ftrTrend), formatStatus(metrics.firstTimeRight, 90)],
      ['Deployment Frequency', `${metrics.deployFreq}/week`, 
       formatTrend(metrics.deployTrend), formatStatus(metrics.deployFreq, 5)],
      ['MTTR', `${metrics.mttr.toFixed(1)}h`, 
       formatTrend(-metrics.mttrTrend), formatStatus(48 / metrics.mttr, 1)],
      ['Change Failure Rate', `${metrics.changeFailureRate.toFixed(1)}%`, 
       formatTrend(-metrics.cfrTrend), formatStatus(100 - metrics.changeFailureRate, 95)]
    );
    
    console.log(table.toString());
  }

  static renderRiskMatrix(risks) {
    console.log(chalk.bold.white('\n⚠️  Risk Assessment Matrix'));
    console.log(chalk.gray('─'.repeat(60)));
    
    const matrix = [
      ['', 'Low Impact', 'Medium Impact', 'High Impact'],
      ['High Likelihood', '', '', ''],
      ['Medium Likelihood', '', '', ''],
      ['Low Likelihood', '', '', '']
    ];
    
    // Place risks in matrix
    risks.forEach(risk => {
      const row = risk.likelihood === 'high' ? 1 : risk.likelihood === 'medium' ? 2 : 3;
      const col = risk.impact === 'low' ? 1 : risk.impact === 'medium' ? 2 : 3;
      
      if (matrix[row][col]) {
        matrix[row][col] += ', ';
      }
      matrix[row][col] += risk.name;
    });
    
    // Color code cells
    const colorCell = (row, col, content) => {
      const severity = (4 - row) * col;
      if (severity >= 6) return chalk.red(content);
      if (severity >= 4) return chalk.yellow(content);
      return chalk.green(content);
    };
    
    const table = new Table();
    matrix.forEach((row, i) => {
      if (i === 0) {
        table.push(row.map(cell => chalk.bold(cell)));
      } else {
        table.push([
          chalk.bold(row[0]),
          ...row.slice(1).map((cell, j) => colorCell(i, j + 1, cell || '-'))
        ]);
      }
    });
    
    console.log(table.toString());
    
    // Risk summary
    const highRisks = risks.filter(r => 
      (r.likelihood === 'high' && r.impact !== 'low') || 
      (r.impact === 'high' && r.likelihood !== 'low')
    );
    
    if (highRisks.length > 0) {
      console.log('\n' + chalk.red.bold('High Priority Risks:'));
      highRisks.forEach(risk => {
        console.log(`  • ${risk.name}: ${risk.mitigation}`);
      });
    }
  }

  static renderResourceUtilization(data) {
    console.log(chalk.bold.white('\n👥 Resource Utilization'));
    console.log(chalk.gray('─'.repeat(60)));
    
    const maxWidth = 40;
    
    data.forEach(member => {
      const utilizationBar = Math.floor((member.utilization / 100) * maxWidth);
      const capacityBar = Math.floor((member.capacity / 100) * maxWidth);
      
      let bar = '';
      if (member.utilization > 100) {
        bar = chalk.red('█'.repeat(maxWidth) + '▶');
      } else if (member.utilization > 80) {
        bar = chalk.yellow('█'.repeat(utilizationBar));
      } else {
        bar = chalk.green('█'.repeat(utilizationBar));
      }
      
      console.log(`\n${member.name}:`);
      console.log(`  Utilization: ${bar} ${member.utilization}%`);
      console.log(`  Capacity:    ${chalk.gray('░'.repeat(capacityBar))} ${member.capacity}%`);
      console.log(`  Tasks:       ${member.activeTasks} active, ${member.completedThisWeek} completed this week`);
    });
    
    // Team summary
    const avgUtilization = data.reduce((sum, m) => sum + m.utilization, 0) / data.length;
    console.log('\n' + chalk.bold('Team Summary:'));
    console.log(`  Average Utilization: ${avgUtilization.toFixed(1)}%`);
    console.log(`  Overloaded Members: ${data.filter(m => m.utilization > 100).length}`);
    console.log(`  Available Capacity: ${data.filter(m => m.utilization < 80).length} members`);
  }

  static findPercentile(data, percentile) {
    let cumulative = 0;
    for (const item of data) {
      cumulative += item.percentage;
      if (cumulative >= percentile) {
        return item.days;
      }
    }
    return data[data.length - 1].days;
  }
}
```

### 9. CLI Commands for Real-Time and Advanced Charts

Update your CLI commands:

```javascript
// Add to your main CLI file

program
  .command('dashboard:live')
  .description('Launch real-time dashboard')
  .option('-f, --full', 'Use full terminal dashboard (blessed)')
  .option('-s, --simple', 'Use simple ASCII dashboard')
  .action(async (options) => {
    try {
      const wsUrl = process.env.KANBAN_WS_URL || 'ws://localhost:3000';
      
      if (options.full) {
        const dashboard = new LiveDashboard(api, wsUrl);
        await dashboard.start();
      } else {
        const dashboard = new RealtimeAsciiDashboard(api, wsUrl);
        await dashboard.start();
      }
    } catch (error) {
      console.error(chalk.red(`Failed to start dashboard: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('metrics:comprehensive')
  .description('Show comprehensive project metrics')
  .option('-b, --board <id>', 'Board ID')
  .option('-d, --days <number>', 'Days to analyze', '30')
  .action(async (options) => {
    const spinner = ora('Calculating metrics...').start();
    
    try {
      const metrics = new ProjectMetrics(api);
      const data = await metrics.getComprehensiveMetrics(
        options.board,
        parseInt(options.days)
      );
      
      spinner.stop();
      
      // Render various charts
      ProjectManagementCharts.renderControlChart({
        values: data.cycleTime.distribution,
        mean: data.cycleTime.average,
        stdDev: calculateStdDev(data.cycleTime.distribution)
      });
      
      ProjectManagementCharts.renderLeadTimeDistribution(
        data.leadTime.distribution
      );
      
      ProjectManagementCharts.renderEfficiencyMatrix({
        flowEfficiency: data.efficiency.flow,
        flowTrend: data.efficiency.flowTrend,
        firstTimeRight: data.quality.qualityScore,
        ftrTrend: data.quality.trend,
        deployFreq: data.velocity.deploymentsPerWeek,
        deployTrend: data.velocity.deployTrend,
        mttr: data.quality.mttr,
        mttrTrend: data.quality.mttrTrend,
        changeFailureRate: data.quality.defectRate,
        cfrTrend: data.quality.defectTrend
      });
      
      ProjectManagementCharts.renderResourceUtilization(data.team.utilization);
      
      ProjectManagementCharts.renderRiskMatrix(data.risk.risks);
      
    } catch (error) {
      spinner.fail(`Failed to calculate metrics: ${error.message}`);
    }
  });

program
  .command('forecast')
  .description('Run Monte Carlo simulation for completion forecast')
  .option('-b, --board <id>', 'Board ID')
  .option('-s, --simulations <number>', 'Number of simulations', '1000')
  .action(async (options) => {
    const spinner = ora('Running simulations...').start();
    
    try {
      const simulator = new MonteCarloSimulator(api);
      const results = await simulator.runCompletionForecast(
        options.board,
        parseInt(options.simulations)
      );
      
      spinner.stop();
      
      ProjectManagementCharts.renderMonteCarloSimulation(results);
      
    } catch (error) {
      spinner.fail(`Simulation failed: ${error.message}`);
    }
  });

// Auto-refresh mode for any chart
program
  .command('chart:watch <type>')
  .description('Watch a chart with auto-refresh')
  .option('-i, --interval <seconds>', 'Refresh interval', '5')
  .action(async (type, options) => {
    const interval = parseInt(options.interval) * 1000;
    
    const renderChart = async () => {
      console.clear();
      console.log(chalk.dim(`Auto-refreshing every ${options.interval} seconds. Press Ctrl+C to stop.`));
      
      try {
        switch (type) {
          case 'burndown':
            await generateBurndown(api, { height: 15 });
            break;
          case 'cfd':
            const cfdData = await api.getCFDData();
            ProjectManagementCharts.renderCumulativeFlowDiagram(cfdData);
            break;
          case 'throughput':
            const throughput = await api.getThroughputData();
            renderThroughputChart(throughput);
            break;
          default:
            console.error(`Unknown chart type: ${type}`);
            process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
    };
    
    // Initial render
    await renderChart();
    
    // Set up auto-refresh
    setInterval(renderChart, interval);
  });
```

## Installation for Real-Time Features

```bash
# Additional dependencies for real-time features
npm install blessed blessed-contrib ws cli-table3
```

## Configuration

Add to your `.env` file:

```env
# WebSocket configuration
KANBAN_WS_URL=ws://localhost:3000
WS_RECONNECT_INTERVAL=5000

# Dashboard settings
DASHBOARD_UPDATE_INTERVAL=2000
DASHBOARD_DATA_RETENTION=50
```

## Usage Examples

### Live dashboard with full terminal UI:
```bash
kanban dashboard:live --full
```

### Simple real-time ASCII dashboard:
```bash
kanban dashboard:live --simple
```

### Comprehensive metrics analysis:
```bash
kanban metrics:comprehensive --days 60
```

### Monte Carlo completion forecast:
```bash
kanban forecast --simulations 5000
```

### Watch any chart with auto-refresh:
```bash
kanban chart:watch burndown --interval 3
kanban chart:watch cfd --interval 10
kanban chart:watch throughput --interval 5
```

### 10. Task Size Estimation and Time Tracking

Create `cli/analytics/taskSizeAnalytics.js`:

```javascript
import asciichart from 'asciichart';
import chalk from 'chalk';
import Table from 'cli-table3';

export class TaskSizeAnalytics {
  constructor() {
    // Time estimates based on historical data
    this.sizeEstimates = {
      S: { 
        minutes: 1.0, 
        label: 'Small',
        description: 'Config updates, simple fixes, documentation',
        storyPoints: 1
      },
      M: { 
        minutes: 1.4, 
        label: 'Medium',
        description: 'Standard development, testing, integration',
        storyPoints: 3
      },
      L: { 
        minutes: 4.0, 
        label: 'Large',
        description: 'Complex features, major documentation',
        storyPoints: 8
      },
      XL: { 
        minutes: 8.0, 
        label: 'Extra Large',
        description: 'Architecture changes, major features',
        storyPoints: 13
      }
    };
  }

  async analyzeTaskSizes(tasks) {
    const analysis = {
      distribution: this.calculateDistribution(tasks),
      timeEstimates: this.calculateTimeEstimates(tasks),
      velocity: this.calculateVelocityBySize(tasks),
      accuracy: await this.calculateEstimationAccuracy(tasks),
      trends: this.analyzeSizeTrends(tasks)
    };

    return analysis;
  }

  calculateDistribution(tasks) {
    const distribution = { S: 0, M: 0, L: 0, XL: 0 };
    const total = tasks.length;

    tasks.forEach(task => {
      const size = task.size || 'M';
      distribution[size]++;
    });

    // Calculate percentages
    const percentages = {};
    Object.entries(distribution).forEach(([size, count]) => {
      percentages[size] = {
        count,
        percentage: ((count / total) * 100).toFixed(1)
      };
    });

    return { raw: distribution, percentages, total };
  }

  calculateTimeEstimates(tasks) {
    const estimates = {};
    let totalMinutes = 0;

    Object.entries(this.sizeEstimates).forEach(([size, config]) => {
      const tasksOfSize = tasks.filter(t => (t.size || 'M') === size);
      const count = tasksOfSize.length;
      const timeMinutes = count * config.minutes;
      
      estimates[size] = {
        count,
        timePerTask: config.minutes,
        totalMinutes: timeMinutes,
        totalHours: (timeMinutes / 60).toFixed(1),
        description: config.description,
        tasks: tasksOfSize
      };

      totalMinutes += timeMinutes;
    });

    return {
      bySize: estimates,
      total: {
        minutes: totalMinutes,
        hours: (totalMinutes / 60).toFixed(1),
        days: (totalMinutes / 60 / 8).toFixed(1),
        weeks: (totalMinutes / 60 / 8 / 5).toFixed(1)
      }
    };
  }

  calculateVelocityBySize(tasks) {
    const completedTasks = tasks.filter(t => t.status === 'done');
    const velocityBySize = {};

    Object.keys(this.sizeEstimates).forEach(size => {
      const completed = completedTasks.filter(t => (t.size || 'M') === size);
      const avgCompletionTime = this.getAverageCompletionTime(completed);
      
      velocityBySize[size] = {
        completed: completed.length,
        avgCompletionTime,
        estimatedTime: this.sizeEstimates[size].minutes,
        accuracy: avgCompletionTime ? 
          ((this.sizeEstimates[size].minutes / avgCompletionTime) * 100).toFixed(1) : 
          'N/A'
      };
    });

    return velocityBySize;
  }

  async calculateEstimationAccuracy(tasks) {
    const completedTasks = tasks.filter(t => t.status === 'done' && t.actualTime);
    const accuracyBySize = {};

    Object.keys(this.sizeEstimates).forEach(size => {
      const tasksOfSize = completedTasks.filter(t => (t.size || 'M') === size);
      
      if (tasksOfSize.length > 0) {
        const deviations = tasksOfSize.map(task => {
          const estimated = this.sizeEstimates[size].minutes;
          const actual = task.actualTime;
          return ((actual - estimated) / estimated) * 100;
        });

        accuracyBySize[size] = {
          count: tasksOfSize.length,
          avgDeviation: (deviations.reduce((a, b) => a + b, 0) / deviations.length).toFixed(1),
          maxDeviation: Math.max(...deviations).toFixed(1),
          minDeviation: Math.min(...deviations).toFixed(1),
          within20Percent: deviations.filter(d => Math.abs(d) <= 20).length
        };
      }
    });

    return accuracyBySize;
  }

  analyzeSizeTrends(tasks) {
    // Group tasks by week
    const weeklyData = {};
    
    tasks.forEach(task => {
      const week = this.getWeekNumber(new Date(task.createdAt));
      if (!weeklyData[week]) {
        weeklyData[week] = { S: 0, M: 0, L: 0, XL: 0 };
      }
      weeklyData[week][task.size || 'M']++;
    });

    return weeklyData;
  }

  renderSizeDistributionChart(analysis) {
    console.log(chalk.bold.white('\n📊 Task Size Distribution'));
    console.log(chalk.gray('═'.repeat(60)));

    // Time estimates summary
    console.log(chalk.bold('\n⏱️  Time Estimates by Task Size:'));
    
    Object.entries(analysis.timeEstimates.bySize).forEach(([size, data]) => {
      if (data.count > 0) {
        const sizeInfo = this.sizeEstimates[size];
        console.log(chalk.bold(`\n${sizeInfo.label} Tasks (${size}): ${data.count} tasks`));
        console.log(`  ${chalk.yellow('●')} Estimated time: ${data.count} × ${data.timePerTask} min = ${chalk.bold(data.totalHours + ' hours')}`);
        console.log(`  ${chalk.dim('*' + data.description + '*')}`);
      }
    });

    // Visual bar chart
    console.log(chalk.bold('\n\nDistribution Chart:'));
    const maxCount = Math.max(...Object.values(analysis.distribution.raw));
    const barWidth = 40;

    Object.entries(analysis.distribution.percentages).forEach(([size, data]) => {
      const barLength = Math.floor((data.count / maxCount) * barWidth);
      const bar = '█'.repeat(barLength);
      const sizeLabel = `${size} (${this.sizeEstimates[size].label})`.padEnd(15);
      
      console.log(
        `${sizeLabel} ${chalk.cyan(bar)} ${data.count} tasks (${data.percentage}%)`
      );
    });

    // Total estimates
    console.log(chalk.gray('\n' + '─'.repeat(60)));
    console.log(chalk.bold('Total Time Estimates:'));
    console.log(`  Total Tasks: ${analysis.distribution.total}`);
    console.log(`  Total Time: ${chalk.bold.green(analysis.timeEstimates.total.hours + ' hours')}`);
    console.log(`  Working Days: ${analysis.timeEstimates.total.days} days`);
    console.log(`  Calendar Weeks: ${analysis.timeEstimates.total.weeks} weeks`);
  }

  renderVelocityBySize(velocity) {
    console.log(chalk.bold.white('\n⚡ Velocity Analysis by Task Size'));
    console.log(chalk.gray('═'.repeat(60)));

    const table = new Table({
      head: ['Size', 'Completed', 'Estimated (min)', 'Actual Avg (min)', 'Accuracy'],
      style: { head: ['cyan'] }
    });

    Object.entries(velocity).forEach(([size, data]) => {
      table.push([
        `${size} (${this.sizeEstimates[size].label})`,
        data.completed,
        this.sizeEstimates[size].minutes.toFixed(1),
        data.avgCompletionTime ? data.avgCompletionTime.toFixed(1) : 'N/A',
        data.accuracy !== 'N/A' ? 
          (parseFloat(data.accuracy) > 80 ? chalk.green(data.accuracy + '%') : chalk.yellow(data.accuracy + '%')) : 
          'N/A'
      ]);
    });

    console.log(table.toString());
  }

  renderEstimationAccuracyChart(accuracy) {
    console.log(chalk.bold.white('\n📈 Estimation Accuracy by Size'));
    console.log(chalk.gray('═'.repeat(60)));

    Object.entries(accuracy).forEach(([size, data]) => {
      if (data.count > 0) {
        console.log(chalk.bold(`\n${size} Tasks (${data.count} completed):`));
        
        // Deviation visualization
        const deviationBar = this.createDeviationBar(parseFloat(data.avgDeviation));
        console.log(`  Average Deviation: ${deviationBar} ${data.avgDeviation}%`);
        console.log(`  Range: ${data.minDeviation}% to ${data.maxDeviation}%`);
        console.log(`  Within ±20%: ${chalk.green(data.within20Percent + '/' + data.count)} tasks`);
      }
    });
  }

  renderSizeTrendChart(trends) {
    console.log(chalk.bold.white('\n📈 Task Size Trends Over Time'));
    console.log(chalk.gray('═'.repeat(60)));

    const weeks = Object.keys(trends).sort();
    const sizes = ['S', 'M', 'L', 'XL'];
    
    // Prepare data for each size
    const series = sizes.map(size => 
      weeks.map(week => trends[week][size] || 0)
    );

    const config = {
      height: 10,
      colors: [
        asciichart.blue,    // S
        asciichart.green,   // M
        asciichart.yellow,  // L
        asciichart.red      // XL
      ],
      format: (x) => x.toFixed(0).padStart(3)
    };

    console.log(asciichart.plot(series, config));

    // Legend
    console.log('\n' + chalk.bold('Task Sizes:'));
    sizes.forEach((size, i) => {
      const colors = [chalk.blue, chalk.green, chalk.yellow, chalk.red];
      console.log(`  ${colors[i]('━━━')} ${size} - ${this.sizeEstimates[size].label}`);
    });
  }

  renderTimeTrackingDashboard(tasks) {
    console.log(chalk.bold.cyan('\n⏰ Time Tracking Dashboard'));
    console.log(chalk.gray('═'.repeat(80)));

    const analysis = {
      distribution: this.calculateDistribution(tasks),
      timeEstimates: this.calculateTimeEstimates(tasks),
      velocity: this.calculateVelocityBySize(tasks)
    };

    // Render comprehensive view
    this.renderSizeDistributionChart(analysis);
    this.renderVelocityBySize(analysis.velocity);
    
    // Add sprint planning suggestions
    this.renderSprintPlanningSuggestions(analysis);
  }

  renderSprintPlanningSuggestions(analysis) {
    console.log(chalk.bold.white('\n🎯 Sprint Planning Suggestions'));
    console.log(chalk.gray('═'.repeat(60)));

    const sprintDays = 10; // 2-week sprint
    const hoursPerDay = 6; // Accounting for meetings, breaks, etc.
    const teamSize = 4; // Example team size
    const totalCapacity = sprintDays * hoursPerDay * teamSize;

    console.log(`\nTeam Capacity (${teamSize} developers, ${sprintDays} days):`);
    console.log(`  Available Hours: ${totalCapacity} hours`);
    console.log(`  Current Backlog: ${analysis.timeEstimates.total.hours} hours`);

    const utilizationPercent = (parseFloat(analysis.timeEstimates.total.hours) / totalCapacity * 100).toFixed(1);
    
    if (utilizationPercent > 100) {
      console.log(`  ${chalk.red('⚠️  Overcommitted:')} ${utilizationPercent}% of capacity`);
      console.log(`  ${chalk.yellow('Recommendation:')} Reduce scope or extend timeline`);
    } else if (utilizationPercent > 80) {
      console.log(`  ${chalk.yellow('⚠️  High Load:')} ${utilizationPercent}% of capacity`);
      console.log(`  ${chalk.yellow('Recommendation:')} Good utilization, monitor closely`);
    } else {
      console.log(`  ${chalk.green('✓ Healthy Load:')} ${utilizationPercent}% of capacity`);
      console.log(`  ${chalk.green('Recommendation:')} Room for additional tasks`);
    }

    // Suggest task mix
    console.log('\nRecommended Sprint Composition:');
    const idealMix = {
      S: 0.3,  // 30% small tasks
      M: 0.5,  // 50% medium tasks
      L: 0.15, // 15% large tasks
      XL: 0.05 // 5% extra large tasks
    };

    Object.entries(idealMix).forEach(([size, idealPercent]) => {
      const currentPercent = parseFloat(analysis.distribution.percentages[size].percentage) / 100;
      const deviation = ((currentPercent - idealPercent) * 100).toFixed(1);
      
      let status = '';
      if (Math.abs(deviation) < 10) {
        status = chalk.green('✓ Good');
      } else if (currentPercent > idealPercent) {
        status = chalk.yellow('↑ High');
      } else {
        status = chalk.yellow('↓ Low');
      }

      console.log(`  ${size}: ${(idealPercent * 100).toFixed(0)}% ideal, ${analysis.distribution.percentages[size].percentage}% actual ${status}`);
    });
  }

  createDeviationBar(deviation) {
    const maxWidth = 20;
    const center = maxWidth / 2;
    const deviationWidth = Math.min(Math.abs(deviation) / 100 * center, center);
    
    let bar = '';
    if (deviation < 0) {
      // Underestimated (took less time)
      bar = ' '.repeat(center - deviationWidth) + chalk.green('█'.repeat(deviationWidth)) + '|' + ' '.repeat(center);
    } else {
      // Overestimated (took more time)
      bar = ' '.repeat(center) + '|' + chalk.red('█'.repeat(deviationWidth));
    }
    
    return bar;
  }

  getAverageCompletionTime(tasks) {
    const withTime = tasks.filter(t => t.actualTime);
    if (withTime.length === 0) return null;
    
    const total = withTime.reduce((sum, t) => sum + t.actualTime, 0);
    return total / withTime.length;
  }

  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo}`;
  }
}

// Integration with CLI commands
export function createSizeAnalyticsCommand(api) {
  return async (options) => {
    const spinner = ora('Analyzing task sizes...').start();
    
    try {
      const tasks = await api.getTasks(options.board);
      const analytics = new TaskSizeAnalytics();
      
      spinner.stop();
      
      if (options.dashboard) {
        analytics.renderTimeTrackingDashboard(tasks);
      } else {
        const analysis = await analytics.analyzeTaskSizes(tasks);
        
        switch (options.view) {
          case 'distribution':
            analytics.renderSizeDistributionChart(analysis);
            break;
          case 'velocity':
            analytics.renderVelocityBySize(analysis.velocity);
            break;
          case 'accuracy':
            analytics.renderEstimationAccuracyChart(analysis.accuracy);
            break;
          case 'trends':
            analytics.renderSizeTrendChart(analysis.trends);
            break;
          default:
            // Show all views
            analytics.renderSizeDistributionChart(analysis);
            analytics.renderVelocityBySize(analysis.velocity);
            analytics.renderEstimationAccuracyChart(analysis.accuracy);
            analytics.renderSizeTrendChart(analysis.trends);
        }
      }
    } catch (error) {
      spinner.fail(`Failed to analyze task sizes: ${error.message}`);
    }
  };
}
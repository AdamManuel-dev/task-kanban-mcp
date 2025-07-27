/**
 * Dashboard theme configurations for blessed-contrib
 */

export interface DashboardTheme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    background: string;
    foreground: string;
    border: string;
    accent: string;
  };
  widgets: {
    donut: {
      remainColor: string;
      colors: string[];
    };
    bar: {
      barColor: string;
      textColor: string;
    };
    line: {
      lineColor: string;
      textColor: string;
      baseline: string;
    };
    table: {
      fg: string;
      selectedFg: string;
      selectedBg: string;
      border: string;
    };
    log: {
      fg: string;
      selectedFg: string;
    };
    gauge: {
      stroke: string;
      fill: string;
    };
    sparkline: {
      fg: string;
    };
    box: {
      fg: string;
      bg: string;
      border: string;
    };
  };
}

/**
 * Dark theme (default)
 */
export const darkTheme: DashboardTheme = {
  name: 'dark',
  colors: {
    primary: 'cyan',
    secondary: 'blue',
    success: 'green',
    warning: 'yellow',
    error: 'red',
    info: 'magenta',
    background: 'black',
    foreground: 'white',
    border: 'cyan',
    accent: 'yellow',
  },
  widgets: {
    donut: {
      remainColor: 'black',
      colors: ['green', 'yellow', 'red', 'blue', 'magenta', 'cyan'],
    },
    bar: {
      barColor: 'cyan',
      textColor: 'white',
    },
    line: {
      lineColor: 'yellow',
      textColor: 'green',
      baseline: 'black',
    },
    table: {
      fg: 'white',
      selectedFg: 'white',
      selectedBg: 'blue',
      border: 'cyan',
    },
    log: {
      fg: 'green',
      selectedFg: 'green',
    },
    gauge: {
      stroke: 'green',
      fill: 'white',
    },
    sparkline: {
      fg: 'blue',
    },
    box: {
      fg: 'white',
      bg: 'black',
      border: 'cyan',
    },
  },
};

/**
 * Light theme
 */
export const lightTheme: DashboardTheme = {
  name: 'light',
  colors: {
    primary: 'blue',
    secondary: 'gray',
    success: 'green',
    warning: 'orange',
    error: 'red',
    info: 'purple',
    background: 'white',
    foreground: 'black',
    border: 'gray',
    accent: 'blue',
  },
  widgets: {
    donut: {
      remainColor: 'white',
      colors: ['green', 'orange', 'red', 'blue', 'purple', 'gray'],
    },
    bar: {
      barColor: 'blue',
      textColor: 'black',
    },
    line: {
      lineColor: 'blue',
      textColor: 'black',
      baseline: 'gray',
    },
    table: {
      fg: 'black',
      selectedFg: 'white',
      selectedBg: 'blue',
      border: 'gray',
    },
    log: {
      fg: 'black',
      selectedFg: 'black',
    },
    gauge: {
      stroke: 'blue',
      fill: 'black',
    },
    sparkline: {
      fg: 'blue',
    },
    box: {
      fg: 'black',
      bg: 'white',
      border: 'gray',
    },
  },
};

/**
 * High contrast theme for accessibility
 */
export const highContrastTheme: DashboardTheme = {
  name: 'high-contrast',
  colors: {
    primary: 'white',
    secondary: 'yellow',
    success: 'green',
    warning: 'yellow',
    error: 'red',
    info: 'cyan',
    background: 'black',
    foreground: 'white',
    border: 'white',
    accent: 'yellow',
  },
  widgets: {
    donut: {
      remainColor: 'black',
      colors: ['white', 'yellow', 'red', 'green', 'cyan', 'magenta'],
    },
    bar: {
      barColor: 'white',
      textColor: 'white',
    },
    line: {
      lineColor: 'white',
      textColor: 'white',
      baseline: 'black',
    },
    table: {
      fg: 'white',
      selectedFg: 'black',
      selectedBg: 'white',
      border: 'white',
    },
    log: {
      fg: 'white',
      selectedFg: 'white',
    },
    gauge: {
      stroke: 'white',
      fill: 'white',
    },
    sparkline: {
      fg: 'white',
    },
    box: {
      fg: 'white',
      bg: 'black',
      border: 'white',
    },
  },
};

/**
 * Solarized dark theme
 */
export const solarizedDarkTheme: DashboardTheme = {
  name: 'solarized-dark',
  colors: {
    primary: 'cyan',
    secondary: 'blue',
    success: 'green',
    warning: 'yellow',
    error: 'red',
    info: 'magenta',
    background: 'black',
    foreground: 'gray',
    border: 'cyan',
    accent: 'blue',
  },
  widgets: {
    donut: {
      remainColor: 'black',
      colors: ['cyan', 'green', 'yellow', 'blue', 'magenta', 'red'],
    },
    bar: {
      barColor: 'cyan',
      textColor: 'gray',
    },
    line: {
      lineColor: 'cyan',
      textColor: 'gray',
      baseline: 'black',
    },
    table: {
      fg: 'gray',
      selectedFg: 'white',
      selectedBg: 'blue',
      border: 'cyan',
    },
    log: {
      fg: 'cyan',
      selectedFg: 'cyan',
    },
    gauge: {
      stroke: 'cyan',
      fill: 'gray',
    },
    sparkline: {
      fg: 'cyan',
    },
    box: {
      fg: 'gray',
      bg: 'black',
      border: 'cyan',
    },
  },
};

/**
 * Available themes registry
 */
export const themes: Record<string, DashboardTheme> = {
  dark: darkTheme,
  light: lightTheme,
  'high-contrast': highContrastTheme,
  'solarized-dark': solarizedDarkTheme,
};

/**
 * Get theme by name with fallback to dark theme
 */
export function getTheme(name: string): DashboardTheme {
  return themes[name] ?? darkTheme;
}

/**
 * Get all available theme names
 */
export function getThemeNames(): string[] {
  return Object.keys(themes);
}

/**
 * Theme helper functions
 */
export class ThemeHelper {
  private readonly theme: DashboardTheme;

  constructor(themeName: string = 'dark') {
    this.theme = getTheme(themeName);
  }

  /**
   * Update theme
   */
  setTheme(themeName: string): void {
    this.theme = getTheme(themeName);
  }

  /**
   * Get current theme
   */
  getTheme(): DashboardTheme {
    return this.theme;
  }

  /**
   * Get color by name
   */
  getColor(colorName: keyof DashboardTheme['colors']): string {
    return this.theme.colors[colorName];
  }

  /**
   * Get widget styles for donut charts
   */
  getDonutStyles() {
    return {
      remainColor: this.theme.widgets.donut.remainColor,
      colors: this.theme.widgets.donut.colors,
    };
  }

  /**
   * Get widget styles for bar charts
   */
  getBarStyles() {
    return {
      barColor: this.theme.widgets.bar.barColor,
      textColor: this.theme.widgets.bar.textColor,
    };
  }

  /**
   * Get widget styles for line charts
   */
  getLineStyles() {
    return {
      style: {
        line: this.theme.widgets.line.lineColor,
        text: this.theme.widgets.line.textColor,
        baseline: this.theme.widgets.line.baseline,
      },
    };
  }

  /**
   * Get widget styles for tables
   */
  getTableStyles() {
    return {
      fg: this.theme.widgets.table.fg,
      selectedFg: this.theme.widgets.table.selectedFg,
      selectedBg: this.theme.widgets.table.selectedBg,
      border: { type: 'line', fg: this.theme.widgets.table.border },
    };
  }

  /**
   * Get widget styles for log widgets
   */
  getLogStyles() {
    return {
      fg: this.theme.widgets.log.fg,
      selectedFg: this.theme.widgets.log.selectedFg,
    };
  }

  /**
   * Get widget styles for gauge widgets
   */
  getGaugeStyles() {
    return {
      stroke: this.theme.widgets.gauge.stroke,
      fill: this.theme.widgets.gauge.fill,
    };
  }

  /**
   * Get widget styles for sparkline widgets
   */
  getSparklineStyles() {
    return {
      style: { fg: this.theme.widgets.sparkline.fg },
    };
  }

  /**
   * Get widget styles for box widgets
   */
  getBoxStyles() {
    return {
      style: {
        fg: this.theme.widgets.box.fg,
        bg: this.theme.widgets.box.bg,
      },
      border: { type: 'line', fg: this.theme.widgets.box.border },
    };
  }

  /**
   * Get header styles
   */
  getHeaderStyles() {
    return {
      border: { type: 'line', fg: this.theme.colors.border },
      style: {
        fg: this.theme.colors.foreground,
        bg: this.theme.colors.secondary,
      },
    };
  }

  /**
   * Get footer styles
   */
  getFooterStyles() {
    return {
      border: { type: 'line', fg: this.theme.colors.border },
      style: { fg: this.theme.colors.foreground },
    };
  }
}

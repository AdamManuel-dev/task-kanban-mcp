import chalk from 'chalk';

export interface Theme {
  name: string;
  colors: {
    primary: (text: string) => string;
    secondary: (text: string) => string;
    success: (text: string) => string;
    error: (text: string) => string;
    warning: (text: string) => string;
    info: (text: string) => string;
    muted: (text: string) => string;
    highlight: (text: string) => string;
    accent: (text: string) => string;
  };
  status: {
    todo: { icon: string; color: (text: string) => string };
    in_progress: { icon: string; color: (text: string) => string };
    done: { icon: string; color: (text: string) => string };
    blocked: { icon: string; color: (text: string) => string };
  };
  priority: {
    P1: (text: string) => string;
    P2: (text: string) => string;
    P3: (text: string) => string;
    P4: (text: string) => string;
    P5: (text: string) => string;
  };
  borders: {
    light: string;
    heavy: string;
    double: string;
  };
  icons: {
    task: string;
    board: string;
    user: string;
    tag: string;
    calendar: string;
    clock: string;
    arrow: string;
    check: string;
    cross: string;
    warning: string;
    info: string;
  };
}

export const defaultTheme: Theme = {
  name: 'default',
  colors: {
    primary: chalk.cyan,
    secondary: chalk.blue,
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.blue,
    muted: chalk.gray,
    highlight: chalk.bgBlue.white,
    accent: chalk.magenta,
  },
  status: {
    todo: { icon: '○', color: chalk.gray },
    in_progress: { icon: '◐', color: chalk.yellow },
    done: { icon: '●', color: chalk.green },
    blocked: { icon: '✕', color: chalk.red },
  },
  priority: {
    P1: chalk.red,
    P2: chalk.yellow,
    P3: chalk.blue,
    P4: chalk.green,
    P5: chalk.gray,
  },
  borders: {
    light: '─',
    heavy: '━',
    double: '═',
  },
  icons: {
    task: '📋',
    board: '🏗️',
    user: '👤',
    tag: '🏷️',
    calendar: '📅',
    clock: '⏰',
    arrow: '→',
    check: '✅',
    cross: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  },
};

export const darkTheme: Theme = {
  ...defaultTheme,
  name: 'dark',
  colors: {
    ...defaultTheme.colors,
    primary: chalk.cyanBright,
    secondary: chalk.blueBright,
    highlight: chalk.bgGray.white,
  },
};

export const lightTheme: Theme = {
  ...defaultTheme,
  name: 'light',
  colors: {
    ...defaultTheme.colors,
    primary: chalk.blue,
    secondary: chalk.cyan,
    muted: chalk.blackBright,
    highlight: chalk.bgWhite.black,
  },
};

export const highContrastTheme: Theme = {
  ...defaultTheme,
  name: 'high-contrast',
  colors: {
    primary: chalk.white,
    secondary: chalk.white,
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.white,
    muted: chalk.gray,
    highlight: chalk.bgWhite.black,
    accent: chalk.white,
  },
  status: {
    todo: { icon: '[ ]', color: chalk.white },
    in_progress: { icon: '[~]', color: chalk.yellow },
    done: { icon: '[X]', color: chalk.green },
    blocked: { icon: '[!]', color: chalk.red },
  },
};

// Theme registry
export const themes = {
  default: defaultTheme,
  dark: darkTheme,
  light: lightTheme,
  'high-contrast': highContrastTheme,
};

export type ThemeName = keyof typeof themes;

// Theme utilities
export class ThemeManager {
  private currentTheme: Theme = defaultTheme;

  setTheme(name: ThemeName): void {
    this.currentTheme = themes[name];
  }

  getTheme(): Theme {
    return this.currentTheme;
  }

  formatStatus(status: string, text?: string): string {
    const statusConfig = this.currentTheme.status[status as keyof typeof this.currentTheme.status];
    if (!statusConfig) return text || status;

    const { icon } = statusConfig;
    const coloredIcon = statusConfig.color(icon);

    return text
      ? `${String(coloredIcon)} ${String(String(statusConfig.color(text)))}`
      : coloredIcon;
  }

  formatPriority(priority: string, text?: string): string {
    const colorFn = this.currentTheme.priority[priority as keyof typeof this.currentTheme.priority];
    if (!colorFn) return text || priority;

    return colorFn(text || priority);
  }

  formatBorder(type: 'light' | 'heavy' | 'double', length: number): string {
    const char = this.currentTheme.borders[type];
    return char.repeat(length);
  }

  getIcon(name: keyof Theme['icons']): string {
    return this.currentTheme.icons[name];
  }

  applyColor(colorName: keyof Theme['colors'], text: string): string {
    return this.currentTheme.colors[colorName](text);
  }
}

// Export singleton instance
export const themeManager = new ThemeManager();

import chalk from 'chalk';

export interface KeyboardShortcut {
  key: string;
  description: string;
  action: () => Promise<void> | void;
  global?: boolean;
}

/**
 * Global keyboard shortcut handler for CLI applications
 */
export class KeyboardHandler {
  private readonly shortcuts: Map<string, KeyboardShortcut> = new Map();

  private isActive = false;

  private helpVisible = false;

  private refreshCallback?: () => Promise<void> | void;

  constructor() {
    this.setupDefaultShortcuts();
  }

  /**
   * Register a new keyboard shortcut
   */
  register(shortcut: KeyboardShortcut): void {
    this.shortcuts.set(shortcut.key, shortcut);
  }

  /**
   * Remove a keyboard shortcut
   */
  unregister(key: string): void {
    this.shortcuts.delete(key);
  }

  /**
   * Activate global keyboard listening
   */
  activate(): void {
    if (this.isActive) return;

    this.isActive = true;

    // Set up raw mode for real-time key capture
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', this.handleKeyPress.bind(this));
    }
  }

  /**
   * Deactivate global keyboard listening
   */
  deactivate(): void {
    if (!this.isActive) return;

    this.isActive = false;

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeAllListeners('data');
    }
  }

  /**
   * Handle key press events
   */
  private async handleKeyPress(key: string): Promise<void> {
    const keyCode = key.charCodeAt(0);

    // Handle Ctrl+C (exit)
    if (keyCode === 3) {
      console.log(chalk.yellow('\n⚠️  Interrupted by user'));
      process.exit(130);
    }

    // Handle specific key combinations
    const shortcut = this.shortcuts.get(key);
    if (shortcut) {
      try {
        await shortcut.action();
      } catch (error) {
        console.error(chalk.red(`Error executing shortcut ${key}:`), error);
      }
    }
  }

  /**
   * Show help overlay with all available shortcuts
   */
  showHelp(): void {
    if (this.helpVisible) {
      this.hideHelp();
      return;
    }

    this.helpVisible = true;
    console.clear();

    console.log(chalk.cyan.bold('\n📋 Keyboard Shortcuts\n'));
    console.log(chalk.gray('─'.repeat(50)));

    const globalShortcuts = Array.from(this.shortcuts.values())
      .filter(s => s.global)
      .sort((a, b) => a.key.localeCompare(b.key));

    const localShortcuts = Array.from(this.shortcuts.values())
      .filter(s => !s.global)
      .sort((a, b) => a.key.localeCompare(b.key));

    if (globalShortcuts.length > 0) {
      console.log(chalk.yellow.bold('\nGlobal Shortcuts:'));
      globalShortcuts.forEach(shortcut => {
        const keyDisplay = this.formatKeyDisplay(shortcut.key);
        console.log(`  ${keyDisplay} - ${shortcut.description}`);
      });
    }

    if (localShortcuts.length > 0) {
      console.log(chalk.yellow.bold('\nContext Shortcuts:'));
      localShortcuts.forEach(shortcut => {
        const keyDisplay = this.formatKeyDisplay(shortcut.key);
        console.log(`  ${keyDisplay} - ${shortcut.description}`);
      });
    }

    console.log(chalk.gray('\n─'.repeat(50)));
    console.log(chalk.gray('Press ? again to hide help, Ctrl+C to exit\n'));
  }

  /**
   * Hide help overlay
   */
  hideHelp(): void {
    if (!this.helpVisible) return;

    this.helpVisible = false;
    console.clear();
    console.log(chalk.gray('Help hidden. Press ? to show again.\n'));
  }

  /**
   * Format key display for help
   */
  private formatKeyDisplay(key: string): string {
    const keyCode = key.charCodeAt(0);

    if (keyCode === 3) return chalk.cyan('Ctrl+C');
    if (keyCode === 18) return chalk.cyan('Ctrl+R');
    if (keyCode === 6) return chalk.cyan('Ctrl+F');
    if (keyCode === 14) return chalk.cyan('Ctrl+N');
    if (key === '?') return chalk.cyan('?');
    if (key === 'q') return chalk.cyan('q');
    if (key === 'r') return chalk.cyan('r');
    if (key === '/') return chalk.cyan('/');

    return chalk.cyan(key);
  }

  /**
   * Set up default global shortcuts
   */
  private setupDefaultShortcuts(): void {
    // Help shortcut
    this.register({
      key: '?',
      description: 'Show/hide keyboard shortcuts help',
      action: () => this.showHelp(),
      global: true,
    });

    // Refresh shortcut (Ctrl+R)
    this.register({
      key: String.fromCharCode(18), // Ctrl+R
      description: 'Refresh current view',
      action: async () => {
        await this.executeRefresh();
      },
      global: true,
    });

    // Search shortcut (Ctrl+F or /)
    this.register({
      key: '/',
      description: 'Search/filter',
      action: async () => {
        console.log(chalk.cyan('🔍 Search mode (not implemented)'));
      },
      global: true,
    });

    // New item shortcut (Ctrl+N)
    this.register({
      key: String.fromCharCode(14), // Ctrl+N
      description: 'Create new item',
      action: async () => {
        console.log(chalk.cyan('📝 Create new item (not implemented)'));
      },
      global: true,
    });

    // Quit shortcut
    this.register({
      key: 'q',
      description: 'Quit application',
      action: () => {
        console.log(chalk.yellow('👋 Goodbye!'));
        process.exit(0);
      },
      global: true,
    });
  }

  /**
   * Get all registered shortcuts
   */
  getShortcuts(): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Check if handler is currently active
   */
  isActivated(): boolean {
    return this.isActive;
  }

  /**
   * Set refresh callback for Ctrl+R functionality
   */
  setRefreshCallback(callback: () => Promise<void> | void): void {
    this.refreshCallback = callback;
  }

  /**
   * Execute refresh action
   */
  private async executeRefresh(): Promise<void> {
    if (this.refreshCallback) {
      try {
        console.log(chalk.cyan('🔄 Refreshing...'));
        await this.refreshCallback();
        console.log(chalk.green('✅ Refreshed'));
      } catch (error) {
        console.error(
          chalk.red('❌ Refresh failed:'),
          error instanceof Error ? error.message : String(error)
        );
      }
    } else {
      console.log(chalk.yellow('⚠️  No refresh action available in current context'));
    }
  }

  /**
   * Create a scoped keyboard handler for specific contexts
   */
  createScope(contextName: string): ScopedKeyboardHandler {
    return new ScopedKeyboardHandler(this, contextName);
  }
}

/**
 * Scoped keyboard handler for specific UI contexts
 */
export class ScopedKeyboardHandler {
  private readonly parent: KeyboardHandler;

  // private readonly contextName: string;

  private readonly scopedShortcuts: Map<string, KeyboardShortcut> = new Map();

  constructor(parent: KeyboardHandler, contextName: string) {
    this.parent = parent;
    // this.contextName = contextName;
  }

  /**
   * Register a context-specific shortcut
   */
  register(shortcut: Omit<KeyboardShortcut, 'global'>): void {
    const scopedShortcut: KeyboardShortcut = {
      ...shortcut,
      global: false,
    };

    this.scopedShortcuts.set(shortcut.key, scopedShortcut);
    this.parent.register(scopedShortcut);
  }

  /**
   * Activate this scope (removes other scope shortcuts)
   */
  activate(): void {
    // Clean up previous scope shortcuts
    this.parent
      .getShortcuts()
      .filter(s => !s.global)
      .forEach(s => this.parent.unregister(s.key));

    // Add this scope's shortcuts
    this.scopedShortcuts.forEach(shortcut => {
      this.parent.register(shortcut);
    });
  }

  /**
   * Deactivate this scope
   */
  deactivate(): void {
    this.scopedShortcuts.forEach((_, key) => {
      this.parent.unregister(key);
    });
  }
}

// Export singleton instance
export const keyboardHandler = new KeyboardHandler();

// Cleanup on process exit
process.on('exit', () => {
  keyboardHandler.deactivate();
});

process.on('SIGINT', () => {
  keyboardHandler.deactivate();
  process.exit(130);
});

process.on('SIGTERM', () => {
  keyboardHandler.deactivate();
  process.exit(143);
});

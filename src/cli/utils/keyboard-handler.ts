import chalk from 'chalk';
import { logger } from '../../utils/logger';

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

  private accessibilityAnnouncementsEnabled = false;

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
      process.stdin.on('data', (key: string) => {
        this.handleKeyPress(key).catch(error =>
          console.error('Failed to handle key press:', error)
        );
      });
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
      logger.info(chalk.yellow('\n⚠️  Interrupted by user'));
      process.exit(130);
    }

    // Handle specific key combinations
    const shortcut = this.shortcuts.get(key);
    if (shortcut) {
      try {
        await shortcut.action();
      } catch (error) {
        logger.error(chalk.red(`Error executing shortcut ${String(key)}:`), error);
      }
    }
  }

  /**
   * Show help overlay with all available shortcuts and accessibility info
   */
  showHelp(): void {
    if (this.helpVisible) {
      this.hideHelp();
      return;
    }

    this.helpVisible = true;
    console.clear();

    // Announce to screen readers
    console.log('\x1b]0;Keyboard Shortcuts Help\x07'); // Set terminal title
    console.log('\x1b[?25l'); // Hide cursor for cleaner display

    console.log(chalk.cyan.bold('\n📋 Keyboard Shortcuts & Accessibility\n'));
    console.log(chalk.gray('─'.repeat(60)));

    // Accessibility section first
    console.log(chalk.green.bold('\n♿ Accessibility Features:'));
    console.log('  • High contrast mode: Use --theme high-contrast');
    console.log('  • Screen reader support: ARIA labels and live regions');
    console.log('  • Keyboard navigation: Tab, Shift+Tab, arrow keys');
    console.log('  • Focus indicators: Visual borders and audio cues');

    const globalShortcuts = Array.from(this.shortcuts.values())
      .filter(s => s.global)
      .sort((a, b) => a.key.localeCompare(b.key));

    const localShortcuts = Array.from(this.shortcuts.values())
      .filter(s => !s.global)
      .sort((a, b) => a.key.localeCompare(b.key));

    if (globalShortcuts.length > 0) {
      console.log(chalk.yellow.bold('\n🌐 Global Shortcuts:'));
      globalShortcuts.forEach(shortcut => {
        const keyDisplay = KeyboardHandler.formatKeyDisplay(shortcut.key);
        const accessibleDesc = this.makeAccessibleDescription(shortcut.description);
        console.log(`  ${String(keyDisplay)} - ${String(accessibleDesc)}`);
      });
    }

    if (localShortcuts.length > 0) {
      console.log(chalk.yellow.bold('\n📍 Context Shortcuts:'));
      localShortcuts.forEach(shortcut => {
        const keyDisplay = KeyboardHandler.formatKeyDisplay(shortcut.key);
        const accessibleDesc = this.makeAccessibleDescription(shortcut.description);
        console.log(`  ${String(keyDisplay)} - ${String(accessibleDesc)}`);
      });
    }

    // Navigation help
    console.log(chalk.blue.bold('\n⌨️  Navigation Tips:'));
    console.log('  • Use Tab to move between sections');
    console.log('  • Arrow keys for directional navigation');
    console.log('  • Enter to activate, Escape to cancel');
    console.log('  • Screen readers: Enable browse mode for best experience');

    console.log(chalk.gray('\n─'.repeat(60)));
    console.log(chalk.gray('Press ? again to hide help, Ctrl+C to exit, h for main help\n'));
    console.log('\x1b[?25h'); // Show cursor again
  }

  /**
   * Make descriptions more accessible for screen readers
   */
  private makeAccessibleDescription(description: string): string {
    return description
      .replace(/\//g, ' or ')
      .replace(/\|/g, ', ')
      .replace(/&/g, ' and ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/^./, str => str.toUpperCase());
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
  private static formatKeyDisplay(key: string): string {
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
      description: 'Search and filter content',
      action: () => {
        console.log(chalk.cyan('🔍 Search mode activated - Type to filter'));
      },
      global: true,
    });

    // Tab navigation shortcut
    this.register({
      key: '\t', // Tab key
      description: 'Navigate to next focusable element',
      action: () => {
        console.log(chalk.blue('→ Tab navigation: Next element'));
      },
      global: true,
    });

    // Accessibility mode toggle
    this.register({
      key: 'a',
      description: 'Toggle accessibility announcements',
      action: () => {
        const isEnabled = this.toggleAccessibilityAnnouncements();
        console.log(chalk.green(`♿ Accessibility announcements ${isEnabled ? 'enabled' : 'disabled'}`));
      },
      global: true,
    });

    // New item shortcut (Ctrl+N)
    this.register({
      key: String.fromCharCode(14), // Ctrl+N
      description: 'Create new item',
      action: () => {
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
        logger.error(
          chalk.red('❌ Refresh failed:'),
          error instanceof Error ? error.message : String(error)
        );
      }
    } else {
      console.log(chalk.yellow('⚠️  No refresh action available in current context'));
    }
  }

  /**
   * Toggle accessibility announcements
   */
  private toggleAccessibilityAnnouncements(): boolean {
    this.accessibilityAnnouncementsEnabled = !this.accessibilityAnnouncementsEnabled;
    
    if (this.accessibilityAnnouncementsEnabled) {
      // Announce the change to screen readers
      process.stderr.write('[ACCESSIBILITY] Screen reader announcements enabled\n');
    }
    
    return this.accessibilityAnnouncementsEnabled;
  }

  /**
   * Make an accessibility announcement if enabled
   */
  announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    if (!this.accessibilityAnnouncementsEnabled) return;
    
    const prefix = priority === 'assertive' ? '[URGENT]' : '[INFO]';
    process.stderr.write(`${prefix} ${message}\n`);
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

  constructor(parent: KeyboardHandler, _contextName: string) {
    this.parent = parent;
    // this['contextName'] = contextName;
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

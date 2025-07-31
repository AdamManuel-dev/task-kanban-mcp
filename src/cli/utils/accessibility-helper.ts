/**
 * @fileoverview Accessibility utilities for CLI interface
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: WCAG compliance, screen reader support, keyboard navigation
 * Main APIs: validateContrastRatio(), getAccessibleColors(), announceToScreenReader()
 * Constraints: Terminal-based, requires ANSI color support
 * Patterns: WCAG 2.1 AA compliance, semantic markup for terminal UIs
 */

export interface ContrastRatio {
  ratio: number;
  level: 'AA' | 'AAA' | 'FAIL';
  isAccessible: boolean;
}

export interface AccessibleColorPair {
  foreground: string;
  background: string;
  contrastRatio: ContrastRatio;
}

export interface ScreenReaderAnnouncement {
  message: string;
  priority: 'polite' | 'assertive';
  category: 'status' | 'navigation' | 'content' | 'error';
}

/**
 * WCAG 2.1 color contrast utilities for terminal interfaces
 */
export class AccessibilityHelper {
  private static readonly WCAG_AA_NORMAL = 4.5;

  private static readonly WCAG_AA_LARGE = 3.0;

  private static readonly WCAG_AAA_NORMAL = 7.0;

  private static readonly WCAG_AAA_LARGE = 4.5;

  /**
   * Calculate relative luminance for RGB values
   */
  private static getRelativeLuminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map(c => {
      const sRGB = c / 255;
      return sRGB <= 0.03928 ? sRGB / 12.92 : ((sRGB + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  /**
   * Calculate contrast ratio between two colors
   */
  static calculateContrastRatio(
    foreground: { r: number; g: number; b: number },
    background: { r: number; g: number; b: number }
  ): ContrastRatio {
    const l1 = this.getRelativeLuminance(foreground.r, foreground.g, foreground.b);
    const l2 = this.getRelativeLuminance(background.r, background.g, background.b);

    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    const ratio = (lighter + 0.05) / (darker + 0.05);

    let level: ContrastRatio['level'];
    let isAccessible: boolean;

    if (ratio >= this.WCAG_AAA_NORMAL) {
      level = 'AAA';
      isAccessible = true;
    } else if (ratio >= this.WCAG_AA_NORMAL) {
      level = 'AA';
      isAccessible = true;
    } else {
      level = 'FAIL';
      isAccessible = false;
    }

    return { ratio, level, isAccessible };
  }

  /**
   * Get accessible color combinations for terminal themes
   */
  static getAccessibleTerminalColors(): {
    dark: AccessibleColorPair[];
    light: AccessibleColorPair[];
    highContrast: AccessibleColorPair[];
  } {
    return {
      dark: [
        {
          foreground: '#FFFFFF', // White text
          background: '#000000', // Black background
          contrastRatio: this.calculateContrastRatio(
            { r: 255, g: 255, b: 255 },
            { r: 0, g: 0, b: 0 }
          ),
        },
        {
          foreground: '#00FF00', // Bright green text
          background: '#000000', // Black background
          contrastRatio: this.calculateContrastRatio({ r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 0 }),
        },
        {
          foreground: '#FFFF00', // Yellow text
          background: '#000000', // Black background
          contrastRatio: this.calculateContrastRatio(
            { r: 255, g: 255, b: 0 },
            { r: 0, g: 0, b: 0 }
          ),
        },
      ],
      light: [
        {
          foreground: '#000000', // Black text
          background: '#FFFFFF', // White background
          contrastRatio: this.calculateContrastRatio(
            { r: 0, g: 0, b: 0 },
            { r: 255, g: 255, b: 255 }
          ),
        },
        {
          foreground: '#0000AA', // Dark blue text
          background: '#FFFFFF', // White background
          contrastRatio: this.calculateContrastRatio(
            { r: 0, g: 0, b: 170 },
            { r: 255, g: 255, b: 255 }
          ),
        },
      ],
      highContrast: [
        {
          foreground: '#FFFFFF', // White text
          background: '#000000', // Black background
          contrastRatio: this.calculateContrastRatio(
            { r: 255, g: 255, b: 255 },
            { r: 0, g: 0, b: 0 }
          ),
        },
        {
          foreground: '#000000', // Black text
          background: '#FFFF00', // Yellow background
          contrastRatio: this.calculateContrastRatio(
            { r: 0, g: 0, b: 0 },
            { r: 255, g: 255, b: 0 }
          ),
        },
      ],
    };
  }

  /**
   * Generate ARIA labels for CLI components
   */
  // eslint-disable-next-line complexity
  static generateAriaLabel(element: {
    type: 'task' | 'column' | 'board' | 'button' | 'list';
    name: string;
    status?: string;
    priority?: number | string;
    count?: number;
    selected?: boolean;
    position?: { row: number; col: number };
  }): string {
    const parts: string[] = [];

    switch (element.type) {
      case 'task':
        parts.push(`Task: ${element.name}`);
        if (element.status) parts.push(`Status: ${element.status}`);
        if (element.priority) parts.push(`Priority: ${element.priority}`);
        if (element.selected) parts.push('Selected');
        break;

      case 'column':
        parts.push(`Column: ${element.name}`);
        if (element.count !== undefined) parts.push(`${element.count} tasks`);
        break;

      case 'board':
        parts.push(`Board: ${element.name}`);
        if (element.count !== undefined) parts.push(`${element.count} columns`);
        break;

      case 'button':
        parts.push(`Button: ${element.name}`);
        break;

      case 'list':
        parts.push(`List: ${element.name}`);
        if (element.count !== undefined) parts.push(`${element.count} items`);
        break;

      default:
        break;
    }

    if (element.position) {
      parts.push(`Position: row ${element.position.row}, column ${element.position.col}`);
    }

    return parts.join(', ');
  }

  /**
   * Create screen reader announcements
   */
  static announceToScreenReader(announcement: ScreenReaderAnnouncement): void {
    // In a terminal environment, we can simulate screen reader announcements
    // by writing to stderr with specific formatting
    const prefix = announcement.priority === 'assertive' ? '[URGENT]' : '[INFO]';
    const categoryPrefix = `[${announcement.category.toUpperCase()}]`;

    process.stderr.write(`${prefix} ${categoryPrefix} ${announcement.message}\n`);
  }

  /**
   * Generate keyboard navigation help text
   */
  static generateKeyboardHelp(context: 'board' | 'list' | 'form' | 'menu'): string[] {
    const commonCommands = [
      'Tab: Navigate forward',
      'Shift+Tab: Navigate backward',
      'Enter: Activate/Select',
      'Escape: Cancel/Back',
      '?: Show help',
    ];

    const contextSpecific: Record<typeof context, string[]> = {
      board: [
        '↑↓: Navigate tasks vertically',
        '←→: Navigate columns horizontally',
        'Space: Select task',
        'Enter: Open task details',
      ],
      list: [
        '↑↓: Navigate list items',
        'Home: Go to first item',
        'End: Go to last item',
        'Space: Toggle selection',
      ],
      form: [
        '↑↓: Navigate form fields',
        'Tab: Next field',
        'Shift+Tab: Previous field',
        'Enter: Submit form',
      ],
      menu: ['↑↓: Navigate menu items', 'Enter: Select menu item', 'Escape: Close menu'],
    };

    return [...contextSpecific[context], ...commonCommands];
  }

  /**
   * Validate if element meets accessibility standards
   */
  static validateAccessibility(element: {
    hasAriaLabel?: boolean;
    hasRole?: boolean;
    hasTabIndex?: boolean;
    contrastRatio?: number;
    isKeyboardNavigable?: boolean;
  }): {
    isAccessible: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (!element.hasAriaLabel) {
      issues.push('Missing aria-label for screen readers');
      recommendations.push('Add descriptive aria-label attribute');
    }

    if (!element.hasRole) {
      issues.push('Missing semantic role');
      recommendations.push('Add appropriate ARIA role (button, listitem, etc.)');
    }

    if (!element.hasTabIndex) {
      issues.push('Not keyboard accessible');
      recommendations.push('Add tabIndex for keyboard navigation');
    }

    if (element.contrastRatio && element.contrastRatio < AccessibilityHelper.WCAG_AA_NORMAL) {
      issues.push(`Low contrast ratio: ${element.contrastRatio.toFixed(2)}`);
      recommendations.push('Increase color contrast to meet WCAG AA standards (4.5:1)');
    }

    if (!element.isKeyboardNavigable) {
      issues.push('Cannot be navigated with keyboard');
      recommendations.push('Ensure element responds to keyboard events');
    }

    return { isAccessible: issues.length === 0, issues, recommendations };
  }

  /**
   * Format text for better screen reader pronunciation
   */
  static formatForScreenReader(text: string): string {
    return text
      .replace(/([A-Z])/g, ' $1') // Add spaces before capital letters
      .replace(/([0-9]+)/g, ' $1 ') // Add spaces around numbers
      .replace(/[_-]/g, ' ') // Replace underscores and hyphens with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Create focus indicator for terminal UI
   */
  static createFocusIndicator(text: string, isFocused: boolean): string {
    if (!isFocused) return text;

    // Use high-contrast border for focus indication
    const border = '▶ ';
    const suffix = ' ◀';
    return `${border}${text}${suffix}`;
  }
}

// Export singleton instance
export const accessibilityHelper = new AccessibilityHelper();

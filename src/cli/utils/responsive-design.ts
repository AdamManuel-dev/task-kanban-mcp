/**
 * @fileoverview Responsive design utilities for terminal interfaces
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Terminal size detection, responsive layouts, breakpoint management
 * Main APIs: getTerminalSize(), calculateLayout(), getBreakpoint()
 * Constraints: Requires TTY support, fallbacks for non-interactive terminals
 * Patterns: Mobile-first responsive design adapted for CLI interfaces
 */

export interface TerminalSize {
  width: number;
  height: number;
  isInteractive: boolean;
  supportsColor: boolean;
  supportsUnicode: boolean;
}

export interface BreakpointConfig {
  name: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  minWidth: number;
  description: string;
}

export interface ResponsiveLayout {
  columns: number;
  itemWidth: number;
  showDetails: boolean;
  compactMode: boolean;
  maxItems: number;
}

/**
 * Responsive design utilities for CLI interfaces
 */
export class ResponsiveDesignHelper {
  private static readonly BREAKPOINTS: BreakpointConfig[] = [
    { name: 'xs', minWidth: 0, description: 'Extra small terminals (< 40 chars)' },
    { name: 'sm', minWidth: 40, description: 'Small terminals (40-80 chars)' },
    { name: 'md', minWidth: 80, description: 'Medium terminals (80-120 chars)' },
    { name: 'lg', minWidth: 120, description: 'Large terminals (120-160 chars)' },
    { name: 'xl', minWidth: 160, description: 'Extra large terminals (160+ chars)' },
  ];

  private static readonly FALLBACK_SIZE: TerminalSize = {
    width: 80,
    height: 24,
    isInteractive: false,
    supportsColor: false,
    supportsUnicode: false,
  };

  /**
   * Get current terminal size and capabilities
   */
  static getTerminalSize(): TerminalSize {
    try {
      const width = process.stdout.columns || this.FALLBACK_SIZE.width;
      const height = process.stdout.rows || this.FALLBACK_SIZE.height;
      const isInteractive = Boolean(process.stdout.isTTY);

      // Detect color support
      const supportsColor = !!(
        process.env.COLORTERM ||
        process.env.TERM?.includes('color') ||
        process.env.TERM === 'xterm-256color' ||
        process.stdout.isTTY
      );

      // Detect Unicode support
      const supportsUnicode = !!(
        process.env.LANG?.includes('UTF-8') ||
        process.env.LC_ALL?.includes('UTF-8') ||
        process.env.TERM?.includes('unicode')
      );

      return {
        width,
        height,
        isInteractive,
        supportsColor,
        supportsUnicode,
      };
    } catch (error) {
      console.warn('Failed to detect terminal size, using fallback:', error);
      return this.FALLBACK_SIZE;
    }
  }

  /**
   * Get current breakpoint based on terminal width
   */
  static getBreakpoint(width?: number): BreakpointConfig {
    const terminalWidth = width ?? this.getTerminalSize().width;

    // Find the largest breakpoint that fits
    for (let i = this.BREAKPOINTS.length - 1; i >= 0; i--) {
      if (terminalWidth >= this.BREAKPOINTS[i].minWidth) {
        return this.BREAKPOINTS[i];
      }
    }

    return this.BREAKPOINTS[0]; // Fallback to xs
  }

  /**
   * Calculate responsive layout for board/list components
   */
  static calculateLayout(type: 'board' | 'list' | 'table', size?: TerminalSize): ResponsiveLayout {
    const terminalSize = size ?? this.getTerminalSize();
    const breakpoint = this.getBreakpoint(terminalSize.width);

    switch (type) {
      case 'board':
        return this.calculateBoardLayout(terminalSize, breakpoint);
      case 'list':
        return this.calculateListLayout(terminalSize, breakpoint);
      case 'table':
        return this.calculateTableLayout(terminalSize, breakpoint);
      default:
        return this.getDefaultLayout(breakpoint);
    }
  }

  /**
   * Calculate board layout (kanban columns)
   */
  private static calculateBoardLayout(
    size: TerminalSize,
    breakpoint: BreakpointConfig
  ): ResponsiveLayout {
    switch (breakpoint.name) {
      case 'xs':
        return {
          columns: 1,
          itemWidth: size.width - 4,
          showDetails: false,
          compactMode: true,
          maxItems: 5,
        };
      case 'sm':
        return {
          columns: 2,
          itemWidth: Math.floor((size.width - 6) / 2),
          showDetails: false,
          compactMode: true,
          maxItems: 8,
        };
      case 'md':
        return {
          columns: 3,
          itemWidth: Math.floor((size.width - 8) / 3),
          showDetails: true,
          compactMode: false,
          maxItems: 10,
        };
      case 'lg':
        return {
          columns: 4,
          itemWidth: Math.floor((size.width - 10) / 4),
          showDetails: true,
          compactMode: false,
          maxItems: 12,
        };
      case 'xl':
        return {
          columns: 5,
          itemWidth: Math.floor((size.width - 12) / 5),
          showDetails: true,
          compactMode: false,
          maxItems: 15,
        };
      default:
        return {
          columns: 3,
          itemWidth: Math.floor((size.width - 8) / 3),
          showDetails: true,
          compactMode: false,
          maxItems: 10,
        };
    }
  }

  /**
   * Calculate list layout
   */
  private static calculateListLayout(
    size: TerminalSize,
    breakpoint: BreakpointConfig
  ): ResponsiveLayout {
    const maxItems = Math.max(5, size.height - 8); // Reserve space for headers/footers

    switch (breakpoint.name) {
      case 'xs':
        return {
          columns: 1,
          itemWidth: size.width - 2,
          showDetails: false,
          compactMode: true,
          maxItems: Math.min(maxItems, 10),
        };
      case 'sm':
      case 'md':
        return {
          columns: 1,
          itemWidth: size.width - 4,
          showDetails: true,
          compactMode: false,
          maxItems,
        };
      case 'lg':
      case 'xl':
        return {
          columns: 1,
          itemWidth: size.width - 6,
          showDetails: true,
          compactMode: false,
          maxItems,
        };
      default:
        return {
          columns: 1,
          itemWidth: size.width - 4,
          showDetails: true,
          compactMode: false,
          maxItems,
        };
    }
  }

  /**
   * Calculate table layout
   */
  private static calculateTableLayout(
    size: TerminalSize,
    breakpoint: BreakpointConfig
  ): ResponsiveLayout {
    const availableWidth = size.width - 4;

    switch (breakpoint.name) {
      case 'xs':
        return {
          columns: 2, // Minimum viable columns
          itemWidth: Math.floor(availableWidth / 2),
          showDetails: false,
          compactMode: true,
          maxItems: size.height - 6,
        };
      case 'sm':
        return {
          columns: 3,
          itemWidth: Math.floor(availableWidth / 3),
          showDetails: false,
          compactMode: true,
          maxItems: size.height - 5,
        };
      case 'md':
        return {
          columns: 4,
          itemWidth: Math.floor(availableWidth / 4),
          showDetails: true,
          compactMode: false,
          maxItems: size.height - 4,
        };
      case 'lg':
      case 'xl':
        return {
          columns: 5,
          itemWidth: Math.floor(availableWidth / 5),
          showDetails: true,
          compactMode: false,
          maxItems: size.height - 4,
        };
      default:
        return {
          columns: 4,
          itemWidth: Math.floor(availableWidth / 4),
          showDetails: true,
          compactMode: false,
          maxItems: size.height - 4,
        };
    }
  }

  /**
   * Get default layout for unknown types
   */
  private static getDefaultLayout(breakpoint: BreakpointConfig): ResponsiveLayout {
    const isSmall = breakpoint.name === 'xs' || breakpoint.name === 'sm';

    return {
      columns: isSmall ? 1 : 2,
      itemWidth: isSmall ? 40 : 60,
      showDetails: !isSmall,
      compactMode: isSmall,
      maxItems: isSmall ? 8 : 12,
    };
  }

  /**
   * Check if terminal supports specific features
   */
  static supportsFeature(feature: 'color' | 'unicode' | 'mouse' | 'focus'): boolean {
    const size = this.getTerminalSize();

    switch (feature) {
      case 'color':
        return size.supportsColor;
      case 'unicode':
        return size.supportsUnicode;
      case 'mouse':
        return size.isInteractive && !!process.env.TERM?.includes('xterm');
      case 'focus':
        return size.isInteractive;
      default:
        return false;
    }
  }

  /**
   * Get optimal text truncation length for current terminal
   */
  static getOptimalTextLength(context: 'title' | 'description' | 'label'): number {
    const _size = this.getTerminalSize();
    const breakpoint = this.getBreakpoint();

    const baseLengths = {
      title: { xs: 15, sm: 25, md: 40, lg: 60, xl: 80 },
      description: { xs: 20, sm: 40, md: 80, lg: 120, xl: 150 },
      label: { xs: 8, sm: 12, md: 16, lg: 20, xl: 24 },
    };

    const contextLengths = baseLengths[context];
    return contextLengths[breakpoint.name];
  }

  /**
   * Adapt content for mobile/small terminals
   */
  static adaptForMobile<T extends { title: string; description?: string }>(
    items: T[],
    options: { maxItems?: number; truncateTitles?: boolean } = {}
  ): T[] {
    const breakpoint = this.getBreakpoint();
    const isMobile = breakpoint.name === 'xs' || breakpoint.name === 'sm';

    if (!isMobile) return items;

    const { maxItems = 10, truncateTitles = true } = options;
    let adapted = items.slice(0, maxItems);

    if (truncateTitles) {
      const maxTitleLength = this.getOptimalTextLength('title');
      adapted = adapted.map(item => ({
        ...item,
        title:
          item.title.length > maxTitleLength
            ? `${item.title.substring(0, maxTitleLength - 3)}...`
            : item.title,
        description: item.description ? undefined : item.description, // Remove descriptions on mobile
      }));
    }

    return adapted;
  }

  /**
   * Create responsive grid layout
   */
  static createGridLayout(items: unknown[], columns: number): unknown[][] {
    const grid: unknown[][] = [];

    for (let i = 0; i < items.length; i += columns) {
      grid.push(items.slice(i, i + columns));
    }

    return grid;
  }

  /**
   * Get responsive spacing
   */
  static getSpacing(size: 'xs' | 'sm' | 'md' | 'lg' = 'md'): {
    margin: number;
    padding: number;
    gap: number;
  } {
    const spacing = {
      xs: { margin: 0, padding: 1, gap: 1 },
      sm: { margin: 1, padding: 1, gap: 1 },
      md: { margin: 1, padding: 2, gap: 2 },
      lg: { margin: 2, padding: 2, gap: 2 },
    };

    return spacing[size];
  }

  /**
   * Monitor terminal size changes
   */
  static watchResize(callback: (size: TerminalSize) => void): () => void {
    const handler = () => {
      callback(this.getTerminalSize());
    };

    process.stdout.on('resize', handler);

    // Return cleanup function
    return () => {
      process.stdout.off('resize', handler);
    };
  }
}

// Export singleton instance
export const responsiveDesign = new ResponsiveDesignHelper();

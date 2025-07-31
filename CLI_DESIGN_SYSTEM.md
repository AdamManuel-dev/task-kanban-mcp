# 🎨 CLI Design System & Accessibility Guide

## Overview

This document defines the design system, accessibility standards, and visual consistency guidelines for the MCP Kanban CLI interface.

## 🎯 Design Principles

### 1. **Accessibility First**

- **WCAG 2.1 AA Compliance**: All interfaces meet or exceed WCAG standards
- **Screen Reader Support**: Semantic markup with proper ARIA labels
- **Keyboard Navigation**: Full keyboard accessibility without mouse dependency
- **High Contrast**: Support for high-contrast themes and color-blind users

### 2. **Progressive Enhancement**

- **Terminal Capability Detection**: Graceful degradation for limited terminals
- **Unicode Fallbacks**: ASCII alternatives for unsupported terminals
- **Color Detection**: Automatic fallback to monochrome when needed

### 3. **Responsive Design**

- **Breakpoint System**: Adaptive layouts for different terminal sizes
- **Mobile-First**: Optimized for narrow terminals (40-80 characters)
- **Content Prioritization**: Show most important information first

## 🎨 Color System

### Standard Theme Palette

```typescript
colors: {
  primary: chalk.cyan,      // Interactive elements, links
  secondary: chalk.blue,    // Secondary actions
  success: chalk.green,     // Success states, completed tasks
  error: chalk.red,         // Errors, blocked tasks
  warning: chalk.yellow,    // Warnings, pending actions
  info: chalk.blue,         // Information, help text
  muted: chalk.gray,        // Secondary text, metadata
  highlight: chalk.bgBlue.white, // Selected/focused items
  accent: chalk.magenta,    // Special emphasis
}
```

### High Contrast Theme

```typescript
colors: {
  primary: chalk.white.bold,
  success: chalk.green.bold,
  error: chalk.red.bold,
  warning: chalk.yellow.bold,
  // Background colors for critical information
  priority: {
    P1: chalk.bgRed.white.bold,      // Critical
    P2: chalk.bgYellow.black.bold,   // High
    P3: chalk.bgBlue.white.bold,     // Medium
  }
}
```

### Color Accessibility Guidelines

- **Contrast Ratios**: Minimum 4.5:1 for normal text, 3:1 for large text
- **Color Blind Support**: Never rely solely on color to convey information
- **Theme Switching**: Support for dark, light, and high-contrast themes

## 📱 Responsive Breakpoints

```typescript
breakpoints: {
  xs: 0-39 chars    // Mobile terminals, minimal layout
  sm: 40-79 chars   // Small terminals, compact layout
  md: 80-119 chars  // Standard terminals, balanced layout
  lg: 120-159 chars // Large terminals, detailed layout
  xl: 160+ chars    // Extra large, full feature layout
}
```

### Layout Adaptations

- **XS (< 40 chars)**: Single column, truncated text, icons only
- **SM (40-79 chars)**: Two columns max, compact spacing
- **MD (80-119 chars)**: Standard layout, full features
- **LG+ (120+ chars)**: Multi-column, detailed information

## ♿ Accessibility Features

### Screen Reader Support

```typescript
// ARIA Labels for all interactive elements
<Box role="listitem" aria-label="Task: Deploy API, Priority: High, Status: In Progress">
  {content}
</Box>

// Live regions for dynamic content
<Text role="status" aria-live="polite">
  Task updated successfully
</Text>
```

### Keyboard Navigation

- **Tab**: Navigate between sections
- **Arrow Keys**: Navigate within sections
- **Enter**: Activate/select items
- **Space**: Toggle selections
- **Escape**: Cancel/go back
- **?**: Show help
- **A**: Toggle accessibility announcements

### Focus Management

```typescript
// Visual focus indicators
const focusStyle = isSelected
  ? '▶ ${content} ◀' // High contrast focus indicator
  : '  ${content}  '; // Normal state
```

## 🎭 Component Patterns

### Task Items

```typescript
interface TaskItemProps {
  task: Task;
  isSelected: boolean;
  showDetails: boolean;
  compactMode: boolean;
}

// Accessibility props
const accessibilityProps = {
  role: 'listitem',
  tabIndex: isSelected ? 0 : -1,
  'aria-label': generateTaskAriaLabel(task),
  'aria-selected': isSelected,
};
```

### Status Indicators

```typescript
const statusIcons = {
  todo: { icon: '○', color: chalk.gray, accessible: '[ ]' },
  in_progress: { icon: '◐', color: chalk.yellow, accessible: '[~]' },
  done: { icon: '●', color: chalk.green, accessible: '[X]' },
  blocked: { icon: '✕', color: chalk.red, accessible: '[!]' },
};
```

### Priority Indicators

```typescript
const priorityDisplay = {
  visual: '★★★★★', // Unicode stars
  accessible: 'P4', // Text-based priority
  screenReader: 'Priority level 4 out of 5', // Full description
};
```

## 📐 Spacing & Layout

### Grid System

```typescript
const spacing = {
  xs: { margin: 0, padding: 1, gap: 1 },
  sm: { margin: 1, padding: 1, gap: 1 },
  md: { margin: 1, padding: 2, gap: 2 },
  lg: { margin: 2, padding: 2, gap: 2 },
};
```

### Text Truncation

```typescript
const textLimits = {
  title: { xs: 15, sm: 25, md: 40, lg: 60, xl: 80 },
  description: { xs: 20, sm: 40, md: 80, lg: 120, xl: 150 },
  label: { xs: 8, sm: 12, md: 16, lg: 20, xl: 24 },
};
```

## 🔧 Implementation Guidelines

### Theme Integration

```typescript
// Always use theme system instead of hardcoded colors
import { themeManager } from '../themes/default';

// Good
const color = themeManager.applyColor('primary', text);

// Bad
const color = chalk.cyan(text);
```

### Responsive Design

```typescript
import { ResponsiveDesignHelper } from '../utils/responsive-design';

const layout = ResponsiveDesignHelper.calculateLayout('board');
const breakpoint = ResponsiveDesignHelper.getBreakpoint();
const supportsUnicode = ResponsiveDesignHelper.supportsFeature('unicode');
```

### Accessibility Implementation

```typescript
import { AccessibilityHelper } from '../utils/accessibility-helper';

// Generate proper ARIA labels
const ariaLabel = AccessibilityHelper.generateAriaLabel({
  type: 'task',
  name: task.title,
  status: task.status,
  priority: task.priority,
  selected: isSelected,
});

// Validate contrast ratios
const contrastRatio = AccessibilityHelper.calculateContrastRatio(foreground, background);
```

## 📋 Testing Checklist

### Visual Consistency

- [ ] All components use theme system
- [ ] Consistent spacing throughout interface
- [ ] Status indicators use standard icons/colors
- [ ] Focus states are clearly visible

### Accessibility

- [ ] All interactive elements have ARIA labels
- [ ] Keyboard navigation works throughout
- [ ] Screen reader announcements are appropriate
- [ ] High contrast theme is usable
- [ ] Color information has text alternatives

### Responsive Design

- [ ] Layout adapts to terminal width
- [ ] Text truncation works properly
- [ ] Essential information visible at all sizes
- [ ] Navigation remains functional on small screens

### Cross-Terminal Compatibility

- [ ] Works in standard terminals (xterm, Terminal.app)
- [ ] Graceful degradation without Unicode support
- [ ] Color fallbacks work properly
- [ ] Interactive features detect TTY capability

## 🚀 Future Enhancements

### Planned Features

1. **Custom Theme Support**: User-defined color schemes
2. **Animation System**: Smooth transitions for state changes
3. **Advanced Typography**: Better text rendering with limited character sets
4. **Touch Support**: Mouse/touch interaction where supported
5. **Internationalization**: RTL language support and localization

### Accessibility Roadmap

1. **Voice Navigation**: Voice command integration
2. **Braille Support**: Braille display compatibility
3. **Motor Accessibility**: Alternative input methods
4. **Cognitive Accessibility**: Simplified interface options

---

## 📚 Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Terminal Color Standards](https://en.wikipedia.org/wiki/ANSI_escape_code)
- [Accessibility in CLI Tools](https://accessibility.blog.gov.uk/2019/02/11/using-terminal-applications/)
- [Inclusive Design Principles](https://inclusivedesignprinciples.org/)

## 🤝 Contributing

When contributing to the CLI interface:

1. **Follow Design System**: Use established patterns and components
2. **Test Accessibility**: Verify keyboard navigation and screen reader support
3. **Check Responsiveness**: Test on different terminal sizes
4. **Validate Themes**: Ensure compatibility with all theme variants
5. **Document Changes**: Update this guide when adding new patterns

---

_This design system ensures a consistent, accessible, and user-friendly CLI experience for all users, regardless of their abilities or terminal capabilities._

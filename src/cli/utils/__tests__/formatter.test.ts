/**
 * Unit tests for formatter utilities
 */

import {
  formatDate,
  formatDuration,
  formatFileSize,
  formatNumber,
  formatPercent,
  formatList,
  formatTable,
  formatJson,
  truncateText,
  padText,
  capitalizeFirst,
  pluralize,
  formatStatus,
  formatPriority,
  formatProgress,
  formatTaskSummary,
} from '../formatter';

describe('Formatter Utilities', () => {
  describe('formatDate', () => {
    it('should format dates with default format', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const formatted = formatDate(date);

      expect(formatted).toMatch(/2024/);
      expect(formatted).toMatch(/Jan|January/);
      expect(formatted).toMatch(/15/);
    });

    it('should format dates with custom format', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const formatted = formatDate(date, 'yyyy-MM-dd');

      expect(formatted).toBe('2024-01-15');
    });

    it('should handle string dates', () => {
      const dateString = '2024-01-15T10:30:00Z';
      const formatted = formatDate(dateString);

      expect(formatted).toMatch(/2024/);
    });

    it('should handle invalid dates', () => {
      const invalidDate = 'invalid-date';
      const formatted = formatDate(invalidDate);

      expect(formatted).toBe('Invalid Date');
    });

    it('should use relative format', () => {
      const now = new Date();
      const formatted = formatDate(now, 'relative');

      expect(formatted).toMatch(/now|ago|in/);
    });
  });

  describe('formatDuration', () => {
    it('should format minutes', () => {
      expect(formatDuration(30)).toBe('30m');
      expect(formatDuration(90)).toBe('1h 30m');
    });

    it('should format hours', () => {
      expect(formatDuration(120)).toBe('2h');
      expect(formatDuration(150)).toBe('2h 30m');
    });

    it('should format days', () => {
      expect(formatDuration(1440)).toBe('1d'); // 24 hours
      expect(formatDuration(1500)).toBe('1d 1h'); // 25 hours
    });

    it('should format weeks', () => {
      expect(formatDuration(10080)).toBe('1w'); // 7 days
      expect(formatDuration(10140)).toBe('1w 1h'); // 7 days 1 hour
    });

    it('should handle zero duration', () => {
      expect(formatDuration(0)).toBe('0m');
    });

    it('should handle negative duration', () => {
      expect(formatDuration(-30)).toBe('0m');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(1023)).toBe('1023 B');
    });

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1.0 MB');
      expect(formatFileSize(2097152)).toBe('2.0 MB');
    });

    it('should format gigabytes', () => {
      expect(formatFileSize(1073741824)).toBe('1.0 GB');
    });

    it('should handle negative sizes', () => {
      expect(formatFileSize(-100)).toBe('0 B');
    });
  });

  describe('formatNumber', () => {
    it('should format numbers with default locale', () => {
      expect(formatNumber(1000)).toMatch(/1[,\s]000/);
      expect(formatNumber(1234567)).toMatch(/1[,\s]234[,\s]567/);
    });

    it('should format decimals', () => {
      expect(formatNumber(1234.56)).toMatch(/1[,\s]234\.56/);
    });

    it('should handle zero', () => {
      expect(formatNumber(0)).toBe('0');
    });

    it('should handle negative numbers', () => {
      const formatted = formatNumber(-1000);
      expect(formatted).toMatch(/-1[,\s]000/);
    });
  });

  describe('formatPercent', () => {
    it('should format percentages', () => {
      expect(formatPercent(0.5)).toBe('50%');
      expect(formatPercent(0.756)).toBe('76%');
      expect(formatPercent(1)).toBe('100%');
    });

    it('should handle zero percent', () => {
      expect(formatPercent(0)).toBe('0%');
    });

    it('should handle over 100%', () => {
      expect(formatPercent(1.5)).toBe('150%');
    });

    it('should format with custom precision', () => {
      expect(formatPercent(0.756, 1)).toBe('75.6%');
      expect(formatPercent(0.756, 2)).toBe('75.60%');
    });
  });

  describe('formatList', () => {
    it('should format simple lists', () => {
      const items = ['apple', 'banana', 'cherry'];
      const formatted = formatList(items);

      expect(formatted).toContain('apple');
      expect(formatted).toContain('banana');
      expect(formatted).toContain('cherry');
    });

    it('should format with bullets', () => {
      const items = ['item1', 'item2'];
      const formatted = formatList(items, { bullet: '•' });

      expect(formatted).toContain('•');
    });

    it('should format with numbers', () => {
      const items = ['first', 'second'];
      const formatted = formatList(items, { numbered: true });

      expect(formatted).toContain('1.');
      expect(formatted).toContain('2.');
    });

    it('should handle empty list', () => {
      const formatted = formatList([]);
      expect(formatted).toBe('');
    });

    it('should apply colors', () => {
      const items = ['red item', 'blue item'];
      const formatted = formatList(items, { color: true });

      expect(formatted).toContain('red item');
      expect(formatted).toContain('blue item');
    });
  });

  describe('formatTable', () => {
    it('should format simple tables', () => {
      const data = [
        { name: 'John', age: 30, city: 'NYC' },
        { name: 'Jane', age: 25, city: 'LA' },
      ];

      const formatted = formatTable(data);

      expect(formatted).toContain('John');
      expect(formatted).toContain('Jane');
      expect(formatted).toContain('30');
      expect(formatted).toContain('25');
    });

    it('should format with custom headers', () => {
      const data = [{ name: 'John', age: 30 }];
      const formatted = formatTable(data, ['Full Name', 'Years']);

      expect(formatted).toContain('Full Name');
      expect(formatted).toContain('Years');
    });

    it('should handle empty data', () => {
      const formatted = formatTable([]);
      expect(formatted).toContain('No data');
    });

    it('should format with colors', () => {
      const data = [{ status: 'active', count: 5 }];
      const formatted = formatTable(data, undefined, { colors: true });

      expect(formatted).toContain('active');
    });
  });

  describe('formatJson', () => {
    it('should format JSON with indentation', () => {
      const data = { name: 'test', value: 123 };
      const formatted = formatJson(data);

      expect(formatted).toContain('"name"');
      expect(formatted).toContain('"test"');
      expect(formatted).toContain('123');
    });

    it('should handle arrays', () => {
      const data = [1, 2, 3];
      const formatted = formatJson(data);

      expect(formatted).toContain('[');
      expect(formatted).toContain(']');
    });

    it('should format with colors', () => {
      const data = { test: true };
      const formatted = formatJson(data, { colors: true });

      expect(formatted).toContain('test');
    });
  });

  describe('truncateText', () => {
    it('should truncate long text', () => {
      const text = 'This is a very long text that should be truncated';
      const truncated = truncateText(text, 20);

      expect(truncated).toHaveLength(23); // 20 + '...'
      expect(truncated).toEndWith('...');
    });

    it('should not truncate short text', () => {
      const text = 'Short text';
      const truncated = truncateText(text, 20);

      expect(truncated).toBe(text);
    });

    it('should handle empty text', () => {
      const truncated = truncateText('', 10);
      expect(truncated).toBe('');
    });

    it('should use custom suffix', () => {
      const text = 'Long text here';
      const truncated = truncateText(text, 5, ' [more]');

      expect(truncated).toEndWith(' [more]');
    });
  });

  describe('padText', () => {
    it('should pad text to specified width', () => {
      const padded = padText('test', 10);
      expect(padded).toHaveLength(10);
      expect(padded).toBe('test      ');
    });

    it('should center text', () => {
      const padded = padText('test', 10, 'center');
      expect(padded).toHaveLength(10);
      expect(padded.trim()).toBe('test');
    });

    it('should right-align text', () => {
      const padded = padText('test', 10, 'right');
      expect(padded).toHaveLength(10);
      expect(padded).toBe('      test');
    });

    it('should handle text longer than width', () => {
      const padded = padText('very long text', 5);
      expect(padded).toBe('very long text');
    });
  });

  describe('capitalizeFirst', () => {
    it('should capitalize first letter', () => {
      expect(capitalizeFirst('hello')).toBe('Hello');
      expect(capitalizeFirst('WORLD')).toBe('WORLD');
    });

    it('should handle empty string', () => {
      expect(capitalizeFirst('')).toBe('');
    });

    it('should handle single character', () => {
      expect(capitalizeFirst('a')).toBe('A');
    });
  });

  describe('pluralize', () => {
    it('should pluralize correctly', () => {
      expect(pluralize(0, 'item')).toBe('0 items');
      expect(pluralize(1, 'item')).toBe('1 item');
      expect(pluralize(2, 'item')).toBe('2 items');
    });

    it('should use custom plural form', () => {
      expect(pluralize(2, 'child', 'children')).toBe('2 children');
    });

    it('should handle negative numbers', () => {
      expect(pluralize(-1, 'item')).toBe('-1 items');
    });
  });

  describe('formatStatus', () => {
    it('should format status with colors', () => {
      expect(formatStatus('todo')).toContain('todo');
      expect(formatStatus('in_progress')).toContain('in_progress');
      expect(formatStatus('done')).toContain('done');
    });

    it('should handle unknown status', () => {
      const formatted = formatStatus('unknown');
      expect(formatted).toContain('unknown');
    });
  });

  describe('formatPriority', () => {
    it('should format priority with colors', () => {
      expect(formatPriority('P1')).toContain('P1');
      expect(formatPriority('P2')).toContain('P2');
      expect(formatPriority('P3')).toContain('P3');
      expect(formatPriority('P4')).toContain('P4');
    });

    it('should handle unknown priority', () => {
      const formatted = formatPriority('P5');
      expect(formatted).toContain('P5');
    });
  });

  describe('formatProgress', () => {
    it('should format progress bar', () => {
      const progress = formatProgress(0.7, 20);

      expect(progress).toHaveLength(20);
      expect(progress).toContain('█');
      expect(progress).toContain('░');
    });

    it('should handle 0% progress', () => {
      const progress = formatProgress(0, 10);
      expect(progress).toBe('░'.repeat(10));
    });

    it('should handle 100% progress', () => {
      const progress = formatProgress(1, 10);
      expect(progress).toBe('█'.repeat(10));
    });

    it('should handle values over 100%', () => {
      const progress = formatProgress(1.5, 10);
      expect(progress).toBe('█'.repeat(10));
    });
  });

  describe('formatTaskSummary', () => {
    it('should format task summary', () => {
      const task = {
        id: 'task-1',
        title: 'Test Task',
        status: 'in_progress',
        priority: 'P2',
        assigneeId: 'user-1',
        dueDate: '2024-12-31',
      };

      const summary = formatTaskSummary(task);

      expect(summary).toContain('Test Task');
      expect(summary).toContain('P2');
      expect(summary).toContain('in_progress');
    });

    it('should handle minimal task data', () => {
      const task = {
        id: 'task-1',
        title: 'Minimal Task',
      };

      const summary = formatTaskSummary(task);
      expect(summary).toContain('Minimal Task');
    });

    it('should format with colors', () => {
      const task = {
        title: 'Colored Task',
        status: 'done',
        priority: 'P1',
      };

      const summary = formatTaskSummary(task, { colors: true });
      expect(summary).toContain('Colored Task');
    });
  });
});

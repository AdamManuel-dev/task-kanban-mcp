/**
 * Unit tests for date/time formatting functions
 */

import {
  formatRelativeTimeNatural,
  formatDueDate,
  formatSmartDateTime,
  formatTimeRange,
  formatTimestamp,
  formatISODate,
  formatDateShort,
  formatWorkingHours,
} from '../formatter';

describe('Date/Time Formatting Functions', () => {
  const mockDate = new Date('2024-01-15T10:30:00Z');

  beforeAll(() => {
    // Mock the current date for consistent tests
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('formatRelativeTimeNatural', () => {
    it('should format relative time using date-fns', () => {
      const oneHourAgo = new Date(mockDate.getTime() - 60 * 60 * 1000);
      const result = formatRelativeTimeNatural(oneHourAgo);
      expect(result).toContain('ago');
    });

    it('should handle string dates', () => {
      const result = formatRelativeTimeNatural('2024-01-15T09:30:00Z');
      expect(result).toContain('ago');
    });
  });

  describe('formatDueDate', () => {
    it('should format today dates with color', () => {
      const result = formatDueDate(mockDate);
      expect(result).toContain('Due today');
    });

    it('should format tomorrow dates', () => {
      const tomorrow = new Date(mockDate.getTime() + 24 * 60 * 60 * 1000);
      const result = formatDueDate(tomorrow);
      expect(result).toContain('Due tomorrow');
    });

    it('should mark overdue dates', () => {
      const yesterday = new Date(mockDate.getTime() - 24 * 60 * 60 * 1000);
      const result = formatDueDate(yesterday);
      expect(result).toContain('Overdue');
    });
  });

  describe('formatSmartDateTime', () => {
    it('should show only time for today', () => {
      const result = formatSmartDateTime(mockDate);
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should show "Yesterday" for yesterday dates', () => {
      const yesterday = new Date(mockDate.getTime() - 24 * 60 * 60 * 1000);
      const result = formatSmartDateTime(yesterday);
      expect(result).toContain('Yesterday');
    });

    it('should show "Tomorrow" for tomorrow dates', () => {
      const tomorrow = new Date(mockDate.getTime() + 24 * 60 * 60 * 1000);
      const result = formatSmartDateTime(tomorrow);
      expect(result).toContain('Tomorrow');
    });
  });

  describe('formatTimeRange', () => {
    it('should format same day ranges', () => {
      const start = new Date(mockDate.getTime());
      const end = new Date(mockDate.getTime() + 2 * 60 * 60 * 1000); // 2 hours later

      const result = formatTimeRange(start, end);
      expect(result).toContain('Today');
      expect(result).toContain('-');
    });

    it('should format cross-day ranges', () => {
      const start = mockDate;
      const end = new Date(mockDate.getTime() + 25 * 60 * 60 * 1000); // Next day

      const result = formatTimeRange(start, end);
      expect(result).toContain('-');
    });
  });

  describe('formatTimestamp', () => {
    it('should format with milliseconds', () => {
      const result = formatTimestamp(mockDate);
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/);
    });

    it('should use current time when no date provided', () => {
      const result = formatTimestamp();
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/);
    });
  });

  describe('formatISODate', () => {
    it('should format as ISO string', () => {
      const result = formatISODate(mockDate);
      expect(result).toBe(mockDate.toISOString());
    });

    it('should handle string dates', () => {
      const dateStr = '2024-01-15T10:30:00Z';
      const result = formatISODate(dateStr);
      expect(result).toBe(new Date(dateStr).toISOString());
    });
  });

  describe('formatDateShort', () => {
    it('should return "Today" for today', () => {
      const result = formatDateShort(mockDate);
      expect(result).toBe('Today');
    });

    it('should return "Yesterday" for yesterday', () => {
      const yesterday = new Date(mockDate.getTime() - 24 * 60 * 60 * 1000);
      const result = formatDateShort(yesterday);
      expect(result).toBe('Yesterday');
    });

    it('should return "Tomorrow" for tomorrow', () => {
      const tomorrow = new Date(mockDate.getTime() + 24 * 60 * 60 * 1000);
      const result = formatDateShort(tomorrow);
      expect(result).toBe('Tomorrow');
    });

    it('should format other dates appropriately', () => {
      const farDate = new Date('2025-05-20T10:30:00Z');
      const result = formatDateShort(farDate);
      expect(result).toContain('May');
    });
  });

  describe('formatWorkingHours', () => {
    it('should format minutes for less than 1 hour', () => {
      const result = formatWorkingHours(0.5);
      expect(result).toBe('30min');
    });

    it('should format hours for less than 8 hours', () => {
      const result = formatWorkingHours(3.5);
      expect(result).toBe('3.5h');
    });

    it('should format full days', () => {
      const result = formatWorkingHours(16);
      expect(result).toBe('2d');
    });

    it('should format days and hours', () => {
      const result = formatWorkingHours(12.5);
      expect(result).toBe('1d 4.5h');
    });
  });
});

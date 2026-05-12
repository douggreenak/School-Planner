// ============================================================
// Schedule Utilities
// ============================================================
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import type { SchoolClass, ScheduleDisruption, DaySchedule } from '@/types';
import { buildDaySchedule } from './calendar';
import { parseMinutes } from './calendarMetrics';

dayjs.extend(isoWeek);

/**
 * Find the next date a class meets, given its weekly day pattern.
 * Returns an ISO date string (YYYY-MM-DD). Returns '' if the class has no
 * meeting days (which shouldn't happen for any real class).
 *
 * Skips today by design: "next time" means the next *future* occurrence. A
 * student adding a Homework task while sitting in today's class is preparing
 * for the *following* meeting, not the one happening right now.
 *
 * @param days  Day-of-week numbers the class meets (0=Sun..6=Sat).
 * @param from  Date to search from (default: today).
 */
export function nextMeetingDate(days: number[], from: Date = new Date()): string {
  if (!days || days.length === 0) return '';
  const start = dayjs(from);
  // Look ahead up to two weeks — covers any meeting pattern.
  for (let i = 1; i <= 14; i++) {
    const candidate = start.add(i, 'day');
    if (days.includes(candidate.day())) return candidate.format('YYYY-MM-DD');
  }
  return '';
}

/**
 * Get the schedule for an entire week.
 */
export function getWeekSchedule(
  weekStart: string,
  classes: SchoolClass[],
  disruptions: ScheduleDisruption[]
): DaySchedule[] {
  const start = dayjs(weekStart).startOf('isoWeek');
  const days: DaySchedule[] = [];
  for (let i = 0; i < 7; i++) {
    const date = start.add(i, 'day').format('YYYY-MM-DD');
    days.push(buildDaySchedule(date, classes, disruptions));
  }
  return days;
}

/**
 * Get a month's worth of schedules for the year view.
 */
export function getMonthSchedules(
  year: number,
  month: number,
  classes: SchoolClass[],
  disruptions: ScheduleDisruption[]
): DaySchedule[] {
  const start = dayjs().year(year).month(month).startOf('month');
  const end = start.endOf('month');
  const days: DaySchedule[] = [];
  let current = start;
  while (current.isBefore(end) || current.isSame(end, 'day')) {
    days.push(buildDaySchedule(current.format('YYYY-MM-DD'), classes, disruptions));
    current = current.add(1, 'day');
  }
  return days;
}

/**
 * Generate common early-out disruption overrides.
 * Compresses a normal schedule so all periods end proportionally earlier.
 */
export function generateEarlyOutOverrides(
  classes: SchoolClass[],
  earlyEndTime: string
): { period: number; startTime: string; endTime: string; cancelled: boolean }[] {
  // Sort by effective start time for the day — if a class has per-day
  // overrides we prefer the earliest of those for ordering. Fall back to
  // the class default startTime when no per-day override exists.
  const sorted = [...classes].sort((a, b) => {
    const aStart = (a.dayTimes && a.dayTimes[1]?.startTime) || a.startTime; // arbitrary weekday used for ordering
    const bStart = (b.dayTimes && b.dayTimes[1]?.startTime) || b.startTime;
    return aStart.localeCompare(bStart);
  });
  if (sorted.length === 0) return [];

  const firstStart = timeToMinutes(sorted[0].startTime);
  const lastEnd = timeToMinutes(sorted[sorted.length - 1].endTime);
  const earlyEnd = timeToMinutes(earlyEndTime);

  const normalDuration = lastEnd - firstStart;
  const newDuration = earlyEnd - firstStart;
  const ratio = newDuration / normalDuration;

  // Compute each class's ideal (floating) new duration, then allocate
  // integer minutes using the Largest Remainder method so the rounded
  // durations sum exactly to newDuration. This avoids 1-minute rounding
  // gaps between adjacent periods that were visible on the calendar.
  const originalDurations = sorted.map((c) => timeToMinutes(c.endTime) - timeToMinutes(c.startTime));
  const idealDurations = originalDurations.map((d) => d * ratio);
  const floored = idealDurations.map((d) => Math.floor(d));
  const remainders = idealDurations.map((d, i) => ({ i, rem: d - floored[i] }));
  const floorSum = floored.reduce((a, b) => a + b, 0);
  let remaining = newDuration - floorSum;
  // If for any reason remaining is negative (shouldn't happen), clamp to 0.
  if (remaining < 0) remaining = 0;

  // Sort by fractional remainder descending to distribute the leftover minutes.
  remainders.sort((a, b) => b.rem - a.rem);
  const addOne = new Array(sorted.length).fill(0);
  for (let k = 0; k < remaining && k < remainders.length; k++) {
    addOne[remainders[k].i] = 1;
  }

  // Build the overrides by walking the sorted classes and assigning
  // consecutive minute ranges so there are no gaps between them. The
  // final class's end time is implicitly constrained to firstStart+newDuration
  // by construction.
  const overrides: { period: number; startTime: string; endTime: string; cancelled: boolean }[] = [];
  let cursor = firstStart;
  for (let idx = 0; idx < sorted.length; idx++) {
    const assigned = Math.max(1, floored[idx] + addOne[idx]); // ensure at least 1 minute
    const start = cursor;
    const end = cursor + assigned;
    overrides.push({ period: sorted[idx].period, startTime: minutesToTime(start), endTime: minutesToTime(end), cancelled: false });
    cursor = end;
  }

  // If rounding left us short (due to clamping to 1), ensure the last
  // class ends exactly at earlyEnd to avoid tiny gaps/overlaps.
  if (overrides.length > 0) {
    const last = overrides[overrides.length - 1];
    last.endTime = minutesToTime(earlyEnd);
    // Also ensure the penultimate end equals last start, adjust if necessary
    for (let i = overrides.length - 2; i >= 0; i--) {
      const nextStart = timeToMinutes(overrides[i + 1].startTime);
      overrides[i].endTime = minutesToTime(nextStart);
    }
  }

  return overrides;
}

/**
 * Generate late-start overrides.
 */
export function generateLateStartOverrides(
  classes: SchoolClass[],
  lateStartTime: string
): { period: number; startTime: string; endTime: string; cancelled: boolean }[] {
  const sorted = [...classes].sort((a, b) => {
    const aStart = (a.dayTimes && a.dayTimes[1]?.startTime) || a.startTime;
    const bStart = (b.dayTimes && b.dayTimes[1]?.startTime) || b.startTime;
    return aStart.localeCompare(bStart);
  });
  if (sorted.length === 0) return [];

  const originalFirstStart = timeToMinutes(sorted[0].startTime);
  const newFirstStart = timeToMinutes(lateStartTime);
  const delay = newFirstStart - originalFirstStart;

  return sorted.map((c) => ({
    period: c.period,
    startTime: minutesToTime(timeToMinutes(c.startTime) + delay),
    endTime: minutesToTime(timeToMinutes(c.endTime) + delay),
    cancelled: false,
  }));
}

function timeToMinutes(time: string): number {
  return parseMinutes(time);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

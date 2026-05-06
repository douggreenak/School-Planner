// ============================================================
// Schedule Utilities
// ============================================================
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import type { SchoolClass, ScheduleDisruption, DaySchedule } from '@/types';
import { buildDaySchedule } from './calendar';

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

  return sorted.map((c) => {
    const relativeStart = timeToMinutes(c.startTime) - firstStart;
    const relativeEnd = timeToMinutes(c.endTime) - firstStart;
    return {
      period: c.period,
      startTime: minutesToTime(firstStart + Math.round(relativeStart * ratio)),
      endTime: minutesToTime(firstStart + Math.round(relativeEnd * ratio)),
      cancelled: false,
    };
  });
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
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

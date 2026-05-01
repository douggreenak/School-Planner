// ============================================================
// Grades helpers — shared between /grades and /grades/[classId].
// Keep pure + framework-free so both pages stay tidy.
// ============================================================
import dayjs from 'dayjs';
import type { Theme } from '@mui/material/styles';
import type { Homework } from '@/types';

// ---- Grade → color (Material palette). null/undefined = disabled grey.
export function gradeColor(percent: number | undefined | null, theme: Theme): string {
  if (percent == null) return theme.palette.text.disabled;
  if (percent >= 90) return theme.palette.success.main;
  if (percent >= 80) return theme.palette.info.main;
  if (percent >= 70) return theme.palette.warning.main;
  return theme.palette.error.main;
}

export function letterFromPercent(p: number): string {
  if (p >= 93) return 'A';
  if (p >= 90) return 'A-';
  if (p >= 87) return 'B+';
  if (p >= 83) return 'B';
  if (p >= 80) return 'B-';
  if (p >= 77) return 'C+';
  if (p >= 73) return 'C';
  if (p >= 70) return 'C-';
  if (p >= 67) return 'D+';
  if (p >= 63) return 'D';
  if (p >= 60) return 'D-';
  return 'F';
}

// Parse a raw score string into a percentage when possible. Accepts
// "18/20", "95%", "95", "B+", "—". Returns null if it can't infer a number.
export function parseScorePercent(raw: string | undefined): number | null {
  if (!raw) return null;
  const txt = raw.replace(/\s+/g, ' ').trim();
  if (!txt) return null;
  const fraction = txt.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fraction) {
    const num = parseFloat(fraction[1]);
    const den = parseFloat(fraction[2]);
    if (den > 0) return (num / den) * 100;
  }
  const pct = txt.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) return parseFloat(pct[1]);
  const bare = txt.match(/^-?(\d+(?:\.\d+)?)$/);
  if (bare) {
    const n = parseFloat(bare[1]);
    if (n > 100) return null;
    if (n <= 20) return null; // heuristic: small bare numbers are point values
    return n;
  }
  return null;
}

// Prefer the scraper-captured scorePercent field; fall back to parsing score text.
export function homeworkPercent(h: Homework): number | null {
  return h.scorePercent ?? parseScorePercent(h.score);
}

// MUI Chip color for a PowerSchool flag text.
export type FlagSeverity = 'error' | 'warning' | 'success' | 'default';
export function flagSeverity(flag: string): FlagSeverity {
  const f = flag.toLowerCase();
  if (f.includes('miss')) return 'error';
  if (f.includes('late') || f.includes('incomplete')) return 'warning';
  if (f.includes('collect') || f.includes('exempt')) return 'success';
  return 'default';
}

// ---- Status predicates ----
// "Missing" / "Late" / "Ungraded" drive the quick-filter chips, status counts,
// and row highlighting. We derive them from the flag text the scraper stored.
export function isMissing(h: Homework): boolean {
  return !!h.flags && /miss/i.test(h.flags);
}
export function isLate(h: Homework): boolean {
  return !!h.flags && /(late|incomplete)/i.test(h.flags);
}
export function isGraded(h: Homework): boolean {
  return homeworkPercent(h) != null;
}
// Ungraded = past-due (dueDate <= today) with no score yet and not missing.
// Assignments still in the future aren't "ungraded" — they're just upcoming.
export function isUngraded(h: Homework): boolean {
  if (isGraded(h)) return false;
  if (isMissing(h)) return false;
  if (!h.dueDate) return false;
  const due = dayjs(h.dueDate);
  if (!due.isValid()) return false;
  return due.startOf('day').valueOf() <= dayjs().startOf('day').valueOf();
}
export function isUpcoming(h: Homework): boolean {
  if (isGraded(h)) return false;
  if (!h.dueDate) return false;
  const due = dayjs(h.dueDate);
  if (!due.isValid()) return false;
  return due.startOf('day').valueOf() > dayjs().startOf('day').valueOf();
}

export interface StatusCounts {
  total: number;
  graded: number;
  missing: number;
  late: number;
  ungraded: number;
  upcoming: number;
  upcomingThisWeek: number;
}

export function statusCounts(list: Homework[]): StatusCounts {
  const now = dayjs().startOf('day');
  const weekAhead = now.add(7, 'day');
  let graded = 0;
  let missing = 0;
  let late = 0;
  let ungraded = 0;
  let upcoming = 0;
  let upcomingThisWeek = 0;
  for (const h of list) {
    if (isMissing(h)) missing++;
    if (isLate(h)) late++;
    if (isGraded(h)) graded++;
    else if (isUngraded(h)) ungraded++;
    if (isUpcoming(h)) {
      upcoming++;
      const due = dayjs(h.dueDate);
      if (due.isValid() && due.valueOf() <= weekAhead.valueOf()) upcomingThisWeek++;
    }
  }
  return { total: list.length, graded, missing, late, ungraded, upcoming, upcomingThisWeek };
}

// ---- Relative date — "Today", "Tomorrow", "3 days ago", "Apr 12" ----
// Intuitive at a glance for the due-date column. Falls back to "MMM D" for
// dates more than a week away so we don't say "in 47 days" for things that
// far out.
export function relativeDueLabel(iso: string | undefined): string {
  if (!iso) return '—';
  const d = dayjs(iso);
  if (!d.isValid()) return '—';
  const today = dayjs().startOf('day');
  const due = d.startOf('day');
  const diffDays = due.diff(today, 'day');
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 6) return `In ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -6) return `${Math.abs(diffDays)} days ago`;
  if (Math.abs(diffDays) < 365) return d.format('MMM D');
  return d.format('MMM D, YYYY');
}

// Longer label for the full-date column on the detail page.
export function fullDueLabel(iso: string | undefined): string {
  if (!iso) return '—';
  const d = dayjs(iso);
  if (!d.isValid()) return '—';
  return d.format('MMM D, YYYY');
}

// ---- Time bucket for grouping the assignments table by when things are due ----
export type TimeBucket = 'Upcoming' | 'This Week' | 'Last Week' | 'This Month' | 'Earlier';
export function timeBucket(iso: string | undefined): TimeBucket {
  if (!iso) return 'Earlier';
  const d = dayjs(iso);
  if (!d.isValid()) return 'Earlier';
  const today = dayjs().startOf('day');
  const diff = d.startOf('day').diff(today, 'day');
  if (diff > 0) return 'Upcoming';
  if (diff >= -6) return 'This Week';
  if (diff >= -13) return 'Last Week';
  if (diff >= -30) return 'This Month';
  return 'Earlier';
}
// Stable order when we render the buckets as headers.
export const TIME_BUCKET_ORDER: TimeBucket[] = ['Upcoming', 'This Week', 'Last Week', 'This Month', 'Earlier'];

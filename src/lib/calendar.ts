// ============================================================
// iCal Calendar Feed Generator
// ============================================================
import ical, { ICalCalendarMethod } from 'ical-generator';
import dayjs from 'dayjs';
import type { SchoolClass, Exam, Homework, ScheduleDisruption, DaySchedule, ScheduleEntry } from '@/types';
import { parseMinutes } from './calendarMetrics';

/**
 * Build the full day schedule for a given date, accounting for disruptions.
 */
export function buildDaySchedule(
  date: string,
  classes: SchoolClass[],
  disruptions: ScheduleDisruption[]
): DaySchedule {
  const d = dayjs(date);
  const dayOfWeek = d.day(); // 0=Sun

  const disruption = disruptions.find((dis) => dis.date === date);
  const dayClasses = classes.filter((c) => c.days.includes(dayOfWeek));

  const entries: ScheduleEntry[] = dayClasses.map((classInfo) => {
    if (disruption) {
      const override = disruption.periodOverrides.find(
        (o) => o.period === classInfo.period
      );
    if (override) {
        return {
          classInfo,
          startTime: override.cancelled ? (classInfo.dayTimes?.[dayOfWeek]?.startTime || classInfo.startTime) : override.startTime,
          endTime: override.cancelled ? (classInfo.dayTimes?.[dayOfWeek]?.endTime || classInfo.endTime) : override.endTime,
          cancelled: override.cancelled,
        };
      }
      if (disruption.type === 'no_school') {
        return { classInfo, startTime: classInfo.startTime, endTime: classInfo.endTime, cancelled: true };
      }
    }
    // Use per-day override times if present, otherwise class-level times.
    return {
      classInfo,
      startTime: classInfo.dayTimes?.[dayOfWeek]?.startTime || classInfo.startTime,
      endTime: classInfo.dayTimes?.[dayOfWeek]?.endTime || classInfo.endTime,
      cancelled: false,
    };
  });

  // Sort by numeric minutes to avoid locale/string pitfalls and ensure
  // per-day overrides (dayTimes) are respected when present.
  const timeToMinutes = parseMinutes;
  entries.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  return { date, classes: entries, disruption };
}

/**
 * Generate an iCal feed for the full semester schedule.
 */
export function generateCalendarFeed(
  classes: SchoolClass[],
  exams: Exam[],
  homework: Homework[],
  disruptions: ScheduleDisruption[],
  semesterStart: string,
  semesterEnd: string,
  schoolName: string
): string {
  const cal = ical({
    name: `${schoolName || 'School'} Schedule`,
    method: ICalCalendarMethod.PUBLISH,
    prodId: { company: 'SchoolPlanner', product: 'ClassSchedule' },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  // -- Recurring class events --
  let current = dayjs(semesterStart);
  const end = dayjs(semesterEnd);

  while (current.isBefore(end) || current.isSame(end, 'day')) {
    const dateStr = current.format('YYYY-MM-DD');
    const schedule = buildDaySchedule(dateStr, classes, disruptions);

    for (const entry of schedule.classes) {
      if (entry.cancelled) continue;

      const startMin = parseMinutes(entry.startTime);
      const endMin = parseMinutes(entry.endTime);

      cal.createEvent({
        start: current.hour(Math.floor(startMin / 60)).minute(startMin % 60).second(0).toDate(),
        end: current.hour(Math.floor(endMin / 60)).minute(endMin % 60).second(0).toDate(),
        summary: entry.classInfo.name,
        location: `Room ${entry.classInfo.room}`,
        description: `Teacher: ${entry.classInfo.teacher}\nPeriod ${entry.classInfo.period}`,
        categories: [{ name: 'Class' }],
      });
    }

    current = current.add(1, 'day');
  }

  // -- Exams --
  // Exams now happen during the linked class period. Pull start/end time and
  // room from that class; fall back to the exam's own fields (legacy rows
  // still have them) and finally to a generic 8–9 AM block.
  const classById = new Map(classes.map((c) => [c.id, c]));
  for (const exam of exams) {
    const examDate = dayjs(exam.date);
    const cls = classById.get(exam.classId);
    const startTime = exam.startTime || cls?.startTime || '08:00';
    const endTime = exam.endTime || cls?.endTime || '09:00';
    const location = exam.location || (cls?.room ? `Room ${cls.room}` : '');

    const sMin = parseMinutes(startTime);
    const eMin = parseMinutes(endTime);

    // No alarm — the user opted out of exam reminders. The event still goes
    // on the calendar; it just won't pop a notification before the exam.
    cal.createEvent({
      start: examDate.hour(Math.floor(sMin / 60)).minute(sMin % 60).second(0).toDate(),
      end: examDate.hour(Math.floor(eMin / 60)).minute(eMin % 60).second(0).toDate(),
      summary: `EXAM: ${exam.title}`,
      location,
      description: exam.notes,
      categories: [{ name: 'Exam' }],
    });
  }

  // -- Homework due dates --
  // PowerSchool-imported assignments stay on the Grades tab and are
  // intentionally excluded from the calendar feed. The feed is for user-owned
  // due dates (manual + Google Classroom), not the gradebook's full history.
  for (const hw of homework) {
    if (!hw.dueDate) continue;
    if (hw.source === 'powerschool') continue;
    const dueDate = dayjs(hw.dueDate);
    cal.createEvent({
      start: dueDate.hour(23).minute(59).toDate(),
      end: dueDate.hour(23).minute(59).toDate(),
      summary: `DUE: ${hw.title}`,
      description: hw.description,
      categories: [{ name: 'Homework' }],
      allDay: true,
    });
  }

  // -- Disruptions --
  for (const d of disruptions) {
    if (d.type === 'no_school') {
      cal.createEvent({
        start: dayjs(d.date).toDate(),
        end: dayjs(d.date).toDate(),
        summary: d.label || 'No School',
        allDay: true,
        categories: [{ name: 'Disruption' }],
      });
    }
  }

  return cal.toString();
}

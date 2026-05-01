// ============================================================
// iCal Calendar Feed Generator
// ============================================================
import ical, { ICalCalendarMethod, ICalAlarmType } from 'ical-generator';
import dayjs from 'dayjs';
import type { SchoolClass, Exam, Homework, ScheduleDisruption, DaySchedule, ScheduleEntry } from '@/types';

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
          startTime: override.cancelled ? classInfo.startTime : override.startTime,
          endTime: override.cancelled ? classInfo.endTime : override.endTime,
          cancelled: override.cancelled,
        };
      }
      if (disruption.type === 'no_school') {
        return { classInfo, startTime: classInfo.startTime, endTime: classInfo.endTime, cancelled: true };
      }
    }
    return { classInfo, startTime: classInfo.startTime, endTime: classInfo.endTime, cancelled: false };
  });

  entries.sort((a, b) => a.startTime.localeCompare(b.startTime));

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

      const [sh, sm] = entry.startTime.split(':').map(Number);
      const [eh, em] = entry.endTime.split(':').map(Number);

      cal.createEvent({
        start: current.hour(sh).minute(sm).second(0).toDate(),
        end: current.hour(eh).minute(em).second(0).toDate(),
        summary: entry.classInfo.name,
        location: `Room ${entry.classInfo.room}`,
        description: `Teacher: ${entry.classInfo.teacher}\nPeriod ${entry.classInfo.period}`,
        categories: [{ name: 'Class' }],
      });
    }

    current = current.add(1, 'day');
  }

  // -- Exams --
  for (const exam of exams) {
    const examDate = dayjs(exam.date);
    const [sh, sm] = (exam.startTime || '08:00').split(':').map(Number);
    const [eh, em] = (exam.endTime || '09:00').split(':').map(Number);

    const event = cal.createEvent({
      start: examDate.hour(sh).minute(sm).second(0).toDate(),
      end: examDate.hour(eh).minute(em).second(0).toDate(),
      summary: `EXAM: ${exam.title}`,
      location: exam.location,
      description: exam.notes,
      categories: [{ name: 'Exam' }],
    });

    if (exam.reminder > 0) {
      event.createAlarm({ type: ICalAlarmType.display, trigger: exam.reminder * 60 });
    }
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

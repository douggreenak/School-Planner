import { NextRequest } from 'next/server';
import { getClasses, getExams, getHomework, getDisruptions, getSettings } from '@/lib/sheets';
import { getConfigFromRequest } from '@/lib/config';
import { generateCalendarFeed } from '@/lib/calendar';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    // Validate token against config file AND settings sheet
    const cfg = getConfigFromRequest(request);
    let savedSettings = await getSettings();
    const validToken = cfg.calendarSecretToken || savedSettings.calendarToken;
    if (validToken && token !== validToken) {
      return new Response('Unauthorized', { status: 401 });
    }

    const [classes, exams, homework, disruptions, freshSettings] = await Promise.all([
      getClasses(),
      getExams(),
      getHomework(),
      getDisruptions(),
      getSettings(),
    ]);

    const semesterStart = freshSettings.semesterStart || '2026-01-12';
    const semesterEnd = freshSettings.semesterEnd || '2026-06-15';
    const schoolName = freshSettings.schoolName || 'School';

    // Inject a synthetic Lunch class into the calendar feed so users see
    // their lunch block even when it's not stored as a persistent class.
    const lunchClass = {
      id: '__lunch__',
      name: 'Lunch',
      teacher: '',
      room: '',
      color: '#9E9E9E',
      period: 0,
      startTime: '12:00',
      endTime: '12:30',
      days: [1, 2, 3, 4, 5],
      semester: '',
      dayTimes: { 1: { startTime: '12:00', endTime: '12:30' }, 2: { startTime: '12:00', endTime: '12:30' }, 3: { startTime: '12:00', endTime: '12:30' }, 4: { startTime: '12:00', endTime: '12:30' }, 5: { startTime: '12:00', endTime: '12:30' } },
    };
    const classesWithLunch = classes.find((c) => c.id === '__lunch__') ? classes : [...classes, lunchClass];

    const ical = generateCalendarFeed(
      classesWithLunch, exams, homework, disruptions,
      semesterStart, semesterEnd, schoolName
    );

    return new Response(ical, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="school-schedule.ics"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('GET /api/calendar error:', error);
    return new Response('Error generating calendar', { status: 500 });
  }
}

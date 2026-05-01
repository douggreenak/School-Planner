import { NextRequest } from 'next/server';
import { getClasses, getExams, getHomework, getDisruptions, getSettings } from '@/lib/sheets';
import { getConfig } from '@/lib/config';
import { generateCalendarFeed } from '@/lib/calendar';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    // Validate token against config file AND settings sheet
    const cfg = getConfig();
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

    const ical = generateCalendarFeed(
      classes, exams, homework, disruptions,
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

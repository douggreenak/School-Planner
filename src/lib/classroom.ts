// ============================================================
// Google Classroom Integration
// ============================================================
import { google } from 'googleapis';
import { getConfig } from './config';
import type { SchoolClass, Homework } from '@/types';
import { v4 as uuid } from 'uuid';

const CLASS_COLORS = [
  '#4285F4', '#EA4335', '#FBBC04', '#34A853',
  '#FF6D01', '#46BDC6', '#7BAAF7', '#F07B72',
];

function getOAuth2Client() {
  const cfg = getConfig();
  return new google.auth.OAuth2(
    cfg.googleClientId,
    cfg.googleClientSecret,
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/classroom/callback`
  );
}

/**
 * Generate OAuth2 authorization URL for Google Classroom access.
 */
export function getAuthUrl(state?: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    ...(state ? { state } : {}),
    scope: [
      'https://www.googleapis.com/auth/classroom.courses.readonly',
      'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
      'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
    ],
  });
}

/**
 * Exchange authorization code for tokens.
 */
export async function getTokens(code: string) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export interface ClassroomCourse {
  courseId: string;
  name: string;
  section: string;
  room: string;
  teacherName: string;
}

/**
 * Fetch active courses from Google Classroom.
 */
export async function getCourses(accessToken: string): Promise<ClassroomCourse[]> {
  const client = getOAuth2Client();
  client.setCredentials({ access_token: accessToken });

  const classroom = google.classroom({ version: 'v1', auth: client });
  const res = await classroom.courses.list({
    courseStates: ['ACTIVE'],
    pageSize: 30,
  });

  const courses: ClassroomCourse[] = [];

  for (const course of res.data.courses ?? []) {
    // Try to get teacher name
    let teacherName = '';
    try {
      const teachers = await classroom.courses.teachers.list({ courseId: course.id! });
      if (teachers.data.teachers && teachers.data.teachers.length > 0) {
        const profile = teachers.data.teachers[0].profile;
        teacherName = profile?.name?.fullName || '';
      }
    } catch {
      // Permission might not be available
    }

    courses.push({
      courseId: course.id!,
      name: course.name ?? 'Untitled Course',
      section: course.section ?? '',
      room: course.room ?? '',
      teacherName,
    });
  }

  return courses;
}

/**
 * Convert Classroom courses into SchoolClass objects.
 */
export function coursesToClasses(courses: ClassroomCourse[]): SchoolClass[] {
  return courses.map((course, i) => {
    const startHour = 8 + Math.floor(i * 55 / 60);
    const startMin = (i * 55) % 60;
    const endMin = startMin + 50;
    const endHour = startHour + Math.floor(endMin / 60);

    return {
      id: uuid(),
      name: course.name,
      teacher: course.teacherName || 'TBD',
      room: course.room || course.section || '',
      color: CLASS_COLORS[i % CLASS_COLORS.length],
      period: i + 1,
      startTime: `${String(startHour).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`,
      endTime: `${String(endHour).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`,
      days: [1, 2, 3, 4, 5],
      semester: 'Current',
    };
  });
}

/**
 * Fetch coursework (assignments) from a single Classroom course.
 */
export async function getCourseAssignments(
  accessToken: string,
  courseId: string,
  localClassId: string
): Promise<Homework[]> {
  const client = getOAuth2Client();
  client.setCredentials({ access_token: accessToken });

  const classroom = google.classroom({ version: 'v1', auth: client });

  try {
    const res = await classroom.courses.courseWork.list({
      courseId,
      orderBy: 'dueDate asc',
      pageSize: 100,
    });

    return (res.data.courseWork ?? []).map((work) => {
      const due = work.dueDate;
      const dueStr = due
        ? `${due.year}-${String(due.month).padStart(2, '0')}-${String(due.day).padStart(2, '0')}`
        : '';

      return {
        id: uuid(),
        classId: localClassId,
        title: work.title ?? 'Untitled',
        description: work.description ?? '',
        dueDate: dueStr,
        completed: false,
        priority: 'medium' as const,
        source: 'classroom' as const,
        sourceId: work.id ?? undefined,
      };
    });
  } catch {
    // If we can't list coursework (permissions), return empty
    return [];
  }
}

/**
 * Import everything from Google Classroom: creates classes AND fetches all assignments.
 */
export async function importAllFromClassroom(accessToken: string): Promise<{
  classes: SchoolClass[];
  assignments: Homework[];
  log: string[];
}> {
  const log: string[] = [];

  log.push('Fetching courses from Google Classroom...');
  const courses = await getCourses(accessToken);
  log.push(`Found ${courses.length} active courses`);

  if (courses.length === 0) {
    return { classes: [], assignments: [], log };
  }

  // Convert to local classes
  const classes = coursesToClasses(courses);

  // Fetch assignments for each course
  const allAssignments: Homework[] = [];
  for (let i = 0; i < courses.length; i++) {
    log.push(`Fetching assignments for: ${courses[i].name}...`);
    const assignments = await getCourseAssignments(
      accessToken,
      courses[i].courseId,
      classes[i].id
    );
    allAssignments.push(...assignments);
    log.push(`  Found ${assignments.length} assignments`);
  }

  log.push(`Total: ${classes.length} classes, ${allAssignments.length} assignments`);

  return { classes, assignments: allAssignments, log };
}

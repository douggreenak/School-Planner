import { NextRequest } from 'next/server';
import { getTokens, importAllFromClassroom } from '@/lib/classroom';
import { syncClassesFromSource, syncHomeworkFromSource } from '@/lib/db';

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state');

    if (error) {
      return Response.redirect(`${appUrl}/settings?classroom=denied`);
    }

    if (!code) {
      return Response.redirect(`${appUrl}/settings?classroom=error&msg=no-code`);
    }

    // Recover userId from OAuth state
    let userId = '';
    try {
      userId = state ? Buffer.from(state, 'base64').toString('utf-8') : '';
    } catch {
      userId = '';
    }
    if (!userId) {
      return Response.redirect(`${appUrl}/settings?classroom=error&msg=no-user`);
    }

    // Exchange code for tokens
    const tokens = await getTokens(code);
    if (!tokens.access_token) {
      return Response.redirect(`${appUrl}/settings?classroom=error&msg=no-token`);
    }

    // Import everything
    const result = await importAllFromClassroom(tokens.access_token);

    // Use sync helpers to handle deduplication properly
    const classStats = await syncClassesFromSource('classroom', result.classes, userId);
    const remappedAssignments = result.assignments.map((a) => ({
      ...a,
      classId: classStats.idMap.get(a.classId) ?? a.classId,
    }));
    const hwStats = await syncHomeworkFromSource('classroom', remappedAssignments, userId);

    return Response.redirect(
      `${appUrl}/settings?classroom=success&classes=${classStats.added + classStats.updated}&assignments=${hwStats.added + hwStats.updated}`
    );
  } catch (error) {
    console.error('Classroom callback error:', error);
    return Response.redirect(
      `${appUrl}/settings?classroom=error&msg=${encodeURIComponent((error as Error).message)}`
    );
  }
}

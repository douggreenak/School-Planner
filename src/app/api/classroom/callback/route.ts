import { NextRequest } from 'next/server';
import { getTokens, importAllFromClassroom } from '@/lib/classroom';
import { addClass, addHomework, getClasses } from '@/lib/sheets';

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      return Response.redirect(`${appUrl}/settings?classroom=denied`);
    }

    if (!code) {
      return Response.redirect(`${appUrl}/settings?classroom=error&msg=no-code`);
    }

    // Exchange code for tokens
    const tokens = await getTokens(code);
    if (!tokens.access_token) {
      return Response.redirect(`${appUrl}/settings?classroom=error&msg=no-token`);
    }

    // Import everything
    const result = await importAllFromClassroom(tokens.access_token);

    // Check existing classes to avoid duplicates
    let existingClasses: string[] = [];
    try {
      const current = await getClasses();
      existingClasses = current.map((c) => c.name.toLowerCase());
    } catch {
      // OK if sheets not ready
    }

    // Save classes (skip dupes)
    let classCount = 0;
    for (const cls of result.classes) {
      if (existingClasses.includes(cls.name.toLowerCase())) continue;
      await addClass(cls);
      classCount++;
    }

    // Save assignments
    let assignmentCount = 0;
    for (const hw of result.assignments) {
      await addHomework(hw);
      assignmentCount++;
    }

    return Response.redirect(
      `${appUrl}/settings?classroom=success&classes=${classCount}&assignments=${assignmentCount}`
    );
  } catch (error) {
    console.error('Classroom callback error:', error);
    return Response.redirect(
      `${appUrl}/settings?classroom=error&msg=${encodeURIComponent((error as Error).message)}`
    );
  }
}

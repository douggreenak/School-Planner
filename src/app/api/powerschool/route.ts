import { NextRequest } from 'next/server';
import { scrapePowerSchool, type ScrapedSchedule } from '@/lib/powerschool';
import { syncClassesFromSource, syncHomeworkFromSource } from '@/lib/sheets';
import { getConfig, writeConfigFile } from '@/lib/config';

export async function POST(request: NextRequest) {
  // Hoisted so the catch block can still surface the scrape log even if the
  // sheet-write phase later throws (e.g. Sheets API quota exceeded). Without
  // this, a write-phase error produced an error response with no log — and
  // the user had no way to see what the scraper actually found.
  let result: ScrapedSchedule | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    const cfg = getConfig();

    // Credentials can come from the request body (for the very first import)
    // or from server-side config (everything afterward). Body wins so users
    // can override without clearing saved creds.
    const url      = body.url      || cfg.powerschoolUrl      || '';
    const username = body.username || cfg.powerschoolUsername || '';
    const password = body.password || cfg.powerschoolPassword || '';

    if (!url || !username || !password) {
      return Response.json({
        success: false,
        error: 'Missing PowerSchool credentials. Save them in Settings first.',
      }, { status: 400 });
    }

    // If the user supplied fresh creds in the body, persist them so future
    // imports can run without re-entering.
    if (body.url || body.username || body.password) {
      writeConfigFile({
        powerschoolUrl: url,
        powerschoolUsername: username,
        powerschoolPassword: password,
      });
    }

    result = await scrapePowerSchool({ url, username, password });

    if (result.classes.length === 0 && result.assignments.length === 0) {
      console.log('=== PowerSchool sync (no data) ===');
      for (const line of result.log) console.log(`[ps] ${line}`);
      console.log('=== end sync ===');
      return Response.json({
        success: false,
        error: 'Connected to PowerSchool but could not find any classes or assignments. The page layout may not be supported yet.',
        log: result.log,
      });
    }

    // Sync classes — add new, update existing, remove classes that were
    // previously imported from PowerSchool but are no longer there.
    const classStats = await syncClassesFromSource('powerschool', result.classes);
    result.log.push(
      `Classes: ${classStats.added} added, ${classStats.updated} updated, ${classStats.removed} removed`,
    );

    // If the scraper produced a matrix-of-days suggestion, map its
    // scrape-time IDs to the persisted class IDs so the client can show
    // per-class suggestions (opt-in) rather than applying them
    // automatically. `matrixByScrapedClassId` keys are the scraper UUIDs;
    // `classStats.idMap` remaps those to the persisted row UUIDs.
    const matrixByClassId: Record<string, { days: number[]; startTime?: string; endTime?: string } | undefined> = {};
    if (result.matrixByScrapedClassId) {
      for (const [scrapedId, entry] of Object.entries(result.matrixByScrapedClassId)) {
        const persisted = classStats.idMap.get(scrapedId);
        if (persisted) matrixByClassId[persisted] = entry;
      }
    }

    // The scraper assigns a fresh scrape-time UUID to each class, and each
    // assignment's classId points at that scrape-time UUID. But if a class
    // already existed in the sheet, syncClassesFromSource kept the OLD stable
    // UUID to preserve foreign-key integrity. We need to rewrite each
    // assignment's classId from scrape-time → persisted UUID before syncing
    // homework, or all updated classes' assignments would be orphaned.
    const remappedAssignments = result.assignments.map((a) => ({
      ...a,
      classId: classStats.idMap.get(a.classId) ?? a.classId,
    }));

    // Assignments: same approach. Homework IDs are preserved across re-imports
    // so the user's "completed" checkboxes and priority overrides survive.
    const hwStats = await syncHomeworkFromSource('powerschool', remappedAssignments);
    result.log.push(
      `Assignments: ${hwStats.added} added, ${hwStats.updated} updated, ${hwStats.removed} removed`,
    );

    // Mirror to server stdout so the same log is visible in the `next dev`
    // terminal. Useful when the browser is closed or when we want to tail a
    // scheduled run. Prefixed lines make it easy to grep out of the next
    // server output.
    console.log('=== PowerSchool sync ===');
    for (const line of result.log) console.log(`[ps] ${line}`);
    console.log('=== end sync ===');

    return Response.json({
      success: true,
      classCount: classStats.added + classStats.updated,
      classAdded: classStats.added,
      classUpdated: classStats.updated,
      classRemoved: classStats.removed,
      assignmentCount: hwStats.added + hwStats.updated,
      assignmentAdded: hwStats.added,
      assignmentUpdated: hwStats.updated,
      assignmentRemoved: hwStats.removed,
      log: result.log,
      // Optional suggestions keyed by the persisted class id (not the
      // scrape-time id). The client may offer these as an opt-in action in
      // the Schedule Wizard; the server does NOT apply them automatically.
      matrixByClassId,
    });
  } catch (error) {
    console.error('POST /api/powerschool error:', error);
    // Surface the scrape log if we got one — even when the write-phase
    // fails, the user needs to see what the scraper found so they can tell
    // whether the error was "didn't get any data" vs "got data but couldn't
    // save it". Quota errors, auth errors, and network blips all fall here.
    const log = result?.log ?? [];
    if (log.length > 0) {
      console.log('=== PowerSchool sync (errored after scrape) ===');
      for (const line of log) console.log(`[ps] ${line}`);
      console.log('=== end sync ===');
    }
    return Response.json({
      success: false,
      error: (error as Error).message,
      log,
    }, { status: 500 });
  }
}

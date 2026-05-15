// ============================================================
// GET /api/debug
// Diagnostic endpoint: dumps class IDs and how many homework
// rows point to each class. Helps trace classId mismatches.
// ============================================================
import { NextRequest } from 'next/server';
import { getClasses, getHomework } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const [classes, homework] = await Promise.all([getClasses(userId), getHomework(userId)]);

    const hwCountByClassId = new Map<string, number>();
    for (const h of homework) {
      hwCountByClassId.set(h.classId, (hwCountByClassId.get(h.classId) ?? 0) + 1);
    }

    const classReport = classes.map((c) => ({
      name: c.name,
      id: c.id,
      source: c.source,
      sourceId: c.sourceId,
      hwCount: hwCountByClassId.get(c.id) ?? 0,
    }));

    const knownIds = new Set(classes.map((c) => c.id));
    const orphaned = new Map<string, number>();
    for (const h of homework) {
      if (!knownIds.has(h.classId)) {
        orphaned.set(h.classId, (orphaned.get(h.classId) ?? 0) + 1);
      }
    }

    return Response.json({
      classes: classReport,
      orphanedClassIds: Object.fromEntries(orphaned),
      totalHomework: homework.length,
      totalClasses: classes.length,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

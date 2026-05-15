import { NextRequest } from 'next/server';
import { getClasses, updateClass } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';

function normalizeName(s?: string | null) {
  if (!s) return '';
  return String(s).replace(/ /g, ' ').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const classes = await getClasses(userId);

    const psByKey = new Map<string, { id: string; sourceId?: string }>();
    for (const c of classes) {
      if (c.source === 'powerschool') {
        const key = `${normalizeName(c.name)}||${c.period}`;
        psByKey.set(key, { id: c.id, sourceId: c.sourceId });
      }
    }

    let migrated = 0;
    for (const c of classes) {
      if (c.source === 'powerschool' || c.source === 'classroom') continue;
      if (!c.name || !c.period || Number(c.period) <= 0) continue;

      const key = `${normalizeName(c.name)}||${c.period}`;
      const match = psByKey.get(key);
      if (!match) continue;

      await updateClass({ ...c, source: 'powerschool', sourceId: match.sourceId ?? key }, userId);
      migrated++;
    }

    return Response.json({ success: true, migrated });
  } catch (err) {
    console.error('Migration error:', err);
    return Response.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}

import { NextRequest } from 'next/server';
import { getClasses, updateClass } from '@/lib/sheets';

// Simple migration endpoint: attempt to link existing manual rows to
// PowerSchool by normalizing names and matching period numbers. For every
// match we set source='powerschool' and sourceId to the scraped-style
// key (name||period). This is best-effort and intended as a one-time
// convenience to avoid duplicate classes after the first import.

function normalizeName(s?: string | null) {
  if (!s) return '';
  return String(s).replace(/\u00A0/g, ' ').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const classes = await getClasses();
    // Find classes that are already present from PowerSchool (the recent
    // import). We'll only link manual rows that clearly match one of these
    // persisted PowerSchool rows by normalized name + period. This avoids
    // tagging unrelated manual rows that don't actually exist in PowerSchool.
    const psByKey = new Map<string, { id: string; sourceId?: string }>();
    for (const pc of classes) {
      if (pc.source === 'powerschool') {
        const key = `${normalizeName(pc.name)}||${pc.period}`;
        psByKey.set(key, { id: pc.id, sourceId: pc.sourceId });
      }
    }
    let migrated = 0;
    for (const c of classes) {
      // Skip rows already tagged as powerschool/classroom
      if (c.source === 'powerschool' || c.source === 'classroom') continue;
      // Only consider rows with a plausible name and numeric period
      if (!c.name || !c.period || Number(c.period) <= 0) continue;
      const key = `${normalizeName(c.name)}||${c.period}`;
      const match = psByKey.get(key);
      if (!match) continue; // no corresponding PowerSchool class observed
      // Link to the observed PowerSchool class. Preserve schedule fields.
      const updated = { ...c, source: 'powerschool' as const, sourceId: match.sourceId ?? `${key}` };
      await updateClass(updated);
      migrated++;
    }
    return Response.json({ success: true, migrated });
  } catch (err) {
    console.error('Migration error:', err);
    return Response.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}

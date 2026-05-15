// ============================================================
// Neon (PostgreSQL) Database Layer
// ============================================================
import { neon } from '@neondatabase/serverless';
import type {
  SchoolClass,
  Homework,
  Exam,
  Task,
  ScheduleDisruption,
  PeriodOverride,
  AppSettings,
} from '@/types';

function getDb() {
  return neon(process.env.DATABASE_URL!);
}

// ---- Schema initialization ----

export async function initializeDatabase() {
  const sql = getDb();

  // Auth tables
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;

  // Data tables — created with user_id from the start for new installs
  await sql`
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      teacher TEXT NOT NULL DEFAULT '',
      room TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      period INTEGER NOT NULL DEFAULT 0,
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      days JSONB NOT NULL DEFAULT '[]',
      day_times JSONB,
      semester TEXT NOT NULL DEFAULT '',
      source TEXT,
      source_id TEXT,
      grade TEXT,
      grade_percent NUMERIC
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS homework (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      class_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT NOT NULL DEFAULT '',
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      priority TEXT NOT NULL DEFAULT 'medium',
      source TEXT NOT NULL DEFAULT 'manual',
      source_id TEXT,
      score TEXT,
      category TEXT,
      flags TEXT,
      score_percent NUMERIC
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      class_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT NOT NULL DEFAULT '',
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      priority TEXT NOT NULL DEFAULT 'medium',
      category TEXT NOT NULL DEFAULT 'General',
      class_id TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS disruptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      period_overrides JSONB NOT NULL DEFAULT '[]'
    )
  `;

  // Settings — composite PK (user_id, key) for new installs
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key)
    )
  `;

  // Migration: add user_id to existing tables that predate multi-user support
  await sql`ALTER TABLE classes ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE homework ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE exams ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE disruptions ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''`;

  // Migrate settings table PK from single-column (key) to composite (user_id, key)
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'settings' AND column_name = 'user_id'
      ) THEN
        ALTER TABLE settings ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
        ALTER TABLE settings ADD PRIMARY KEY (user_id, key);
      END IF;
    END $$
  `;
}

// ---- Row mappers ----

function dbToClass(row: Record<string, unknown>): SchoolClass {
  return {
    id: row.id as string,
    name: row.name as string,
    teacher: (row.teacher as string) || '',
    room: (row.room as string) || '',
    color: (row.color as string) || '',
    period: Number(row.period) || 0,
    startTime: (row.start_time as string) || '',
    endTime: (row.end_time as string) || '',
    days: (row.days as number[]) || [],
    dayTimes: (row.day_times as SchoolClass['dayTimes']) ?? undefined,
    semester: (row.semester as string) || '',
    source: (row.source as SchoolClass['source']) ?? undefined,
    sourceId: (row.source_id as string) || undefined,
    grade: (row.grade as string) || undefined,
    gradePercent: row.grade_percent != null ? Number(row.grade_percent) : undefined,
  };
}

function dbToHomework(row: Record<string, unknown>): Homework {
  return {
    id: row.id as string,
    classId: (row.class_id as string) || '',
    title: (row.title as string) || '',
    description: (row.description as string) || '',
    dueDate: (row.due_date as string) || '',
    completed: Boolean(row.completed),
    priority: (row.priority as Homework['priority']) || 'medium',
    source: (row.source as Homework['source']) || 'manual',
    sourceId: (row.source_id as string) || undefined,
    score: (row.score as string) || undefined,
    category: (row.category as string) || undefined,
    flags: (row.flags as string) || undefined,
    scorePercent: (() => {
      const n = Number(row.score_percent);
      return row.score_percent != null && Number.isFinite(n) ? n : undefined;
    })(),
  };
}

function dbToExam(row: Record<string, unknown>): Exam {
  return {
    id: row.id as string,
    classId: (row.class_id as string) || '',
    title: (row.title as string) || '',
    date: (row.date as string) || '',
    startTime: (row.start_time as string) || '',
    endTime: (row.end_time as string) || '',
    location: (row.location as string) || '',
    notes: (row.notes as string) || '',
  };
}

function dbToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: (row.title as string) || '',
    description: (row.description as string) || '',
    dueDate: (row.due_date as string) || '',
    completed: Boolean(row.completed),
    priority: (row.priority as Task['priority']) || 'medium',
    category: (row.category as string) || 'General',
    classId: (row.class_id as string) || undefined,
  };
}

function dbToDisruption(row: Record<string, unknown>): ScheduleDisruption {
  return {
    id: row.id as string,
    date: (row.date as string) || '',
    type: (row.type as ScheduleDisruption['type']),
    label: (row.label as string) || '',
    periodOverrides: (row.period_overrides as PeriodOverride[]) || [],
  };
}

// ---- Users ----

export interface DbUser {
  id: string;
  username: string;
  passwordHash: string;
}

export async function createUser(id: string, username: string, passwordHash: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO users (id, username, password_hash)
    VALUES (${id}, ${username.toLowerCase()}, ${passwordHash})
  `;
}

export async function getUserByUsername(username: string): Promise<DbUser | null> {
  const sql = getDb();
  const rows = await sql`SELECT id, username, password_hash FROM users WHERE username = ${username.toLowerCase()}`;
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  return { id: row.id as string, username: row.username as string, passwordHash: row.password_hash as string };
}

export async function getUserById(id: string): Promise<{ id: string; username: string } | null> {
  const sql = getDb();
  const rows = await sql`SELECT id, username FROM users WHERE id = ${id}`;
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  return { id: row.id as string, username: row.username as string };
}

// ---- Sessions ----

export async function createDbSession(id: string, userId: string, expiresAt: Date): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (${id}, ${userId}, ${expiresAt.toISOString()})
  `;
}

export async function getDbSession(id: string): Promise<{ userId: string; expiresAt: Date } | null> {
  const sql = getDb();
  const rows = await sql`SELECT user_id, expires_at FROM sessions WHERE id = ${id}`;
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  return { userId: row.user_id as string, expiresAt: new Date(row.expires_at as string) };
}

export async function deleteDbSession(id: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM sessions WHERE id = ${id}`;
}

// ---- Classes ----

export async function getClasses(userId: string): Promise<SchoolClass[]> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM classes WHERE user_id = ${userId} ORDER BY period, name`;
  return rows.map((r) => dbToClass(r as Record<string, unknown>));
}

export async function getClassById(id: string, userId: string): Promise<SchoolClass | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM classes WHERE id = ${id} AND user_id = ${userId}`;
  return rows.length > 0 ? dbToClass(rows[0] as Record<string, unknown>) : null;
}

export async function addClass(c: SchoolClass, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO classes (id, user_id, name, teacher, room, color, period, start_time, end_time, days, day_times, semester, source, source_id, grade, grade_percent)
    VALUES (
      ${c.id}, ${userId}, ${c.name}, ${c.teacher}, ${c.room}, ${c.color}, ${c.period},
      ${c.startTime}, ${c.endTime}, ${JSON.stringify(c.days)}::jsonb,
      ${c.dayTimes ? JSON.stringify(c.dayTimes) : null}::jsonb,
      ${c.semester}, ${c.source ?? null}, ${c.sourceId ?? null},
      ${c.grade ?? null}, ${c.gradePercent ?? null}
    )
  `;
}

export async function updateClass(c: SchoolClass, userId: string): Promise<void> {
  const sql = getDb();
  if (c.dayTimes === undefined) {
    await sql`
      UPDATE classes SET
        name = ${c.name}, teacher = ${c.teacher}, room = ${c.room},
        color = ${c.color}, period = ${c.period}, start_time = ${c.startTime},
        end_time = ${c.endTime}, days = ${JSON.stringify(c.days)}::jsonb,
        semester = ${c.semester}, source = ${c.source ?? null},
        source_id = ${c.sourceId ?? null}, grade = ${c.grade ?? null},
        grade_percent = ${c.gradePercent ?? null}
      WHERE id = ${c.id} AND user_id = ${userId}
    `;
  } else {
    await sql`
      UPDATE classes SET
        name = ${c.name}, teacher = ${c.teacher}, room = ${c.room},
        color = ${c.color}, period = ${c.period}, start_time = ${c.startTime},
        end_time = ${c.endTime}, days = ${JSON.stringify(c.days)}::jsonb,
        day_times = ${c.dayTimes ? JSON.stringify(c.dayTimes) : null}::jsonb,
        semester = ${c.semester}, source = ${c.source ?? null},
        source_id = ${c.sourceId ?? null}, grade = ${c.grade ?? null},
        grade_percent = ${c.gradePercent ?? null}
      WHERE id = ${c.id} AND user_id = ${userId}
    `;
  }
}

export async function deleteClass(id: string, userId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM classes WHERE id = ${id} AND user_id = ${userId}`;
}

// ---- Homework ----

export async function getHomework(userId: string): Promise<Homework[]> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM homework WHERE user_id = ${userId} ORDER BY due_date, title`;
  return rows.map((r) => dbToHomework(r as Record<string, unknown>));
}

export async function addHomework(h: Homework, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO homework (id, user_id, class_id, title, description, due_date, completed, priority, source, source_id, score, category, flags, score_percent)
    VALUES (
      ${h.id}, ${userId}, ${h.classId}, ${h.title}, ${h.description}, ${h.dueDate},
      ${h.completed}, ${h.priority}, ${h.source}, ${h.sourceId ?? null},
      ${h.score ?? null}, ${h.category ?? null}, ${h.flags ?? null},
      ${h.scorePercent ?? null}
    )
  `;
}

export async function updateHomework(h: Homework, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE homework SET
      class_id = ${h.classId}, title = ${h.title}, description = ${h.description},
      due_date = ${h.dueDate}, completed = ${h.completed}, priority = ${h.priority},
      source = ${h.source}, source_id = ${h.sourceId ?? null}, score = ${h.score ?? null},
      category = ${h.category ?? null}, flags = ${h.flags ?? null},
      score_percent = ${h.scorePercent ?? null}
    WHERE id = ${h.id} AND user_id = ${userId}
  `;
}

export async function deleteHomework(id: string, userId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM homework WHERE id = ${id} AND user_id = ${userId}`;
}

// ---- Exams ----

export async function getExams(userId: string): Promise<Exam[]> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM exams WHERE user_id = ${userId} ORDER BY date, start_time`;
  return rows.map((r) => dbToExam(r as Record<string, unknown>));
}

export async function addExam(e: Exam, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO exams (id, user_id, class_id, title, date, start_time, end_time, location, notes)
    VALUES (${e.id}, ${userId}, ${e.classId}, ${e.title}, ${e.date}, ${e.startTime}, ${e.endTime}, ${e.location}, ${e.notes})
  `;
}

export async function updateExam(e: Exam, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE exams SET
      class_id = ${e.classId}, title = ${e.title}, date = ${e.date},
      start_time = ${e.startTime}, end_time = ${e.endTime},
      location = ${e.location}, notes = ${e.notes}
    WHERE id = ${e.id} AND user_id = ${userId}
  `;
}

export async function deleteExam(id: string, userId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM exams WHERE id = ${id} AND user_id = ${userId}`;
}

// ---- Tasks ----

export async function getTasks(userId: string): Promise<Task[]> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM tasks WHERE user_id = ${userId} ORDER BY due_date, title`;
  return rows.map((r) => dbToTask(r as Record<string, unknown>));
}

export async function addTask(t: Task, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO tasks (id, user_id, title, description, due_date, completed, priority, category, class_id)
    VALUES (${t.id}, ${userId}, ${t.title}, ${t.description}, ${t.dueDate}, ${t.completed}, ${t.priority}, ${t.category}, ${t.classId ?? null})
  `;
}

export async function updateTask(t: Task, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE tasks SET
      title = ${t.title}, description = ${t.description}, due_date = ${t.dueDate},
      completed = ${t.completed}, priority = ${t.priority}, category = ${t.category},
      class_id = ${t.classId ?? null}
    WHERE id = ${t.id} AND user_id = ${userId}
  `;
}

export async function deleteTask(id: string, userId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM tasks WHERE id = ${id} AND user_id = ${userId}`;
}

export async function deleteTasksBatch(ids: string[], userId: string): Promise<number> {
  if (ids.length === 0) return 0;
  const sql = getDb();
  await sql`DELETE FROM tasks WHERE id = ANY(${ids}) AND user_id = ${userId}`;
  return ids.length;
}

// ---- Disruptions ----

export async function getDisruptions(userId: string): Promise<ScheduleDisruption[]> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM disruptions WHERE user_id = ${userId} ORDER BY date`;
  return rows.map((r) => dbToDisruption(r as Record<string, unknown>));
}

export async function addDisruption(d: ScheduleDisruption, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO disruptions (id, user_id, date, type, label, period_overrides)
    VALUES (${d.id}, ${userId}, ${d.date}, ${d.type}, ${d.label}, ${JSON.stringify(d.periodOverrides)}::jsonb)
  `;
}

export async function updateDisruption(d: ScheduleDisruption, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE disruptions SET
      date = ${d.date}, type = ${d.type}, label = ${d.label},
      period_overrides = ${JSON.stringify(d.periodOverrides)}::jsonb
    WHERE id = ${d.id} AND user_id = ${userId}
  `;
}

export async function deleteDisruption(id: string, userId: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM disruptions WHERE id = ${id} AND user_id = ${userId}`;
}

// ---- Settings ----

export async function getSettings(userId: string): Promise<Partial<AppSettings>> {
  const sql = getDb();
  const rows = await sql`SELECT key, value FROM settings WHERE user_id = ${userId}`;
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key as string;
    const value = row.value as string;
    if (key === 'lunchTimes' && value) {
      try { settings[key] = JSON.parse(value); } catch { settings[key] = value; }
    } else {
      settings[key] = value;
    }
  }
  return settings as Partial<AppSettings>;
}

export async function setSetting(key: string, value: string, userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO settings (user_id, key, value) VALUES (${userId}, ${key}, ${value})
    ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value
  `;
}

// ---- Sync helpers (PowerSchool / Classroom imports) ----

const normalizeName = (s?: string | null) =>
  s ? s.replace(/ /g, ' ').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase() : '';

export async function syncClassesFromSource(
  source: 'powerschool' | 'classroom',
  incoming: SchoolClass[],
  userId: string,
): Promise<{ added: number; updated: number; removed: number; idMap: Map<string, string> }> {
  const sql = getDb();

  const allRows = await sql`SELECT * FROM classes WHERE user_id = ${userId}`;
  const all = allRows.map((r) => dbToClass(r as Record<string, unknown>));

  const fromSource = all.filter((c) => c.source === source);
  const bySourceId = new Map<string, SchoolClass>();
  for (const c of fromSource) {
    if (c.sourceId && !bySourceId.has(c.sourceId)) bySourceId.set(c.sourceId, c);
  }

  let added = 0;
  let updated = 0;
  const keptIds = new Set<string>();
  const idMap = new Map<string, string>();

  if (source === 'powerschool') {
    const manualMap = new Map<string, SchoolClass>();
    for (const c of all) {
      if (c.source === 'powerschool') continue;
      const key = `${normalizeName(c.name)}||${c.period || ''}`;
      if (!manualMap.has(key)) manualMap.set(key, c);
    }

    for (const cls of incoming) {
      let prior = cls.sourceId ? bySourceId.get(cls.sourceId) : undefined;
      if (!prior) {
        const key = `${normalizeName(cls.name)}||${cls.period || ''}`;
        prior = manualMap.get(key);
      }

      if (prior) {
        const merged: SchoolClass = {
          ...prior,
          ...cls,
          id: prior.id,
          color: prior.color || cls.color,
          source,
          sourceId: cls.sourceId,
        };
        if (prior.days?.length) merged.days = prior.days;
        if (prior.startTime?.trim()) merged.startTime = prior.startTime;
        if (prior.endTime?.trim()) merged.endTime = prior.endTime;
        if (prior.dayTimes && Object.keys(prior.dayTimes).length > 0) merged.dayTimes = prior.dayTimes;
        if (prior.period && Number(prior.period) > 0) merged.period = prior.period;

        await sql`
          UPDATE classes SET
            name = ${merged.name}, teacher = ${merged.teacher}, room = ${merged.room},
            color = ${merged.color}, period = ${merged.period},
            start_time = ${merged.startTime}, end_time = ${merged.endTime},
            days = ${JSON.stringify(merged.days)}::jsonb,
            day_times = ${merged.dayTimes ? JSON.stringify(merged.dayTimes) : null}::jsonb,
            semester = ${merged.semester}, source = ${merged.source ?? null},
            source_id = ${merged.sourceId ?? null}, grade = ${merged.grade ?? null},
            grade_percent = ${merged.gradePercent ?? null}
          WHERE id = ${merged.id} AND user_id = ${userId}
        `;
        idMap.set(cls.id, prior.id);
        keptIds.add(prior.id);
        updated++;
      } else {
        await sql`
          INSERT INTO classes (id, user_id, name, teacher, room, color, period, start_time, end_time, days, day_times, semester, source, source_id, grade, grade_percent)
          VALUES (
            ${cls.id}, ${userId}, ${cls.name}, ${cls.teacher}, ${cls.room}, ${cls.color}, ${cls.period},
            ${cls.startTime}, ${cls.endTime}, ${JSON.stringify(cls.days)}::jsonb,
            ${cls.dayTimes ? JSON.stringify(cls.dayTimes) : null}::jsonb,
            ${cls.semester}, ${source}, ${cls.sourceId ?? null},
            ${cls.grade ?? null}, ${cls.gradePercent ?? null}
          )
        `;
        idMap.set(cls.id, cls.id);
        keptIds.add(cls.id);
        added++;
      }
    }

    const toDelete = all.filter((c) => !keptIds.has(c.id)).map((c) => c.id);
    if (toDelete.length > 0) {
      await sql`DELETE FROM classes WHERE id = ANY(${toDelete}) AND user_id = ${userId}`;
    }
    return { added, updated, removed: toDelete.length, idMap };
  }

  // Classroom (and future sources)
  for (const cls of incoming) {
    if (!cls.sourceId) {
      await sql`
        INSERT INTO classes (id, user_id, name, teacher, room, color, period, start_time, end_time, days, day_times, semester, source, source_id, grade, grade_percent)
        VALUES (
          ${cls.id}, ${userId}, ${cls.name}, ${cls.teacher}, ${cls.room}, ${cls.color}, ${cls.period},
          ${cls.startTime}, ${cls.endTime}, ${JSON.stringify(cls.days)}::jsonb,
          ${cls.dayTimes ? JSON.stringify(cls.dayTimes) : null}::jsonb,
          ${cls.semester}, ${source}, ${null},
          ${cls.grade ?? null}, ${cls.gradePercent ?? null}
        )
      `;
      idMap.set(cls.id, cls.id);
      added++;
      continue;
    }

    let prior = bySourceId.get(cls.sourceId);
    if (!prior) {
      const norm = normalizeName(cls.name);
      prior = all.find((c) => {
        if (c.source === source) return false;
        if ((c.period || 0) !== (cls.period || 0)) return false;
        return normalizeName(c.name) === norm;
      });
    }

    if (prior) {
      const merged: SchoolClass = {
        ...prior,
        ...cls,
        id: prior.id,
        color: prior.color || cls.color,
        source,
        sourceId: cls.sourceId,
      };
      if (prior.days?.length) merged.days = prior.days;
      if (prior.startTime?.trim()) merged.startTime = prior.startTime;
      if (prior.endTime?.trim()) merged.endTime = prior.endTime;
      if (prior.dayTimes && Object.keys(prior.dayTimes).length > 0) merged.dayTimes = prior.dayTimes;
      if (prior.period && Number(prior.period) > 0) merged.period = prior.period;

      await sql`
        UPDATE classes SET
          name = ${merged.name}, teacher = ${merged.teacher}, room = ${merged.room},
          color = ${merged.color}, period = ${merged.period},
          start_time = ${merged.startTime}, end_time = ${merged.endTime},
          days = ${JSON.stringify(merged.days)}::jsonb,
          day_times = ${merged.dayTimes ? JSON.stringify(merged.dayTimes) : null}::jsonb,
          semester = ${merged.semester}, source = ${merged.source ?? null},
          source_id = ${merged.sourceId ?? null}, grade = ${merged.grade ?? null},
          grade_percent = ${merged.gradePercent ?? null}
        WHERE id = ${merged.id} AND user_id = ${userId}
      `;
      idMap.set(cls.id, prior.id);
      keptIds.add(prior.id);
      updated++;
    } else {
      await sql`
        INSERT INTO classes (id, user_id, name, teacher, room, color, period, start_time, end_time, days, day_times, semester, source, source_id, grade, grade_percent)
        VALUES (
          ${cls.id}, ${userId}, ${cls.name}, ${cls.teacher}, ${cls.room}, ${cls.color}, ${cls.period},
          ${cls.startTime}, ${cls.endTime}, ${JSON.stringify(cls.days)}::jsonb,
          ${cls.dayTimes ? JSON.stringify(cls.dayTimes) : null}::jsonb,
          ${cls.semester}, ${source}, ${cls.sourceId ?? null},
          ${cls.grade ?? null}, ${cls.gradePercent ?? null}
        )
      `;
      idMap.set(cls.id, cls.id);
      added++;
    }
  }

  const toDelete = fromSource.filter((c) => !keptIds.has(c.id)).map((c) => c.id);
  if (toDelete.length > 0) {
    await sql`DELETE FROM classes WHERE id = ANY(${toDelete}) AND user_id = ${userId}`;
  }
  return { added, updated, removed: toDelete.length, idMap };
}

export async function syncHomeworkFromSource(
  source: 'powerschool' | 'classroom',
  incoming: Homework[],
  userId: string,
): Promise<{ added: number; updated: number; removed: number }> {
  const sql = getDb();

  const existingRows = await sql`SELECT * FROM homework WHERE source = ${source} AND user_id = ${userId}`;
  const existing = existingRows.map((r) => dbToHomework(r as Record<string, unknown>));

  const bySourceId = new Map<string, Homework>();
  for (const hw of existing) {
    if (hw.sourceId && !bySourceId.has(hw.sourceId)) bySourceId.set(hw.sourceId, hw);
  }

  let added = 0;
  let updated = 0;
  const keptIds = new Set<string>();

  for (const hw of incoming) {
    if (!hw.sourceId) {
      await sql`
        INSERT INTO homework (id, user_id, class_id, title, description, due_date, completed, priority, source, source_id, score, category, flags, score_percent)
        VALUES (
          ${hw.id}, ${userId}, ${hw.classId}, ${hw.title}, ${hw.description}, ${hw.dueDate},
          ${hw.completed}, ${hw.priority}, ${source}, ${null},
          ${hw.score ?? null}, ${hw.category ?? null}, ${hw.flags ?? null}, ${hw.scorePercent ?? null}
        )
      `;
      added++;
      continue;
    }

    const prior = bySourceId.get(hw.sourceId);
    if (prior) {
      const merged: Homework = {
        ...prior,
        ...hw,
        id: prior.id,
        completed: prior.completed,
        priority: prior.priority,
        source,
      };
      await sql`
        UPDATE homework SET
          class_id = ${merged.classId}, title = ${merged.title},
          description = ${merged.description}, due_date = ${merged.dueDate},
          completed = ${merged.completed}, priority = ${merged.priority},
          source = ${merged.source}, source_id = ${merged.sourceId ?? null},
          score = ${merged.score ?? null}, category = ${merged.category ?? null},
          flags = ${merged.flags ?? null}, score_percent = ${merged.scorePercent ?? null}
        WHERE id = ${merged.id} AND user_id = ${userId}
      `;
      keptIds.add(prior.id);
      updated++;
    } else {
      await sql`
        INSERT INTO homework (id, user_id, class_id, title, description, due_date, completed, priority, source, source_id, score, category, flags, score_percent)
        VALUES (
          ${hw.id}, ${userId}, ${hw.classId}, ${hw.title}, ${hw.description}, ${hw.dueDate},
          ${hw.completed}, ${hw.priority}, ${source}, ${hw.sourceId ?? null},
          ${hw.score ?? null}, ${hw.category ?? null}, ${hw.flags ?? null}, ${hw.scorePercent ?? null}
        )
      `;
      added++;
    }
  }

  const toDelete = existing.filter((hw) => !keptIds.has(hw.id)).map((hw) => hw.id);
  if (toDelete.length > 0) {
    await sql`DELETE FROM homework WHERE id = ANY(${toDelete}) AND user_id = ${userId}`;
  }
  return { added, updated, removed: toDelete.length };
}

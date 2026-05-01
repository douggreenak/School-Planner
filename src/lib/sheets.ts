// ============================================================
// Google Sheets Database Layer
// ============================================================
import { google, sheets_v4 } from 'googleapis';
import { getConfig } from './config';
import type {
  SchoolClass,
  Homework,
  Exam,
  Task,
  ScheduleDisruption,
  PeriodOverride,
  AppSettings,
  SheetName,
} from '@/types';

// --------------- Auth ---------------

function getAuth() {
  const cfg = getConfig();
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: cfg.googleServiceAccountEmail,
      private_key: cfg.googlePrivateKey?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheets(): sheets_v4.Sheets {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

const SPREADSHEET_ID = () => {
  const cfg = getConfig();
  return cfg.googleSpreadsheetId!;
};

// --------------- Helpers ---------------

async function getRows(sheet: SheetName): Promise<string[][]> {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID(),
    range: `${sheet}!A:Z`,
  });
  return (res.data.values as string[][]) ?? [];
}

async function appendRow(sheet: SheetName, values: string[]) {
  await getSheets().spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID(),
    range: `${sheet}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
}

async function updateRow(sheet: SheetName, rowIndex: number, values: string[]) {
  await getSheets().spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID(),
    range: `${sheet}!A${rowIndex}:Z${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
}

/**
 * Append many rows in a single API call. Critical for bulk sync — the
 * Sheets API enforces a 60-write-requests-per-minute-per-user quota, and
 * importing a full PowerSchool gradebook (hundreds of assignments) blew
 * past that with one-row-per-call appends. This collapses N appends into 1.
 */
async function appendRows(sheet: SheetName, rows: string[][]) {
  if (rows.length === 0) return;
  await getSheets().spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID(),
    range: `${sheet}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

/**
 * Update many rows in a single API call via `values.batchUpdate`. Each
 * entry in `updates` becomes one range in the batch. Same rationale as
 * appendRows — collapses N updates into 1.
 */
async function batchUpdateRows(
  sheet: SheetName,
  updates: { rowIndex: number; values: string[] }[],
) {
  if (updates.length === 0) return;
  await getSheets().spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: updates.map(({ rowIndex, values }) => ({
        range: `${sheet}!A${rowIndex}:Z${rowIndex}`,
        values: [values],
      })),
    },
  });
}

async function deleteRow(sheet: SheetName, rowIndex: number) {
  const sheetId = await getSheetId(sheet);
  await getSheets().spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex,
            },
          },
        },
      ],
    },
  });
}

async function getSheetId(sheetName: string): Promise<number> {
  const res = await getSheets().spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID(),
  });
  const sheet = res.data.sheets?.find(
    (s) => s.properties?.title === sheetName
  );
  return sheet?.properties?.sheetId ?? 0;
}

// --------------- Initialize Spreadsheet ---------------

export async function initializeSpreadsheet() {
  const sheets = getSheets();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID(),
  });
  const existing = spreadsheet.data.sheets?.map((s) => s.properties?.title) ?? [];

  const requiredSheets: { name: SheetName; headers: string[] }[] = [
    {
      name: 'Classes',
      headers: ['id', 'name', 'teacher', 'room', 'color', 'period', 'startTime', 'endTime', 'days', 'semester', 'source', 'sourceId', 'grade', 'gradePercent'],
    },
    {
      name: 'Homework',
      headers: ['id', 'classId', 'title', 'description', 'dueDate', 'completed', 'priority', 'source', 'sourceId', 'score', 'category', 'flags', 'scorePercent'],
    },
    {
      name: 'Exams',
      headers: ['id', 'classId', 'title', 'date', 'startTime', 'endTime', 'location', 'notes', 'reminder'],
    },
    {
      name: 'Tasks',
      headers: ['id', 'title', 'description', 'dueDate', 'completed', 'priority', 'category'],
    },
    {
      name: 'Disruptions',
      headers: ['id', 'date', 'type', 'label', 'periodOverrides'],
    },
    {
      name: 'Settings',
      headers: ['key', 'value'],
    },
  ];

  for (const { name, headers } of requiredSheets) {
    if (!existing.includes(name)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID(),
        requestBody: {
          requests: [{ addSheet: { properties: { title: name } } }],
        },
      });
      await appendRow(name, headers);
    }
  }
}

// --------------- Classes ---------------

function rowToClass(row: string[]): SchoolClass {
  return {
    id: row[0],
    name: row[1],
    teacher: row[2],
    room: row[3],
    color: row[4],
    period: parseInt(row[5], 10),
    startTime: row[6],
    endTime: row[7],
    days: JSON.parse(row[8] || '[]'),
    semester: row[9],
    source: (row[10] as SchoolClass['source']) || undefined,
    sourceId: row[11] || undefined,
    grade: row[12] || undefined,
    gradePercent: row[13] ? parseFloat(row[13]) : undefined,
  };
}

function classToRow(c: SchoolClass): string[] {
  return [
    c.id,
    c.name,
    c.teacher,
    c.room,
    c.color,
    String(c.period),
    c.startTime,
    c.endTime,
    JSON.stringify(c.days),
    c.semester,
    c.source ?? '',
    c.sourceId ?? '',
    c.grade ?? '',
    c.gradePercent != null ? String(c.gradePercent) : '',
  ];
}

export async function getClasses(): Promise<SchoolClass[]> {
  const rows = await getRows('Classes');
  return rows.slice(1).map(rowToClass);
}

export async function getClassById(id: string): Promise<SchoolClass | null> {
  const classes = await getClasses();
  return classes.find((c) => c.id === id) ?? null;
}

export async function addClass(c: SchoolClass) {
  await appendRow('Classes', classToRow(c));
}

export async function updateClass(c: SchoolClass) {
  const rows = await getRows('Classes');
  const idx = rows.findIndex((r) => r[0] === c.id);
  if (idx > 0) await updateRow('Classes', idx + 1, classToRow(c));
}

export async function deleteClass(id: string) {
  const rows = await getRows('Classes');
  const idx = rows.findIndex((r) => r[0] === id);
  if (idx > 0) await deleteRow('Classes', idx + 1);
}

// --------------- Homework ---------------

function rowToHomework(row: string[]): Homework {
  return {
    id: row[0],
    classId: row[1],
    title: row[2],
    description: row[3],
    dueDate: row[4],
    completed: row[5] === 'true',
    priority: (row[6] as Homework['priority']) || 'medium',
    source: (row[7] as Homework['source']) || 'manual',
    sourceId: row[8] || undefined,
    score: row[9] || undefined,
    category: row[10] || undefined,
    // Older sheets predate this column — row[11] will be undefined for them,
    // which turns into `undefined` here. Additive, no migration required.
    flags: row[11] || undefined,
    // Same story for scorePercent — new column, empty on old rows. Guard
    // against non-numeric strings ("NaN", corrupted data) turning into a
    // NaN that would confuse the client-side `?? parseScorePercent` fallback
    // (NaN isn't nullish, so ?? wouldn't fire).
    scorePercent: (() => {
      const raw = row[12];
      if (raw === undefined || raw === '') return undefined;
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : undefined;
    })(),
  };
}

function homeworkToRow(h: Homework): string[] {
  return [
    h.id,
    h.classId,
    h.title,
    h.description,
    h.dueDate,
    String(h.completed),
    h.priority,
    h.source,
    h.sourceId ?? '',
    h.score ?? '',
    h.category ?? '',
    h.flags ?? '',
    h.scorePercent != null ? String(h.scorePercent) : '',
  ];
}

export async function getHomework(): Promise<Homework[]> {
  const rows = await getRows('Homework');
  return rows.slice(1).map(rowToHomework);
}

export async function addHomework(h: Homework) {
  await appendRow('Homework', homeworkToRow(h));
}

export async function updateHomework(h: Homework) {
  const rows = await getRows('Homework');
  const idx = rows.findIndex((r) => r[0] === h.id);
  if (idx > 0) await updateRow('Homework', idx + 1, homeworkToRow(h));
}

export async function deleteHomework(id: string) {
  const rows = await getRows('Homework');
  const idx = rows.findIndex((r) => r[0] === id);
  if (idx > 0) await deleteRow('Homework', idx + 1);
}

// --------------- Bulk sync helpers (for PowerSchool / Classroom imports) ---------------

/**
 * Delete a set of rows from a sheet in a single batchUpdate.
 * Indices are 1-based (header = 1, first data row = 2). We sort descending
 * so deleting a lower row doesn't shift the indices of rows we're about to
 * delete next.
 */
async function deleteRowsBatch(sheet: SheetName, rowIndices: number[]) {
  if (rowIndices.length === 0) return;
  const sheetId = await getSheetId(sheet);
  const sorted = [...new Set(rowIndices)].sort((a, b) => b - a);
  await getSheets().spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody: {
      requests: sorted.map((rowIdx) => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: rowIdx - 1,
            endIndex: rowIdx,
          },
        },
      })),
    },
  });
}

/**
 * Sync classes from an external source (PowerSchool / Classroom) into the Classes sheet.
 *
 * The guarantee: after a successful sync, every row tagged with this source is a class
 * that appeared in `incoming`. No duplicates, no ghosts, no abandoned rows from old
 * buggy imports. Manual user classes (source='manual' or undefined) are never touched.
 *
 * Matching:
 *   - Rows match by sourceId. The first existing row with a given sourceId is updated
 *     in place, preserving the stable UUID + user-customized color.
 *   - Any additional existing rows (duplicates, no sourceId, or orphans with stale IDs)
 *     are deleted so there's exactly one row per incoming class.
 *
 * Returns stats about what was added/updated/removed, plus an `idMap` mapping each
 * incoming class's scrape-time UUID to the UUID actually persisted in the sheet.
 * For updated classes the persisted UUID is the PRE-EXISTING one (kept stable so
 * foreign keys don't break); for new classes it's the scrape-time UUID itself.
 * Callers MUST use this map to rewrite `classId` on any child rows (like homework)
 * before syncing them, or those rows will be orphaned.
 */
export async function syncClassesFromSource(
  source: 'powerschool' | 'classroom',
  incoming: SchoolClass[],
): Promise<{ added: number; updated: number; removed: number; idMap: Map<string, string> }> {
  // Load everything up-front so updates and deletes can work from a single snapshot
  // instead of re-fetching the whole sheet N times.
  const rows = await getRows('Classes');
  const existing: { cls: SchoolClass; rowIdx: number }[] = rows
    .slice(1)
    .map((r, i) => ({ cls: rowToClass(r), rowIdx: i + 2 })); // +2: header is row 1, data starts at 2

  const existingFromSource = existing.filter((e) => e.cls.source === source);

  // Map sourceId → first matching existing row (others with same sourceId become duplicates
  // that we'll delete). Entries with no sourceId are tracked separately for removal.
  const bySourceId = new Map<string, { cls: SchoolClass; rowIdx: number }>();
  for (const e of existingFromSource) {
    if (e.cls.sourceId && !bySourceId.has(e.cls.sourceId)) {
      bySourceId.set(e.cls.sourceId, e);
    }
  }

  let added = 0;
  let updated = 0;
  const keptRowIds = new Set<string>();
  // scrape-time id → persisted id (so homework foreign keys stay valid)
  const idMap = new Map<string, string>();

  // Collect updates + appends so we can batch them into two API calls total
  // (instead of one call per row). The Sheets API caps write requests at
  // 60/min/user — a full PowerSchool import plus its assignments breaks that
  // trivially when each row is its own HTTP call.
  const toUpdate: { rowIndex: number; values: string[] }[] = [];
  const toAppend: string[][] = [];

  for (const cls of incoming) {
    if (!cls.sourceId) {
      // Incoming class has no stable key — just append. Can't dedupe it against
      // existing rows, so treat every such class as brand new each sync.
      toAppend.push(classToRow({ ...cls, source }));
      idMap.set(cls.id, cls.id);
      added++;
      continue;
    }
    const prior = bySourceId.get(cls.sourceId);
    if (prior) {
      // Update in place, keeping the user's chosen color and the stable UUID
      // (so homework foreign keys remain valid).
      const merged: SchoolClass = {
        ...prior.cls,
        ...cls,
        id: prior.cls.id,
        color: prior.cls.color || cls.color,
        source,
      };
      toUpdate.push({ rowIndex: prior.rowIdx, values: classToRow(merged) });
      idMap.set(cls.id, prior.cls.id);
      updated++;
      keptRowIds.add(prior.cls.id);
    } else {
      toAppend.push(classToRow({ ...cls, source }));
      idMap.set(cls.id, cls.id);
      added++;
    }
  }

  // Flush: one batchUpdate for updates, one append for new rows.
  await batchUpdateRows('Classes', toUpdate);
  await appendRows('Classes', toAppend);

  // Anything tagged with this source that we did NOT just update is either:
  //   (a) a class no longer in PowerSchool,
  //   (b) a duplicate of a row we kept (same sourceId appearing twice),
  //   (c) an old broken import with empty or grade-shaped sourceId.
  // All three should be removed — the user explicitly opted in to mirror PowerSchool.
  const rowsToDelete: number[] = [];
  for (const e of existingFromSource) {
    if (keptRowIds.has(e.cls.id)) continue;
    rowsToDelete.push(e.rowIdx);
  }
  await deleteRowsBatch('Classes', rowsToDelete);

  return { added, updated, removed: rowsToDelete.length, idMap };
}

/**
 * Sync homework from an external source into the Homework sheet.
 *
 * Same guarantee as syncClassesFromSource: after a successful sync, every row tagged
 * with this source appeared in `incoming` and there are no duplicates. Manual user
 * homework is never touched.
 *
 * Preserves local user edits (completed state, priority) across re-imports.
 */
export async function syncHomeworkFromSource(
  source: 'powerschool' | 'classroom',
  incoming: Homework[],
): Promise<{ added: number; updated: number; removed: number }> {
  const rows = await getRows('Homework');
  const existing: { hw: Homework; rowIdx: number }[] = rows
    .slice(1)
    .map((r, i) => ({ hw: rowToHomework(r), rowIdx: i + 2 }));

  const existingFromSource = existing.filter((e) => e.hw.source === source);
  const bySourceId = new Map<string, { hw: Homework; rowIdx: number }>();
  for (const e of existingFromSource) {
    if (e.hw.sourceId && !bySourceId.has(e.hw.sourceId)) {
      bySourceId.set(e.hw.sourceId, e);
    }
  }

  let added = 0;
  let updated = 0;
  const keptRowIds = new Set<string>();

  // Same batching story as syncClassesFromSource — assignments are the big
  // one (potentially hundreds per sync), so per-row appends here are what
  // trip the 60/min Sheets write quota in practice.
  const toUpdate: { rowIndex: number; values: string[] }[] = [];
  const toAppend: string[][] = [];

  for (const hw of incoming) {
    if (!hw.sourceId) {
      toAppend.push(homeworkToRow({ ...hw, source }));
      added++;
      continue;
    }
    const prior = bySourceId.get(hw.sourceId);
    if (prior) {
      // Preserve the user's local edits — they may have manually checked off
      // an assignment or bumped its priority regardless of what PowerSchool says.
      const merged: Homework = {
        ...prior.hw,
        ...hw,
        id: prior.hw.id,
        completed: prior.hw.completed,
        priority: prior.hw.priority,
        source,
      };
      toUpdate.push({ rowIndex: prior.rowIdx, values: homeworkToRow(merged) });
      updated++;
      keptRowIds.add(prior.hw.id);
    } else {
      toAppend.push(homeworkToRow({ ...hw, source }));
      added++;
    }
  }

  await batchUpdateRows('Homework', toUpdate);
  await appendRows('Homework', toAppend);

  const rowsToDelete: number[] = [];
  for (const e of existingFromSource) {
    if (keptRowIds.has(e.hw.id)) continue;
    rowsToDelete.push(e.rowIdx);
  }
  await deleteRowsBatch('Homework', rowsToDelete);

  return { added, updated, removed: rowsToDelete.length };
}

// --------------- Exams ---------------

function rowToExam(row: string[]): Exam {
  return {
    id: row[0],
    classId: row[1],
    title: row[2],
    date: row[3],
    startTime: row[4],
    endTime: row[5],
    location: row[6],
    notes: row[7],
    reminder: parseInt(row[8], 10) || 30,
  };
}

function examToRow(e: Exam): string[] {
  return [e.id, e.classId, e.title, e.date, e.startTime, e.endTime, e.location, e.notes, String(e.reminder)];
}

export async function getExams(): Promise<Exam[]> {
  const rows = await getRows('Exams');
  return rows.slice(1).map(rowToExam);
}

export async function addExam(e: Exam) {
  await appendRow('Exams', examToRow(e));
}

export async function updateExam(e: Exam) {
  const rows = await getRows('Exams');
  const idx = rows.findIndex((r) => r[0] === e.id);
  if (idx > 0) await updateRow('Exams', idx + 1, examToRow(e));
}

export async function deleteExam(id: string) {
  const rows = await getRows('Exams');
  const idx = rows.findIndex((r) => r[0] === id);
  if (idx > 0) await deleteRow('Exams', idx + 1);
}

// --------------- Tasks ---------------

function rowToTask(row: string[]): Task {
  return {
    id: row[0],
    title: row[1],
    description: row[2],
    dueDate: row[3],
    completed: row[4] === 'true',
    priority: (row[5] as Task['priority']) || 'medium',
    category: row[6] || 'General',
  };
}

function taskToRow(t: Task): string[] {
  return [t.id, t.title, t.description, t.dueDate, String(t.completed), t.priority, t.category];
}

export async function getTasks(): Promise<Task[]> {
  const rows = await getRows('Tasks');
  return rows.slice(1).map(rowToTask);
}

export async function addTask(t: Task) {
  await appendRow('Tasks', taskToRow(t));
}

export async function updateTask(t: Task) {
  const rows = await getRows('Tasks');
  const idx = rows.findIndex((r) => r[0] === t.id);
  if (idx > 0) await updateRow('Tasks', idx + 1, taskToRow(t));
}

export async function deleteTask(id: string) {
  const rows = await getRows('Tasks');
  const idx = rows.findIndex((r) => r[0] === id);
  if (idx > 0) await deleteRow('Tasks', idx + 1);
}

// --------------- Disruptions ---------------

function rowToDisruption(row: string[]): ScheduleDisruption {
  return {
    id: row[0],
    date: row[1],
    type: row[2] as ScheduleDisruption['type'],
    label: row[3],
    periodOverrides: JSON.parse(row[4] || '[]') as PeriodOverride[],
  };
}

function disruptionToRow(d: ScheduleDisruption): string[] {
  return [d.id, d.date, d.type, d.label, JSON.stringify(d.periodOverrides)];
}

export async function getDisruptions(): Promise<ScheduleDisruption[]> {
  const rows = await getRows('Disruptions');
  return rows.slice(1).map(rowToDisruption);
}

export async function addDisruption(d: ScheduleDisruption) {
  await appendRow('Disruptions', disruptionToRow(d));
}

export async function updateDisruption(d: ScheduleDisruption) {
  const rows = await getRows('Disruptions');
  const idx = rows.findIndex((r) => r[0] === d.id);
  if (idx > 0) await updateRow('Disruptions', idx + 1, disruptionToRow(d));
}

export async function deleteDisruption(id: string) {
  const rows = await getRows('Disruptions');
  const idx = rows.findIndex((r) => r[0] === id);
  if (idx > 0) await deleteRow('Disruptions', idx + 1);
}

// --------------- Settings ---------------

export async function getSettings(): Promise<Partial<AppSettings>> {
  const rows = await getRows('Settings');
  const settings: Record<string, string> = {};
  for (const row of rows.slice(1)) {
    if (row[0]) settings[row[0]] = row[1];
  }
  return settings as unknown as Partial<AppSettings>;
}

export async function setSetting(key: string, value: string) {
  const rows = await getRows('Settings');
  const idx = rows.findIndex((r) => r[0] === key);
  if (idx > 0) {
    await updateRow('Settings', idx + 1, [key, value]);
  } else {
    await appendRow('Settings', [key, value]);
  }
}

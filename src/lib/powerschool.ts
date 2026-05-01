// ============================================================
// PowerSchool Scraper
// Handles multiple PowerSchool portal layouts (SIS, Student/Guardian).
// Falls back to multiple selector strategies.
// ============================================================
import puppeteer from 'puppeteer-core';
import type { SchoolClass, Homework } from '@/types';
import { v4 as uuid } from 'uuid';

function findChromePath(): string {
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  if (process.platform === 'win32') {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }
  return '/usr/bin/google-chrome';
}

interface PowerSchoolCredentials {
  url: string;
  username: string;
  password: string;
}

export interface ScrapedSchedule {
  classes: SchoolClass[];
  assignments: Homework[];
  log: string[];
}

const CLASS_COLORS = [
  '#4285F4', '#EA4335', '#FBBC04', '#34A853',
  '#FF6D01', '#46BDC6', '#7BAAF7', '#F07B72',
  '#A142F4', '#24C1E0', '#F538A0', '#185ABC',
];

// Standard bell schedule fallback (50-min periods starting at 8:00)
function defaultBellTime(period: number): { start: string; end: string } {
  const firstStart = 8 * 60; // 8:00 AM
  const periodLength = 50;
  const passingTime = 5;
  const offset = (period - 1) * (periodLength + passingTime);
  const start = firstStart + offset;
  const end = start + periodLength;
  return {
    start: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
    end: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
  };
}

// ----------------------------------------------------------------------------
// Parse PowerSchool's "expression" string for day-of-week info.
// PowerSchool puts a code like "1(A-E)" or "1(M,W,F)" in the period column on
// the home page. The leading number is the period; the parenthesized text is a
// day-of-week pattern. The matrix scrape (myschedule.html) is preferred, but
// some installs don't expose that page or it parses to zero entries — in that
// case we fall back to this so the schedule view still shows real meeting days
// instead of every class on Mon–Fri.
//
// Letter↔weekday convention: A=Mon, B=Tue, C=Wed, D=Thu, E=Fri (the standard
// US 5-letter rotation). For schools whose A/B days actually rotate across
// real weekdays, this is still the most useful display: it shows the week as
// PowerSchool's own rotation cycle.
//
// Examples:
//   "1(A-E)"     → [1,2,3,4,5]
//   "1(M-F)"     → [1,2,3,4,5]
//   "3(M,W,F)"   → [1,3,5]
//   "9(A,B)"     → [1,2]
//   "1 A-E"      → [1,2,3,4,5]
//   "1"          → null (no day info)
// ----------------------------------------------------------------------------
function parseDaysFromExpression(expression: string): number[] | null {
  if (!expression) return null;
  // Drop the leading period number; keep whatever follows.
  const after = expression.replace(/^\d+\s*[-:]?\s*/, '').trim();
  if (!after) return null;
  // Day codes are usually wrapped in parens, but accept bare patterns too.
  const paren = after.match(/\(([^)]+)\)/);
  const content = (paren ? paren[1] : after).trim();
  if (!content) return null;

  const letterToDay: Record<string, number> = {
    'm': 1, 'mon': 1, 'monday': 1,
    't': 2, 'tue': 2, 'tues': 2, 'tuesday': 2,
    'w': 3, 'wed': 3, 'wednesday': 3,
    'h': 4, 'r': 4, 'th': 4, 'thu': 4, 'thur': 4, 'thurs': 4, 'thursday': 4,
    'f': 5, 'fri': 5, 'friday': 5,
    'a': 1, 'b': 2, 'c': 3, 'd': 4, 'e': 5, // A/B/C/D/E rotation → assume M–F
    's': 6, 'sat': 6, 'saturday': 6,
    'u': 0, 'sun': 0, 'sunday': 0,
  };

  const parts = content.split(/[,\s/|;]+/).filter(Boolean);
  const days = new Set<number>();
  for (const p of parts) {
    const t = p.toLowerCase();
    // Range like "A-E" or "M-F" — expand inclusively.
    const range = t.match(/^([a-z]+)-([a-z]+)$/);
    if (range) {
      const a = letterToDay[range[1]];
      const b = letterToDay[range[2]];
      if (a !== undefined && b !== undefined && a <= b) {
        for (let d = a; d <= b; d++) days.add(d);
        continue;
      }
    }
    const d = letterToDay[t];
    if (d !== undefined) days.add(d);
  }
  if (days.size === 0) return null;
  return Array.from(days).sort((a, b) => a - b);
}

export async function scrapePowerSchool(
  creds: PowerSchoolCredentials
): Promise<ScrapedSchedule> {
  const log: string[] = [];
  // Extract just the origin (scheme + host) so any sub-URL works
  // e.g. "https://premier.k12northstar.org/guardian/home.html" → "https://premier.k12northstar.org"
  const baseUrl = new URL(creds.url).origin;

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: findChromePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    page.setDefaultTimeout(45000);

    // ===================== LOGIN =====================
    log.push('Navigating to PowerSchool login...');

    // `networkidle2` waits until only ≤2 network connections for 500ms — some
    // PowerSchool sites have background pings (analytics, chat widgets) that
    // keep that false forever. `domcontentloaded` is faster and more reliable.
    const navOpts = { waitUntil: 'domcontentloaded' as const, timeout: 30000 };

    // Try both /guardian/ and /public/ login pages
    let loginUrl = `${baseUrl}/guardian/home.html`;
    try {
      await page.goto(loginUrl, navOpts);
    } catch {
      loginUrl = `${baseUrl}/public/home.html`;
      await page.goto(loginUrl, navOpts);
      log.push('Used /public/ login page');
    }

    // Find username/password fields using multiple selector strategies
    const usernameSelectors = ['#fieldAccount', '#account', 'input[name="account"]', 'input[name="username"]', 'input[type="text"]'];
    const passwordSelectors = ['#fieldPassword', '#pw', 'input[name="pw"]', 'input[name="password"]', 'input[type="password"]'];
    const submitSelectors = ['#btn-enter-sign-in', '#btn-enter', 'button[type="submit"]', 'input[type="submit"]', '.submitBtn'];

    let usernameField: string | null = null;
    for (const sel of usernameSelectors) {
      if (await page.$(sel)) { usernameField = sel; break; }
    }

    let passwordField: string | null = null;
    for (const sel of passwordSelectors) {
      if (await page.$(sel)) { passwordField = sel; break; }
    }

    let submitBtn: string | null = null;
    for (const sel of submitSelectors) {
      if (await page.$(sel)) { submitBtn = sel; break; }
    }

    if (!usernameField || !passwordField) {
      throw new Error('Could not find login form fields on the PowerSchool page. The login page layout may have changed.');
    }

    log.push(`Found login form (user: ${usernameField}, pass: ${passwordField})`);

    await page.type(usernameField, creds.username, { delay: 30 });
    await page.type(passwordField, creds.password, { delay: 30 });

    // Trigger the navigation promise BEFORE clicking, so we never miss it.
    // Fire-and-race: whichever happens first (full navigation, an error alert,
    // or a short timeout) determines the next step. We don't fail hard on
    // timeout — we just fall through and check if we're logged in.
    const navigationPromise = page
      .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
      .catch(() => null);

    const errorPromise = page
      .waitForSelector('.feedback-alert, .alert-danger, .error-message, #feedback-alert', { timeout: 30000, visible: true })
      .catch(() => null);

    if (submitBtn) {
      await page.click(submitBtn);
    } else {
      await page.keyboard.press('Enter');
    }

    // Race: whichever resolves first — navigation or a visible error alert
    await Promise.race([navigationPromise, errorPromise]);

    // Give the DOM a moment to settle regardless of which promise won
    await new Promise((r) => setTimeout(r, 800));

    // Check for login errors (visible error alert)
    const loginError = await page.evaluate(() => {
      const alertEl = document.querySelector('.feedback-alert, .alert-danger, .error-message, #feedback-alert');
      const text = alertEl?.textContent?.trim();
      // Some alerts exist in the DOM even when there's no error — only treat
      // non-empty text that isn't a bare whitespace/placeholder as a real error.
      if (!text || text.length < 3) return null;
      return text;
    });

    if (loginError) {
      throw new Error(`PowerSchool login failed: ${loginError}`);
    }

    // Some PowerSchool instances complete login in-place (no page navigation),
    // so we explicitly load the home page to verify the session cookie works.
    try {
      await page.goto(`${baseUrl}/guardian/home.html`, navOpts);
    } catch {
      // non-fatal — maybe already there
    }

    // Verify we're logged in by checking for common post-login elements
    const isLoggedIn = await page.evaluate(() => {
      // If the login form is still visible, we're NOT logged in
      if (document.querySelector('#fieldAccount, #fieldPassword')) return false;
      return !!(
        document.querySelector('#quickLookup') ||
        document.querySelector('.studentName') ||
        document.querySelector('#content-main') ||
        document.querySelector('.box-round') ||
        document.querySelector('[class*="student"]') ||
        document.querySelector('a[href*="scores.html"]') ||
        document.body.innerHTML.includes('Quick Lookup') ||
        document.body.innerHTML.includes('Grades and Attendance')
      );
    });

    if (!isLoggedIn) {
      throw new Error('Login may have failed — could not verify logged-in state. Check your username and password.');
    }

    log.push('Logged in successfully');

    // ===================== SCRAPE CLASSES =====================
    log.push('Scraping class schedule...');

    // Visit multiple PowerSchool pages in order of preference.
    // The home/grades page is the most reliable source for classes because
    // the class table contains scores.html?frn= links that are exclusive to
    // actual classes (not menu tiles).
    const classPagesToTry = [
      `${baseUrl}/guardian/home.html`,
      `${baseUrl}/guardian/myschedule.html`,
      `${baseUrl}/guardian/schedulematrix.html`,
      `${baseUrl}/public/home.html`,
    ];

    // A "term frn" is one column in the grades table — PowerSchool typically
    // has separate columns for Q1, Q2, S1, Q3, Q4, S2, Y1, each with its own
    // scores.html?frn= link and its own grade. We keep them ALL, then pick the
    // best one in node code (semester preferred over quarter).
    type TermFrn = {
      term: string;           // raw column header, e.g. "S1", "Q3", "Y1"
      termType: string;       // 'semester' | 'quarter' | 'year' | 'unknown'
      frn: string;
      href: string;           // fully-qualified URL captured from the <a>; browsers resolve it for us
      grade: string;
      gradePercent: number | null;
    };
    type RawClass = {
      name: string;
      teacher: string;
      teacherEmail: string;
      room: string;
      period: number;
      expression: string;
      sourceId: string;
      termFrns: TermFrn[];
    };

    // Pick the "display" term for a class — the one whose grade we show and
    // whose scores page we hit first for assignments. Priority:
    //   1. Semester matching the current calendar half (S2 in spring, S1 in fall)
    //   2. Any semester frn with a real grade
    //   3. Latest quarter (rightmost in document order) with a real grade
    //   4. Year
    //   5. Anything with a frn
    const pickBestTerm = (terms: TermFrn[]): TermFrn | null => {
      if (!terms || terms.length === 0) return null;
      const hasGrade = (t: TermFrn) => !!t.frn && (!!t.grade || t.gradePercent !== null);
      const graded = terms.filter(hasGrade);

      // Jan–Jun is typically spring semester (S2); Jul–Dec is fall (S1). The
      // user can ignore this if their school's semester numbering is reversed
      // — we still return SOMETHING semester-ish first.
      const now = new Date();
      const isSpring = now.getMonth() <= 5;
      const preferS = isSpring ? /2/ : /1/;

      const semesters = graded.filter((t) => t.termType === 'semester');
      const preferred = semesters.find((t) => preferS.test(t.term));
      if (preferred) return preferred;
      if (semesters.length > 0) return semesters[semesters.length - 1];

      const quarters = graded.filter((t) => t.termType === 'quarter');
      if (quarters.length > 0) return quarters[quarters.length - 1];

      const years = graded.filter((t) => t.termType === 'year');
      if (years.length > 0) return years[0];

      return graded[0] || terms.find((t) => !!t.frn) || null;
    };

    // Decide which frns we hit to SCRAPE ASSIGNMENTS.
    // A PowerSchool Y1 page usually aggregates the full year's assignments;
    // each S1/S2 page aggregates its semester. So if Y1 exists, visit it alone.
    // If semesters exist, visit them all (S1+S2 covers the whole year). If
    // only quarters exist, visit all quarters. This way we collect the full
    // assignment history regardless of how the school structures terms.
    const framesToVisit = (terms: TermFrn[]): TermFrn[] => {
      const withFrn = terms.filter((t) => !!t.frn);
      const byType = (type: string) => withFrn.filter((t) => t.termType === type);
      const years = byType('year');
      if (years.length > 0) return [years[0]];
      const semesters = byType('semester');
      if (semesters.length > 0) return semesters;
      const quarters = byType('quarter');
      if (quarters.length > 0) return quarters;
      return withFrn;
    };

    let rawClasses: RawClass[] = [];

    for (const url of classPagesToTry) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } catch {
        continue;
      }

      const scraped = await page.evaluate(() => {
        type TermFrnInner = {
          term: string;
          termType: string;
          frn: string;
          href: string;
          grade: string;
          gradePercent: number | null;
        };
        const results: {
          name: string;
          teacher: string;
          teacherEmail: string;
          room: string;
          period: number;
          expression: string;
          sourceId: string;
          termFrns: TermFrnInner[];
        }[] = [];

        // =================================================
        // IMPORTANT: a real class row is identified by having at least one
        // `a[href*="scores.html?frn="]` link — these are the per-term grade
        // links and never appear on menu tiles, nav, or dashboard widgets.
        //
        // CAUTION: the TEXT of that link is the GRADE (e.g. "A+ 99.44"),
        // NOT the class name. The class name lives in a separate cell in
        // the same row — the one that contains the teacher's mailto link.
        // =================================================
        const scoresLinks = document.querySelectorAll<HTMLAnchorElement>(
          'a[href*="scores.html?frn"], a[href*="scores.html"][href*="frn="]'
        );

        const seenRows = new WeakSet<Element>();
        scoresLinks.forEach((link) => {
          const row = link.closest('tr');
          if (!row || seenRows.has(row)) return;
          seenRows.add(row);

          // Skip header rows
          if (row.querySelector('th')) return;

          const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'));
          if (cells.length < 3) return;

          // --- Find the COURSE cell (NOT a grade cell) ---
          // A course cell is characterised by containing a mailto: link
          // (teacher email). Grade cells only contain scores.html links.
          let courseCell: HTMLTableCellElement | null = null;
          for (const td of cells) {
            if (td.querySelector('a[href^="mailto:"]')) {
              courseCell = td;
              break;
            }
          }
          // Fallback: last non-grade cell. Grade cells contain scores.html
          // links exclusively; the course cell usually doesn't.
          if (!courseCell) {
            for (let i = cells.length - 1; i >= 0; i--) {
              const td = cells[i];
              const hasScoresOnly = td.querySelector('a[href*="scores.html"]') && !td.querySelector('a:not([href*="scores.html"])');
              if (!hasScoresOnly) { courseCell = td; break; }
            }
          }
          if (!courseCell) return;

          // --- Extract the course NAME from the course cell ---
          // Priority 1: bolded course name (common layout)
          // Priority 2: a non-mailto, non-scores link
          // Priority 3: cell text with Email/Rm portions stripped
          let name = '';
          const boldEl = courseCell.querySelector('b, strong');
          if (boldEl?.textContent?.trim()) {
            name = boldEl.textContent.trim();
          }
          if (!name) {
            const courseLink = courseCell.querySelector<HTMLAnchorElement>(
              'a:not([href^="mailto:"]):not([href*="scores.html"])'
            );
            if (courseLink?.textContent?.trim()) {
              name = courseLink.textContent.trim();
            }
          }
          if (!name) {
            // Fall back to the cell's text, with teacher/room info stripped
            let text = (courseCell.textContent || '').replace(/\s+/g, ' ').trim();
            text = text.replace(/\s*(?:-|•|·)?\s*Email\s+.+?(?=\s*(?:-|•|·|$))/i, ' ');
            // `*` not `+` so an empty room ("Rm:" with no value) also matches
            // — otherwise the literal "- Rm:" stays glued to the class name.
            text = text.replace(/\s*(?:-|•|·)?\s*(?:Rm|Room)\s*[:.]?\s*[A-Za-z0-9\-.]*/i, ' ');
            text = text.replace(/\s+/g, ' ').trim();
            name = text;
          }
          // Final cleanup: if the name still has a trailing "- Rm:" or "- Rm"
          // (e.g. because the bold-el path produced the name and then a sibling
          // text node added "- Rm:" to the cell), trim it. Same for empty Email.
          name = name
            .replace(/\s*(?:-|•|·)\s*(?:Rm|Room)\s*[:.]?\s*[A-Za-z0-9\-.]*$/i, '')
            .replace(/\s*(?:-|•|·)\s*Email\s*:?\s*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (!name) return;

          // Sanity: if "name" somehow matches a grade pattern, this row is
          // clearly something other than a class — bail out.
          if (/^[A-F][+-]?\s*\d+(?:\.\d+)?$/.test(name)) return;
          if (/^\d+(?:\.\d+)?\s*%?$/.test(name)) return;

          // --- Teacher (from mailto link) ---
          let teacher = '';
          let teacherEmail = '';
          const emailLink = courseCell.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
          if (emailLink) {
            teacherEmail = (emailLink.href.match(/mailto:([^?]+)/)?.[1] || '').trim();
            const emailText = (emailLink.textContent || '').trim();
            // The link text is usually a display name like "Smith, Jane".
            // Only derive from the email if the link text looks like an email itself.
            if (emailText && !emailText.includes('@') && emailText.length > 1) {
              teacher = emailText;
            } else if (teacherEmail) {
              teacher = teacherEmail.split('@')[0]
                .replace(/[._]/g, ' ')
                .trim()
                .split(' ')
                .filter(Boolean)
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ');
            }
          }

          // --- Room ---
          let room = '';
          const cellText = courseCell.textContent || '';
          const roomMatch = cellText.match(/(?:Rm|Room)\s*[:.]?\s*([A-Za-z0-9\-.]+)/i);
          if (roomMatch) room = roomMatch[1];

          // --- Period (expression) from the FIRST cell ---
          const firstCell = cells[0];
          const expression = firstCell?.textContent?.trim() || '';
          // Skip this row if the first cell looks like a grade rather than a
          // period code — that means we mis-identified the row.
          if (/^[A-F][+-]?\s*\d/.test(expression)) return;
          const periodMatch = expression.match(/^(\d+)/);
          const period = periodMatch ? parseInt(periodMatch[1], 10) : results.length + 1;

          // --- Capture every TERM column: Q1/Q2/S1/Q3/Q4/S2/Y1 all have their
          // own scores.html?frn= link with their own grade. We keep them all
          // and pick the best one (semester preferred) in node code. This is
          // how we get SEMESTER grades instead of whatever the first quarter
          // link happens to be, AND how we can aggregate assignments across
          // terms. ---
          const termFrns: TermFrnInner[] = [];
          const table = row.closest('table') as HTMLTableElement | null;
          // Some PowerSchool grades tables have a "pre-header" row above the
          // real column headers — typically a single colspan cell titled
          // "Current Grades and Attendance" or a school logo. rows[0] points
          // at THAT row, so its cells don't align with our data row. Score
          // every candidate row above this one and pick the most header-ish.
          const allRows = table ? Array.from(table.rows) : [];
          const headerScore = (r: HTMLTableRowElement): number => {
            let s = 0;
            for (const c of Array.from(r.cells)) {
              const t = (c.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
              if (/\bs\s*\d\b|\bsem(ester)?\s*\d|semester/.test(t)) s += 3;
              if (/\bq\s*\d\b|\bquart(er)?\s*\d|quarter/.test(t)) s += 3;
              if (/\by\s*\d\b|year/.test(t)) s += 2;
              if (/^exp$|course|period|absences|tardies/.test(t)) s += 1;
            }
            // Rows with `th` cells are almost always headers in PowerSchool.
            if (r.querySelector('th')) s += 2;
            return s;
          };
          let headerRow: HTMLTableRowElement | null = null;
          let best = 0;
          for (const r of allRows) {
            if (r === row) break; // don't look past the data row
            const sc = headerScore(r);
            if (sc > best) { best = sc; headerRow = r; }
          }
          if (!headerRow) headerRow = allRows[0] || null;
          const headerCells = headerRow ? Array.from(headerRow.cells) : [];
          const headerLabels = headerCells.map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim());
          const rowCells = Array.from(row.cells);

          const allScoreLinks = row.querySelectorAll<HTMLAnchorElement>(
            'a[href*="scores.html?frn"], a[href*="scores.html"][href*="frn="]'
          );
          for (const link of Array.from(allScoreLinks)) {
            const parentCell = link.closest('td, th') as HTMLTableCellElement | null;
            if (!parentCell) continue;
            const cellIdx = rowCells.indexOf(parentCell);

            // ---- Term classification, fg= first ----
            // PowerSchool grade links carry the term code directly in the URL:
            //   .../scores.html?frn=...&fg=Q3&...
            //   .../scores.html?frn=...&fg=S2&...
            // That's the authoritative source. The column-header heuristic
            // (kept as fallback) was flaky across skins — some pages have a
            // colspan banner above the real headers, some use "Sem1" vs "S1",
            // etc. The fg param works regardless.
            const fgMatch = link.href.match(/[?&]fg=([^&]+)/);
            const fg = fgMatch ? decodeURIComponent(fgMatch[1]).trim() : '';
            const fgLc = fg.toLowerCase();

            const headerTerm = cellIdx >= 0 ? (headerLabels[cellIdx] || '') : '';
            const headerLc = headerTerm.toLowerCase();

            // term label preference: fg when present (e.g. "S2"), else header
            const term = fg || headerTerm;

            let termType = 'unknown';
            if (fgLc) {
              if (/^s\d?/.test(fgLc)) termType = 'semester';
              else if (/^q\d/.test(fgLc)) termType = 'quarter';
              else if (/^y\d?/.test(fgLc)) termType = 'year';
              else if (/^t\d/.test(fgLc)) termType = 'trimester';
            }
            // Fall back to header-text matching if fg was absent/unknown
            if (termType === 'unknown' && headerLc) {
              if (/(?:^|\b)s(?:em(?:ester)?)?\s*\d/.test(headerLc) || /semester/.test(headerLc)) termType = 'semester';
              else if (/(?:^|\b)q(?:uart(?:er)?)?\s*\d/.test(headerLc) || /quarter/.test(headerLc)) termType = 'quarter';
              else if (/(?:^|\b)y(?:ear)?\s*\d?/.test(headerLc) || /^full[- ]?year/.test(headerLc)) termType = 'year';
            }

            const frnMatch = link.href.match(/[?&]frn=([^&]+)/);
            if (!frnMatch) continue;
            const frn = decodeURIComponent(frnMatch[1]);

            const txt = (link.textContent || '').replace(/\s+/g, ' ').trim();
            // Skip info/placeholder links — e.g. "[ i ]" or "[ - ]"
            if (txt === '[ i ]' || txt === '[i]' || /^\[\s*[-–]+\s*\]$/.test(txt)) continue;
            let grade = '';
            let gradePercent: number | null = null;
            const letterMatch = txt.match(/\b([A-F][+-]?)\b/);
            if (letterMatch) grade = letterMatch[1];
            const pctMatch = txt.match(/(\d{1,3}(?:\.\d+)?)\s*%?/);
            if (pctMatch) {
              const n = parseFloat(pctMatch[1]);
              if (!isNaN(n) && n >= 0 && n <= 100) gradePercent = n;
            }
            termFrns.push({ term, termType, frn, href: link.href, grade, gradePercent });
          }

          // --- Stable sourceId for sync: courseName+period, not frn ---
          // frn changes between terms (Q1 → Q2), so it's NOT stable. The
          // combo of name + period is stable across an entire school year.
          const sourceId = `${name.toLowerCase()}||${period}`;

          results.push({
            name,
            teacher,
            teacherEmail,
            room,
            period,
            expression,
            sourceId,
            termFrns,
          });
        });

        return results;
      });

      if (scraped.length > 0) {
        rawClasses = scraped;
        log.push(`Found ${scraped.length} classes on ${url}`);
        break;
      } else {
        log.push(`No classes on ${url}`);
      }
    }

    // Belt-and-suspenders: filter obvious non-class items by name pattern.
    const MENU_ITEM = /^(file\s*login|login|sign.?in|sign.?out|log.?out|forms?|purchas|payment|touchbase|account|preferenc|bulletin|lunch|balance|feedback|notification|email|report|demographic|registration|directory|news|announce|help|about|contact|privacy|faq|grade\s*history|attendance\s*history|my\s*schedule|school\s*information|teacher\s*comments|quick\s*lookup|your\s+available)/i;

    rawClasses = rawClasses.filter((c) => {
      if (!c.name || c.name.length < 2) return false;
      if (MENU_ITEM.test(c.name.trim())) return false;
      // Reject anything that looks like a bare grade
      if (/^[A-F][+-]?\s*\d/.test(c.name.trim())) return false;
      if (/^\d+(?:\.\d+)?\s*%?$/.test(c.name.trim())) return false;
      return true;
    });

    // Dedupe by sourceId — a given class should appear at most once
    const bySourceId = new Map<string, RawClass>();
    for (const c of rawClasses) {
      if (!bySourceId.has(c.sourceId)) bySourceId.set(c.sourceId, c);
    }
    rawClasses = Array.from(bySourceId.values());

    // ===================== SCRAPE MY SCHEDULE (day-of-week matrix) =====================
    // The home/grades page doesn't reliably expose which days each class meets,
    // so we hit /guardian/myschedule.html next. That page is a weekly matrix:
    // day-of-week columns across the top, period rows down the side, with the
    // class name in each cell where a class meets. Parsing the matrix gives us
    // real `days` arrays instead of the old hardcoded [1..5] fallback.
    //
    // Returns a map keyed by the class's matrix identifier (course name +
    // period, lowercased) → { days, startTime?, endTime? }. We also try to
    // pick up cell-level start/end times because the matrix is often
    // authoritative for bell-schedule-adjusted times.
    type MatrixEntry = { days: number[]; startTime?: string; endTime?: string };
    const matrixByKey = new Map<string, MatrixEntry>();

    try {
      await page.goto(`${baseUrl}/guardian/myschedule.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      log.push('Loaded My Schedule page for day-of-week matrix');

      const matrixRaw = await page.evaluate(() => {
        // Map a header string ("M", "Mon", "Monday", "Tue", "Day 1", "A Day"…)
        // to a JS day number (0=Sun..6=Sat). Returns null if the header
        // doesn't look like a weekday or rotation-day.
        function dayFromHeader(raw: string): number | null {
          // Strip footnote markers, asterisks, parens before matching.
          const cleaned = raw.replace(/[\* ]+/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
          const s = cleaned.toLowerCase();
          if (!s) return null;
          // Full names and prefixes first (so "sun" doesn't get swallowed by "s")
          if (/^sun(day)?$/.test(s)) return 0;
          if (/^mon(day)?$/.test(s)) return 1;
          if (/^tue(s(day)?)?$/.test(s)) return 2;
          if (/^wed(nesday)?$/.test(s)) return 3;
          if (/^thu(r(s(day)?)?)?$/.test(s)) return 4;
          if (/^fri(day)?$/.test(s)) return 5;
          if (/^sat(urday)?$/.test(s)) return 6;
          // Single-letter columns common on PowerSchool matrices: M T W R F
          // "R" = Thursday (conventional in US school schedules), "U" = Sunday
          if (s === 'm') return 1;
          if (s === 't') return 2;
          if (s === 'w') return 3;
          if (s === 'r' || s === 'h' || s === 'th') return 4;
          if (s === 'f') return 5;
          if (s === 's') return 6;
          if (s === 'u') return 0;
          // Block-rotation: "Day 1" / "Day 2" / ... → map sequentially to weekdays.
          // Day 1=Mon, Day 5=Fri, Day 6=Sat, Day 7=Sun. (Same convention as ISO.)
          const dayN = s.match(/^day\s*([1-7])$/);
          if (dayN) {
            const n = parseInt(dayN[1], 10);
            return n === 7 ? 0 : n;
          }
          // "Day A" / "A Day" / bare "A" — map A=Mon, B=Tue, C=Wed, D=Thu, E=Fri
          const letter = s.match(/^(?:day\s+)?([a-g])(?:\s+day)?$/);
          if (letter) {
            const map: Record<string, number> = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 0 };
            return map[letter[1]] ?? null;
          }
          return null;
        }

        // Find a table whose first row's header cells look like weekday names.
        const tables = Array.from(document.querySelectorAll('table'));
        type Col = { idx: number; day: number };
        let target: HTMLTableElement | null = null;
        let cols: Col[] = [];
        // Diagnostic: what header texts did we see across all tables? Lets us
        // tell the user (and the dev) WHY the matrix wasn't recognised.
        const headerSamples: string[] = [];

        for (const t of tables) {
          const headerRow = t.querySelector('tr');
          if (!headerRow) continue;
          const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
          const candidate: Col[] = [];
          const sample: string[] = [];
          headerCells.forEach((cell, i) => {
            const text = (cell.textContent || '').replace(/\s+/g, ' ').trim();
            if (text) sample.push(text);
            const d = dayFromHeader(text);
            if (d !== null) candidate.push({ idx: i, day: d });
          });
          if (sample.length > 0 && headerSamples.length < 4) {
            headerSamples.push(sample.slice(0, 8).join(' | '));
          }
          // Need at least two weekday columns to be a schedule matrix
          if (candidate.length >= 2) {
            target = t as HTMLTableElement;
            cols = candidate;
            break;
          }
        }

        if (!target) return { entries: [], note: 'no-matrix', headerSamples };

        // Each body row is a period. The first cell usually has a period number
        // plus a time range like "1(A) 8:00-8:50". Iterate the day columns and
        // grab the class-name cell text. Skip header rows.
        const entries: {
          periodLabel: string;
          startTime: string;
          endTime: string;
          courseName: string;
          day: number;
        }[] = [];

        const bodyRows = Array.from(target.querySelectorAll('tr')).slice(1);
        for (const row of bodyRows) {
          if (row.querySelector('th')) continue; // sub-header
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 2) continue;

          // First cell: period + time range
          const firstText = (cells[0].textContent || '').replace(/\s+/g, ' ').trim();
          const periodMatch = firstText.match(/^(\d+)/);
          const periodLabel = periodMatch ? periodMatch[1] : firstText;
          // Time range like "8:00-8:50" or "08:00 - 08:50 AM"
          let startTime = '';
          let endTime = '';
          const timeMatch = firstText.match(/(\d{1,2}:\d{2})\s*(?:AM|PM)?\s*[-–]\s*(\d{1,2}:\d{2})\s*(?:AM|PM)?/i);
          if (timeMatch) {
            startTime = timeMatch[1];
            endTime = timeMatch[2];
          }

          for (const col of cols) {
            const cell = cells[col.idx];
            if (!cell) continue;
            // The cell's text is usually "CourseName - Room X - Teacher", or
            // just the course name. Take everything up to the first dash as
            // the course name; the name is what we match against rawClasses.
            const raw = (cell.textContent || '').replace(/\s+/g, ' ').trim();
            if (!raw) continue;
            // Skip placeholder cells
            if (raw === '-' || raw === '—' || /^no\b/i.test(raw)) continue;
            const courseName = raw.split(/\s*[-–]\s*/)[0].trim();
            if (!courseName) continue;
            entries.push({ periodLabel, startTime, endTime, courseName, day: col.day });
          }
        }

        return { entries, note: 'ok', headerSamples: [] as string[] };
      });

      if (matrixRaw.note === 'no-matrix') {
        log.push('My Schedule matrix not found — falling back to expression-parsed days');
        // Surface the headers we DID see so the user/dev can adapt the parser
        // for their school's PowerSchool layout if needed.
        if (matrixRaw.headerSamples && matrixRaw.headerSamples.length > 0) {
          log.push(`  matrix candidates examined: ${matrixRaw.headerSamples.length}`);
          for (const s of matrixRaw.headerSamples) log.push(`    headers: ${s}`);
        }
      } else {
        // Roll up entries: same (period, courseName) across multiple days
        // produces a single { days: [...] } entry.
        type RollupVal = { days: Set<number>; startTime: string; endTime: string };
        const rollup = new Map<string, RollupVal>();
        for (const e of matrixRaw.entries) {
          const key = `${e.courseName.toLowerCase()}||${e.periodLabel}`;
          const existing = rollup.get(key);
          if (existing) {
            existing.days.add(e.day);
            if (!existing.startTime && e.startTime) existing.startTime = e.startTime;
            if (!existing.endTime && e.endTime) existing.endTime = e.endTime;
          } else {
            rollup.set(key, {
              days: new Set([e.day]),
              startTime: e.startTime,
              endTime: e.endTime,
            });
          }
        }
        for (const [key, v] of rollup) {
          matrixByKey.set(key, {
            days: Array.from(v.days).sort((a, b) => a - b),
            startTime: v.startTime || undefined,
            endTime: v.endTime || undefined,
          });
        }
        log.push(`Parsed ${matrixByKey.size} class/period entries from My Schedule matrix`);
      }
    } catch (err) {
      log.push(`Could not load My Schedule matrix: ${(err as Error).message}`);
    }

    // Build proper SchoolClass objects.
    // We keep a parallel map of classId → all term frns so that per-class
    // assignment scraping can visit the right scores.html URL(s). The frn
    // list is a PowerSchool implementation detail and is intentionally NOT
    // stored on SchoolClass (frns change per term).
    const classTermFrns = new Map<string, TermFrn[]>();
    const classes: SchoolClass[] = rawClasses.map((c, i) => {
      // Default bell times; overridden by the matrix if we found one.
      const bell = defaultBellTime(c.period || (i + 1));
      // Look up the matrix entry two ways — by period (most specific) and by
      // course name alone (fallback for instances where the period label on
      // the matrix doesn't match the period extracted from the home page).
      const matrixKey = `${c.name.toLowerCase()}||${c.period || ''}`;
      let mx = matrixByKey.get(matrixKey);
      if (!mx) {
        // Loosely: first entry whose key starts with the name
        const nameLc = c.name.toLowerCase();
        for (const [k, v] of matrixByKey) {
          if (k.startsWith(`${nameLc}||`)) { mx = v; break; }
        }
      }

      // Day-of-week resolution priority:
      //   1. matrix entry (myschedule.html) — definitive
      //   2. expression code on the home page (e.g. "1(M,W,F)" → [1,3,5])
      //   3. default to weekdays Mon–Fri
      // Times priority: matrix → bell-schedule fallback.
      let days: number[];
      let daysSource: string;
      if (mx?.days && mx.days.length > 0) {
        days = mx.days;
        daysSource = 'matrix';
      } else {
        const fromExpr = parseDaysFromExpression(c.expression);
        if (fromExpr && fromExpr.length > 0) {
          days = fromExpr;
          daysSource = `expression "${c.expression}"`;
        } else {
          days = [1, 2, 3, 4, 5];
          daysSource = 'default Mon–Fri';
        }
      }
      const startTime = mx?.startTime || bell.start;
      const endTime = mx?.endTime || bell.end;
      const timesSource = mx?.startTime ? 'matrix' : 'default bell';
      log.push(`  - ${c.name} (P${c.period || (i + 1)}): days=[${days.join(',')}] from ${daysSource}; ${startTime}–${endTime} from ${timesSource}`);

      // Grade/percent come from the SEMESTER if available, else the latest
      // quarter. This answers "pull semester grades, not just quarter grades".
      const best = pickBestTerm(c.termFrns);

      const cls: SchoolClass = {
        id: uuid(),
        name: c.name,
        teacher: c.teacher || 'TBD',
        room: c.room || '',
        color: CLASS_COLORS[i % CLASS_COLORS.length],
        period: c.period || (i + 1),
        startTime,
        endTime,
        days,
        semester: 'Current',
        source: 'powerschool' as const,
        sourceId: c.sourceId,
        grade: best?.grade || undefined,
        gradePercent: best?.gradePercent ?? undefined,
      };
      if (c.termFrns.length > 0) classTermFrns.set(cls.id, c.termFrns);
      if (best) {
        log.push(`  - ${c.name}: grade from ${best.term || best.termType} column (${best.grade || ''}${best.gradePercent !== null ? ` ${best.gradePercent}%` : ''})`);
      }
      return cls;
    });

    log.push(`Imported ${classes.length} classes after filtering menu items`);

    // ===================== SCRAPE ASSIGNMENTS =====================
    // Strategy: for each class, hit every scores.html?frn= page that's worth
    // visiting (Y1 alone if it exists, else all S1/S2 semester pages, else
    // all quarters) and merge the results. A single semester page aggregates
    // Q1+Q2 assignments, so visiting both S1 and S2 gives the full year.
    //
    // This is what "clicking into the grade on each class" does in the
    // browser. Previously we only visited one frn (whichever was first),
    // which often corresponded to an empty or wrong-term column — that's why
    // no assignments were showing up on the grades page.
    log.push('Scraping assignments per class...');

    const assignments: Homework[] = [];

    // Sharing the parse helper keeps the table-detection logic in one place.
    // Returns BOTH the parsed rows and a short diagnostic string — the latter
    // lets us tell the user WHY a page had zero results ("no table found",
    // "table found but no data rows", etc.) instead of just "0 assignments".
    const scrapeAssignmentsFromPage = async (): Promise<{
      assignments: Array<{ title: string; dueDate: string; category: string; score: string; scorePercent: number | null; flags: string; }>;
      diagnostic: string;
    }> => {
      return await page.evaluate(() => {
        type RawAssignment = {
          title: string;
          dueDate: string;
          category: string;
          score: string;
          // Numeric percent from the "%" column. Kept separate from `score`
          // so the client can reliably show a percentage for rows where the
          // raw score is a bare points value with no denominator ("18").
          scorePercent: number | null;
          // PowerSchool's flag column (Late / Missing / Collected / Incomplete).
          // Captured separately so the UI can show it as a distinct badge.
          flags: string;
        };
        const results: RawAssignment[] = [];

        // Find the assignments table. PowerSchool skins vary a lot — some
        // say "Due Date", some just "Due"; some use "Name"/"Title" instead
        // of "Assignment". The common thread is an assignments table has
        // a date-ish column and an assignment-title-ish column.
        const tables = Array.from(document.querySelectorAll<HTMLTableElement>('table'));
        let target: HTMLTableElement | null = null;

        // Helper: read the first row of the table properly — NOT via
        // `tr:first-child`, which wrongly matches the first tr of each
        // thead/tbody (and pollutes the header label list with data cells).
        // HTMLTableElement.rows[0] is the correct DOM API.
        const firstRowOf = (t: HTMLTableElement) => t.rows[0] || null;
        const headerTextOf = (t: HTMLTableElement) => {
          const r = firstRowOf(t);
          return r ? (r.textContent || '').toLowerCase() : '';
        };

        for (const t of tables) {
          const headerText = headerTextOf(t);
          const hasDue = headerText.includes('due date') || /\bdue\b/.test(headerText) || headerText.includes('date');
          const hasTitle = headerText.includes('assignment') || headerText.includes('name') || headerText.includes('title') || headerText.includes('description');
          const hasScore = headerText.includes('score') || headerText.includes('grade') || headerText.includes('pts') || headerText.includes('points') || headerText.includes('%');
          const hasCategory = headerText.includes('category') || headerText.includes('cat ');
          if ((hasDue && hasTitle) || (hasDue && hasScore && hasCategory)) {
            target = t;
            break;
          }
        }

        // NO fallback to "biggest table". Previously that happened to grab
        // the "grade-category / drop-low-scores" config table when the real
        // assignments table hadn't rendered yet, and we'd emit 9 junk rows
        // of grade calc settings as homework. If the primary header-match
        // didn't find an assignments table, bail explicitly — the caller
        // already has a retry-on-other-term logic that handles this.
        if (!target) {
          return {
            results,
            diagnostic: `no assignments table matched (page had ${tables.length} tables; headers: ${JSON.stringify(tables.map((t) => (firstRowOf(t)?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)))})`,
          };
        }

        const headerRow = firstRowOf(target);
        const headerCells = headerRow ? Array.from(headerRow.cells) : [];
        // ---------------- COLSPAN-AWARE LABEL MAP ----------------
        // The raw `Array.from(headerRow.cells)` gives us ONE entry per
        // visual header cell. But modern PowerSchool renders the Flags
        // header as a single <th colspan="7"> covering seven body columns
        // (collected / late / missing / exempt / absent / incomplete /
        // excluded), which means the BODY rows have seven more cells than
        // the header. Without accounting for colspan, findIndex('score')
        // returns 4 — but cells[4] in the body is actually a flag sub-
        // column ("late"), not the score. Building a column-index → label
        // map that respects colspan lines everything back up.
        const colToLabel: string[] = [];
        for (const cell of headerCells) {
          const span = (cell as HTMLTableCellElement).colSpan || 1;
          const label = (cell.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
          for (let k = 0; k < span; k++) colToLabel.push(label);
        }
        // headerLabels kept around purely for diagnostic logging — what
        // the user sees in the Accordion. Use colToLabel for actual lookups.
        const headerLabels = headerCells.map((c) => (c.textContent || '').trim().toLowerCase());

        const idx = {
          due:        colToLabel.findIndex((h) => h.includes('due date') || /\bdue\b/.test(h) || h === 'date'),
          category:   colToLabel.findIndex((h) => h.includes('category') || h === 'cat'),
          assignment: colToLabel.findIndex((h) => h.includes('assignment') || h === 'name' || h === 'title' || h.includes('description')),
          flags:      colToLabel.findIndex((h) =>
            h === 'flags' || h.includes('flag') ||
            h === 'codes' || h === 'code' ||
            h.includes('status') || h.includes('indicator')
          ),
          score:      colToLabel.findIndex((h) => h === 'score' || h === 'pts' || h.includes('points')),
          percent:    colToLabel.findIndex((h) => h === '%' || h.includes('percent')),
          grade:      colToLabel.findIndex((h) => h === 'grade' || h.includes('letter grade')),
        };

        // Range of columns that live under the "flags" header (e.g. cols 3..9
        // when "flags" has colspan=7). Used to iterate sub-flag cells and
        // detect which are actually active rather than trusting textContent
        // (every sub-flag cell has sr-only label text regardless of state).
        const flagRange: { start: number; end: number } = (() => {
          if (idx.flags < 0) return { start: -1, end: -1 };
          let end = idx.flags;
          while (end + 1 < colToLabel.length && colToLabel[end + 1] === colToLabel[idx.flags]) end++;
          return { start: idx.flags, end };
        })();

        // Known PowerSchool flag words. Used two ways: (1) to rescue a score
        // cell that's actually a flag — some skins stuff "Late"/"Missing"
        // literally into the Score column for ungraded items, no separate
        // flag column at all; and (2) to scan the whole row as a last resort
        // when no flag header was detected.
        const FLAG_WORDS = /^(late|missing|exempt|collected|incomplete|absent|excused|tardy|overdue)$/i;

        // Iterate all rows after the header. `table.rows` is document order
        // across thead/tbody/tfoot, so index 0 is the header and 1+ is data.
        const allRows = Array.from(target.rows);
        const dataRows = allRows.slice(1);
        dataRows.forEach((row) => {
          const cells = Array.from(row.cells);
          if (cells.length < 2) return;
          const title = idx.assignment >= 0 ? (cells[idx.assignment]?.textContent || '').trim() : '';
          if (!title) return;
          const dueDate = idx.due >= 0 ? (cells[idx.due]?.textContent || '').trim() : '';
          const category = idx.category >= 0 ? (cells[idx.category]?.textContent || '').trim() : '';

          // Flag detection — iterate every sub-column under the "flags"
          // header. Modern PowerSchool puts a visible icon (<img>, <svg>, or
          // a font-awesome <i>) in the cell ONLY when that flag is active;
          // unset cells contain only a screen-reader label. We use the
          // presence of an icon element (or any non-text, non-whitespace
          // node other than sr-only text) as the state indicator, then pick
          // up the cell's text as the flag's name. Multiple active flags on
          // one row are joined with commas.
          let flags = '';
          if (flagRange.start >= 0) {
            const activeFlags: string[] = [];
            for (let i = flagRange.start; i <= flagRange.end; i++) {
              const cell = cells[i];
              if (!cell) continue;
              // Iconographic active state: an <img> with any src (the
              // default PowerSchool flag sprite), <svg>, or icon-font <i>.
              const hasIcon = !!cell.querySelector('img, svg, i[class*="icon"], i[class*="fa-"], [class*="filled"], [class*="active"]');
              if (!hasIcon) continue;
              const label = (cell.textContent || '').replace(/\s+/g, ' ').trim();
              if (label) activeFlags.push(label);
            }
            flags = activeFlags.join(', ');
          } else if (idx.flags >= 0) {
            // Simpler fallback for single-cell flag columns (older skins).
            flags = (cells[idx.flags]?.textContent || '').replace(/\s+/g, ' ').trim();
          }

          // Score display, ordered priority: raw score (e.g. "19/20") →
          // percent (e.g. "95") → letter grade (e.g. "A"). First non-empty
          // wins. Explicitly NEVER falls back to the flags column.
          let score = '';
          for (const key of ['score', 'percent', 'grade'] as const) {
            const i = idx[key];
            if (i < 0) continue;
            const t = (cells[i]?.textContent || '').replace(/\s+/g, ' ').trim();
            if (t && t !== '--') {
              score = key === 'percent' && /^\d/.test(t) ? `${t}%` : t;
              break;
            }
          }

          // Numeric percent — captured ONLY from the "%" column. This is the
          // reliable source for assignment-level percentage display; the raw
          // score string may be a fraction, a bare points value, or a letter,
          // none of which the client can always parse. If PowerSchool shows a
          // "%" column for the assignment, use that number directly.
          let scorePercent: number | null = null;
          if (idx.percent >= 0) {
            const pctTxt = (cells[idx.percent]?.textContent || '').replace(/\s+/g, ' ').trim();
            const m = pctTxt.match(/(-?\d+(?:\.\d+)?)/);
            if (m) {
              const n = parseFloat(m[1]);
              if (!isNaN(n) && n >= 0 && n <= 100) scorePercent = n;
            }
          }
          // Fallback: derive from a score cell that's a fraction like "18/20".
          if (scorePercent === null && score) {
            const frac = score.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
            if (frac) {
              const num = parseFloat(frac[1]);
              const den = parseFloat(frac[2]);
              if (den > 0) scorePercent = (num / den) * 100;
            } else {
              // Or a bare "95%" / "95" in the score itself
              const pctM = score.match(/^(\d+(?:\.\d+)?)\s*%?$/);
              if (pctM) {
                const n = parseFloat(pctM[1]);
                // Only treat as a percent if it's plausibly one (>20). Bare
                // small numbers are almost always raw points, not percents.
                if (!isNaN(n) && n > 20 && n <= 100) scorePercent = n;
              }
            }
          }

          // Rescue: if the value we picked for score is actually a status
          // word (some skins dump "Late"/"Missing" into the Score column
          // for ungraded items with no separate flag column), move it to
          // flags and leave score empty. This is the user-reported bug —
          // every item shown as "Late" because that's what was in the
          // score cell.
          if (score && FLAG_WORDS.test(score)) {
            if (!flags) flags = score;
            score = '';
          }

          // Last-ditch flag detection: no flag column was identified in the
          // header AND no flag was captured yet — scan every non-structural
          // cell for a bare flag word. This handles the "unnamed status
          // column" skin where the header is blank or an icon.
          if (!flags && idx.flags < 0) {
            const structural = new Set(
              [idx.due, idx.category, idx.assignment, idx.score, idx.percent, idx.grade]
                .filter((i) => i >= 0),
            );
            for (let i = 0; i < cells.length; i++) {
              if (structural.has(i)) continue;
              const t = (cells[i]?.textContent || '').replace(/\s+/g, ' ').trim();
              if (t && FLAG_WORDS.test(t)) { flags = t; break; }
            }
          }

          results.push({ title, dueDate, category, score, scorePercent, flags });
        });

        const withPct = results.filter((r) => r.scorePercent !== null).length;
        const withFlag = results.filter((r) => !!r.flags).length;
        // Dump the first data row's cells verbatim so we can see exactly what
        // textContent each column has. Trimmed + length-capped so the log
        // doesn't explode.
        const firstRowDump = dataRows[0]
          ? Array.from(dataRows[0].cells).map((c, i) => {
              const t = (c.textContent || '').replace(/\s+/g, ' ').trim();
              return `${i}=${JSON.stringify(t.slice(0, 60))}`;
            }).join(' | ')
          : '(no data rows)';
        const diagnostic = results.length > 0
          ? `parsed ${results.length} row(s) (${withPct} with %, ${withFlag} with flag) cols=${JSON.stringify(headerLabels)} row0=[${firstRowDump}]`
          : `table had ${dataRows.length} data rows but 0 passed title filter (cols: ${JSON.stringify(headerLabels)})`;
        return { results, diagnostic };
      }).then((r) => ({ assignments: r.results, diagnostic: r.diagnostic }));
    };

    for (const cls of classes) {
      const terms = classTermFrns.get(cls.id) || [];
      if (terms.length === 0) {
        log.push(`  - ${cls.name}: no term frns captured, skipping assignment scrape`);
        continue;
      }

      const toVisit = framesToVisit(terms);
      // Dedup across visits by title+dueDate — semester pages overlap with
      // quarter pages, and we don't want "Essay 1" showing up twice if the
      // school exposes both frn tiers.
      const seen = new Set<string>();
      const classAssignments: { title: string; dueDate: string; category: string; score: string; scorePercent: number | null; flags: string; }[] = [];

      log.push(`  - ${cls.name}: visiting ${toVisit.length} term page(s) — ${toVisit.map((t) => t.term || t.termType).join(', ')}`);

      for (const t of toVisit) {
        // Use the anchor's actual href (already absolute — browsers resolve
        // relative hrefs automatically). Reconstructing `/guardian/scores.html`
        // was fragile: some PowerSchool skins host scores at a different path,
        // and double-encoding the frn could mangle certain values.
        const scoresUrl = t.href || `${baseUrl}/guardian/scores.html?frn=${encodeURIComponent(t.frn)}`;
        try {
          await page.goto(scoresUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          // Race table-ish selectors. Modern PS skins use `.scoresTable` /
          // Backbone-rendered containers; classic skins expose a plain <table>.
          // Whichever appears first wins; if nothing appears in 8s we fall
          // through and let the diagnostic explain why.
          // Wait for an ASSIGNMENTS-looking table specifically, not just any
          // table. Several PS pages render grade-calc config tables or
          // class-header summary tables first, then fill in the assignments
          // table via XHR a second or two later. Racing on "any table" used
          // to resolve before the real one existed, and the scraper would
          // bail out or grab the wrong one. We use a waitForFunction that
          // scans for a table whose header row mentions both a date-ish
          // column AND an assignment-ish column.
          await Promise.race([
            page.waitForFunction(() => {
              const tbls = Array.from(document.querySelectorAll('table'));
              return tbls.some((t) => {
                const h = ((t.rows[0]?.textContent) || '').toLowerCase();
                const hasDate = h.includes('due') || h.includes('date');
                const hasTitle = h.includes('assignment') || h.includes('name') || h.includes('title') || h.includes('description');
                return hasDate && hasTitle;
              });
            }, { timeout: 12000 }),
            page.waitForSelector('.scoresTable, [id^="scoresTable"], [class*="assignment"], [class*="Assignment"]', { timeout: 12000 }),
          ]).catch(() => null);
          // Small settle delay in case of additional async hydration.
          await new Promise((r) => setTimeout(r, 500));
        } catch {
          log.push(`    · could not load ${t.term || t.termType} page`);
          continue;
        }

        // Post-navigation diagnostics: log the actual URL we landed on, the
        // page title, and the table count. This tells us in one glance whether
        // we got redirected (e.g. back to login), landed on a modern SPA
        // skeleton that hadn't hydrated yet, or landed on the right page with
        // markup we don't recognize. Without these, "0 tables" is a dead end.
        const pageInfo = await page.evaluate(() => ({
          url: location.href,
          title: document.title,
          tableCount: document.querySelectorAll('table').length,
          bodyLen: (document.body?.innerText || '').length,
          bodyStart: (document.body?.innerText || '').substring(0, 240).replace(/\s+/g, ' ').trim(),
          loginFormVisible: !!document.querySelector('#fieldAccount, #fieldPassword'),
        }));
        log.push(`    · landed: "${pageInfo.title}" — ${pageInfo.tableCount} tables, body ${pageInfo.bodyLen}ch`);
        log.push(`    · url: ${pageInfo.url}`);
        if (pageInfo.loginFormVisible) {
          log.push(`    · WARNING: login form visible — session expired or redirected back to login`);
        }
        if (pageInfo.tableCount === 0) {
          log.push(`    · body preview: "${pageInfo.bodyStart}"`);
        }

        const { assignments: scraped, diagnostic } = await scrapeAssignmentsFromPage();
        let added = 0;
        for (const a of scraped) {
          const key = `${a.title.toLowerCase()}||${a.dueDate}`;
          if (seen.has(key)) continue;
          seen.add(key);
          classAssignments.push(a);
          added++;
        }
        log.push(`    · ${t.term || t.termType}: ${scraped.length} parsed (${added} new) — ${diagnostic}`);
      }

      // If the preferred tier returned nothing, try the OTHER tiers as a
      // fallback — some schools leave the semester page empty and keep
      // assignments only on quarter pages (or vice versa). We only bother
      // when we found zero, to avoid doubling the scrape time.
      if (classAssignments.length === 0) {
        const alreadyVisited = new Set(toVisit.map((t) => t.frn));
        const fallback = terms.filter((t) => t.frn && !alreadyVisited.has(t.frn));
        if (fallback.length > 0) {
          log.push(`    · no assignments on preferred tier, trying ${fallback.length} fallback frn(s)`);
          for (const t of fallback) {
            const scoresUrl = t.href || `${baseUrl}/guardian/scores.html?frn=${encodeURIComponent(t.frn)}`;
            try {
              await page.goto(scoresUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
              await Promise.race([
                page.waitForSelector('table', { timeout: 8000 }),
                page.waitForSelector('.scoresTable, [id^="scoresTable"], [class*="assignment"], [class*="Assignment"]', { timeout: 8000 }),
              ]).catch(() => null);
              await new Promise((r) => setTimeout(r, 500));
            } catch { continue; }
            const { assignments: scraped, diagnostic } = await scrapeAssignmentsFromPage();
            log.push(`    · fallback ${t.term || t.termType}: ${scraped.length} parsed — ${diagnostic}`);
            for (const a of scraped) {
              const key = `${a.title.toLowerCase()}||${a.dueDate}`;
              if (seen.has(key)) continue;
              seen.add(key);
              classAssignments.push(a);
            }
          }
        }
      }

      log.push(`  - ${cls.name}: ${classAssignments.length} total assignments after dedupe`);

      for (const a of classAssignments) {
        if (!a.title || a.title.length < 2) continue;

        // Parse the due date — PowerSchool uses M/D or M/D/YYYY formats.
        let dueDate = '';
        if (a.dueDate) {
          const parsed = new Date(a.dueDate);
          if (!isNaN(parsed.getTime())) {
            dueDate = parsed.toISOString().split('T')[0];
          }
        }

        // Stable sourceId for this assignment. PowerSchool doesn't expose a
        // per-assignment ID in the DOM, so we derive one from the class's
        // stable sourceId + title + due date. This is stable across scrapes
        // unless the teacher edits the assignment title. It does NOT include
        // the frn, because a single assignment may appear under multiple
        // term frns (Q1 and S1) but should be one row in our sheet.
        const sourceId = `${cls.sourceId}||${a.title}||${dueDate || a.dueDate}`;

        assignments.push({
          id: uuid(),
          classId: cls.id,
          title: a.title,
          description: a.category ? `Category: ${a.category}` : '',
          dueDate,
          completed: false,
          priority: 'medium' as const,
          source: 'powerschool' as const,
          sourceId,
          score: a.score || undefined,
          scorePercent: a.scorePercent ?? undefined,
          category: a.category || undefined,
          flags: a.flags || undefined,
        });
      }
    }

    const withPct = assignments.filter((a) => a.scorePercent !== undefined).length;
    const withFlag = assignments.filter((a) => !!a.flags).length;
    log.push(`Found ${assignments.length} assignments total (${withPct} with %, ${withFlag} with flag)`);

    return { classes, assignments, log };
  } catch (err) {
    log.push(`ERROR: ${(err as Error).message}`);
    throw new Error(`PowerSchool scrape failed: ${(err as Error).message}\n\nLog:\n${log.join('\n')}`);
  } finally {
    await browser.close();
  }
}

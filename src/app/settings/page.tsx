'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Link from '@mui/material/Link';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import SchoolIcon from '@mui/icons-material/School';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import StorageIcon from '@mui/icons-material/Storage';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import KeyIcon from '@mui/icons-material/Key';
import { useClasses } from '@/lib/hooks';
import type { SchoolClass } from '@/types';

export default function SettingsPage() {
  return (
    <Suspense fallback={<CircularProgress />}>
      <SettingsInner />
    </Suspense>
  );
}

function SettingsInner() {
  const searchParams = useSearchParams();
  const { refetch: refetchClasses } = useClasses();
  const { data: importedClasses, loading: classesLoading, refetch: refetchClassesList } = useClasses();
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });
  const [syncing, setSyncing] = useState<string | null>(null);

  // Setup status from /api/setup
  const [setupStatus, setSetupStatus] = useState<{
    configured: boolean;
    hasDatabase: boolean;
    hasClassroomOAuth: boolean;
    hasPowerschool: boolean;
    powerschoolUrl: string;
    powerschoolUsername: string;
  } | null>(null);

  // Live database health
  const [liveHealth, setLiveHealth] = useState<{
    checking: boolean;
    ok: boolean | null;
    error?: string;
    checkedAt?: number;
  }>({ checking: false, ok: null });

  const refreshLiveHealth = async (force = false) => {
    setLiveHealth((prev) => ({ ...prev, checking: true }));
    try {
      const res = await fetch(`/api/setup/health${force ? '?force=1' : ''}`);
      const data = await res.json();
      setLiveHealth({ checking: false, ok: !!data.ok, error: data.error, checkedAt: data.checkedAt });
    } catch (e) {
      setLiveHealth({ checking: false, ok: false, error: (e as Error).message });
    }
  };

  // School info
  const [schoolName, setSchoolName] = useState('');
  const [semesterStart, setSemesterStart] = useState('');
  const [semesterEnd, setSemesterEnd] = useState('');
  const [lunchTimes, setLunchTimes] = useState<Record<number, { startTime: string; endTime: string }>>({
    1: { startTime: '10:26', endTime: '10:57' },
    2: { startTime: '10:50', endTime: '11:20' },
    3: { startTime: '10:50', endTime: '11:20' },
    4: { startTime: '10:50', endTime: '11:20' },
    5: { startTime: '10:26', endTime: '10:57' },
  });

  // PowerSchool
  const [psUrl, setPsUrl] = useState('');
  const [psUser, setPsUser] = useState('');
  const [psPass, setPsPass] = useState('');
  const [psLog, setPsLog] = useState<string[]>([]);
  const [psMatrixSuggestions, setPsMatrixSuggestions] = useState<Record<string, { days: number[]; startTime?: string; endTime?: string }>>({});

  const normalizeName = (s?: string | null) => (s ? String(s).replace(/ /g, ' ').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase() : '');

  const normalizeTime = (input?: string | null): string | undefined => {
    if (!input) return undefined;
    const s = String(input).trim();
    const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
    if (!m) return undefined;
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ampm = (m[3] || '').toLowerCase();
    if (ampm === 'pm') { if (hh < 12) hh += 12; }
    else if (ampm === 'am') { if (hh === 12) hh = 0; }
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return undefined;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  const updateLunchTime = (day: number, field: 'startTime' | 'endTime', value: string) => {
    setLunchTimes((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  // Google Classroom OAuth
  const [classroomClientId, setClassroomClientId] = useState('');
  const [classroomClientSecret, setClassroomClientSecret] = useState('');

  // Calendar
  const [calendarToken, setCalendarToken] = useState('');
  const [calendarUrl, setCalendarUrl] = useState('');

  // Schedule wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardIndex, setWizardIndex] = useState(0);
  const [editableClass, setEditableClass] = useState<SchoolClass | null>(null);

  useEffect(() => {
    setCalendarUrl(`${window.location.origin}/api/calendar?token=${calendarToken || 'your-token'}`);
  }, [calendarToken]);

  // Handle Google Classroom callback results
  useEffect(() => {
    const classroomResult = searchParams.get('classroom');
    if (classroomResult === 'success') {
      const classes = searchParams.get('classes') || '0';
      const assignments = searchParams.get('assignments') || '0';
      setSnackbar({ open: true, message: `Google Classroom imported! ${classes} classes and ${assignments} assignments added.`, severity: 'success' });
    } else if (classroomResult === 'denied') {
      setSnackbar({ open: true, message: 'Google Classroom access was denied. Please try again and grant permissions.', severity: 'error' });
    } else if (classroomResult === 'error') {
      const msg = searchParams.get('msg') || 'Unknown error';
      setSnackbar({ open: true, message: `Google Classroom error: ${msg}`, severity: 'error' });
    }
  }, [searchParams]);

  // Load setup status + saved settings
  useEffect(() => {
    fetch('/api/setup')
      .then((r) => r.json())
      .then((data) => {
        setSetupStatus(data);
        if (data.powerschoolUrl) setPsUrl(data.powerschoolUrl);
        if (data.powerschoolUsername) setPsUser(data.powerschoolUsername);
        refreshLiveHealth();
      })
      .catch(() => {});

    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        if (s.schoolName) setSchoolName(s.schoolName);
        if (s.semesterStart) setSemesterStart(s.semesterStart);
        if (s.semesterEnd) setSemesterEnd(s.semesterEnd);
        if (s.calendarToken) setCalendarToken(s.calendarToken);
        if (s.powerschoolUrl) setPsUrl(s.powerschoolUrl);
        if (s.powerschoolUsername) setPsUser(s.powerschoolUsername);
        if (s.lunchTimes) setLunchTimes(typeof s.lunchTimes === 'string' ? JSON.parse(s.lunchTimes) : s.lunchTimes);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Actions ----

  const saveLunchTimes = async () => {
    setSyncing('lunch');
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'lunchTimes', value: JSON.stringify(lunchTimes) }),
      });
      setSnackbar({ open: true, message: 'Lunch times saved!', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to save lunch times', severity: 'error' });
    }
    setSyncing(null);
  };

  const saveSchoolSettings = async () => {
    setSyncing('school');
    const settings = {
      schoolName,
      semesterStart,
      semesterEnd,
      calendarToken,
      powerschoolUrl: psUrl,
      powerschoolUsername: psUser,
      lunchTimes: JSON.stringify(lunchTimes),
    };
    try {
      for (const [key, value] of Object.entries(settings)) {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
      }
      setSnackbar({ open: true, message: 'Settings saved!', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to save settings', severity: 'error' });
    }
    setSyncing(null);
  };

  const savePowerSchool = async () => {
    setSyncing('ps-save');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-powerschool', url: psUrl, username: psUser, password: psPass }),
      });
      const data = await res.json();
      if (data.success) {
        setSnackbar({ open: true, message: 'PowerSchool login saved. Future imports will run without re-entering credentials.', severity: 'success' });
        setPsPass('');
        const status = await fetch('/api/setup').then((r) => r.json());
        setSetupStatus(status);
      } else {
        setSnackbar({ open: true, message: data.error || 'Failed to save PowerSchool login.', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Network error saving PowerSchool login.', severity: 'error' });
    }
    setSyncing(null);
  };

  const clearPowerSchool = async () => {
    setSyncing('ps-clear');
    try {
      await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear-powerschool' }),
      });
      setPsUrl('');
      setPsUser('');
      setPsPass('');
      setSnackbar({ open: true, message: 'Saved PowerSchool login cleared.', severity: 'info' });
      const status = await fetch('/api/setup').then((r) => r.json());
      setSetupStatus(status);
    } catch {
      setSnackbar({ open: true, message: 'Failed to clear saved login.', severity: 'error' });
    }
    setSyncing(null);
  };

  const syncPowerSchool = async () => {
    setSyncing('powerschool');
    setPsLog([]);
    setPsMatrixSuggestions({});
    try {
      const hasPassword = !!psPass;
      const res = await fetch('/api/powerschool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hasPassword ? { url: psUrl, username: psUser, password: psPass } : {}),
      });
      const data = await res.json();
      if (data.log) setPsLog(data.log);
      if (data.matrixByClassId) setPsMatrixSuggestions(data.matrixByClassId);
      if (data.success) {
        const parts: string[] = [];
        if (data.classAdded) parts.push(`${data.classAdded} added`);
        if (data.classUpdated) parts.push(`${data.classUpdated} updated`);
        if (data.classRemoved) parts.push(`${data.classRemoved} removed`);
        const classSummary = parts.length > 0 ? parts.join(', ') : 'no changes';
        setSnackbar({ open: true, message: `PowerSchool sync complete — ${classSummary}. ${data.assignmentCount || 0} assignments synced.`, severity: 'success' });
        if (hasPassword) setPsPass('');
        refetchClasses();
        refetchClassesList();
        const status = await fetch('/api/setup').then((r) => r.json());
        setSetupStatus(status);
        if (data.matrixByClassId && Object.keys(data.matrixByClassId).length > 0) {
          if (confirm('PowerSchool suggested schedule matches were found. Run a one-time migration to link matching manual classes to their PowerSchool entries (recommended)?')) {
            setSyncing('migrating');
            try {
              const resp = await fetch('/api/powerschool/migrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
              const j = await resp.json().catch(() => ({}));
              if (resp.ok && j && j.success) {
                const migratedCount = Number(j.migrated || 0);
                setSnackbar({ open: true, message: migratedCount > 0 ? `Migration complete: ${migratedCount} classes linked.` : 'Migration complete: no manual classes needed linking.', severity: migratedCount > 0 ? 'success' : 'info' });
                refetchClassesList();
                refetchClasses();
              } else {
                setSnackbar({ open: true, message: (j && j.error) ? j.error : 'Migration failed', severity: 'error' });
              }
            } catch (err) {
              setSnackbar({ open: true, message: `Migration error: ${(err as Error).message}`, severity: 'error' });
            }
            setSyncing(null);
          }
        }
      } else {
        setSnackbar({ open: true, message: data.error || 'PowerSchool import failed', severity: 'error' });
      }
    } catch (e) {
      setSnackbar({ open: true, message: `Connection error: ${(e as Error).message}`, severity: 'error' });
    }
    setSyncing(null);
  };

  const saveClassroomOAuth = async () => {
    setSyncing('classroom-save');
    try {
      await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-classroom-oauth', clientId: classroomClientId, clientSecret: classroomClientSecret }),
      });
      setSnackbar({ open: true, message: 'Classroom OAuth credentials saved!', severity: 'success' });
      const status = await fetch('/api/setup').then((r) => r.json());
      setSetupStatus(status);
    } catch {
      setSnackbar({ open: true, message: 'Failed to save', severity: 'error' });
    }
    setSyncing(null);
  };

  const connectClassroom = async () => {
    setSyncing('classroom');
    try {
      const res = await fetch('/api/classroom');
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else if (data.needsSetup) {
        setSnackbar({ open: true, message: data.error, severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Connection error', severity: 'error' });
    }
    setSyncing(null);
  };

  const copyCalendarUrl = () => {
    navigator.clipboard.writeText(calendarUrl);
    setSnackbar({ open: true, message: 'Calendar URL copied to clipboard!', severity: 'success' });
  };

  // ---- Render ----

  const healthChip = (() => {
    if (liveHealth.checking) {
      return (
        <Chip
          size="small"
          icon={<CircularProgress size={12} sx={{ color: 'inherit !important' }} />}
          label="Checking database…"
          variant="outlined"
        />
      );
    }
    if (liveHealth.ok === null) return null;
    if (liveHealth.ok) {
      return (
        <Tooltip title="Click to re-check connection">
          <Chip
            size="small"
            color="success"
            icon={<CheckCircleIcon />}
            label="Database connected"
            onClick={() => refreshLiveHealth(true)}
            clickable
          />
        </Tooltip>
      );
    }
    return (
      <Tooltip title={liveHealth.error ? `Error: ${liveHealth.error}. Click to retry.` : 'Click to retry'}>
        <Chip
          size="small"
          color="error"
          icon={<ErrorIcon />}
          label="Database error"
          onClick={() => refreshLiveHealth(true)}
          clickable
        />
      </Tooltip>
    );
  })();

  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400 }}>Settings</Typography>
        {healthChip}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Your data is stored in a Neon PostgreSQL database — it syncs across every device automatically.
      </Typography>

      <Stack spacing={3}>

        {/* ===== DATABASE STATUS ===== */}
        {liveHealth.ok === false && (
          <Alert severity="error" icon={<StorageIcon />}>
            <strong>Database unreachable.</strong> {liveHealth.error || 'Check that DATABASE_URL is set correctly.'}{' '}
            <Button size="small" onClick={() => refreshLiveHealth(true)}>Retry</Button>
          </Alert>
        )}

        {/* ===== SCHOOL INFORMATION ===== */}
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <SchoolIcon color="primary" /> School Information
            </Typography>
            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField fullWidth label="School Name" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="e.g., Lincoln High School" />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Semester Start" type="date" value={semesterStart} onChange={(e) => setSemesterStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Semester End" type="date" value={semesterEnd} onChange={(e) => setSemesterEnd(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={12}>
                <Button
                  variant="contained"
                  startIcon={syncing === 'school' ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon />}
                  onClick={saveSchoolSettings}
                  disabled={!!syncing}
                >
                  Save School Info
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* ===== POWERSCHOOL ===== */}
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <SyncIcon color="primary" /> PowerSchool Import
              <Chip label="Optional" size="small" variant="outlined" />
              {setupStatus?.hasPowerschool && (
                <Chip label="Login saved" color="success" size="small" icon={<CheckCircleIcon />} />
              )}
            </Typography>
            <Alert severity="info" sx={{ mb: 2, fontSize: '0.85rem' }}>
              Import your class schedule, assignments, and current grades from PowerSchool. Log in once — future imports reuse the saved credentials so you can sync with a single click.
              <br /><strong>Requires Google Chrome</strong> to be installed on the computer running this app.
            </Alert>
            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField
                  fullWidth
                  label="PowerSchool URL"
                  value={psUrl}
                  onChange={(e) => setPsUrl(e.target.value)}
                  placeholder="https://your-school.powerschool.com"
                  helperText="Any URL from your school's PowerSchool portal — the domain will be extracted automatically"
                />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Student Username" value={psUser} onChange={(e) => setPsUser(e.target.value)} />
              </Grid>
              <Grid size={6}>
                <TextField
                  fullWidth
                  label={setupStatus?.hasPowerschool ? 'Password (leave blank to use saved)' : 'Student Password'}
                  type="password"
                  value={psPass}
                  onChange={(e) => setPsPass(e.target.value)}
                  placeholder={setupStatus?.hasPowerschool ? '••••••••  (saved)' : ''}
                  helperText={
                    setupStatus?.hasPowerschool
                      ? 'Leave blank to reuse the saved password, or type a new one to update.'
                      : 'Saved securely on the server after your first import.'
                  }
                />
              </Grid>
              <Grid size={12}>
                <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    startIcon={syncing === 'powerschool' ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
                    onClick={syncPowerSchool}
                    disabled={!!syncing || (!setupStatus?.hasPowerschool && (!psUrl || !psUser || !psPass))}
                  >
                    {setupStatus?.hasPowerschool ? 'Sync Now' : 'Import from PowerSchool'}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={syncing === 'ps-save' ? <CircularProgress size={16} /> : <KeyIcon />}
                    onClick={savePowerSchool}
                    disabled={!psUrl || !psUser || !psPass || !!syncing}
                  >
                    Save Login
                  </Button>
                  {setupStatus?.hasPowerschool && (
                    <Button variant="text" color="error" onClick={clearPowerSchool} disabled={!!syncing}>
                      Clear Saved Login
                    </Button>
                  )}
                </Stack>
              </Grid>
              {psLog.length > 0 && (
                <Grid size={12}>
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="body2">Import Log ({psLog.length} entries)</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Box sx={{ fontFamily: 'monospace', fontSize: '0.75rem', maxHeight: 200, overflow: 'auto', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                        {psLog.map((line, i) => <div key={i}>{line}</div>)}
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>

        {/* ===== SCHEDULE WIZARD ===== */}
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <CalendarMonthIcon color="primary" />
              <Typography variant="h6">Schedule Setup Wizard</Typography>
              <Chip label="Optional" size="small" variant="outlined" />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Create and edit your internal schedule. Pick from classes imported from PowerSchool and set the days, period, and times the app should use. PowerSchool syncs will preserve these manual schedule fields.
            </Typography>

            <Box sx={{ mb: 2 }}>
              <Button
                variant="contained"
                onClick={async () => {
                  try {
                    await refetchClassesList();
                    setWizardOpen(true);
                    setWizardIndex(0);
                  } catch (e) {
                    setSnackbar({ open: true, message: `Failed to refresh classes: ${(e as Error).message}`, severity: 'error' });
                  }
                }}
                disabled={classesLoading}
              >
                Open Schedule Wizard
              </Button>
              <Button variant="outlined" sx={{ ml: 2 }} onClick={async () => {
                if (!importedClasses || importedClasses.length === 0) return;
                if (!confirm('Apply the Lathrop HS default bell schedule to all classes? This will update days and per-day times for each period.')) return;
                setSyncing('apply-default');
                try {
                  // Slot keys: 'ext' = Extension (Tue/Wed/Thu 7:30-8:05), 1..6 = Periods 1-6.
                  type SlotKey = 'ext' | 1 | 2 | 3 | 4 | 5 | 6;
                  const weekTemplate: Record<number, Partial<Record<SlotKey, { start: string; end: string }>>> = {
                    1: { 1: { start: '07:30', end: '08:24' }, 2: { start: '08:31', end: '09:25' }, 3: { start: '09:32', end: '10:26' }, 4: { start: '11:04', end: '11:58' }, 5: { start: '12:05', end: '12:59' }, 6: { start: '13:06', end: '14:00' } },
                    2: { ext: { start: '07:30', end: '08:05' }, 1: { start: '08:13', end: '09:26' }, 2: { start: '09:34', end: '10:47' }, 4: { start: '11:26', end: '12:39' }, 5: { start: '12:47', end: '14:00' } },
                    3: { ext: { start: '07:30', end: '08:05' }, 2: { start: '08:13', end: '09:26' }, 3: { start: '09:34', end: '10:47' }, 5: { start: '11:26', end: '12:39' }, 6: { start: '12:47', end: '14:00' } },
                    4: { ext: { start: '07:30', end: '08:05' }, 1: { start: '08:13', end: '09:26' }, 3: { start: '09:34', end: '10:47' }, 4: { start: '11:26', end: '12:39' }, 6: { start: '12:47', end: '14:00' } },
                    5: { 1: { start: '07:30', end: '08:24' }, 2: { start: '08:31', end: '09:25' }, 3: { start: '09:32', end: '10:26' }, 4: { start: '11:04', end: '11:58' }, 5: { start: '12:05', end: '12:59' }, 6: { start: '13:06', end: '14:00' } },
                  };
                  // Detect Extension period by name. Lathrop's Extension block is
                  // typically labeled "Ext Seminar" / "Extension" / "Advisory" /
                  // "Homeroom" in PowerSchool — none of which carry a numeric
                  // period that maps cleanly to 1-6.
                  const isExtension = (name: string) => /\b(ext|extension|seminar|advisory|homeroom)\b/i.test(name || '');
                  const promises: Promise<Response>[] = [];
                  let skipped = 0;
                  for (const c of importedClasses) {
                    // parseInt is lenient — handles "1", "1A", " 2 " all correctly.
                    const periodNum = parseInt(String(c.period ?? ''), 10);
                    let slot: SlotKey | null = null;
                    if (isExtension(c.name)) slot = 'ext';
                    else if (periodNum >= 1 && periodNum <= 6) slot = periodNum as SlotKey;
                    if (slot === null) { skipped++; continue; }
                    const days: number[] = [];
                    const dayTimes: Record<number, { startTime: string; endTime: string }> = {};
                    for (let d = 1; d <= 5; d++) {
                      const slotTime = weekTemplate[d]?.[slot];
                      if (slotTime) {
                        days.push(d);
                        dayTimes[d] = { startTime: slotTime.start, endTime: slotTime.end };
                      }
                    }
                    if (days.length === 0) { skipped++; continue; }
                    const firstDay = days[0];
                    const representative = dayTimes[firstDay];
                    const updated = { ...c, startTime: representative.startTime, endTime: representative.endTime, days: days.sort((a, b) => a - b), dayTimes } as SchoolClass;
                    promises.push(fetch('/api/classes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) }));
                  }
                  await Promise.all(promises);
                  const msg = skipped > 0
                    ? `Lathrop HS bell schedule applied to ${promises.length} class${promises.length === 1 ? '' : 'es'}. ${skipped} class${skipped === 1 ? '' : 'es'} skipped (no recognizable period 1-6 or Extension) — edit them in the wizard.`
                    : 'Lathrop HS bell schedule applied. Review and adjust any class times if needed.';
                  setSnackbar({ open: true, message: msg, severity: 'success' });
                  refetchClassesList();
                  refetchClasses();
                } catch (err) {
                  setSnackbar({ open: true, message: `Failed to apply default schedule: ${(err as Error).message}`, severity: 'error' });
                }
                setSyncing(null);
              }} disabled={classesLoading || !!syncing}>
                Apply Default Bell Schedule
              </Button>
              <Button variant="text" sx={{ ml: 2 }} onClick={() => refetchClassesList()} disabled={classesLoading}>
                Refresh Classes
              </Button>
            </Box>

            <Collapse in={wizardOpen}>
              <Card variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle1">Step {wizardIndex + 1} of {importedClasses ? importedClasses.length + 1 : 1}</Typography>
                  <Button size="small" onClick={() => { setWizardOpen(false); setEditableClass(null); }}>Close</Button>
                </Box>

                {wizardIndex === 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" sx={{ mb: 1 }}>Pick a class to edit its schedule:</Typography>
                    {classesLoading && <CircularProgress />}
                    {!classesLoading && importedClasses && (
                      <Stack spacing={1}>
                        {importedClasses.map((c: SchoolClass) => (
                          <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Button size="small" onClick={() => {
                              const clone: SchoolClass = { ...c, dayTimes: c.dayTimes ? { ...c.dayTimes } : undefined };
                              if (clone.startTime) { const n = normalizeTime(clone.startTime); if (n) clone.startTime = n; }
                              if (clone.endTime) { const n = normalizeTime(clone.endTime); if (n) clone.endTime = n; }
                              if (clone.dayTimes) {
                                for (const k of Object.keys(clone.dayTimes)) {
                                  const dt = clone.dayTimes[Number(k)];
                                  if (!dt) continue;
                                  const ns = normalizeTime(dt.startTime);
                                  const ne = normalizeTime(dt.endTime);
                                  if (ns) dt.startTime = ns;
                                  if (ne) dt.endTime = ne;
                                }
                              }
                              setEditableClass(clone);
                              setWizardIndex(1);
                            }}>Edit</Button>
                            <Typography>{c.name} (P{c.period})</Typography>
                          </Box>
                        ))}
                      </Stack>
                    )}
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 600 }}>Lunch Times</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                      Default times match the Lathrop HS bell schedule. Adjust if needed.
                    </Typography>
                    <Grid container spacing={1}>
                      {([
                        { label: 'Mon', day: 1 }, { label: 'Tue', day: 2 }, { label: 'Wed', day: 3 },
                        { label: 'Thu', day: 4 }, { label: 'Fri', day: 5 },
                      ] as { label: string; day: number }[]).map(({ label, day }) => (
                        <Grid size={2.4} key={day}>
                          <Stack spacing={0.5}>
                            <Typography variant="caption" sx={{ fontWeight: 600, textAlign: 'center' }}>{label}</Typography>
                            <TextField size="small" type="time" label="Start" value={lunchTimes[day]?.startTime || ''} onChange={(e) => updateLunchTime(day, 'startTime', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                            <TextField size="small" type="time" label="End" value={lunchTimes[day]?.endTime || ''} onChange={(e) => updateLunchTime(day, 'endTime', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                          </Stack>
                        </Grid>
                      ))}
                    </Grid>
                    <Button size="small" variant="contained" sx={{ mt: 1.5 }} onClick={saveLunchTimes} disabled={!!syncing} startIcon={syncing === 'lunch' ? <CircularProgress size={14} color="inherit" /> : <CheckCircleIcon />}>
                      Save Lunch Times
                    </Button>
                  </Box>
                )}

                {wizardIndex === 1 && editableClass && (
                  <Box sx={{ mt: 2 }}>
                    {psMatrixSuggestions && psMatrixSuggestions[editableClass.id] && (
                      (() => {
                        const s = psMatrixSuggestions[editableClass.id] as { days: number[]; startTime?: string; endTime?: string } | undefined;
                        if (!s) return null;
                        const labels = s.days.map((d) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ');
                        const times = s.startTime ? ` · ${s.startTime}${s.endTime ? `–${s.endTime}` : ''}` : '';
                        return (
                          <Alert severity="info" sx={{ mb: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Box sx={{ mr: 2 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>PowerSchool suggestion</Typography>
                                <Typography variant="caption" color="text.secondary">{labels}{times}</Typography>
                              </Box>
                              <Box>
                                <Button size="small" onClick={() => {
                                  const suggestion = psMatrixSuggestions[editableClass.id];
                                  if (!suggestion) return;
                                  const daysArr = (suggestion.days || []).slice().sort((a: number, b: number) => a - b);
                                  const newDayTimes = { ...(editableClass.dayTimes || {}) } as Record<number, { startTime: string; endTime: string }>;
                                  if (suggestion.startTime) {
                                    const ns = normalizeTime(suggestion.startTime) || suggestion.startTime!;
                                    const ne = normalizeTime(suggestion.endTime) || suggestion.endTime || suggestion.startTime!;
                                    for (const d of daysArr) newDayTimes[d] = { startTime: ns, endTime: ne };
                                  }
                                  setEditableClass({ ...editableClass, days: daysArr, dayTimes: Object.keys(newDayTimes).length > 0 ? newDayTimes : undefined });
                                  setSnackbar({ open: true, message: 'Applied PowerSchool suggestion (not yet saved). Click Save to persist.', severity: 'success' });
                                }}>Apply suggestion</Button>
                                <Button size="small" sx={{ ml: 1 }} onClick={() => {
                                  setPsMatrixSuggestions((prev) => { const copy = { ...(prev || {}) }; delete copy[editableClass.id]; return copy; });
                                }}>Dismiss</Button>
                              </Box>
                            </Box>
                          </Alert>
                        );
                      })()
                    )}
                    <Typography variant="subtitle2">Editing: {editableClass.name}</Typography>
                    <Grid container spacing={1} sx={{ mt: 1 }}>
                      <Grid size={12}>
                        <TextField fullWidth label="Period" type="number" value={editableClass.period || ''} onChange={(e) => setEditableClass({ ...editableClass, period: parseInt(e.target.value || '0', 10) || 0 })} />
                      </Grid>
                      <Grid size={6}>
                        <TextField fullWidth label="Start Time" type="time" value={normalizeTime(editableClass.startTime) || editableClass.startTime || '08:00'} onChange={(e) => setEditableClass({ ...editableClass, startTime: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                      </Grid>
                      <Grid size={6}>
                        <TextField fullWidth label="End Time" type="time" value={normalizeTime(editableClass.endTime) || editableClass.endTime || '08:50'} onChange={(e) => setEditableClass({ ...editableClass, endTime: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                      </Grid>
                      <Grid size={12}>
                        <Typography variant="body2">Days</Typography>
                        <Box>
                          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, idx) => {
                            const weekdayNum = (idx + 1) % 7;
                            return (
                              <FormControlLabel
                                key={d}
                                control={<Checkbox
                                  checked={(editableClass.days || []).includes(weekdayNum)}
                                  onChange={(e) => {
                                    const daysSet = new Set<number>(editableClass.days || []);
                                    let dayTimesCopy: Record<number, { startTime: string; endTime: string }> | undefined = editableClass.dayTimes ? { ...editableClass.dayTimes } : undefined;
                                    if (e.target.checked) {
                                      daysSet.add(weekdayNum);
                                    } else {
                                      daysSet.delete(weekdayNum);
                                      if (dayTimesCopy) { delete dayTimesCopy[weekdayNum as keyof typeof dayTimesCopy]; if (Object.keys(dayTimesCopy).length === 0) dayTimesCopy = undefined; }
                                    }
                                    setEditableClass({ ...editableClass, days: Array.from(daysSet).sort((a, b) => a - b), dayTimes: dayTimesCopy });
                                  }}
                                />} label={d}
                              />
                            );
                          })}
                        </Box>
                      </Grid>
                      <Grid size={12}>
                        <Typography variant="body2" sx={{ mt: 1, mb: 1 }}>Per-day Times (optional)</Typography>
                        <Box>
                          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, idx) => {
                            const weekdayNum = (idx + 1) % 7;
                            const meets = (editableClass.days || []).includes(weekdayNum);
                            const dt = editableClass.dayTimes && editableClass.dayTimes[weekdayNum];
                            const overrideChecked = !!dt;
                            return (
                              <Box key={d} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <FormControlLabel
                                  control={<Checkbox checked={overrideChecked} onChange={(e) => {
                                    const dayTimes = { ...(editableClass.dayTimes || {}) } as Record<number, { startTime: string; endTime: string }>;
                                    if (e.target.checked) {
                                      const ns = normalizeTime(editableClass.startTime) || editableClass.startTime || '08:00';
                                      const ne = normalizeTime(editableClass.endTime) || editableClass.endTime || '08:50';
                                      dayTimes[weekdayNum] = dayTimes[weekdayNum] || { startTime: ns, endTime: ne };
                                    } else {
                                      delete dayTimes[weekdayNum as keyof typeof dayTimes];
                                    }
                                    setEditableClass({ ...editableClass, dayTimes: Object.keys(dayTimes).length > 0 ? dayTimes : undefined });
                                  }} disabled={!meets} />} label={d}
                                />
                                <TextField size="small" type="time" value={normalizeTime(editableClass.dayTimes && editableClass.dayTimes[weekdayNum]?.startTime) || (editableClass.dayTimes && editableClass.dayTimes[weekdayNum]?.startTime) || ''}
                                  onChange={(e) => {
                                    const newDayTimes = { ...(editableClass.dayTimes || {}) } as Record<number, { startTime: string; endTime: string }>;
                                    const ns = normalizeTime(editableClass.startTime) || editableClass.startTime || '08:00';
                                    const ne = normalizeTime(editableClass.endTime) || editableClass.endTime || '08:50';
                                    newDayTimes[weekdayNum] = newDayTimes[weekdayNum] || { startTime: ns, endTime: ne };
                                    newDayTimes[weekdayNum].startTime = e.target.value;
                                    setEditableClass({ ...editableClass, dayTimes: newDayTimes });
                                  }} sx={{ width: 120 }} disabled={!meets || !overrideChecked} />
                                <Typography variant="caption">–</Typography>
                                <TextField size="small" type="time" value={normalizeTime(editableClass.dayTimes && editableClass.dayTimes[weekdayNum]?.endTime) || (editableClass.dayTimes && editableClass.dayTimes[weekdayNum]?.endTime) || ''}
                                  onChange={(e) => {
                                    const newDayTimes = { ...(editableClass.dayTimes || {}) } as Record<number, { startTime: string; endTime: string }>;
                                    const ns = normalizeTime(editableClass.startTime) || editableClass.startTime || '08:00';
                                    const ne = normalizeTime(editableClass.endTime) || editableClass.endTime || '08:50';
                                    newDayTimes[weekdayNum] = newDayTimes[weekdayNum] || { startTime: ns, endTime: ne };
                                    newDayTimes[weekdayNum].endTime = e.target.value;
                                    setEditableClass({ ...editableClass, dayTimes: newDayTimes });
                                  }} sx={{ width: 120 }} disabled={!meets || !overrideChecked} />
                              </Box>
                            );
                          })}
                          <Box sx={{ mt: 1 }}>
                            <Button size="small" onClick={() => {
                              const daysArr = editableClass.days || [];
                              const newDayTimes = { ...(editableClass.dayTimes || {}) } as Record<number, { startTime: string; endTime: string }>;
                              const normStart = normalizeTime(editableClass.startTime) || editableClass.startTime || '08:00';
                              const normEnd = normalizeTime(editableClass.endTime) || editableClass.endTime || '08:50';
                              for (const d of daysArr) newDayTimes[d] = { startTime: normStart, endTime: normEnd };
                              setEditableClass({ ...editableClass, dayTimes: newDayTimes });
                            }}>Apply Default Times To Selected Days</Button>
                            <Button size="small" sx={{ ml: 1 }} onClick={() => setEditableClass({ ...editableClass, dayTimes: undefined })}>Clear Per-Day Overrides</Button>
                          </Box>
                        </Box>
                      </Grid>
                    </Grid>
                    <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                      <Button variant="contained" onClick={async () => {
                        try {
                          const res = await fetch('/api/classes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editableClass) });
                          if (res.ok) {
                            setSnackbar({ open: true, message: 'Schedule saved', severity: 'success' });
                            setWizardIndex(0);
                            refetchClassesList();
                            refetchClasses();
                            setEditableClass(null);
                          } else {
                            const j = await res.json().catch(() => ({}));
                            setSnackbar({ open: true, message: j.error || 'Failed to save', severity: 'error' });
                          }
                        } catch (e) {
                          setSnackbar({ open: true, message: `Network error: ${(e as Error).message}`, severity: 'error' });
                        }
                      }}>Save</Button>
                      <Button variant="outlined" onClick={() => { setEditableClass(null); setWizardIndex(0); }}>Back</Button>
                    </Box>
                  </Box>
                )}
              </Card>
            </Collapse>
          </CardContent>
        </Card>

        {/* ===== GOOGLE CLASSROOM ===== */}
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CloudSyncIcon color="primary" /> Google Classroom Import
              <Chip label="Optional" size="small" variant="outlined" />
            </Typography>
            <Accordion sx={{ mb: 2 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2">Setup Instructions (one-time)</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1}>
                  <Typography variant="body2">
                    1. Go to{' '}
                    <Link href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" sx={{ fontWeight: 600 }}>
                      Google Cloud Console → Credentials <OpenInNewIcon sx={{ fontSize: 14, verticalAlign: 'middle' }} />
                    </Link>
                  </Typography>
                  <Typography variant="body2">
                    2. Enable the <strong>&quot;Google Classroom API&quot;</strong> in{' '}
                    <Link href="https://console.cloud.google.com/apis/library/classroom.googleapis.com" target="_blank" rel="noopener">
                      API Library <OpenInNewIcon sx={{ fontSize: 14, verticalAlign: 'middle' }} />
                    </Link>.
                  </Typography>
                  <Typography variant="body2">
                    3. Click <strong>&quot;+ CREATE CREDENTIALS&quot; → &quot;OAuth client ID&quot;</strong>.
                  </Typography>
                  <Typography variant="body2">
                    4. If prompted, configure the <strong>OAuth consent screen</strong> first (External, add your email as test user).
                  </Typography>
                  <Typography variant="body2">
                    5. Choose <strong>&quot;Web application&quot;</strong>. Under <strong>&quot;Authorized redirect URIs&quot;</strong>, add:
                  </Typography>
                  <Alert severity="info" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/classroom/callback
                  </Alert>
                  <Typography variant="body2">
                    6. Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> and paste them below:
                  </Typography>
                </Stack>
              </AccordionDetails>
            </Accordion>
            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField fullWidth label="OAuth Client ID" value={classroomClientId} onChange={(e) => setClassroomClientId(e.target.value)} placeholder="...apps.googleusercontent.com" />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="OAuth Client Secret" type="password" value={classroomClientSecret} onChange={(e) => setClassroomClientSecret(e.target.value)} />
              </Grid>
              <Grid size={12}>
                <Stack direction="row" spacing={2}>
                  <Button
                    variant="outlined"
                    startIcon={syncing === 'classroom-save' ? <CircularProgress size={16} /> : <KeyIcon />}
                    onClick={saveClassroomOAuth}
                    disabled={!classroomClientId || !classroomClientSecret || !!syncing}
                  >
                    Save OAuth Credentials
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={syncing === 'classroom' ? <CircularProgress size={16} color="inherit" /> : <CloudSyncIcon />}
                    onClick={connectClassroom}
                    disabled={!!syncing || (!setupStatus?.hasClassroomOAuth && !classroomClientId)}
                  >
                    Connect &amp; Import
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* ===== CALENDAR FEED ===== */}
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CalendarMonthIcon color="primary" /> Calendar Feed (iCal)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Subscribe to this URL in <strong>Google Calendar</strong>, <strong>Apple Calendar</strong>, or <strong>Outlook</strong> to see your class schedule, exams, and homework due dates on your phone and computer.
            </Typography>
            <Alert severity="info" sx={{ mb: 2, fontSize: '0.85rem' }}>
              <strong>How to subscribe:</strong><br />
              <strong>Google Calendar:</strong> Settings → &quot;Add calendar&quot; → &quot;From URL&quot; → paste the URL below<br />
              <strong>Apple Calendar:</strong> File → &quot;New Calendar Subscription&quot; → paste the URL below<br />
              <strong>Outlook:</strong> &quot;Add calendar&quot; → &quot;Subscribe from web&quot; → paste the URL below
            </Alert>
            <Grid container spacing={2}>
              <Grid size={8}>
                <TextField fullWidth label="Secret Token" value={calendarToken} onChange={(e) => setCalendarToken(e.target.value)} placeholder="Click Generate to create a token" />
              </Grid>
              <Grid size={4} sx={{ display: 'flex', alignItems: 'center' }}>
                <Button variant="outlined" onClick={() => setCalendarToken(crypto.randomUUID())} fullWidth>
                  Generate Token
                </Button>
              </Grid>
              <Grid size={12}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField fullWidth label="Calendar Subscription URL" value={calendarUrl} slotProps={{ input: { readOnly: true } }} />
                  <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={copyCalendarUrl}>Copy</Button>
                </Box>
              </Grid>
              <Grid size={12}>
                <Typography variant="caption" color="text.secondary">
                  Remember to click &quot;Save School Info&quot; above after generating a token so it persists.
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

      </Stack>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

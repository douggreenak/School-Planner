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
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import StepContent from '@mui/material/StepContent';
import Link from '@mui/material/Link';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import { alpha } from '@mui/material/styles';
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
import LinkIcon from '@mui/icons-material/Link';
import QrCodeIcon from '@mui/icons-material/QrCode';
import DevicesIcon from '@mui/icons-material/Devices';
import LockIcon from '@mui/icons-material/Lock';
import { useClasses } from '@/lib/hooks';
import type { SchoolClass } from '@/types';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';

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

  // Connection status
  const [setupStatus, setSetupStatus] = useState<{
    configured: boolean;
    missing: string[];
    hasServiceAccount: boolean;
    serviceAccountEmail: string;
    hasSpreadsheet: boolean;
    spreadsheetId: string;
    hasClassroomOAuth: boolean;
    hasPowerschool: boolean;
    powerschoolUrl: string;
    powerschoolUsername: string;
  } | null>(null);
  const [connectionTest, setConnectionTest] = useState<{
    tested: boolean;
    success: boolean;
    spreadsheetTitle?: string;
    error?: string;
    hint?: string;
  }>({ tested: false, success: false });

  // Live health: actually pings the Google Sheets API to verify reachability.
  // Unlike `setupStatus` (which only reports config presence), this tells us
  // whether the service account + sheet ID still work right now.
  const [liveHealth, setLiveHealth] = useState<{
    checking: boolean;
    ok: boolean | null; // null = never checked
    spreadsheetTitle?: string;
    error?: string;
    checkedAt?: number;
  }>({ checking: false, ok: null });

  const refreshLiveHealth = async (force = false) => {
    setLiveHealth((prev) => ({ ...prev, checking: true }));
    try {
      const res = await fetch(`/api/setup/health${force ? '?force=1' : ''}`);
      const data = await res.json();
      setLiveHealth({
        checking: false,
        ok: !!data.ok,
        spreadsheetTitle: data.spreadsheetTitle,
        error: data.error,
        checkedAt: data.checkedAt,
      });
    } catch (e) {
      setLiveHealth({ checking: false, ok: false, error: (e as Error).message });
    }
  };

  // Credentials (entered in UI, saved to config.json on server)
  const [serviceEmail, setServiceEmail] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetsInitialized, setSheetsInitialized] = useState(false);

  // School info (saved to Google Sheets)
  const [schoolName, setSchoolName] = useState('');
  const [semesterStart, setSemesterStart] = useState('');
  const [semesterEnd, setSemesterEnd] = useState('');

  // PowerSchool
  const [psUrl, setPsUrl] = useState('');
  const [psUser, setPsUser] = useState('');
  const [psPass, setPsPass] = useState('');
  const [psLog, setPsLog] = useState<string[]>([]);
  const [psMatrixSuggestions, setPsMatrixSuggestions] = useState<Record<string, { days: number[]; startTime?: string; endTime?: string }>>({});
  // Normalize names client-side for matching to PowerSchool rows
  const normalizeName = (s?: string | null) => (s ? String(s).replace(/\u00A0/g, ' ').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase() : '');

  // Google Classroom OAuth
  const [classroomClientId, setClassroomClientId] = useState('');
  const [classroomClientSecret, setClassroomClientSecret] = useState('');

  // Calendar
  const [calendarToken, setCalendarToken] = useState('');
  const [calendarUrl, setCalendarUrl] = useState('');

  // Setup Code (quick setup for new devices)
  const [setupCode, setSetupCode] = useState('');
  const [setupPassphrase, setSetupPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [generatePassphrase, setGeneratePassphrase] = useState('');
  const [showGeneratePassphrase, setShowGeneratePassphrase] = useState(false);
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
      setSnackbar({
        open: true,
        message: `Google Classroom imported! ${classes} classes and ${assignments} assignments added.`,
        severity: 'success',
      });
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
        if (data.serviceAccountEmail) setServiceEmail(data.serviceAccountEmail);
        if (data.spreadsheetId) setSpreadsheetId(data.spreadsheetId);
        if (data.powerschoolUrl) setPsUrl(data.powerschoolUrl);
        if (data.powerschoolUsername) setPsUser(data.powerschoolUsername);
        // We never send the password back to the client. If it's saved server-side,
        // we show a placeholder message and let the import use the saved value.
        // Kick off a live health check too — only meaningful if creds are saved.
        if (data.hasServiceAccount && data.hasSpreadsheet) {
          refreshLiveHealth();
        }
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
      })
      .catch(() => {});
  }, []);

  // ---- Actions ----

  const saveCredentials = async () => {
    setSyncing('credentials');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-credentials',
          serviceAccountEmail: serviceEmail,
          privateKey,
          spreadsheetId,
        }),
      });
      const data = await res.json();
      setConnectionTest({ tested: true, success: data.success, spreadsheetTitle: data.spreadsheetTitle, error: data.error, hint: data.hint });
      if (data.success) {
        setSheetsInitialized(true);
        setSnackbar({ open: true, message: data.message || 'Connected and initialized!', severity: 'success' });
        const status = await fetch('/api/setup').then((r) => r.json());
        setSetupStatus(status);
      } else {
        setSnackbar({ open: true, message: data.hint || data.error || 'Connection failed. Check your credentials.', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to save credentials', severity: 'error' });
    }
    setSyncing(null);
  };

  const testConnection = async () => {
    setSyncing('test');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test-connection' }),
      });
      const data = await res.json();
      setConnectionTest({ tested: true, success: data.success, spreadsheetTitle: data.spreadsheetTitle, error: data.error, hint: data.hint });
      if (data.success) {
        setSnackbar({ open: true, message: `Connected to "${data.spreadsheetTitle}"!`, severity: 'success' });
      } else {
        setSnackbar({ open: true, message: data.hint || data.error || 'Connection failed', severity: 'error' });
      }
    } catch {
      setConnectionTest({ tested: true, success: false, error: 'Network error' });
    }
    setSyncing(null);
  };

  const saveSchoolSettings = async () => {
    setSyncing('school');
    const settings = { schoolName, semesterStart, semesterEnd, calendarToken, powerschoolUrl: psUrl, powerschoolUsername: psUser };
    try {
      for (const [key, value] of Object.entries(settings)) {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
      }
      setSnackbar({ open: true, message: 'Settings saved to Google Sheets! They will persist across all devices.', severity: 'success' });
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
        body: JSON.stringify({
          action: 'save-powerschool',
          url: psUrl,
          username: psUser,
          password: psPass,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSnackbar({ open: true, message: 'PowerSchool login saved. Future imports will run without re-entering credentials.', severity: 'success' });
        setPsPass(''); // clear the password field — it's now stored server-side
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
      // If the password field is blank, fall back to the saved server-side password.
      // Otherwise pass the form values (which also triggers re-saving them server-side).
      const hasPassword = !!psPass;
      const res = await fetch('/api/powerschool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          hasPassword
            ? { url: psUrl, username: psUser, password: psPass }
            : {}, // empty body → route uses saved config
        ),
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
        setSnackbar({
          open: true,
          message: `PowerSchool sync complete — ${classSummary}. ${data.assignmentCount || 0} assignments synced.`,
          severity: 'success',
        });
        if (hasPassword) setPsPass('');
        refetchClasses();
        // Refresh the local classes list for the schedule wizard
        refetchClassesList();
        // Refresh setup status so the "saved" pill shows up after a fresh save
        const status = await fetch('/api/setup').then((r) => r.json());
        setSetupStatus(status);
        // If the server returned matrix suggestions, also offer a one-time
        // migration prompt to link existing manual rows to PowerSchool when
        // heuristics suggest a match. This prevents duplicate classes on
        // subsequent imports. We only do this when there are suggestions
        // and when the user opted to allow migrations via a simple confirm.
        if (data.matrixByClassId && Object.keys(data.matrixByClassId).length > 0) {
          // Ask the user whether to run an automatic migration linking
          // matched manual rows to their PowerSchool sourceId. This will
          // update the Classes sheet in place and is reversible only by
          // manual edits in the sheet, so require confirmation.
          if (confirm('PowerSchool suggested schedule matches were found. Run a one-time migration to link matching manual classes to their PowerSchool entries (recommended)?')) {
            setSyncing('migrating');
            try {
              const resp = await fetch('/api/powerschool/migrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
              const j = await resp.json();
              if (resp.ok && j.migrated) {
                setSnackbar({ open: true, message: `Migration complete: ${j.migrated} classes linked.`, severity: 'success' });
                refetchClassesList();
                refetchClasses();
              } else {
                setSnackbar({ open: true, message: j.error || 'Migration failed', severity: 'error' });
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
        body: JSON.stringify({
          action: 'save-classroom-oauth',
          clientId: classroomClientId,
          clientSecret: classroomClientSecret,
        }),
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

  const useSetupCode = async () => {
    setSyncing('setup-code');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'use-setup-code', setupCode, passphrase: setupPassphrase }),
      });
      const data = await res.json();
      if (data.success) {
        setConnectionTest({ tested: true, success: true, spreadsheetTitle: data.spreadsheetTitle });
        setSheetsInitialized(true);
        setSnackbar({ open: true, message: data.message || 'Connected! All credentials restored from setup code.', severity: 'success' });
        // Refresh setup status
        const status = await fetch('/api/setup').then((r) => r.json());
        setSetupStatus(status);
        if (status.serviceAccountEmail) setServiceEmail(status.serviceAccountEmail);
        if (status.spreadsheetId) setSpreadsheetId(status.spreadsheetId);
        // Clear sensitive inputs
        setSetupCode('');
        setSetupPassphrase('');
      } else {
        setSnackbar({ open: true, message: data.hint || data.error || 'Failed to restore from setup code.', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Network error while restoring setup code.', severity: 'error' });
    }
    setSyncing(null);
  };

  const generateSetupCode = async () => {
    setSyncing('generate-code');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-setup-code', passphrase: generatePassphrase }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedCode(data.setupCode);
        setSnackbar({ open: true, message: 'Setup code generated! Copy it and save it somewhere safe.', severity: 'success' });
      } else {
        setSnackbar({ open: true, message: data.error || 'Failed to generate setup code.', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Network error.', severity: 'error' });
    }
    setSyncing(null);
  };

  const copySetupCode = () => {
    navigator.clipboard.writeText(generatedCode);
    setSnackbar({ open: true, message: 'Setup code copied to clipboard!', severity: 'success' });
  };

  // ---- Render ----

  const isConnected = connectionTest.tested && connectionTest.success;

  // Build the live-health Chip shown next to the page title. Clicking it forces
  // a fresh check (bypassing the TTL cache in /api/setup/health) so a user who
  // just fixed their creds can confirm right away without waiting 10–30s.
  const healthChip = (() => {
    if (liveHealth.checking) {
      return (
        <Chip
          size="small"
          icon={<CircularProgress size={12} sx={{ color: 'inherit !important' }} />}
          label="Checking Google Sheets…"
          variant="outlined"
        />
      );
    }
    if (liveHealth.ok === null) {
      // Never checked (probably because creds aren't saved yet). Don't show anything.
      return null;
    }
    if (liveHealth.ok) {
      return (
        <Tooltip title="Click to re-check connection">
          <Chip
            size="small"
            color="success"
            icon={<CheckCircleIcon />}
            label={liveHealth.spreadsheetTitle ? `Connected: ${liveHealth.spreadsheetTitle}` : 'Connected'}
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
          label="Sheet unreachable"
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
        All your data is stored in a Google Sheet — it syncs across every device automatically.
      </Typography>

      <Stack spacing={3}>

        {/* ===== QUICK SETUP (shown when NOT yet connected) ===== */}
        {!isConnected && (
          <Card sx={(theme) => ({
            border: '2px solid',
            borderColor: 'primary.main',
            background: theme.palette.mode === 'light'
              ? 'linear-gradient(135deg, #e8f0fe 0%, #f8f9ff 100%)'
              : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.primary.main, 0.04)} 100%)`,
          })}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <DevicesIcon color="primary" />
                <Typography variant="h6">Quick Setup</Typography>
                <Chip label="Fastest" size="small" color="primary" />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Already set up on another device? Paste your <strong>Setup Code</strong> and enter the passphrase to connect instantly — no need to re-enter credentials.
              </Typography>
              <Grid container spacing={2}>
                <Grid size={12}>
                  <TextField
                    fullWidth
                    label="Setup Code"
                    value={setupCode}
                    onChange={(e) => setSetupCode(e.target.value.trim())}
                    placeholder="SP1-..."
                    multiline
                    rows={2}
                    helperText="The setup code generated on your other device"
                  />
                </Grid>
                <Grid size={12}>
                  <TextField
                    fullWidth
                    label="Passphrase"
                    type={showPassphrase ? 'text' : 'password'}
                    value={setupPassphrase}
                    onChange={(e) => setSetupPassphrase(e.target.value)}
                    placeholder="The passphrase you chose when generating the code"
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={() => setShowPassphrase(!showPassphrase)} edge="end" size="small">
                              {showPassphrase ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Grid>
                <Grid size={12}>
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={syncing === 'setup-code' ? <CircularProgress size={18} color="inherit" /> : <LockIcon />}
                    onClick={useSetupCode}
                    disabled={!setupCode || !setupPassphrase || !!syncing}
                  >
                    Connect with Setup Code
                  </Button>
                </Grid>
              </Grid>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                First time? Follow the manual setup steps below instead.
              </Typography>
            </CardContent>
          </Card>
        )}

        {/* ===== STEP 1: GOOGLE SHEETS CONNECTION ===== */}
        <Card sx={{ border: '2px solid', borderColor: isConnected ? 'success.main' : setupStatus?.configured ? 'warning.main' : 'primary.main' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              {isConnected ? (
                <CheckCircleIcon sx={{ color: 'success.main' }} />
              ) : (
                <StorageIcon color="primary" />
              )}
              <Typography variant="h6">
                Step 1: Connect Google Sheets
              </Typography>
              {isConnected && (
                <Chip label="Connected" color="success" size="small" />
              )}
            </Box>

            <Stepper orientation="vertical" sx={{ ml: 1 }}>
              {/* Sub-step A: Create a Google Cloud project */}
              <Step active expanded>
                <StepLabel>
                  <Typography variant="subtitle2">Create a Google Cloud Service Account (one-time setup)</Typography>
                </StepLabel>
                <StepContent>
                  <Stack spacing={1.5}>
                    <Alert severity="info" sx={{ fontSize: '0.85rem' }}>
                      A service account lets this app read/write your Google Sheet without you logging in each time. It takes about 3 minutes.
                    </Alert>
                    <Typography variant="body2">
                      1. Go to{' '}
                      <Link href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" sx={{ fontWeight: 600 }}>
                        Google Cloud Console &rarr; Credentials <OpenInNewIcon sx={{ fontSize: 14, verticalAlign: 'middle' }} />
                      </Link>
                    </Typography>
                    <Typography variant="body2">
                      2. Click <strong>&quot;Create Project&quot;</strong> (name it anything, e.g. &quot;School Planner&quot;), then click <strong>Create</strong>.
                    </Typography>
                    <Typography variant="body2">
                      3. In the left sidebar, click <strong>&quot;Enabled APIs & Services&quot;</strong>, then <strong>&quot;+ ENABLE APIS AND SERVICES&quot;</strong>.
                      Search for <strong>&quot;Google Sheets API&quot;</strong> and enable it.
                    </Typography>
                    <Typography variant="body2">
                      4. Go back to{' '}
                      <Link href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener" sx={{ fontWeight: 600 }}>
                        Service Accounts <OpenInNewIcon sx={{ fontSize: 14, verticalAlign: 'middle' }} />
                      </Link>
                      {' '}&rarr; <strong>&quot;+ CREATE SERVICE ACCOUNT&quot;</strong>.
                      Name it anything (e.g. &quot;school-planner&quot;). Skip optional steps. Click <strong>Done</strong>.
                    </Typography>
                    <Typography variant="body2">
                      5. Click on the service account you just made &rarr; <strong>&quot;Keys&quot;</strong> tab &rarr; <strong>&quot;Add Key&quot; &rarr; &quot;Create new key&quot; &rarr; JSON</strong>.
                      A <code>.json</code> file downloads. Open it in a text editor.
                    </Typography>
                    <Typography variant="body2">
                      6. Copy the <code>client_email</code> and <code>private_key</code> values from that file and paste them below:
                    </Typography>

                    <TextField
                      fullWidth
                      label="Service Account Email"
                      value={serviceEmail}
                      onChange={(e) => setServiceEmail(e.target.value)}
                      placeholder="example@project-id.iam.gserviceaccount.com"
                      helperText='The "client_email" field from the JSON key file'
                    />
                    <TextField
                      fullWidth
                      label="Private Key"
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                      placeholder="-----BEGIN PRIVATE KEY-----\n..."
                      multiline
                      rows={3}
                      helperText='The "private_key" field from the JSON key file (including BEGIN/END lines)'
                    />
                  </Stack>
                </StepContent>
              </Step>

              {/* Sub-step B: Create & share the spreadsheet */}
              <Step active expanded>
                <StepLabel>
                  <Typography variant="subtitle2">Create a Google Sheet and share it</Typography>
                </StepLabel>
                <StepContent>
                  <Stack spacing={1.5}>
                    <Typography variant="body2">
                      1.{' '}
                      <Link href="https://sheets.new" target="_blank" rel="noopener" sx={{ fontWeight: 600 }}>
                        Create a new Google Sheet <OpenInNewIcon sx={{ fontSize: 14, verticalAlign: 'middle' }} />
                      </Link>
                      {' '}(name it &quot;School Planner Data&quot; or whatever you like).
                    </Typography>
                    <Typography variant="body2">
                      2. Click <strong>&quot;Share&quot;</strong> (top-right), and add your service account email as an <strong>Editor</strong>:
                    </Typography>
                    {serviceEmail && (
                      <Alert severity="success" sx={{ fontFamily: 'monospace', fontSize: '0.85rem', cursor: 'pointer' }}
                        onClick={() => { navigator.clipboard.writeText(serviceEmail); setSnackbar({ open: true, message: 'Email copied!', severity: 'info' }); }}>
                        {serviceEmail}
                        <Typography variant="caption" component="span" sx={{ display: 'block', mt: 0.5 }}>Click to copy this email, then paste it in the Share dialog</Typography>
                      </Alert>
                    )}
                    <Typography variant="body2">
                      3. Copy the <strong>Spreadsheet ID</strong> from the URL. It is the long string between <code>/d/</code> and <code>/edit</code>:
                    </Typography>
                    <Alert severity="info" sx={{ fontSize: '0.8rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      https://docs.google.com/spreadsheets/d/<Box component="strong" sx={{ color: 'primary.main' }}>THIS_PART_IS_THE_ID</Box>/edit
                    </Alert>
                    <TextField
                      fullWidth
                      label="Spreadsheet ID"
                      value={spreadsheetId}
                      onChange={(e) => setSpreadsheetId(e.target.value)}
                      placeholder="e.g., 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                    />
                  </Stack>
                </StepContent>
              </Step>

              {/* Sub-step C: Save & test */}
              <Step active expanded>
                <StepLabel>
                  <Typography variant="subtitle2">Save credentials and test the connection</Typography>
                </StepLabel>
                <StepContent>
                  <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                    <Button
                      variant="contained"
                      startIcon={syncing === 'credentials' ? <CircularProgress size={16} color="inherit" /> : <KeyIcon />}
                      onClick={saveCredentials}
                      disabled={!serviceEmail || !privateKey || !spreadsheetId || !!syncing}
                    >
                      Save Credentials
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={syncing === 'test' ? <CircularProgress size={16} /> : <LinkIcon />}
                      onClick={testConnection}
                      disabled={!!syncing}
                    >
                      Test Connection
                    </Button>
                  </Stack>

                  {connectionTest.tested && (
                    <Alert severity={connectionTest.success ? 'success' : 'error'} sx={{ mt: 2 }}>
                      {connectionTest.success
                        ? `Connected to spreadsheet: "${connectionTest.spreadsheetTitle}"`
                        : (connectionTest.hint || connectionTest.error || 'Connection failed')
                      }
                    </Alert>
                  )}

                  {sheetsInitialized && (
                    <Alert severity="success" sx={{ mt: 1 }}>
                      Google Sheets database is ready! All data tabs have been created.
                    </Alert>
                  )}
                </StepContent>
              </Step>
            </Stepper>

            {/* Generate Setup Code — shown after successful connection */}
            {isConnected && (
              <>
                <Divider sx={{ my: 3 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <DevicesIcon sx={{ color: 'primary.main' }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Set up another device?
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Generate a <strong>Setup Code</strong> to instantly connect another device — no need to re-enter service account keys or spreadsheet IDs. The code is encrypted with a passphrase you choose.
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={8}>
                    <TextField
                      fullWidth
                      label="Choose a passphrase"
                      type={showGeneratePassphrase ? 'text' : 'password'}
                      value={generatePassphrase}
                      onChange={(e) => setGeneratePassphrase(e.target.value)}
                      placeholder="Something you'll remember"
                      helperText="You'll need this passphrase on the other device"
                      slotProps={{
                        input: {
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton onClick={() => setShowGeneratePassphrase(!showGeneratePassphrase)} edge="end" size="small">
                                {showGeneratePassphrase ? <VisibilityOff /> : <Visibility />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                  </Grid>
                  <Grid size={4} sx={{ display: 'flex', alignItems: 'flex-start', pt: 1 }}>
                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={syncing === 'generate-code' ? <CircularProgress size={16} /> : <QrCodeIcon />}
                      onClick={generateSetupCode}
                      disabled={!generatePassphrase || generatePassphrase.length < 4 || !!syncing}
                    >
                      Generate Code
                    </Button>
                  </Grid>
                  {generatedCode && (
                    <Grid size={12}>
                      <Alert severity="success" sx={{ mb: 1 }}>
                        Setup code generated! Copy it and save it somewhere safe (password manager, notes app, etc.).
                      </Alert>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                          fullWidth
                          label="Your Setup Code"
                          value={generatedCode}
                          multiline
                          rows={3}
                          slotProps={{ input: { readOnly: true, sx: { fontFamily: 'monospace', fontSize: '0.75rem' } } }}
                        />
                        <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={copySetupCode} sx={{ alignSelf: 'flex-start', mt: 1 }}>
                          Copy
                        </Button>
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </>
            )}
          </CardContent>
        </Card>

        {/* ===== STEP 2: SCHOOL INFO ===== */}
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <SchoolIcon color="primary" /> Step 2: School Information
            </Typography>
            <Alert severity="info" sx={{ mb: 2, fontSize: '0.85rem' }}>
              These settings are saved to your Google Sheet so they persist across all your devices.
            </Alert>
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
                <Button variant="contained" startIcon={syncing === 'school' ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon />} onClick={saveSchoolSettings} disabled={!!syncing}>
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
                <TextField fullWidth label="PowerSchool URL" value={psUrl} onChange={(e) => setPsUrl(e.target.value)} placeholder="https://your-school.powerschool.com" helperText="Any URL from your school's PowerSchool portal (e.g. https://premier.k12northstar.org/guardian/home.html) — the domain will be extracted automatically" />
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
                      ? 'Password is stored encrypted on the server. Leave blank to reuse it, or type a new one to update.'
                      : 'Saved securely on the server after your first import — you won\'t have to re-enter it.'
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
                    <Button
                      variant="text"
                      color="error"
                      onClick={clearPowerSchool}
                      disabled={!!syncing}
                    >
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
                        {psLog.map((line, i) => (
                          <div key={i}>{line}</div>
                        ))}
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
                <Button variant="contained" onClick={() => { setWizardOpen(true); setWizardIndex(0); }} disabled={classesLoading || !importedClasses}>
                  Open Schedule Wizard
                </Button>
                <Button variant="outlined" sx={{ ml: 2 }} onClick={async () => {
                  if (!importedClasses || importedClasses.length === 0) return;
                  if (!confirm('Apply the default bell schedule to all classes? This will set days to Mon–Fri and update start/end times per period.')) return;
                  setSyncing('apply-default');
                  try {
                    // Lathrop HS default bell times (Mon–Fri)
                    const template: Record<number, { start: string; end: string; days: number[] }> = {
                      1: { start: '07:30', end: '08:24', days: [1,2,3,4,5] },
                      2: { start: '08:31', end: '09:25', days: [1,2,3,4,5] },
                      3: { start: '09:32', end: '10:26', days: [1,2,3,4,5] },
                      4: { start: '11:04', end: '11:58', days: [1,2,3,4,5] },
                      5: { start: '12:05', end: '12:59', days: [1,2,3,4,5] },
                      6: { start: '13:06', end: '14:20', days: [1,2,3,4,5] },
                    };
                    const promises: Promise<Response>[] = [];
                    for (const c of importedClasses) {
                      const slot = template[c.period || 0];
                      if (!slot) continue;
                      const updated = { ...c, startTime: slot.start, endTime: slot.end, days: slot.days, dayTimes: c.dayTimes };
                      promises.push(fetch('/api/classes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) }));
                    }
                    await Promise.all(promises);
                    setSnackbar({ open: true, message: 'Default bell schedule applied. Review your classes and Save any edits you make.', severity: 'success' });
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
                  <Box>
                    <Button size="small" onClick={() => { setWizardOpen(false); setEditableClass(null); }}>Close</Button>
                  </Box>
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
                              // Clone to avoid mutating the original object from the list
                              const clone: SchoolClass = { ...c, dayTimes: c.dayTimes ? { ...c.dayTimes } : undefined };
                              setEditableClass(clone);
                              setWizardIndex(1);
                            }}>
                              Edit
                            </Button>
                            <Typography>{c.name} (P{c.period})</Typography>
                          </Box>
                        ))}
                      </Stack>
                    )}
                  </Box>
                )}

                {wizardIndex === 1 && editableClass && (
                  <Box sx={{ mt: 2 }}>
                    {/* PowerSchool matrix suggestion (opt-in) */}
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
                                  // If the matrix included times, set per-day overrides for those days.
                                  const newDayTimes = { ...(editableClass.dayTimes || {}) } as Record<number, { startTime: string; endTime: string }>;
                                  if (suggestion.startTime) {
                                    for (const d of daysArr) {
                                      newDayTimes[d] = { startTime: suggestion.startTime!, endTime: suggestion.endTime || suggestion.startTime! };
                                    }
                                  }
                                  setEditableClass({ ...editableClass, days: daysArr, dayTimes: Object.keys(newDayTimes).length > 0 ? newDayTimes : undefined });
                                  setSnackbar({ open: true, message: 'Applied PowerSchool suggestion (not yet saved). Click Save to persist.', severity: 'success' });
                                }}>Apply suggestion</Button>
                                <Button size="small" sx={{ ml: 1 }} onClick={() => {
                                  // Dismiss for this session
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
                        <TextField fullWidth label="Start Time" type="time" value={editableClass.startTime || '08:00'} onChange={(e) => setEditableClass({ ...editableClass, startTime: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                      </Grid>
                      <Grid size={6}>
                        <TextField fullWidth label="End Time" type="time" value={editableClass.endTime || '08:50'} onChange={(e) => setEditableClass({ ...editableClass, endTime: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                      </Grid>
                      <Grid size={12}>
                        <Typography variant="body2">Days</Typography>
                        <Box>
                          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, idx) => (
                            <FormControlLabel key={d} control={<Checkbox checked={(editableClass.days || []).includes(idx)} onChange={(e) => {
                              const daysSet = new Set<number>(editableClass.days || []);
                              let dayTimesCopy: Record<number, { startTime: string; endTime: string }> | undefined = editableClass.dayTimes ? { ...editableClass.dayTimes } : undefined;
                              if (e.target.checked) {
                                daysSet.add(idx);
                              } else {
                                daysSet.delete(idx);
                                if (dayTimesCopy) {
                                  delete dayTimesCopy[idx as any];
                                  if (Object.keys(dayTimesCopy).length === 0) dayTimesCopy = undefined;
                                }
                              }
                              setEditableClass({ ...editableClass, days: Array.from(daysSet).sort((a, b) => a - b), dayTimes: dayTimesCopy });
                            }} />} label={d} />
                          ))}
                        </Box>
                      </Grid>

                      <Grid size={12}>
                        <Typography variant="body2" sx={{ mt: 1, mb: 1 }}>Per-day Times (optional)</Typography>
                        <Box>
                          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, idx) => {
                            const meets = (editableClass.days || []).includes(idx);
                            const dt = editableClass.dayTimes && editableClass.dayTimes[idx];
                            const overrideChecked = !!dt;
                            return (
                              <Box key={d} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      checked={overrideChecked}
                                      onChange={(e) => {
                                        const dayTimes = { ...(editableClass.dayTimes || {}) } as Record<number, { startTime: string; endTime: string }>;
                                        if (e.target.checked) {
                                          dayTimes[idx] = dayTimes[idx] || { startTime: editableClass.startTime || '08:00', endTime: editableClass.endTime || '08:50' };
                                        } else {
                                          delete dayTimes[idx as any];
                                        }
                                        const newDayTimes = Object.keys(dayTimes).length > 0 ? dayTimes : undefined;
                                        setEditableClass({ ...editableClass, dayTimes: newDayTimes });
                                      }}
                                      disabled={!meets}
                                    />
                                  }
                                  label={d}
                                />
                                <TextField
                                  size="small"
                                  type="time"
                                  value={(editableClass.dayTimes && editableClass.dayTimes[idx]?.startTime) || ''}
                                  onChange={(e) => {
                                    const newDayTimes = { ...(editableClass.dayTimes || {}) } as Record<number, { startTime: string; endTime: string }>;
                                    newDayTimes[idx] = newDayTimes[idx] || { startTime: editableClass.startTime || '08:00', endTime: editableClass.endTime || '08:50' };
                                    newDayTimes[idx].startTime = e.target.value;
                                    setEditableClass({ ...editableClass, dayTimes: newDayTimes });
                                  }}
                                  sx={{ width: 120 }}
                                  disabled={!meets || !overrideChecked}
                                />
                                <Typography variant="caption">–</Typography>
                                <TextField
                                  size="small"
                                  type="time"
                                  value={(editableClass.dayTimes && editableClass.dayTimes[idx]?.endTime) || ''}
                                  onChange={(e) => {
                                    const newDayTimes = { ...(editableClass.dayTimes || {}) } as Record<number, { startTime: string; endTime: string }>;
                                    newDayTimes[idx] = newDayTimes[idx] || { startTime: editableClass.startTime || '08:00', endTime: editableClass.endTime || '08:50' };
                                    newDayTimes[idx].endTime = e.target.value;
                                    setEditableClass({ ...editableClass, dayTimes: newDayTimes });
                                  }}
                                  sx={{ width: 120 }}
                                  disabled={!meets || !overrideChecked}
                                />
                              </Box>
                            );
                          })}

                          <Box sx={{ mt: 1 }}>
                            <Button size="small" onClick={() => {
                              const daysArr = editableClass.days || [];
                              const newDayTimes = { ...(editableClass.dayTimes || {}) } as Record<number, { startTime: string; endTime: string }>;
                              for (const d of daysArr) {
                                newDayTimes[d] = { startTime: editableClass.startTime || '08:00', endTime: editableClass.endTime || '08:50' };
                              }
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
                          // Persist to server (preserves links via sourceId)
                          const res = await fetch('/api/classes', { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(editableClass) });
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
                      Google Cloud Console &rarr; Credentials <OpenInNewIcon sx={{ fontSize: 14, verticalAlign: 'middle' }} />
                    </Link>
                    {' '}(use the same project from Step 1).
                  </Typography>
                  <Typography variant="body2">
                    2. Enable the <strong>&quot;Google Classroom API&quot;</strong> in{' '}
                    <Link href="https://console.cloud.google.com/apis/library/classroom.googleapis.com" target="_blank" rel="noopener">
                      API Library <OpenInNewIcon sx={{ fontSize: 14, verticalAlign: 'middle' }} />
                    </Link>.
                  </Typography>
                  <Typography variant="body2">
                    3. In <strong>Credentials</strong>, click <strong>&quot;+ CREATE CREDENTIALS&quot; &rarr; &quot;OAuth client ID&quot;</strong>.
                  </Typography>
                  <Typography variant="body2">
                    4. If prompted, configure the <strong>OAuth consent screen</strong> first (External, add your email as test user).
                  </Typography>
                  <Typography variant="body2">
                    5. Choose <strong>&quot;Web application&quot;</strong> as the type. Under <strong>&quot;Authorized redirect URIs&quot;</strong>, add:
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
                <TextField fullWidth label="OAuth Client Secret" type="password" value={classroomClientSecret} onChange={(e) => setClassroomClientSecret(e.target.value)} placeholder="GOCSPX-..." />
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
                    Connect & Import
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
              <strong>Google Calendar:</strong> Settings &rarr; &quot;Add calendar&quot; &rarr; &quot;From URL&quot; &rarr; paste the URL below<br />
              <strong>Apple Calendar:</strong> File &rarr; &quot;New Calendar Subscription&quot; &rarr; paste the URL below<br />
              <strong>Outlook:</strong> &quot;Add calendar&quot; &rarr; &quot;Subscribe from web&quot; &rarr; paste the URL below
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
                  <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={copyCalendarUrl}>
                    Copy
                  </Button>
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

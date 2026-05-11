'use client';
// ============================================================
// Schedule page — calendar of classes (Day / Week / Year) plus a
// Disruptions manager. Layout:
//   - Outer tabs: Schedule | Disruptions(n)
//   - Schedule tab:
//       date navigation (prev / today / next, tab-aware)
//       sub-tabs: Day / Week / Year
//       disruption banner if applicable
//       calendar view — click a class block to open ClassDetailDialog
//   - Disruptions tab: list + add/edit/delete dialog
// ============================================================
import { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Paper from '@mui/material/Paper';
import Fab from '@mui/material/Fab';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Grid from '@mui/material/Grid';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { useClasses, useDisruptions, apiPost, apiPut, apiDelete } from '@/lib/hooks';
import { generateEarlyOutOverrides, generateLateStartOverrides, getWeekSchedule } from '@/lib/schedule';
import DayView from '@/components/DayView';
import WeekView from '@/components/WeekView';
import YearView from '@/components/YearView';
import ClassDetailDialog from '@/components/ClassDetailDialog';
import { buildDaySchedule } from '@/lib/calendar';
import type { ScheduleDisruption, PeriodOverride, ScheduleEntry } from '@/types';
import { v4 as uuid } from 'uuid';

dayjs.extend(isoWeek);

const DISRUPTION_TYPES: { value: ScheduleDisruption['type']; label: string; color: string }[] = [
  { value: 'early_out', label: 'Early Out', color: '#f9ab00' },
  { value: 'late_start', label: 'Late Start', color: '#1a73e8' },
  { value: 'no_school', label: 'No School', color: '#d93025' },
  { value: 'assembly', label: 'Assembly', color: '#7BAAF7' },
  { value: 'custom', label: 'Custom', color: '#9aa0a6' },
];

// Sub-tabs inside the "Schedule" outer tab.
type ViewMode = 'day' | 'week' | 'year';
const VIEW_MODE_INDEX: Record<ViewMode, number> = { day: 0, week: 1, year: 2 };
const VIEW_MODES: ViewMode[] = ['day', 'week', 'year'];

export default function SchedulePage() {
  // Suspense fallback removed — rely on central LoadingOverlay instead.
  return <SchedulePageInner />;
}

function SchedulePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Outer tab — driven by ?tab=disruptions in the URL so the sidebar
  // "Disruptions" link can deep-link to it. Falls back to "schedule".
  const initialOuter = searchParams.get('tab') === 'disruptions' ? 1 : 0;
  const [outerTab, setOuterTab] = useState(initialOuter);

  // Keep outer tab in sync if the user navigates via the sidebar (which
  // changes only the search string, not the pathname — the component does
  // not unmount, so we have to react to searchParams changing).
  useEffect(() => {
    const next = searchParams.get('tab') === 'disruptions' ? 1 : 0;
    setOuterTab(next);
  }, [searchParams]);

  // When the user clicks the inner tabs we update the URL so the active
  // state survives refresh + so the sidebar's "Schedule" / "Disruptions"
  // active state stays correct. Always pushes a new search string.
  const switchOuterTab = (next: number) => {
    setOuterTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 1) params.set('tab', 'disruptions');
    else params.delete('tab');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Calendar state
  const [view, setView] = useState<ViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(dayjs());

  // Click-to-detail state
  const [detailEntry, setDetailEntry] = useState<ScheduleEntry | null>(null);
  const [detailDate, setDetailDate] = useState<string>('');

  // Disruption form state
  const { data: classes, loading: cLoading } = useClasses();
  const { data: disruptions, loading: dLoading, refetch } = useDisruptions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleDisruption | null>(null);
  const [form, setForm] = useState<ScheduleDisruption>({
    id: '', date: '', type: 'early_out', label: '', periodOverrides: [],
  });
  const [autoTime, setAutoTime] = useState('13:00');

  // Build the schedules the views need.
  // Inject a synthetic "Lunch" class for display only in the Schedule view.
  const lunchClass = useMemo(() => ({
    id: '__lunch__',
    name: 'Lunch',
    teacher: '',
    room: '',
    color: '#9E9E9E',
    period: 0,
    startTime: '12:00',
    endTime: '12:30',
    days: [1, 2, 3, 4, 5],
    semester: '',
    // per-day overrides for Mon–Fri
    dayTimes: { 1: { startTime: '12:00', endTime: '12:30' }, 2: { startTime: '12:00', endTime: '12:30' }, 3: { startTime: '12:00', endTime: '12:30' }, 4: { startTime: '12:00', endTime: '12:30' }, 5: { startTime: '12:00', endTime: '12:30' } },
  } as any), []);

  const classesForSchedule = useMemo(() => {
    const base = classes || [];
    // Avoid duplicating if a real class happens to have the same id
    if (base.find((c) => c.id === '__lunch__')) return base;
    return [...base, lunchClass];
  }, [classes, lunchClass]);

  const daySchedule = useMemo(() => {
    if (!classesForSchedule || !disruptions) return null;
    return buildDaySchedule(selectedDate.format('YYYY-MM-DD'), classesForSchedule, disruptions);
  }, [classesForSchedule, disruptions, selectedDate]);

  const weekSchedule = useMemo(() => {
    if (!classesForSchedule || !disruptions) return null;
    return getWeekSchedule(selectedDate.format('YYYY-MM-DD'), classesForSchedule, disruptions);
  }, [classesForSchedule, disruptions, selectedDate]);

  // For the detail dialog we need the disruption that applies to `detailDate`,
  // not the currently-selected date — week-view clicks pick a different day.
  const detailDisruption = useMemo(() => {
    if (!detailDate || !disruptions) return undefined;
    return disruptions.find((d) => d.date === detailDate);
  }, [detailDate, disruptions]);

  // Date navigation steps by the current sub-view.
  const navigateDate = (dir: number) => {
    if (view === 'day') setSelectedDate(selectedDate.add(dir, 'day'));
    else if (view === 'week') setSelectedDate(selectedDate.add(dir, 'week'));
    else setSelectedDate(selectedDate.add(dir, 'year'));
  };

  const headerLabel = useMemo(() => {
    if (view === 'day') return selectedDate.format('dddd, MMMM D, YYYY');
    if (view === 'week') {
      const start = selectedDate.startOf('isoWeek');
      const end = start.add(6, 'day');
      // "Apr 21 – 27, 2026" if same month, else "Apr 27 – May 3, 2026"
      return start.month() === end.month()
        ? `${start.format('MMM D')} – ${end.format('D, YYYY')}`
        : `${start.format('MMM D')} – ${end.format('MMM D, YYYY')}`;
    }
    return selectedDate.format('YYYY');
  }, [selectedDate, view]);

  const openDialog = (d?: ScheduleDisruption) => {
    if (d) { setEditing(d); setForm(d); }
    else {
      setEditing(null);
      setForm({ id: uuid(), date: dayjs().format('YYYY-MM-DD'), type: 'early_out', label: '', periodOverrides: [] });
    }
    setDialogOpen(true);
  };

  const handleAutoGenerate = () => {
    if (!classes) return;
    let overrides: PeriodOverride[] = [];
    if (form.type === 'early_out') {
      overrides = generateEarlyOutOverrides(classes, autoTime);
    } else if (form.type === 'late_start') {
      overrides = generateLateStartOverrides(classes, autoTime);
    } else if (form.type === 'no_school') {
      overrides = classes.map((c) => ({ period: c.period, startTime: c.startTime, endTime: c.endTime, cancelled: true }));
    }
    setForm({ ...form, periodOverrides: overrides });
  };

  const handleSave = async () => {
    if (editing) await apiPut('/api/disruptions', form);
    else await apiPost('/api/disruptions', form);
    setDialogOpen(false);
    refetch();
  };

  const handleDelete = async (id: string) => {
    await apiDelete(`/api/disruptions?id=${id}`);
    refetch();
  };

  // Click handlers passed down to the views.
  const handleDayClick = (entry: ScheduleEntry) => {
    setDetailEntry(entry);
    setDetailDate(selectedDate.format('YYYY-MM-DD'));
  };
  const handleWeekClick = (entry: ScheduleEntry, date: string) => {
    setDetailEntry(entry);
    setDetailDate(date);
  };

  if (cLoading || dLoading) return null;

  const isTodaySelected = selectedDate.isSame(dayjs(), 'day');
  const todayDisruption = daySchedule?.disruption;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <CalendarMonthIcon sx={{ color: 'primary.main', fontSize: 30 }} />
        <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400 }}>
          Schedule
        </Typography>
      </Box>

      <Tabs value={outerTab} onChange={(_, v) => switchOuterTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Schedule" />
        <Tab label={`Disruptions (${disruptions?.length ?? 0})`} />
      </Tabs>

      {/* ===== Schedule tab ===== */}
      {outerTab === 0 && (
        <Box>
          {/* Date nav row */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <IconButton onClick={() => navigateDate(-1)} size="small" aria-label="Previous">
              <ChevronLeftIcon />
            </IconButton>
            <Button
              variant={isTodaySelected ? 'contained' : 'outlined'}
              size="small"
              startIcon={<TodayIcon />}
              onClick={() => setSelectedDate(dayjs())}
            >
              Today
            </Button>
            <IconButton onClick={() => navigateDate(1)} size="small" aria-label="Next">
              <ChevronRightIcon />
            </IconButton>
            <Typography variant="h6" sx={{ ml: 1, fontWeight: 500 }}>
              {headerLabel}
            </Typography>
          </Box>

          {/* Disruption banner — only for the day view, since week+year already
              indicate disruptions visually. */}
          {view === 'day' && todayDisruption && (
            <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2, borderRadius: 2 }}>
              <strong>{todayDisruption.label || DISRUPTION_TYPES.find((t) => t.value === todayDisruption.type)?.label}</strong>
              {' — '}Schedule modified for this day.
            </Alert>
          )}

          {/* View tabs + calendar */}
          <Paper sx={{ borderRadius: 2 }}>
            <Tabs
              value={VIEW_MODE_INDEX[view]}
              onChange={(_, v: number) => setView(VIEW_MODES[v])}
              sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
            >
              <Tab label="Day" />
              <Tab label="Week" />
              <Tab label="Year" />
            </Tabs>
            <Box sx={{ p: 2 }}>
            <>
              {/* When the user has not added/imported any persistent classes,
                  show a helpful call-to-action above the calendar while still
                  rendering the calendar (which includes the synthetic Lunch).
               */}
              {(!classes || classes.length === 0) && (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                  <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                    No classes imported — only Lunch is shown on the schedule
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Add classes from the Classes page or import them from PowerSchool to populate your full schedule.
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
                    <Button variant="outlined" onClick={() => router.push('/classes')}>Add classes</Button>
                    <Button variant="contained" onClick={() => router.push('/settings')}>Connect PowerSchool</Button>
                  </Stack>
                </Box>
              )}
                
                  {view === 'day' && daySchedule && (
                    <DayView
                      schedule={daySchedule}
                      date={selectedDate.format('YYYY-MM-DD')}
                      onClassClick={handleDayClick}
                    />
                  )}
                  {view === 'week' && weekSchedule && (
                    <WeekView
                      schedule={weekSchedule}
                      weekStart={selectedDate.startOf('isoWeek').format('YYYY-MM-DD')}
                      onClassClick={handleWeekClick}
                    />
                  )}
                  {view === 'year' && disruptions && (
                    <YearView
                      year={selectedDate.year()}
                      classes={classesForSchedule}
                      disruptions={disruptions}
                      onDateClick={(d) => { setSelectedDate(dayjs(d)); setView('day'); }}
                    />
                  )}
                </>
            </Box>
          </Paper>
        </Box>
      )}

      {/* ===== Disruptions tab ===== */}
      {outerTab === 1 && (
        <Box>
          {disruptions?.length === 0 && (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 6 }}>
                <WarningAmberIcon sx={{ fontSize: 48, color: 'warning.main', mb: 1 }} />
                <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>No schedule disruptions</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Add early-out days, late starts, no-school days, or custom schedule changes.
                </Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => openDialog()}>Add Disruption</Button>
              </CardContent>
            </Card>
          )}

          <Stack spacing={1.5}>
            {disruptions?.sort((a, b) => dayjs(a.date).diff(dayjs(b.date))).map((d) => {
              const typeInfo = DISRUPTION_TYPES.find((t) => t.value === d.type);
              const isPast = dayjs(d.date).isBefore(dayjs(), 'day');
              return (
                <Card key={d.id} sx={{ opacity: isPast ? 0.6 : 1 }}>
                  <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Chip size="small" label={typeInfo?.label} sx={{ backgroundColor: typeInfo?.color + '18', color: typeInfo?.color, fontWeight: 600, fontSize: '0.7rem' }} />
                          <Typography variant="body1" sx={{ fontWeight: 600 }}>{d.label}</Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {dayjs(d.date).format('dddd, MMMM D, YYYY')}
                        </Typography>
                        {d.periodOverrides.length > 0 && d.type !== 'no_school' && (
                          <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {d.periodOverrides.map((o) => (
                              <Chip
                                key={o.period}
                                size="small"
                                variant="outlined"
                                label={o.cancelled ? `P${o.period}: Cancelled` : `P${o.period}: ${o.startTime}–${o.endTime}`}
                                color={o.cancelled ? 'error' : 'default'}
                                sx={{ fontSize: '0.65rem' }}
                              />
                            ))}
                          </Box>
                        )}
                      </Box>
                      <Box>
                        <IconButton size="small" onClick={() => openDialog(d)}><EditIcon fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDelete(d.id)}><DeleteIcon fontSize="small" /></IconButton>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>

          {disruptions && disruptions.length > 0 && (
            <Fab color="primary" sx={{ position: 'fixed', bottom: 24, right: 24 }} onClick={() => openDialog()} aria-label="Add disruption">
              <AddIcon />
            </Fab>
          )}
        </Box>
      )}

      {/* ===== Disruption add/edit dialog ===== */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Disruption' : 'Add Disruption'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}>
              <TextField fullWidth label="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g., Early Release — Teacher PD" />
            </Grid>
            <Grid size={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Type</InputLabel>
                <Select value={form.type} label="Type" onChange={(e) => setForm({ ...form, type: e.target.value as ScheduleDisruption['type'] })}>
                  {DISRUPTION_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={6}>
              <TextField fullWidth label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>

            {(form.type === 'early_out' || form.type === 'late_start') && (
              <Grid size={12}>
                <Alert severity="info" sx={{ mb: 1 }}>
                  Auto-generate adjusted times: set the {form.type === 'early_out' ? 'new end time' : 'new start time'} and periods will be proportionally adjusted.
                </Alert>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <TextField
                    label={form.type === 'early_out' ? 'Early End Time' : 'Late Start Time'}
                    type="time"
                    size="small"
                    value={autoTime}
                    onChange={(e) => setAutoTime(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <Button variant="outlined" startIcon={<AutoFixHighIcon />} onClick={handleAutoGenerate}>
                    Auto Generate
                  </Button>
                </Box>
              </Grid>
            )}

            {form.periodOverrides.length > 0 && (
              <Grid size={12}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Period Overrides</Typography>
                <Stack spacing={1}>
                  {form.periodOverrides.map((o, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Chip label={`P${o.period}`} size="small" />
                      <TextField
                        size="small"
                        type="time"
                        value={o.startTime}
                        onChange={(e) => {
                          const overrides = [...form.periodOverrides];
                          overrides[i] = { ...o, startTime: e.target.value };
                          setForm({ ...form, periodOverrides: overrides });
                        }}
                        sx={{ width: 120 }}
                        disabled={o.cancelled}
                      />
                      <Typography variant="caption">–</Typography>
                      <TextField
                        size="small"
                        type="time"
                        value={o.endTime}
                        onChange={(e) => {
                          const overrides = [...form.periodOverrides];
                          overrides[i] = { ...o, endTime: e.target.value };
                          setForm({ ...form, periodOverrides: overrides });
                        }}
                        sx={{ width: 120 }}
                        disabled={o.cancelled}
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={o.cancelled}
                            onChange={(e) => {
                              const overrides = [...form.periodOverrides];
                              overrides[i] = { ...o, cancelled: e.target.checked };
                              setForm({ ...form, periodOverrides: overrides });
                            }}
                          />
                        }
                        label="Cancel"
                      />
                    </Box>
                  ))}
                </Stack>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.label}>
            {editing ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== Class detail dialog ===== */}
      <ClassDetailDialog
        open={!!detailEntry}
        onClose={() => setDetailEntry(null)}
        entry={detailEntry}
        date={detailDate}
        disruption={detailDisruption}
      />
    </Box>
  );
}

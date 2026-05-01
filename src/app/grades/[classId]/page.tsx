'use client';
// ============================================================
// Grade Detail — a single class's full gradebook.
// Layout (top → bottom):
//   1. Breadcrumb + Sync
//   2. Class header card with grade + progress bar
//   3. Stat strip (graded / missing / late / ungraded / upcoming)
//   4. Category breakdown — click a card to filter the table by category
//   5. Quick-filter chips + search + sort toggle
//   6. Assignments table — grouped by time bucket when sorted by due-desc,
//      flagged rows tinted, smart relative due labels
// ============================================================
import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import CircularProgress from '@mui/material/CircularProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SyncIcon from '@mui/icons-material/Sync';
import SearchIcon from '@mui/icons-material/Search';
import SchoolIcon from '@mui/icons-material/School';
import EmailIcon from '@mui/icons-material/Email';
import RoomIcon from '@mui/icons-material/Room';
import ScheduleIcon from '@mui/icons-material/Schedule';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import EventIcon from '@mui/icons-material/Event';
import { useClasses, useHomework } from '@/lib/hooks';
import {
  gradeColor,
  letterFromPercent,
  flagSeverity,
  homeworkPercent,
  statusCounts,
  relativeDueLabel,
  fullDueLabel,
  isMissing,
  isLate,
  isUngraded,
  isUpcoming,
  isGraded,
  timeBucket,
  TIME_BUCKET_ORDER,
  type TimeBucket,
} from '@/lib/grades';
import type { Homework } from '@/types';

// ---- Quick filter mode for the assignments table ----
// Five orthogonal lenses on the same data. "all" is the default; the others
// narrow the table to a subset that needs attention.
type FilterMode = 'all' | 'missing' | 'late' | 'ungraded' | 'upcoming' | 'graded';

export default function GradeDetailPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = use(params);
  const theme = useTheme();
  const router = useRouter();
  const { data: classes, loading: loadingClasses, refetch: refetchClasses } = useClasses();
  const { data: homework, loading: loadingHomework, refetch: refetchHomework } = useHomework();
  const [syncing, setSyncing] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<'due-desc' | 'due-asc' | 'category'>('due-desc');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  // null = no category filter; set when the user clicks a category card.
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const cls = useMemo(() => (classes || []).find((c) => c.id === classId), [classes, classId]);

  const classHomework: Homework[] = useMemo(() => {
    if (!cls) return [];
    return (homework || []).filter((h) => h.classId === cls.id);
  }, [homework, cls]);

  // Counts powering the stat strip and the badge counts on the filter chips.
  const stats = useMemo(() => statusCounts(classHomework), [classHomework]);

  // Category breakdown with average of assignments that have numeric scores.
  const categoryStats = useMemo(() => {
    const byCategory = new Map<string, { items: Homework[]; percents: number[] }>();
    classHomework.forEach((h) => {
      const cat = h.category || 'Other';
      const bucket = byCategory.get(cat) || { items: [], percents: [] };
      bucket.items.push(h);
      const p = homeworkPercent(h);
      if (p != null) bucket.percents.push(p);
      byCategory.set(cat, bucket);
    });
    return Array.from(byCategory.entries()).map(([name, { items, percents }]) => ({
      name,
      count: items.length,
      graded: percents.length,
      avg: percents.length > 0 ? percents.reduce((a, b) => a + b, 0) / percents.length : null,
    })).sort((a, b) => b.count - a.count);
  }, [classHomework]);

  // Filter + sort the assignments list. Order of operations:
  //   1) text query (title or category)
  //   2) status filter chip (missing / late / ungraded / upcoming / graded)
  //   3) category filter (set by clicking a category card)
  //   4) sort
  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = classHomework.filter((h) =>
      !q || h.title.toLowerCase().includes(q) || (h.category || '').toLowerCase().includes(q)
    );
    if (filterMode !== 'all') {
      list = list.filter((h) => {
        if (filterMode === 'missing') return isMissing(h);
        if (filterMode === 'late') return isLate(h);
        if (filterMode === 'ungraded') return isUngraded(h);
        if (filterMode === 'upcoming') return isUpcoming(h);
        if (filterMode === 'graded') return isGraded(h);
        return true;
      });
    }
    if (categoryFilter) {
      list = list.filter((h) => (h.category || 'Other') === categoryFilter);
    }
    list = [...list].sort((a, b) => {
      if (sortMode === 'category') {
        const ca = (a.category || 'zzz').toLowerCase();
        const cb = (b.category || 'zzz').toLowerCase();
        if (ca !== cb) return ca.localeCompare(cb);
      }
      const ad = dayjs(a.dueDate).valueOf() || 0;
      const bd = dayjs(b.dueDate).valueOf() || 0;
      return sortMode === 'due-asc' ? ad - bd : bd - ad;
    });
    return list;
  }, [classHomework, query, sortMode, filterMode, categoryFilter]);

  // When sorted by due-desc we group rows into time buckets ("Upcoming",
  // "This Week", "Last Week"…) for a calendar-like read. For other sort
  // orders this returns a single bucket so the table renders flat.
  const groupedRows = useMemo(() => {
    if (sortMode !== 'due-desc') {
      return [{ bucket: 'all' as const, items: filteredSorted }];
    }
    const groups = new Map<TimeBucket, Homework[]>();
    for (const h of filteredSorted) {
      const b = timeBucket(h.dueDate);
      const arr = groups.get(b) || [];
      arr.push(h);
      groups.set(b, arr);
    }
    return TIME_BUCKET_ORDER
      .filter((b) => groups.has(b))
      .map((bucket) => ({ bucket, items: groups.get(bucket)! }));
  }, [filteredSorted, sortMode]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/powerschool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // empty — use saved creds
      });
      const data = await res.json();
      if (data.success) {
        setSnackbar({ open: true, message: 'Grades synced.', severity: 'success' });
        refetchClasses();
        refetchHomework();
      } else {
        setSnackbar({
          open: true,
          message: data.error?.includes('Missing PowerSchool credentials')
            ? 'Save your PowerSchool login in Settings first.'
            : data.error || 'Sync failed.',
          severity: 'error',
        });
      }
    } catch (e) {
      setSnackbar({ open: true, message: `Sync error: ${(e as Error).message}`, severity: 'error' });
    }
    setSyncing(false);
  };

  const loading = loadingClasses || loadingHomework;
  const color = cls ? gradeColor(cls.gradePercent, theme) : theme.palette.text.disabled;

  if (loading && !cls) {
    return (
      <Box>
        <LinearProgress />
      </Box>
    );
  }

  if (!loading && !cls) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/grades')} sx={{ mb: 2 }}>
          Back to Grades
        </Button>
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <SchoolIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" gutterBottom>Class not found</Typography>
            <Typography variant="body2" color="text.secondary">
              This class may have been removed. Return to the Grades page to pick another.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (!cls) return null;

  // Whether the user is currently filtering. Drives a small "X active filters
  // · Clear" affordance above the table.
  const hasActiveFilter = filterMode !== 'all' || categoryFilter !== null || query.trim() !== '';

  return (
    <Box>
      {/* ===== Top nav ===== */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center' }}>
        <IconButton onClick={() => router.push('/grades')} aria-label="Back to grades">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="body2" color="text.secondary">Grades</Typography>
        <Typography variant="body2" color="text.disabled">/</Typography>
        <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>{cls.name}</Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="outlined"
          size="small"
          startIcon={syncing ? <CircularProgress size={14} color="inherit" /> : <SyncIcon />}
          onClick={syncNow}
          disabled={syncing}
        >
          {syncing ? 'Syncing…' : 'Sync'}
        </Button>
      </Stack>

      {/* ===== Class header card =====
          Big grade on the right, identity + meta chips on the left, and a
          full-width progress bar so the grade reads at a glance. */}
      <Card sx={{ mb: 3, overflow: 'hidden' }}>
        <Box sx={{ height: 6, bgcolor: cls.color }} />
        <CardContent>
          <Grid container spacing={2} sx={{ alignItems: 'center' }}>
            <Grid size={{ xs: 12, sm: 8 }}>
              <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 500, mb: 1 }}>
                {cls.name}
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                {cls.teacher && cls.teacher !== 'TBD' && (
                  <Chip icon={<EmailIcon />} label={cls.teacher} size="small" variant="outlined" />
                )}
                {cls.room && (
                  <Chip icon={<RoomIcon />} label={`Rm ${cls.room}`} size="small" variant="outlined" />
                )}
                <Chip icon={<ScheduleIcon />} label={`Period ${cls.period}`} size="small" variant="outlined" />
                {cls.source === 'powerschool' && (
                  <Chip label="PowerSchool" size="small" color="primary" variant="outlined" />
                )}
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }} sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
              {cls.gradePercent != null ? (
                <>
                  <Typography variant="h2" sx={{ fontSize: '3rem', fontWeight: 500, color, lineHeight: 1 }}>
                    {cls.gradePercent.toFixed(1)}%
                  </Typography>
                  <Typography variant="h5" sx={{ color, fontWeight: 500 }}>
                    {cls.grade || letterFromPercent(cls.gradePercent)}
                  </Typography>
                </>
              ) : cls.grade ? (
                <Typography variant="h2" sx={{ fontSize: '3rem', fontWeight: 500, color, lineHeight: 1 }}>
                  {cls.grade}
                </Typography>
              ) : (
                <Chip label="No grade yet" variant="outlined" />
              )}
            </Grid>
          </Grid>

          {cls.gradePercent != null && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, cls.gradePercent)}
                sx={{
                  height: 10,
                  borderRadius: 5,
                  bgcolor: alpha(color, 0.15),
                  '& .MuiLinearProgress-bar': { bgcolor: color },
                }}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ===== Stat strip =====
          Same five tiles as the overview, but scoped to this class. Lets the
          student see "do I have anything to fix here?" without scanning the
          full assignments table. The tiles are also implicit shortcuts —
          their values match the filter-chip counts directly below. */}
      {classHomework.length > 0 && (
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
            <Card variant="outlined">
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <CheckCircleOutlineIcon sx={{ color: 'success.main', fontSize: 22 }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      Graded
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 500, lineHeight: 1.1 }}>
                      {stats.graded}
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                        / {stats.total}
                      </Typography>
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
            <Card
              variant="outlined"
              sx={{
                borderColor: stats.missing > 0 ? alpha(theme.palette.error.main, 0.5) : undefined,
                bgcolor: stats.missing > 0 ? alpha(theme.palette.error.main, 0.06) : undefined,
              }}
            >
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <ErrorOutlineIcon sx={{ color: 'error.main', fontSize: 22 }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      Missing
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 500, lineHeight: 1.1, color: stats.missing > 0 ? 'error.main' : 'text.primary' }}>
                      {stats.missing}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
            <Card
              variant="outlined"
              sx={{
                borderColor: stats.late > 0 ? alpha(theme.palette.warning.main, 0.5) : undefined,
                bgcolor: stats.late > 0 ? alpha(theme.palette.warning.main, 0.06) : undefined,
              }}
            >
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <WarningAmberIcon sx={{ color: 'warning.main', fontSize: 22 }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      Late
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 500, lineHeight: 1.1, color: stats.late > 0 ? 'warning.main' : 'text.primary' }}>
                      {stats.late}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 6, md: 2.4 }}>
            <Card variant="outlined">
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <HelpOutlineIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      Ungraded
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 500, lineHeight: 1.1 }}>
                      {stats.ungraded}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
            <Card
              variant="outlined"
              sx={{
                borderColor: stats.upcoming > 0 ? alpha(theme.palette.primary.main, 0.5) : undefined,
                bgcolor: stats.upcoming > 0 ? alpha(theme.palette.primary.main, 0.06) : undefined,
              }}
            >
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <EventIcon sx={{ color: 'primary.main', fontSize: 22 }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      Upcoming
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 500, lineHeight: 1.1, color: stats.upcoming > 0 ? 'primary.main' : 'text.primary' }}>
                      {stats.upcoming}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ===== Category breakdown =====
          Each category card shows count + average. Click to filter the table
          below to that category — clicking the active card un-filters. The
          selected card gets a colored ring so the active filter is visible. */}
      {categoryStats.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 1 }}>
              Category Breakdown
            </Typography>
            {categoryFilter && (
              <Chip
                label={`Filtered: ${categoryFilter}`}
                size="small"
                color="primary"
                onDelete={() => setCategoryFilter(null)}
              />
            )}
          </Stack>
          <Grid container spacing={2}>
            {categoryStats.map((cat) => {
              const catColor = gradeColor(cat.avg ?? undefined, theme);
              const active = categoryFilter === cat.name;
              return (
                <Grid key={cat.name} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Card
                    variant="outlined"
                    sx={{
                      height: '100%',
                      borderColor: active ? catColor : undefined,
                      borderWidth: active ? 2 : 1,
                      bgcolor: active ? alpha(catColor, 0.06) : undefined,
                    }}
                  >
                    <CardActionArea
                      onClick={() => setCategoryFilter(active ? null : cat.name)}
                      aria-label={active ? `Clear ${cat.name} filter` : `Filter by ${cat.name}`}
                    >
                      <CardContent>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.7rem' }}>
                            {cat.name}
                          </Typography>
                          {active && <Chip size="small" label="Active" color="primary" sx={{ height: 18, fontSize: '0.6rem' }} />}
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mt: 0.5 }}>
                          {cat.avg != null ? (
                            <Typography variant="h4" sx={{ fontSize: '1.75rem', fontWeight: 500, color: catColor }}>
                              {cat.avg.toFixed(1)}%
                            </Typography>
                          ) : (
                            <Typography variant="h4" sx={{ fontSize: '1.75rem', fontWeight: 500, color: 'text.disabled' }}>
                              —
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary">
                            {cat.graded}/{cat.count} graded
                          </Typography>
                        </Stack>
                        {cat.avg != null && (
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(100, cat.avg)}
                            sx={{
                              mt: 1,
                              height: 4,
                              borderRadius: 2,
                              bgcolor: alpha(catColor, 0.15),
                              '& .MuiLinearProgress-bar': { bgcolor: catColor },
                            }}
                          />
                        )}
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* ===== Quick-filter chips =====
          One-click lenses on the table. Counts are baked into the labels so
          the user knows whether clicking will turn up anything. */}
      {classHomework.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
          <Chip
            label={`All · ${stats.total}`}
            color={filterMode === 'all' ? 'primary' : 'default'}
            variant={filterMode === 'all' ? 'filled' : 'outlined'}
            onClick={() => setFilterMode('all')}
            clickable
          />
          <Chip
            icon={<ErrorOutlineIcon />}
            label={`Missing · ${stats.missing}`}
            color={filterMode === 'missing' ? 'error' : 'default'}
            variant={filterMode === 'missing' ? 'filled' : 'outlined'}
            onClick={() => setFilterMode(filterMode === 'missing' ? 'all' : 'missing')}
            disabled={stats.missing === 0}
            clickable
          />
          <Chip
            icon={<WarningAmberIcon />}
            label={`Late · ${stats.late}`}
            color={filterMode === 'late' ? 'warning' : 'default'}
            variant={filterMode === 'late' ? 'filled' : 'outlined'}
            onClick={() => setFilterMode(filterMode === 'late' ? 'all' : 'late')}
            disabled={stats.late === 0}
            clickable
          />
          <Chip
            icon={<HelpOutlineIcon />}
            label={`Ungraded · ${stats.ungraded}`}
            color={filterMode === 'ungraded' ? 'default' : 'default'}
            variant={filterMode === 'ungraded' ? 'filled' : 'outlined'}
            onClick={() => setFilterMode(filterMode === 'ungraded' ? 'all' : 'ungraded')}
            disabled={stats.ungraded === 0}
            clickable
          />
          <Chip
            icon={<EventIcon />}
            label={`Upcoming · ${stats.upcoming}`}
            color={filterMode === 'upcoming' ? 'primary' : 'default'}
            variant={filterMode === 'upcoming' ? 'filled' : 'outlined'}
            onClick={() => setFilterMode(filterMode === 'upcoming' ? 'all' : 'upcoming')}
            disabled={stats.upcoming === 0}
            clickable
          />
          <Chip
            icon={<CheckCircleOutlineIcon />}
            label={`Graded · ${stats.graded}`}
            color={filterMode === 'graded' ? 'success' : 'default'}
            variant={filterMode === 'graded' ? 'filled' : 'outlined'}
            onClick={() => setFilterMode(filterMode === 'graded' ? 'all' : 'graded')}
            disabled={stats.graded === 0}
            clickable
          />
        </Stack>
      )}

      {/* ===== Search + sort row ===== */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', mb: 2 }}>
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 1, flex: 1 }}>
          {filteredSorted.length === classHomework.length
            ? `All Assignments · ${classHomework.length}`
            : `Showing ${filteredSorted.length} of ${classHomework.length}`}
        </Typography>
        {hasActiveFilter && (
          <Button
            size="small"
            variant="text"
            onClick={() => {
              setFilterMode('all');
              setCategoryFilter(null);
              setQuery('');
            }}
          >
            Clear filters
          </Button>
        )}
        <TextField
          placeholder="Search assignments…"
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 240 }}
        />
        <ToggleButtonGroup
          size="small"
          value={sortMode}
          exclusive
          onChange={(_, v) => v && setSortMode(v)}
        >
          <Tooltip title="Newest first (grouped by week)">
            <ToggleButton value="due-desc">Newest</ToggleButton>
          </Tooltip>
          <Tooltip title="Oldest first">
            <ToggleButton value="due-asc">Oldest</ToggleButton>
          </Tooltip>
          <Tooltip title="Group by category">
            <ToggleButton value="category">Category</ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>
      </Box>

      {/* ===== Assignments table =====
          When sorted by due-desc the rows are bucketed into time groups
          ("Upcoming", "This Week", "Last Week", …) with subtle section
          headers. Flagged rows get a faint left-border stripe + bg tint
          matching their flag severity (red=missing, orange=late). */}
      {classHomework.length === 0 ? (
        <Alert severity="info" variant="outlined">
          No assignments yet for this class. Click <strong>Sync</strong> to pull the latest from PowerSchool.
        </Alert>
      ) : filteredSorted.length === 0 ? (
        <Alert severity="info" variant="outlined">
          No assignments match the current filters.{' '}
          <Box
            component="span"
            onClick={() => {
              setFilterMode('all');
              setCategoryFilter(null);
              setQuery('');
            }}
            sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline', fontWeight: 500 }}
          >
            Clear filters
          </Box>
        </Alert>
      ) : (
        <Card variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: alpha(theme.palette.action.hover, 0.6) }}>
                <TableCell sx={{ fontWeight: 600 }}>Assignment</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Due</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Score</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>%</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groupedRows.map((group) => (
                <BucketGroup
                  key={group.bucket}
                  group={group}
                  theme={theme}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
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

// ============================================================
// One time-bucket group of rows. Renders an optional section header row
// (when `bucket !== 'all'`) followed by the assignment rows themselves.
// Pulled out as a sub-component so the main render stays readable.
// ============================================================
function BucketGroup({
  group,
  theme,
}: {
  group: { bucket: TimeBucket | 'all'; items: Homework[] };
  theme: Theme;
}) {
  const showHeader = group.bucket !== 'all';
  return (
    <>
      {showHeader && (
        <TableRow>
          <TableCell
            colSpan={5}
            sx={{
              bgcolor: alpha(theme.palette.action.hover, 0.3),
              py: 0.5,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'text.secondary' }}>
                {group.bucket}
              </Typography>
              <Divider orientation="vertical" flexItem sx={{ height: 12, alignSelf: 'center' }} />
              <Typography variant="caption" color="text.disabled">
                {group.items.length} {group.items.length === 1 ? 'assignment' : 'assignments'}
              </Typography>
            </Stack>
          </TableCell>
        </TableRow>
      )}
      {group.items.map((h) => {
        // Prefer the scraped % column over re-parsing the raw score.
        const pct = homeworkPercent(h);
        const rowColor = pct != null ? gradeColor(pct, theme) : theme.palette.text.disabled;
        const missing = isMissing(h);
        const late = isLate(h);
        // Subtle row tinting + colored left border so the eye finds attention
        // items first. Missing wins over late if a row somehow has both.
        const stripeColor = missing
          ? theme.palette.error.main
          : late
            ? theme.palette.warning.main
            : null;
        return (
          <TableRow
            key={h.id}
            hover
            sx={{
              bgcolor: stripeColor ? alpha(stripeColor, 0.05) : 'transparent',
              borderLeft: stripeColor ? `3px solid ${stripeColor}` : '3px solid transparent',
            }}
          >
            <TableCell>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{h.title}</Typography>
              {h.description && h.description !== `Category: ${h.category}` && (
                <Typography variant="caption" color="text.secondary">{h.description}</Typography>
              )}
            </TableCell>
            <TableCell>
              {h.category ? (
                <Chip label={h.category} size="small" variant="outlined" />
              ) : (
                <Typography variant="body2" color="text.disabled">—</Typography>
              )}
            </TableCell>
            <TableCell>
              <Tooltip title={fullDueLabel(h.dueDate)}>
                <Typography variant="body2" color="text.secondary">
                  {relativeDueLabel(h.dueDate)}
                </Typography>
              </Tooltip>
            </TableCell>
            <TableCell align="right">
              <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
                {h.flags && (
                  <Chip
                    label={h.flags}
                    size="small"
                    color={flagSeverity(h.flags)}
                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600 }}
                  />
                )}
                {h.score ? (
                  <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace' }}>
                    {h.score}
                  </Typography>
                ) : !h.flags ? (
                  <Typography variant="body2" color="text.disabled">—</Typography>
                ) : null}
              </Stack>
            </TableCell>
            <TableCell align="right">
              {pct != null ? (
                <Typography variant="body2" sx={{ fontWeight: 600, color: rowColor }}>
                  {pct.toFixed(1)}%
                </Typography>
              ) : (
                <Typography variant="body2" color="text.disabled">—</Typography>
              )}
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}

'use client';
import { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import AssignmentIcon from '@mui/icons-material/Assignment';
import QuizIcon from '@mui/icons-material/Quiz';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useClasses, useHomework, useExams, useTasks, useDisruptions } from '@/lib/hooks';
import { buildDaySchedule } from '@/lib/calendar';
import { getWeekSchedule } from '@/lib/schedule';
import DayView from '@/components/DayView';
import WeekView from '@/components/WeekView';
import YearView from '@/components/YearView';

dayjs.extend(isoWeek);

export default function Dashboard() {
  const [tab, setTab] = useState(0);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const { data: classes, loading: classesLoading } = useClasses();
  const { data: homework } = useHomework();
  const { data: exams } = useExams();
  const { data: tasks } = useTasks();
  const { data: disruptions } = useDisruptions();

  const todaySchedule = useMemo(() => {
    if (!classes || !disruptions) return null;
    return buildDaySchedule(selectedDate.format('YYYY-MM-DD'), classes, disruptions);
  }, [classes, disruptions, selectedDate]);

  const weekSchedule = useMemo(() => {
    if (!classes || !disruptions) return null;
    return getWeekSchedule(selectedDate.format('YYYY-MM-DD'), classes, disruptions);
  }, [classes, disruptions, selectedDate]);

  // PowerSchool assignments belong on the Grades tab only — don't show them
  // in the Dashboard's "Upcoming Homework" card or summary counts. They're
  // imports from the school grading system, not personal to-dos.
  const manualHomework = useMemo(
    () => (homework || []).filter((h) => h.source !== 'powerschool'),
    [homework],
  );

  const upcomingHomework = useMemo(() => {
    return manualHomework
      .filter((h) => !h.completed && dayjs(h.dueDate).isAfter(dayjs().subtract(1, 'day')))
      .sort((a, b) => dayjs(a.dueDate).diff(dayjs(b.dueDate)))
      .slice(0, 5);
  }, [manualHomework]);

  const upcomingExams = useMemo(() => {
    if (!exams) return [];
    return exams
      .filter((e) => dayjs(e.date).isAfter(dayjs().subtract(1, 'day')))
      .sort((a, b) => dayjs(a.date).diff(dayjs(b.date)))
      .slice(0, 3);
  }, [exams]);

  const pendingTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => !t.completed).slice(0, 5);
  }, [tasks]);

  const completedToday = useMemo(() => {
    if (!tasks) return { hw: 0, hwTotal: 0, tasks: 0, tasksTotal: 0 };
    const todayStr = dayjs().format('YYYY-MM-DD');
    // Count only manual / non-PowerSchool homework here — PowerSchool
    // assignments live on the Grades tab.
    const todayHw = manualHomework.filter((h) => h.dueDate === todayStr);
    const todayTasks = tasks.filter((t) => t.dueDate === todayStr);
    return {
      hw: todayHw.filter((h) => h.completed).length,
      hwTotal: todayHw.length,
      tasks: todayTasks.filter((t) => t.completed).length,
      tasksTotal: todayTasks.length,
    };
  }, [manualHomework, tasks]);

  if (classesLoading) return <LinearProgress />;

  const navigateDate = (dir: number) => {
    if (tab === 0) setSelectedDate(selectedDate.add(dir, 'day'));
    else if (tab === 1) setSelectedDate(selectedDate.add(dir, 'week'));
    else setSelectedDate(selectedDate.add(dir, 'year'));
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400 }}>
            {selectedDate.format('dddd, MMMM D, YYYY')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Welcome back! Here&apos;s your schedule overview.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <IconButton onClick={() => navigateDate(-1)} size="small">
            <ChevronLeftIcon />
          </IconButton>
          <IconButton onClick={() => setSelectedDate(dayjs())} size="small">
            <TodayIcon />
          </IconButton>
          <IconButton onClick={() => navigateDate(1)} size="small">
            <ChevronRightIcon />
          </IconButton>
        </Stack>
      </Box>

      {/* Disruption Alert */}
      {todaySchedule?.disruption && (
        <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2, borderRadius: 2 }}>
          <strong>{todaySchedule.disruption.label}</strong> — Schedule has been modified for today.
        </Alert>
      )}

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <TodayIcon sx={{ color: 'primary.main', fontSize: 32, mb: 0.5 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {todaySchedule?.classes.filter((c) => !c.cancelled).length ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">Classes Today</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <AssignmentIcon sx={{ color: 'error.main', fontSize: 32, mb: 0.5 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {upcomingHomework.length}
              </Typography>
              <Typography variant="caption" color="text.secondary">Upcoming Homework</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <QuizIcon sx={{ color: 'warning.main', fontSize: 32, mb: 0.5 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {upcomingExams.length}
              </Typography>
              <Typography variant="caption" color="text.secondary">Upcoming Exams</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <CheckCircleIcon sx={{ color: 'success.main', fontSize: 32, mb: 0.5 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {completedToday.hw + completedToday.tasks}
                <Typography component="span" variant="body2" color="text.secondary">
                  /{completedToday.hwTotal + completedToday.tasksTotal}
                </Typography>
              </Typography>
              <Typography variant="caption" color="text.secondary">Completed Today</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Schedule Tabs */}
      <Paper sx={{ borderRadius: 2, mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          <Tab label="Day" />
          <Tab label="Week" />
          <Tab label="Year" />
        </Tabs>
        <Box sx={{ p: 2 }}>
          {tab === 0 && todaySchedule && (
            <DayView schedule={todaySchedule} date={selectedDate.format('YYYY-MM-DD')} />
          )}
          {tab === 1 && weekSchedule && (
            <WeekView schedule={weekSchedule} weekStart={selectedDate.startOf('isoWeek').format('YYYY-MM-DD')} />
          )}
          {tab === 2 && classes && disruptions && (
            <YearView
              year={selectedDate.year()}
              classes={classes}
              disruptions={disruptions}
              onDateClick={(d) => { setSelectedDate(dayjs(d)); setTab(0); }}
            />
          )}
        </Box>
      </Paper>

      {/* Bottom cards – upcoming homework, exams, tasks */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <AssignmentIcon fontSize="small" sx={{ color: 'error.main' }} />
                Upcoming Homework
              </Typography>
              {upcomingHomework.length === 0 && (
                <Typography variant="body2" color="text.secondary">No upcoming homework</Typography>
              )}
              <Stack spacing={1}>
                {upcomingHomework.map((h) => (
                  <Box key={h.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{h.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Due {dayjs(h.dueDate).format('MMM D')}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={h.priority}
                      color={h.priority === 'high' ? 'error' : h.priority === 'medium' ? 'warning' : 'default'}
                    />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <QuizIcon fontSize="small" sx={{ color: 'warning.main' }} />
                Upcoming Exams
              </Typography>
              {upcomingExams.length === 0 && (
                <Typography variant="body2" color="text.secondary">No upcoming exams</Typography>
              )}
              <Stack spacing={1}>
                {upcomingExams.map((e) => (
                  <Box key={e.id}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{e.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {dayjs(e.date).format('MMM D')} at {e.startTime}
                      {e.location && ` — ${e.location}`}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />
                Pending Tasks
              </Typography>
              {pendingTasks.length === 0 && (
                <Typography variant="body2" color="text.secondary">All tasks complete!</Typography>
              )}
              <Stack spacing={1}>
                {pendingTasks.map((t) => (
                  <Box key={t.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{t.title}</Typography>
                      {t.dueDate && (
                        <Typography variant="caption" color="text.secondary">
                          Due {dayjs(t.dueDate).format('MMM D')}
                        </Typography>
                      )}
                    </Box>
                    <Chip size="small" label={t.category} variant="outlined" />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

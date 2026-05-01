'use client';
// ============================================================
// ClassDetailDialog — read-only popup for a class block in DayView /
// WeekView. Shows the date-specific time, cancellation status, teacher /
// room, days the class meets, and quick links to Grades + Classes.
// ============================================================
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import { alpha, useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import ScheduleIcon from '@mui/icons-material/Schedule';
import RoomIcon from '@mui/icons-material/Room';
import PersonIcon from '@mui/icons-material/Person';
import EventIcon from '@mui/icons-material/Event';
import GradingIcon from '@mui/icons-material/Grading';
import EditIcon from '@mui/icons-material/Edit';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import BlockIcon from '@mui/icons-material/Block';
import type { ScheduleEntry, ScheduleDisruption } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  entry: ScheduleEntry | null;
  // Date for this entry — needed because a single class repeats and the
  // "what's happening today" context comes from the calendar slot, not the
  // SchoolClass itself.
  date: string;
  // Disruption that applies to the date, if any. Powers the "today's schedule
  // is modified" banner inside the dialog.
  disruption?: ScheduleDisruption;
}

const DAY_LABELS_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Format "HH:mm" → "9:30 AM"
function formatTime(t: string): string {
  if (!t) return '—';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h)) return t;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function durationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

export default function ClassDetailDialog({ open, onClose, entry, date, disruption }: Props) {
  const router = useRouter();
  const theme = useTheme();

  if (!entry) return null;
  const { classInfo, startTime, endTime, cancelled } = entry;
  const dur = durationMinutes(startTime, endTime);
  const dateObj = dayjs(date);
  const isPast = dateObj.endOf('day').isBefore(dayjs());
  const isToday = dateObj.isSame(dayjs(), 'day');

  // Did the time differ from the class's normal schedule? If so, show both.
  const isShifted =
    !cancelled && (startTime !== classInfo.startTime || endTime !== classInfo.endTime);

  // Sort meeting days for consistent display ("Mon, Tue, Wed…").
  const sortedDays = [...classInfo.days].sort();

  const goToGrades = () => {
    onClose();
    router.push(`/grades/${classInfo.id}`);
  };
  const goToClasses = () => {
    onClose();
    router.push('/classes');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      {/* Colored top stripe — same pattern as the Grades pages, ties the
          dialog visually to the class block the user clicked. */}
      <Box sx={{ height: 6, bgcolor: classInfo.color }} />

      <Box sx={{ display: 'flex', alignItems: 'flex-start', px: 3, pt: 2.5, pb: 1, gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
            {dateObj.format('dddd, MMM D')}{isToday && ' · Today'}{isPast && !isToday && ' · Past'}
          </Typography>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 500,
              color: cancelled ? 'text.disabled' : 'text.primary',
              textDecoration: cancelled ? 'line-through' : 'none',
              wordBreak: 'break-word',
            }}
          >
            {classInfo.name}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ flexShrink: 0 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ pt: 1 }}>
        {/* ===== Status banners ===== */}
        {cancelled && (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
              bgcolor: alpha(theme.palette.error.main, 0.08),
              color: 'error.main',
              borderRadius: 1,
              px: 1.5,
              py: 1,
              mb: 2,
            }}
          >
            <BlockIcon fontSize="small" />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Class cancelled for this day
            </Typography>
          </Stack>
        )}
        {disruption && !cancelled && (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
              bgcolor: alpha(theme.palette.warning.main, 0.1),
              color: 'warning.dark',
              borderRadius: 1,
              px: 1.5,
              py: 1,
              mb: 2,
            }}
          >
            <WarningAmberIcon fontSize="small" />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {disruption.label || 'Schedule modified for this day'}
            </Typography>
          </Stack>
        )}

        {/* ===== Time block ===== */}
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
          <ScheduleIcon sx={{ color: 'text.secondary' }} />
          <Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 500,
                color: cancelled ? 'text.disabled' : 'text.primary',
                textDecoration: cancelled ? 'line-through' : 'none',
              }}
            >
              {formatTime(startTime)} – {formatTime(endTime)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {dur > 0 ? `${dur} minute${dur === 1 ? '' : 's'}` : '—'}
              {isShifted && ' · adjusted'}
            </Typography>
          </Box>
        </Stack>

        {/* When time differs from the regular schedule, show the regular time
            so the change is visible. */}
        {isShifted && (
          <Box sx={{ ml: 4.5, mb: 1.5 }}>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
              Normally: {formatTime(classInfo.startTime)} – {formatTime(classInfo.endTime)}
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 1.5 }} />

        {/* ===== Meta rows ===== */}
        <Stack spacing={1.25}>
          {classInfo.teacher && classInfo.teacher !== 'TBD' && (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <PersonIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
              <Typography variant="body2">{classInfo.teacher}</Typography>
            </Stack>
          )}
          {classInfo.room && (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <RoomIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
              <Typography variant="body2">Room {classInfo.room}</Typography>
            </Stack>
          )}
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <EventIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
              <Typography variant="body2" component="span">
                Period {classInfo.period}
              </Typography>
              <Typography variant="caption" color="text.disabled">·</Typography>
              <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {sortedDays.map((d) => (
                  <Chip
                    key={d}
                    label={DAY_LABELS_FULL[d]}
                    size="small"
                    variant={dateObj.day() === d ? 'filled' : 'outlined'}
                    color={dateObj.day() === d ? 'primary' : 'default'}
                    sx={{ height: 20, fontSize: '0.65rem' }}
                  />
                ))}
              </Stack>
            </Stack>
          </Stack>
          {classInfo.semester && (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box sx={{ width: 20 }} />
              <Typography variant="caption" color="text.secondary">
                {classInfo.semester}
              </Typography>
            </Stack>
          )}
          {classInfo.source === 'powerschool' && (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box sx={{ width: 20 }} />
              <Chip label="PowerSchool" size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
              {classInfo.gradePercent != null && (
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {classInfo.gradePercent.toFixed(1)}% {classInfo.grade ? `· ${classInfo.grade}` : ''}
                </Typography>
              )}
            </Stack>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Close</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={goToClasses} startIcon={<EditIcon />}>
          Edit class
        </Button>
        {classInfo.source === 'powerschool' && (
          <Button onClick={goToGrades} variant="contained" startIcon={<GradingIcon />}>
            View grades
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

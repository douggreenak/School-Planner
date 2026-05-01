'use client';
// ============================================================
// DayView — vertical timeline of one day's classes.
// Pixel-based positioning (1 hour = PX_PER_HOUR px) so the layout is
// deterministic regardless of any parent-height ambiguity. The previous
// percentage-based version collapsed when the parent reported a smaller
// height than minHeight, leaving every block as a ~16px sliver.
// ============================================================
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import dayjs from 'dayjs';
import type { DaySchedule, ScheduleEntry } from '@/types';

// 7 AM through 7 PM = 13 hour labels, 12 hour intervals.
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7);
const PX_PER_HOUR = 64;
const DAY_START_MIN = 7 * 60;   // 420 — top of the timeline
const DAY_END_MIN = 19 * 60;    // 1140 — bottom (7 PM)
const TOTAL_HEIGHT = ((DAY_END_MIN - DAY_START_MIN) / 60) * PX_PER_HOUR; // 768px
const TIME_GUTTER = 64; // px reserved for the hour labels on the left

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

function formatTime(t: string): string {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

interface Props {
  schedule: DaySchedule;
  date: string;
  // Optional click handler. When provided, class blocks become real buttons
  // (with role + keyboard support). Stays optional so existing call sites
  // (e.g. the dashboard) still work.
  onClassClick?: (entry: ScheduleEntry) => void;
}

export default function DayView({ schedule, date, onClassClick }: Props) {
  const theme = useTheme();

  // "Now" indicator updates every minute. Only meaningful when viewing today.
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 60_000);
    return () => clearInterval(id);
  }, []);

  const isToday = dayjs(date).isSame(dayjs(), 'day');
  const nowMin = now.hour() * 60 + now.minute();
  const nowInRange = nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN;

  if (schedule.classes.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography variant="h6" color="text.secondary">
          No classes scheduled for {dayjs(date).format('dddd, MMMM D')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', height: TOTAL_HEIGHT, mt: 1 }}>
      {/* Hour rows: label on the left, divider line across the right. */}
      {HOURS.map((hour) => {
        const top = (hour - 7) * PX_PER_HOUR;
        return (
          <Box key={hour}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                position: 'absolute',
                top,
                left: 0,
                width: TIME_GUTTER - 12,
                pr: 1,
                textAlign: 'right',
                transform: 'translateY(-50%)',
                fontSize: '0.7rem',
                userSelect: 'none',
              }}
            >
              {formatHour(hour)}
            </Typography>
            <Box
              sx={{
                position: 'absolute',
                top,
                left: TIME_GUTTER,
                right: 0,
                borderTop: 1,
                borderColor: 'divider',
              }}
            />
          </Box>
        );
      })}

      {/* Half-hour ticks — faint dashed lines, just enough visual rhythm. */}
      {HOURS.slice(0, -1).map((hour) => {
        const top = (hour - 7) * PX_PER_HOUR + PX_PER_HOUR / 2;
        return (
          <Box
            key={`half-${hour}`}
            sx={{
              position: 'absolute',
              top,
              left: TIME_GUTTER,
              right: 0,
              borderTop: '1px dashed',
              borderColor: alpha(theme.palette.divider, 0.4),
              pointerEvents: 'none',
            }}
          />
        );
      })}

      {/* Class blocks */}
      {schedule.classes.map((entry) => {
        const [sh, sm] = entry.startTime.split(':').map(Number);
        const [eh, em] = entry.endTime.split(':').map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        const top = ((startMin - DAY_START_MIN) / 60) * PX_PER_HOUR;
        // Floor at 28px so very short classes (or weird import data) still
        // show up as something readable rather than a 4px line.
        const height = Math.max(((endMin - startMin) / 60) * PX_PER_HOUR, 28);
        // Only show the teacher/room row when the block is tall enough.
        const showTeacher = height >= 56;
        const clickable = !!onClassClick;

        return (
          <Box
            key={entry.classInfo.id}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-label={clickable ? `${entry.classInfo.name}, ${formatTime(entry.startTime)} to ${formatTime(entry.endTime)}` : undefined}
            onClick={clickable ? () => onClassClick!(entry) : undefined}
            onKeyDown={clickable ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClassClick!(entry);
              }
            } : undefined}
            sx={{
              position: 'absolute',
              top,
              height,
              left: TIME_GUTTER + 4,
              right: 8,
              backgroundColor: entry.cancelled
                ? theme.palette.action.disabledBackground
                : alpha(entry.classInfo.color, 0.16),
              borderLeft: `4px solid ${entry.cancelled ? theme.palette.action.disabled : entry.classInfo.color}`,
              borderRadius: '0 8px 8px 0',
              px: 1.25,
              py: 0.75,
              opacity: entry.cancelled ? 0.65 : 1,
              cursor: clickable ? 'pointer' : 'default',
              transition: 'box-shadow 0.15s, background-color 0.15s',
              '&:hover': clickable ? {
                boxShadow: `0 2px 10px ${alpha(theme.palette.common.black, 0.18)}`,
                backgroundColor: entry.cancelled
                  ? theme.palette.action.disabledBackground
                  : alpha(entry.classInfo.color, 0.26),
              } : undefined,
              '&:focus-visible': clickable ? {
                outline: `2px solid ${entry.classInfo.color}`,
                outlineOffset: 2,
              } : undefined,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              gap: 0.25,
              zIndex: 1,
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                color: entry.classInfo.color,
                textDecoration: entry.cancelled ? 'line-through' : 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.2,
              }}
            >
              {entry.classInfo.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
              {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
              {entry.cancelled && ' · Cancelled'}
            </Typography>
            {showTeacher && entry.classInfo.teacher && entry.classInfo.teacher !== 'TBD' && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: 'block',
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.classInfo.teacher}{entry.classInfo.room ? ` · Rm ${entry.classInfo.room}` : ''}
              </Typography>
            )}
          </Box>
        );
      })}

      {/* "Now" indicator — red dot + line at the current time. Only renders
          when viewing today and we're within the visible window. */}
      {isToday && nowInRange && (
        <Box
          sx={{
            position: 'absolute',
            top: ((nowMin - DAY_START_MIN) / 60) * PX_PER_HOUR,
            left: TIME_GUTTER - 4,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'error.main', flexShrink: 0 }} />
          <Box sx={{ flex: 1, height: 0, borderTop: '2px solid', borderColor: 'error.main' }} />
        </Box>
      )}
    </Box>
  );
}

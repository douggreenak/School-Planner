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
import { PX_PER_HOUR, DAY_START_MIN, DAY_END_MIN, TOTAL_HEIGHT, TIME_GUTTER, MIN_BLOCK_HEIGHT, hourTop, halfHourTop, minutesToPixels, heightForMinutes, topForMinutes } from '@/lib/calendarMetrics';
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7);

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
  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugSchedule') === '1';

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
        {/* Hour labels on the left. Gridlines removed for a cleaner look. */}
        {HOURS.map((hour) => {
          const top = hourTop(hour);
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
            </Box>
          );
        })}

      {/* Half-hour ticks removed for a cleaner look. */}

      {/* Class blocks */}
      {schedule.classes.map((entry) => {
  const [sh, sm] = entry.startTime.split(':').map(Number);
        const [eh, em] = entry.endTime.split(':').map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        const top = topForMinutes(startMin);
        // Floor at MIN_BLOCK_HEIGHT so very short classes (or weird import data) still
        // show up as something readable rather than a 4px line.
        const height = heightForMinutes(startMin, endMin);
        // Only show the teacher/room row when the block is tall enough.
        const showTeacher = height >= 56;
        const clickable = !!onClassClick;

        if (debug) {
          // eslint-disable-next-line no-console
          console.debug(`DayView entry: ${entry.classInfo.name} ${entry.startTime}-${entry.endTime} -> top=${top.toFixed(2)}px height=${height.toFixed(2)}px`);
        }

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
              borderRadius: '8px',
              px: 1.25,
              py: 0.75,
              opacity: entry.cancelled ? 0.65 : 1,
              cursor: clickable ? 'pointer' : 'default',
              transition: 'box-shadow 0.15s, background-color 0.15s',
                '&:hover': clickable ? {
                  boxShadow: `0 4px 20px ${alpha(theme.palette.common.black, 0.22)}`,
                  backgroundColor: entry.cancelled
                    ? theme.palette.action.disabledBackground
                    : alpha(entry.classInfo.color, 0.8),
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
                fontWeight: 700,
                color: 'text.primary',
                textDecoration: entry.cancelled ? 'line-through' : 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.2,
              }}
            >
              {entry.classInfo.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, fontWeight: 600 }}>
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
            {debug && (
              <Typography variant="caption" sx={{ position: 'absolute', right: 6, top: 4, fontSize: '0.6rem', color: 'text.secondary' }}>
                {`${top.toFixed(1)} / ${height.toFixed(1)}`}
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
            top: topForMinutes(nowMin),
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

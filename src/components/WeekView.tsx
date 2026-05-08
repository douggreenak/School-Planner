'use client';
// ============================================================
// WeekView — 7-day grid with class blocks positioned by their actual
// start/end times. Same pixel-based scheme as DayView, just laid out
// across 7 day-columns. The previous version put each class only in its
// starting hour cell, so a 90-minute class showed as a tiny block in one
// row instead of spanning two.
// ============================================================
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { alpha, useTheme } from '@mui/material/styles';
import { DAY_START_MIN, DAY_END_MIN, TOTAL_HEIGHT, PX_PER_HOUR, TIME_GUTTER, hourTop, halfHourTop, topForMinutes, heightForMinutes } from '@/lib/calendarMetrics';
import dayjs from 'dayjs';
import type { DaySchedule, ScheduleEntry } from '@/types';

interface Props {
  schedule: DaySchedule[];
  weekStart: string;
  // Optional click handler. Receives both the entry and its date so the
  // page shows the correct day-specific dialog.
  onClassClick?: (entry: ScheduleEntry, date: string) => void;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7 AM through 7 PM
// constants imported from calendarMetrics to match DayView

function formatHour(h: number): string {
  if (h === 12) return '12p';
  if (h < 12) return `${h}a`;
  return `${h - 12}p`;
}

export default function WeekView({ schedule, weekStart, onClassClick }: Props) {
  const theme = useTheme();
  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugSchedule') === '1';
  const start = dayjs(weekStart);

  // Now indicator updates every minute (only useful for "today" column).
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 60_000);
    return () => clearInterval(id);
  }, []);
  const nowMin = now.hour() * 60 + now.minute();
  const nowInRange = nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN;

  return (
    <Box sx={{ overflowX: 'auto' }}>
          <Box sx={{ minWidth: 760 }}>
        {/* ===== Header row: weekday + date ===== */}
        <Box sx={{ display: 'grid', gridTemplateColumns: `${TIME_GUTTER}px repeat(7, 1fr)` }}>
          <Box />
          {DAY_LABELS.map((label, i) => {
            const d = start.add(i, 'day');
            const isToday = d.isSame(dayjs(), 'day');
            return (
              <Box
                key={label}
                sx={{
                  textAlign: 'center',
                  pb: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                  {label}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: isToday ? 600 : 400,
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    bgcolor: isToday ? 'primary.main' : 'transparent',
                    color: isToday ? 'primary.contrastText' : 'text.primary',
                  }}
                >
                  {d.format('D')}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* ===== Body: time gutter on the left, 7 day columns on the right ===== */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `${TIME_GUTTER}px repeat(7, 1fr)`,
            position: 'relative',
            height: TOTAL_HEIGHT,
          }}
        >
          {/* Hour-label gutter */}
          <Box sx={{ position: 'relative' }}>
            {HOURS.map((hour) => {
               const top = hourTop(hour);
              return (
                <Typography
                  key={hour}
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    position: 'absolute',
                    top,
                    right: 6,
                    transform: 'translateY(-50%)',
                    fontSize: '0.65rem',
                    userSelect: 'none',
                  }}
                >
                  {formatHour(hour)}
                </Typography>
              );
            })}
          </Box>

          {/* Day columns */}
          {schedule.map((day, dayIdx) => {
            const d = start.add(dayIdx, 'day');
            const isToday = d.isSame(dayjs(), 'day');
            return (
              <Box
                key={dayIdx}
                sx={{
                  position: 'relative',
                  borderLeft: 1,
                  borderColor: 'divider',
                  bgcolor: isToday ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
                }}
              >
                {/* Hour gridlines removed for a cleaner look */}

                {/* Class blocks */}
                {day.classes.map((entry) => {
                  const [sh, sm] = entry.startTime.split(':').map(Number);
                  const [eh, em] = entry.endTime.split(':').map(Number);
                const startMin = sh * 60 + sm;
                const endMin = eh * 60 + em;
                const top = topForMinutes(startMin);
                const height = heightForMinutes(startMin, endMin);
                const clickable = !!onClassClick;

                if (debug) {
                  // eslint-disable-next-line no-console
                  console.debug(
                    `WeekView entry: ${entry.classInfo.name} ${entry.startTime}-${entry.endTime} (day ${day.date}) -> top=${top.toFixed(2)}px height=${height.toFixed(2)}px`
                  );
                }

                  return (
                    <Box
                      key={entry.classInfo.id}
                      role={clickable ? 'button' : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? () => onClassClick!(entry, day.date) : undefined}
                      onKeyDown={clickable ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onClassClick!(entry, day.date);
                        }
                      } : undefined}
                      sx={{
                        position: 'absolute',
                        top,
                        height,
                        left: 2,
                        right: 2,
                        backgroundColor: entry.cancelled
                          ? theme.palette.action.disabledBackground
                          : alpha(entry.classInfo.color, 0.14),
                        borderLeft: `3px solid ${entry.cancelled ? theme.palette.action.disabled : entry.classInfo.color}`,
                        borderRadius: '6px',
                        px: 0.5,
                        py: 0.25,
                        overflow: 'hidden',
                        opacity: entry.cancelled ? 0.5 : 1,
                        cursor: clickable ? 'pointer' : 'default',
                        transition: 'background-color 0.12s',
                        '&:hover': clickable ? {
                          backgroundColor: entry.cancelled
                            ? theme.palette.action.disabledBackground
                            : alpha(entry.classInfo.color, 0.9),
                          boxShadow: `0 4px 18px ${alpha(theme.palette.common.black, 0.14)}`,
                        } : undefined,
                        '&:focus-visible': clickable ? {
                          outline: `2px solid ${entry.classInfo.color}`,
                          outlineOffset: 1,
                        } : undefined,
                        zIndex: 1,
                      }}
                    >
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            color: 'text.primary',
                            fontSize: '0.75rem',
                            display: 'block',
                            lineHeight: 1.15,
                            textDecoration: entry.cancelled ? 'line-through' : 'none',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {entry.classInfo.name}
                        </Typography>
                        {height >= 36 && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontSize: '0.6rem', display: 'block', lineHeight: 1.15 }}
                          >
                            {entry.startTime}
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

                {/* Now indicator — only on the today column */}
                {isToday && nowInRange && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: topForMinutes(nowMin),
                      left: 0,
                      right: 0,
                      display: 'flex',
                      alignItems: 'center',
                      pointerEvents: 'none',
                      zIndex: 2,
                    }}
                  >
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'error.main', flexShrink: 0, ml: -0.5 }} />
                    <Box sx={{ flex: 1, height: 0, borderTop: '2px solid', borderColor: 'error.main' }} />
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>

        {/* Disruption indicators */}
        <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
          {schedule.map((day, i) =>
            day.disruption ? (
              <Chip
                key={i}
                size="small"
                label={`${DAY_LABELS[i]}: ${day.disruption.label}`}
                color="warning"
                variant="outlined"
                sx={{ fontSize: '0.7rem' }}
              />
            ) : null
          )}
        </Box>
      </Box>
    </Box>
  );
}

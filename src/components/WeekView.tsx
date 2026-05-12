'use client';
// ============================================================
// WeekView — 7-day grid with class blocks positioned by their actual
// start/end times. Same pixel-based scheme as DayView, just laid out
// across 7 day-columns. The previous version put each class only in its
// starting hour cell, so a 90-minute class showed as a tiny block in one
// row instead of spanning two.
// ============================================================
import { useEffect, useState, useMemo, memo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { alpha, useTheme } from '@mui/material/styles';
import { DAY_START_MIN, DAY_END_MIN, TOTAL_HEIGHT, PX_PER_HOUR, TIME_GUTTER, hourTop, halfHourTop, topForMinutes, heightForMinutes, parseMinutes } from '@/lib/calendarMetrics';
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

function formatHour(h: number): string {
  if (h === 12) return '12p';
  if (h < 12) return `${h}a`;
  return `${h - 12}p`;
}

function NowIndicator() {
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 60_000);
    return () => clearInterval(id);
  }, []);

  const nowMin = now.hour() * 60 + now.minute();
  if (nowMin < DAY_START_MIN || nowMin > DAY_END_MIN) return null;

  return (
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
  );
}

interface ClassBlockProps {
  entry: ScheduleEntry;
  top: number;
  height: number;
  theme: any;
  date: string;
  onClassClick?: (entry: ScheduleEntry, date: string) => void;
  debug: boolean;
}

const ClassBlock = memo(({ entry, top, height, theme, date, onClassClick, debug }: ClassBlockProps) => {
  const clickable = !!onClassClick;

  if (debug) {
    // eslint-disable-next-line no-console
    console.debug(
      `WeekView entry: ${entry.classInfo.name} ${entry.startTime}-${entry.endTime} (day ${date}) -> top=${top.toFixed(2)}px height=${height.toFixed(2)}px`
    );
  }

  return (
    <Box
      key={entry.classInfo.id}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onClassClick!(entry, date) : undefined}
      onKeyDown={clickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClassClick!(entry, date);
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
});

ClassBlock.displayName = 'ClassBlock';

export default function WeekView({ schedule, weekStart, onClassClick }: Props) {
  const theme = useTheme();
  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugSchedule') === '1';
  const start = dayjs(weekStart);

  const memoizedSchedules = useMemo(() => {
    return schedule.map((day) => ({
      ...day,
      classes: day.classes.map((entry) => {
        const startMin = parseMinutes(entry.startTime);
        const endMin = parseMinutes(entry.endTime);
        return {
          entry,
          top: topForMinutes(startMin),
          height: heightForMinutes(startMin, endMin),
        };
      }),
    }));
  }, [schedule]);

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
          {memoizedSchedules.map((day, dayIdx) => {
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
                {/* Class blocks */}
                {day.classes.map(({ entry, top, height }) => (
                  <ClassBlock
                    key={entry.classInfo.id}
                    entry={entry}
                    top={top}
                    height={height}
                    theme={theme}
                    date={day.date}
                    onClassClick={onClassClick}
                    debug={debug}
                  />
                ))}

                {/* Now indicator — only on the today column */}
                {isToday && <NowIndicator />}
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

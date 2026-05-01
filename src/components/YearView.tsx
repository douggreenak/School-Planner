'use client';
import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { alpha, useTheme } from '@mui/material/styles';
import dayjs from 'dayjs';
import type { SchoolClass, ScheduleDisruption } from '@/types';
import { buildDaySchedule } from '@/lib/calendar';

interface Props {
  year: number;
  classes: SchoolClass[];
  disruptions: ScheduleDisruption[];
  onDateClick: (date: string) => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function YearView({ year, classes, disruptions, onDateClick }: Props) {
  const theme = useTheme();

  const disruptionDates = useMemo(() => {
    const map = new Map<string, ScheduleDisruption>();
    for (const d of disruptions) map.set(d.date, d);
    return map;
  }, [disruptions]);

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 2 }}>
      {MONTHS.map((monthLabel, monthIdx) => {
        const firstDay = dayjs().year(year).month(monthIdx).startOf('month');
        const daysInMonth = firstDay.daysInMonth();
        const startDow = (firstDay.day() + 6) % 7; // Monday = 0
        const cells: { date: string; day: number; inMonth: boolean }[] = [];

        for (let i = 0; i < startDow; i++) cells.push({ date: '', day: 0, inMonth: false });
        for (let d = 1; d <= daysInMonth; d++) {
          cells.push({
            date: firstDay.date(d).format('YYYY-MM-DD'),
            day: d,
            inMonth: true,
          });
        }

        return (
          <Box key={monthLabel}>
            <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>{monthLabel}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <Typography key={i} variant="caption" color="text.secondary" sx={{ textAlign: 'center', fontSize: '0.6rem' }}>
                  {d}
                </Typography>
              ))}
              {cells.map((cell, i) => {
                if (!cell.inMonth) return <Box key={i} />;
                const disruption = disruptionDates.get(cell.date);
                const isToday = cell.date === dayjs().format('YYYY-MM-DD');
                const dayOfWeek = dayjs(cell.date).day();
                const hasClasses = classes.some((c) => c.days.includes(dayOfWeek));

                let bg = 'transparent';
                let color = theme.palette.text.primary;
                if (isToday) {
                  bg = theme.palette.primary.main;
                  color = theme.palette.primary.contrastText;
                } else if (disruption?.type === 'no_school') {
                  bg = alpha(theme.palette.error.main, 0.12);
                  color = theme.palette.error.main;
                } else if (disruption) {
                  bg = alpha(theme.palette.warning.main, 0.15);
                  color = theme.palette.warning.dark ?? theme.palette.warning.main;
                } else if (hasClasses) {
                  bg = alpha(theme.palette.primary.main, 0.1);
                } else {
                  color = theme.palette.text.disabled;
                }

                const label = disruption
                  ? `${dayjs(cell.date).format('MMM D')}: ${disruption.label}`
                  : dayjs(cell.date).format('ddd, MMM D');

                return (
                  <Tooltip key={i} title={label} arrow>
                    <Box
                      onClick={() => onDateClick(cell.date)}
                      sx={{
                        width: 24,
                        height: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        fontSize: '0.65rem',
                        fontWeight: isToday ? 600 : 400,
                        backgroundColor: bg,
                        color,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        '&:hover': { boxShadow: `0 0 0 2px ${theme.palette.primary.main}` },
                        mx: 'auto',
                      }}
                    >
                      {cell.day}
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

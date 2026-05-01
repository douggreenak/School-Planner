'use client';
import { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Grid from '@mui/material/Grid';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import type { SchoolClass } from '@/types';
import { v4 as uuid } from 'uuid';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (cls: SchoolClass) => void;
  initial?: SchoolClass | null;
}

const COLORS = [
  '#4285F4', '#EA4335', '#FBBC04', '#34A853',
  '#FF6D01', '#46BDC6', '#7BAAF7', '#F07B72',
  '#A142F4', '#24C1E0', '#F538A0', '#185ABC',
];

const DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];

const empty: SchoolClass = {
  id: '',
  name: '',
  teacher: '',
  room: '',
  color: '#4285F4',
  period: 1,
  startTime: '08:00',
  endTime: '08:50',
  days: [1, 2, 3, 4, 5],
  semester: 'Spring 2026',
};

export default function ClassDialog({ open, onClose, onSave, initial }: Props) {
  const [form, setForm] = useState<SchoolClass>(empty);

  useEffect(() => {
    if (initial) setForm(initial);
    else setForm({ ...empty, id: uuid() });
  }, [initial, open]);

  const update = (field: keyof SchoolClass, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleDay = (day: number) => {
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter((d) => d !== day) : [...prev.days, day],
    }));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? 'Edit Class' : 'Add Class'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={12}>
            <TextField fullWidth label="Class Name" value={form.name} onChange={(e) => update('name', e.target.value)} />
          </Grid>
          <Grid size={6}>
            <TextField fullWidth label="Teacher" value={form.teacher} onChange={(e) => update('teacher', e.target.value)} />
          </Grid>
          <Grid size={6}>
            <TextField fullWidth label="Room" value={form.room} onChange={(e) => update('room', e.target.value)} />
          </Grid>
          <Grid size={4}>
            <TextField fullWidth label="Period" type="number" value={form.period} onChange={(e) => update('period', parseInt(e.target.value) || 1)} />
          </Grid>
          <Grid size={4}>
            <TextField fullWidth label="Start Time" type="time" value={form.startTime} onChange={(e) => update('startTime', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={4}>
            <TextField fullWidth label="End Time" type="time" value={form.endTime} onChange={(e) => update('endTime', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={12}>
            <TextField fullWidth label="Semester" value={form.semester} onChange={(e) => update('semester', e.target.value)} />
          </Grid>
          <Grid size={12}>
            <Box sx={{ mb: 1 }}>
              <InputLabel sx={{ mb: 0.5, fontSize: '0.75rem' }}>Days</InputLabel>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {DAYS.map((d) => (
                  <Chip
                    key={d.value}
                    label={d.label}
                    onClick={() => toggleDay(d.value)}
                    color={form.days.includes(d.value) ? 'primary' : 'default'}
                    variant={form.days.includes(d.value) ? 'filled' : 'outlined'}
                  />
                ))}
              </Box>
            </Box>
          </Grid>
          <Grid size={12}>
            <InputLabel sx={{ mb: 0.5, fontSize: '0.75rem' }}>Color</InputLabel>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {COLORS.map((c) => (
                <Box
                  key={c}
                  onClick={() => update('color', c)}
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: c,
                    cursor: 'pointer',
                    border: form.color === c ? 3 : '3px solid transparent',
                    borderColor: form.color === c ? 'text.primary' : 'transparent',
                    transition: 'border 0.15s',
                  }}
                />
              ))}
            </Box>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onSave(form)} disabled={!form.name}>
          {initial ? 'Save' : 'Add Class'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

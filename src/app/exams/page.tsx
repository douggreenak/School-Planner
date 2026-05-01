'use client';
import { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
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
import Stack from '@mui/material/Stack';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RoomIcon from '@mui/icons-material/Room';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useExams, useClasses, apiPost, apiPut, apiDelete } from '@/lib/hooks';
import type { Exam } from '@/types';
import { v4 as uuid } from 'uuid';

export default function ExamsPage() {
  const { data: exams, loading, refetch } = useExams();
  const { data: classes } = useClasses();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [form, setForm] = useState<Exam>({
    id: '', classId: '', title: '', date: '', startTime: '08:00', endTime: '09:00',
    location: '', notes: '', reminder: 30,
  });

  const sorted = useMemo(() => {
    if (!exams) return [];
    return [...exams].sort((a, b) => dayjs(a.date).diff(dayjs(b.date)));
  }, [exams]);

  const upcoming = sorted.filter((e) => dayjs(e.date).isAfter(dayjs().subtract(1, 'day')));
  const past = sorted.filter((e) => dayjs(e.date).isBefore(dayjs(), 'day'));

  const openDialog = (exam?: Exam) => {
    if (exam) { setEditing(exam); setForm(exam); }
    else {
      setEditing(null);
      setForm({ id: uuid(), classId: classes?.[0]?.id ?? '', title: '', date: dayjs().add(7, 'day').format('YYYY-MM-DD'), startTime: '08:00', endTime: '09:00', location: '', notes: '', reminder: 30 });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editing) await apiPut('/api/exams', form);
    else await apiPost('/api/exams', form);
    setDialogOpen(false);
    refetch();
  };

  const handleDelete = async (id: string) => {
    await apiDelete(`/api/exams?id=${id}`);
    refetch();
  };

  const getClassName = (classId: string) => classes?.find((c) => c.id === classId)?.name ?? 'Unknown';
  const getClassColor = (classId: string) => classes?.find((c) => c.id === classId)?.color ?? '';

  if (loading) return <LinearProgress />;

  const renderExamCard = (exam: Exam) => {
    const isPast = dayjs(exam.date).isBefore(dayjs(), 'day');
    const daysUntil = dayjs(exam.date).diff(dayjs(), 'day');
    return (
      <Card key={exam.id} sx={{ opacity: isPast ? 0.6 : 1 }}>
        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>{exam.title}</Typography>
                {!isPast && daysUntil <= 3 && (
                  <Chip size="small" label={daysUntil === 0 ? 'Today!' : `${daysUntil}d`} color="error" sx={{ fontSize: '0.7rem', height: 22 }} />
                )}
              </Box>
              <Chip
                size="small"
                label={getClassName(exam.classId)}
                sx={{ backgroundColor: getClassColor(exam.classId) + '18', color: getClassColor(exam.classId), fontWeight: 500, fontSize: '0.7rem', mb: 1 }}
              />
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AccessTimeIcon fontSize="small" />
                  {dayjs(exam.date).format('MMM D, YYYY')} • {exam.startTime} – {exam.endTime}
                </Typography>
                {exam.location && (
                  <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <RoomIcon fontSize="small" /> {exam.location}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <NotificationsIcon fontSize="small" /> {exam.reminder}min reminder
                </Typography>
              </Box>
              {exam.notes && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                  {exam.notes}
                </Typography>
              )}
            </Box>
            <Box>
              <IconButton size="small" onClick={() => openDialog(exam)}><EditIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={() => handleDelete(exam.id)} color="error"><DeleteIcon fontSize="small" /></IconButton>
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box>
      <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400, mb: 3 }}>Exams</Typography>

      {upcoming.length === 0 && past.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>No exams scheduled</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => openDialog()}>Add Exam</Button>
        </Box>
      )}

      {upcoming.length > 0 && (
        <>
          <Typography variant="h6" sx={{ mb: 1.5, color: 'primary.main' }}>Upcoming</Typography>
          <Stack spacing={1.5} sx={{ mb: 3 }}>{upcoming.map(renderExamCard)}</Stack>
        </>
      )}

      {past.length > 0 && (
        <>
          <Typography variant="h6" sx={{ mb: 1.5, color: 'text.secondary' }}>Past</Typography>
          <Stack spacing={1.5}>{past.map(renderExamCard)}</Stack>
        </>
      )}

      <Fab color="primary" sx={{ position: 'fixed', bottom: 24, right: 24 }} onClick={() => openDialog()}>
        <AddIcon />
      </Fab>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Exam' : 'Add Exam'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}><TextField fullWidth label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Class</InputLabel>
                <Select value={form.classId} label="Class" onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                  {classes?.map((c) => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
            <Grid size={{ xs: 6, sm: 6 }}><TextField fullWidth label="Start Time" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
            <Grid size={{ xs: 6, sm: 6 }}><TextField fullWidth label="End Time" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
            <Grid size={{ xs: 12, sm: 8 }}><TextField fullWidth label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Grid>
            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth label="Reminder (min)" type="number" value={form.reminder} onChange={(e) => setForm({ ...form, reminder: parseInt(e.target.value) || 0 })} /></Grid>
            <Grid size={12}><TextField fullWidth label="Notes" multiline rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.title}>
            {editing ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

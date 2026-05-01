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
import Checkbox from '@mui/material/Checkbox';
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
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Stack from '@mui/material/Stack';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useHomework, useClasses, apiPost, apiPut, apiDelete } from '@/lib/hooks';
import type { Homework } from '@/types';
import { v4 as uuid } from 'uuid';

export default function HomeworkPage() {
  const { data: homework, loading, refetch } = useHomework();
  const { data: classes } = useClasses();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Homework | null>(null);
  const [tab, setTab] = useState(0); // 0=upcoming, 1=completed, 2=all

  const [form, setForm] = useState<Homework>({
    id: '', classId: '', title: '', description: '', dueDate: '',
    completed: false, priority: 'medium', source: 'manual',
  });

  // PowerSchool assignments live on the Grades tab ONLY — they're auto-imported
  // from the school's grading system and shouldn't clutter the manual-entry
  // Homework list. Everything else (manual + Classroom imports) still shows
  // here. All downstream tabs/counts are computed from this filtered list.
  const manualHomework = useMemo(
    () => (homework || []).filter((h) => h.source !== 'powerschool'),
    [homework],
  );

  const filtered = useMemo(() => {
    let list = [...manualHomework];
    if (tab === 0) list = list.filter((h) => !h.completed);
    else if (tab === 1) list = list.filter((h) => h.completed);
    return list.sort((a, b) => dayjs(a.dueDate).diff(dayjs(b.dueDate)));
  }, [manualHomework, tab]);

  const openDialog = (hw?: Homework) => {
    if (hw) {
      setEditing(hw);
      setForm(hw);
    } else {
      setEditing(null);
      setForm({ id: uuid(), classId: classes?.[0]?.id ?? '', title: '', description: '', dueDate: dayjs().format('YYYY-MM-DD'), completed: false, priority: 'medium', source: 'manual' });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editing) await apiPut('/api/homework', form);
    else await apiPost('/api/homework', form);
    setDialogOpen(false);
    refetch();
  };

  const toggleComplete = async (hw: Homework) => {
    await apiPut('/api/homework', { ...hw, completed: !hw.completed });
    refetch();
  };

  const handleDelete = async (id: string) => {
    await apiDelete(`/api/homework?id=${id}`);
    refetch();
  };

  const getClassName = (classId: string) => classes?.find((c) => c.id === classId)?.name ?? 'Unknown';
  const getClassColor = (classId: string) => classes?.find((c) => c.id === classId)?.color ?? '';

  if (loading) return <LinearProgress />;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400 }}>Homework</Typography>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Upcoming (${manualHomework.filter((h) => !h.completed).length})`} />
        <Tab label={`Completed (${manualHomework.filter((h) => h.completed).length})`} />
        <Tab label="All" />
      </Tabs>

      {filtered.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body1" color="text.secondary">
            {tab === 0 ? 'No upcoming homework!' : tab === 1 ? 'No completed homework yet.' : 'No homework found.'}
          </Typography>
        </Box>
      )}

      <Stack spacing={1}>
        {filtered.map((hw) => {
          const overdue = !hw.completed && dayjs(hw.dueDate).isBefore(dayjs(), 'day');
          return (
            <Card key={hw.id} sx={{ opacity: hw.completed ? 0.7 : 1 }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Checkbox
                  checked={hw.completed}
                  onChange={() => toggleComplete(hw)}
                  sx={{ color: getClassColor(hw.classId), '&.Mui-checked': { color: getClassColor(hw.classId) } }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body1" sx={{ fontWeight: 500, textDecoration: hw.completed ? 'line-through' : 'none' }}>
                    {hw.title}
                  </Typography>
                  {hw.description && (
                    <Typography variant="body2" color="text.secondary" noWrap>{hw.description}</Typography>
                  )}
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Chip
                      size="small"
                      label={getClassName(hw.classId)}
                      sx={{ backgroundColor: getClassColor(hw.classId) + '18', color: getClassColor(hw.classId), fontWeight: 500, fontSize: '0.7rem' }}
                    />
                    <Typography variant="caption" color={overdue ? 'error.main' : 'text.secondary'} sx={{ fontWeight: overdue ? 600 : 400 }}>
                      {overdue ? 'OVERDUE • ' : ''}Due {dayjs(hw.dueDate).format('MMM D, YYYY')}
                    </Typography>
                    {hw.source !== 'manual' && (
                      <Chip size="small" label={hw.source} variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                    )}
                  </Box>
                </Box>
                <Chip
                  size="small"
                  label={hw.priority}
                  color={hw.priority === 'high' ? 'error' : hw.priority === 'medium' ? 'warning' : 'default'}
                  sx={{ fontSize: '0.7rem' }}
                />
                <IconButton size="small" onClick={() => openDialog(hw)}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => handleDelete(hw.id)} color="error">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      <Fab color="primary" sx={{ position: 'fixed', bottom: 24, right: 24 }} onClick={() => openDialog()}>
        <AddIcon />
      </Fab>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Homework' : 'Add Homework'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}>
              <TextField fullWidth label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth label="Description" multiline rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Class</InputLabel>
                <Select value={form.classId} label="Class" onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                  {classes?.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Due Date" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Priority</InputLabel>
                <Select value={form.priority} label="Priority" onChange={(e) => setForm({ ...form, priority: e.target.value as Homework['priority'] })}>
                  <MenuItem value="low">Low</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                </Select>
              </FormControl>
            </Grid>
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

// Inline SVG — we don't use `@mui/icons-material/Edit` here so the homework
// page can be self-contained. `fontSize` is declared so callers using the
// MUI icon convention compile; the SVG is a fixed 20px size.
function EditIcon(_props: { fontSize?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
      <path d="M200-200h57l391-391-57-57-391 391v57Zm-40 40v-117l462-461 116 116-461 462H160Zm560-504-56-56 56 56ZM512-649l-28-29 57 57-29-28Z"/>
    </svg>
  );
}

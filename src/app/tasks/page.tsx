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
import { useTasks, apiPost, apiPut, apiDelete } from '@/lib/hooks';
import type { Task } from '@/types';
import { v4 as uuid } from 'uuid';

const CATEGORIES = ['General', 'Study', 'Project', 'Reading', 'Practice', 'Other'];

export default function TasksPage() {
  const { data: tasks, loading, refetch } = useTasks();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<Task>({
    id: '', title: '', description: '', dueDate: '', completed: false, priority: 'medium', category: 'General',
  });

  const filtered = useMemo(() => {
    if (!tasks) return [];
    let list = [...tasks];
    if (tab === 0) list = list.filter((t) => !t.completed);
    else if (tab === 1) list = list.filter((t) => t.completed);
    return list.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return dayjs(a.dueDate).diff(dayjs(b.dueDate));
    });
  }, [tasks, tab]);

  const openDialog = (task?: Task) => {
    if (task) { setEditing(task); setForm(task); }
    else {
      setEditing(null);
      setForm({ id: uuid(), title: '', description: '', dueDate: dayjs().format('YYYY-MM-DD'), completed: false, priority: 'medium', category: 'General' });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editing) await apiPut('/api/tasks', form);
    else await apiPost('/api/tasks', form);
    setDialogOpen(false);
    refetch();
  };

  const toggleComplete = async (task: Task) => {
    await apiPut('/api/tasks', { ...task, completed: !task.completed });
    refetch();
  };

  const handleDelete = async (id: string) => {
    await apiDelete(`/api/tasks?id=${id}`);
    refetch();
  };

  if (loading) return <LinearProgress />;

  return (
    <Box>
      <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400, mb: 2 }}>Tasks</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Pending (${tasks?.filter((t) => !t.completed).length ?? 0})`} />
        <Tab label={`Done (${tasks?.filter((t) => t.completed).length ?? 0})`} />
        <Tab label="All" />
      </Tabs>

      {filtered.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body1" color="text.secondary">
            {tab === 0 ? 'No pending tasks!' : 'No tasks found.'}
          </Typography>
        </Box>
      )}

      <Stack spacing={1}>
        {filtered.map((task) => {
          const overdue = !task.completed && task.dueDate && dayjs(task.dueDate).isBefore(dayjs(), 'day');
          return (
            <Card key={task.id} sx={{ opacity: task.completed ? 0.7 : 1 }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Checkbox checked={task.completed} onChange={() => toggleComplete(task)} color="success" />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body1" sx={{ fontWeight: 500, textDecoration: task.completed ? 'line-through' : 'none' }}>
                    {task.title}
                  </Typography>
                  {task.description && <Typography variant="body2" color="text.secondary" noWrap>{task.description}</Typography>}
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center' }}>
                    <Chip size="small" label={task.category} variant="outlined" sx={{ fontSize: '0.7rem' }} />
                    {task.dueDate && (
                      <Typography variant="caption" color={overdue ? 'error.main' : 'text.secondary'} sx={{ fontWeight: overdue ? 600 : 400 }}>
                        {overdue ? 'OVERDUE • ' : ''}Due {dayjs(task.dueDate).format('MMM D')}
                      </Typography>
                    )}
                  </Box>
                </Box>
                <Chip size="small" label={task.priority} color={task.priority === 'high' ? 'error' : task.priority === 'medium' ? 'warning' : 'default'} sx={{ fontSize: '0.7rem' }} />
                <IconButton size="small" onClick={() => handleDelete(task.id)} color="error"><DeleteIcon fontSize="small" /></IconButton>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      <Fab color="primary" sx={{ position: 'fixed', bottom: 24, right: 24 }} onClick={() => openDialog()}><AddIcon /></Fab>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Task' : 'Add Task'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}><TextField fullWidth label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Grid>
            <Grid size={12}><TextField fullWidth label="Description" multiline rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Due Date" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Priority</InputLabel>
                <Select value={form.priority} label="Priority" onChange={(e) => setForm({ ...form, priority: e.target.value as Task['priority'] })}>
                  <MenuItem value="low">Low</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Category</InputLabel>
                <Select value={form.category} label="Category" onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
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

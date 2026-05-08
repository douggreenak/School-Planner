'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RoomIcon from '@mui/icons-material/Room';
import PersonIcon from '@mui/icons-material/Person';
import { useClasses, apiPost, apiPut, apiDelete } from '@/lib/hooks';
import ClassDialog from '@/components/ClassDialog';
import type { SchoolClass } from '@/types';
// (No synthetic lunch button here — Lunch is added to the schedule view only.)

const DAY_NAMES: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

export default function ClassesPage() {
  const { data: classes, loading, refetch, mutate } = useClasses();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; cls: SchoolClass } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSave = async (cls: SchoolClass) => {
    if (editing) {
      await apiPut(`/api/classes`, cls);
    } else {
      await apiPost(`/api/classes`, cls);
    }
    setDialogOpen(false);
    setEditing(null);
    refetch();
  };

  // Optimistic delete: remove the class from local state immediately so the UI
  // updates the moment the user clicks. The network call happens in the
  // background. If it fails, we roll the class back in place and surface an
  // error toast. This keeps the app feeling instant even on slow Sheets writes.
  const handleDelete = async (id: string) => {
    setMenuAnchor(null);
    const prev = classes;
    if (!prev) return;
    const removed = prev.find((c) => c.id === id) || null;
    mutate(prev.filter((c) => c.id !== id));
    try {
      await apiDelete(`/api/classes?id=${id}`);
    } catch (err) {
      // Roll back and tell the user. We intentionally don't refetch — the
      // server state is unchanged, so our pre-delete cache is still correct.
      if (removed) mutate(prev);
      setDeleteError(`Could not delete class: ${(err as Error).message}`);
    }
  };

  if (loading) return <LinearProgress />;

  return (
    <Box>
      <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400, mb: 3 }}>
        Classes
      </Typography>

      {(!classes || classes.length === 0) && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
            No classes yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Add your first class to get started, or import from PowerSchool.
          </Typography>
          <Fab variant="extended" color="primary" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <AddIcon sx={{ mr: 1 }} /> Add Class
          </Fab>
          {/* Lunch is provided in the schedule view as a synthetic class. */}
        </Box>
      )}

      <Grid container spacing={2}>
        {classes?.map((cls) => (
          <Grid key={cls.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card sx={{ position: 'relative' }}>
              <Box sx={{ height: 6, backgroundColor: cls.color, borderRadius: '12px 12px 0 0' }} />
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Typography variant="h5" sx={{ fontWeight: 600, color: cls.color }}>
                    {cls.name}
                  </Typography>
                  <IconButton size="small" onClick={(e) => setMenuAnchor({ el: e.currentTarget, cls })}>
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <PersonIcon fontSize="small" /> {cls.teacher}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <RoomIcon fontSize="small" /> Room {cls.room}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AccessTimeIcon fontSize="small" /> Period {cls.period} • {cls.startTime} – {cls.endTime}
                  </Typography>
                </Box>
                <Box sx={{ mt: 1.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {cls.days.sort().map((d) => (
                    <Chip key={d} label={DAY_NAMES[d]} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                  ))}
                </Box>
                <Chip label={cls.semester} size="small" sx={{ mt: 1, backgroundColor: cls.color + '18', color: cls.color, fontWeight: 500 }} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* FAB */}
      {classes && classes.length > 0 && (
        <Fab
          color="primary"
          sx={{ position: 'fixed', bottom: 24, right: 24 }}
          onClick={() => { setEditing(null); setDialogOpen(true); }}
        >
          <AddIcon />
        </Fab>
      )}

      {/* Context menu */}
      <Menu
        anchorEl={menuAnchor?.el}
        open={!!menuAnchor}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem onClick={() => { setEditing(menuAnchor!.cls); setDialogOpen(true); setMenuAnchor(null); }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleDelete(menuAnchor!.cls.id)} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      <ClassDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSave={handleSave}
        initial={editing}
      />

      <Snackbar
        open={!!deleteError}
        autoHideDuration={6000}
        onClose={() => setDeleteError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setDeleteError(null)} variant="filled">
          {deleteError}
        </Alert>
      </Snackbar>
    </Box>
  );
}

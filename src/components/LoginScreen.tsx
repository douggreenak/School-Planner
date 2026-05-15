'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import SchoolIcon from '@mui/icons-material/School';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

interface Props {
  onLogin: (user: { id: string; username: string }) => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!username.trim() || !password) {
      setError('Please enter a username and password.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Something went wrong.');
      } else {
        onLogin(data.user);
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setBusy(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit();
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Paper elevation={3} sx={{ width: '100%', maxWidth: 400, p: 4, borderRadius: 3 }}>
        <Stack spacing={3} sx={{ alignItems: 'center' }}>
          <Stack direction="row" sx={{ alignItems: 'center' }} spacing={1.5}>
            <SchoolIcon sx={{ color: 'primary.main', fontSize: 36 }} />
            <Typography variant="h5" sx={{ fontWeight: 600, color: 'primary.main' }}>
              School Planner
            </Typography>
          </Stack>

          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
            {mode === 'login'
              ? 'Sign in to access your planner.'
              : 'Create an account to get started.'}
          </Typography>

          {error && <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert>}

          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKey}
            fullWidth
            autoFocus
            autoComplete="username"
            disabled={busy}
            size="medium"
          />

          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKey}
            fullWidth
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            disabled={busy}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword((v) => !v)}
                      edge="end"
                      size="small"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />

          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={submit}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
          >
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>

          <Divider sx={{ width: '100%' }} />

          <Stack direction="row" sx={{ alignItems: 'center' }} spacing={1}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            </Typography>
            <Button
              variant="text"
              size="small"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              disabled={busy}
            >
              {mode === 'login' ? 'Create Account' : 'Sign In'}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}

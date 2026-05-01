'use client';
import { useState, useEffect, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CircleIcon from '@mui/icons-material/Circle';
import SchoolIcon from '@mui/icons-material/School';
import AssignmentIcon from '@mui/icons-material/Assignment';
import QuizIcon from '@mui/icons-material/Quiz';
import ChecklistIcon from '@mui/icons-material/Checklist';
import GradingIcon from '@mui/icons-material/Grading';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import SettingsIcon from '@mui/icons-material/Settings';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';
import { useThemeMode } from '@/components/ThemeRegistry';

const DRAWER_WIDTH = 256;

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { label: 'Classes', icon: <SchoolIcon />, path: '/classes' },
  { label: 'Schedule', icon: <CalendarMonthIcon />, path: '/schedule' },
  { label: 'Grades', icon: <GradingIcon />, path: '/grades' },
  { label: 'Homework', icon: <AssignmentIcon />, path: '/homework' },
  { label: 'Exams', icon: <QuizIcon />, path: '/exams' },
  { label: 'Tasks', icon: <ChecklistIcon />, path: '/tasks' },
  { label: 'Disruptions', icon: <WarningAmberIcon />, path: '/schedule?tab=disruptions' },
  { label: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

// Decide whether a nav item should appear active. Two cases the simpler
// `pathname.startsWith(...)` check got wrong:
//   1. Both /schedule and /schedule?tab=disruptions share the path /schedule.
//      Without looking at the query, both items light up at the same time.
//   2. /grades vs /grades/[classId] — the bare /grades item should still be
//      active on a detail route.
//
// Rule:
//   - "/" is active only on exactly "/".
//   - For other items: pathname must start with the item's path.
//   - If the item carries a ?tab=X query, the URL's `tab` must equal X.
//   - If the item has no query, no sibling with the same base path may
//     currently match. (E.g. /schedule item is NOT active when ?tab=disruptions
//     is present, because the Disruptions sibling owns that state.)
function isNavItemActive(item: NavItem, pathname: string, currentTab: string | null): boolean {
  if (item.path === '/') return pathname === '/';
  const [itemPath, itemQuery] = item.path.split('?');
  if (!pathname.startsWith(itemPath)) return false;
  if (itemQuery) {
    const itemTab = new URLSearchParams(itemQuery).get('tab');
    return currentTab === itemTab;
  }
  // Item has no query — only active when no sibling tab is currently selected
  // for this same base path.
  const siblingClaimsTab = NAV_ITEMS.some((other) => {
    if (other === item) return false;
    const [otherPath, otherQuery] = other.path.split('?');
    if (otherPath !== itemPath || !otherQuery) return false;
    const otherTab = new URLSearchParams(otherQuery).get('tab');
    return otherTab === currentTab;
  });
  return !siblingClaimsTab;
}

// Renders the nav list. Uses useSearchParams so it has to live behind a
// Suspense boundary in Next 16 — otherwise the whole layout opts out of
// static rendering for every page that uses it.
function NavListInner({
  onItemClick,
}: {
  onItemClick: (path: string) => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');

  return (
    <List sx={{ px: 1, pt: 1 }}>
      {NAV_ITEMS.map((item) => {
        const isActive = isNavItemActive(item, pathname, currentTab);
        return (
          <ListItemButton
            key={item.label}
            selected={isActive}
            onClick={() => onItemClick(item.path)}
            sx={{ mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: isActive ? 'primary.main' : 'text.secondary' }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText
              primary={item.label}
              slotProps={{ primary: { sx: { fontSize: '0.875rem', fontWeight: isActive ? 600 : 400 } } }}
            />
          </ListItemButton>
        );
      })}
    </List>
  );
}

// Fallback shown while the suspense boundary resolves on first load. Same
// list shape, but with no active highlighting — avoids layout shift.
function NavListFallback({
  onItemClick,
}: {
  onItemClick: (path: string) => void;
}) {
  return (
    <List sx={{ px: 1, pt: 1 }}>
      {NAV_ITEMS.map((item) => (
        <ListItemButton
          key={item.label}
          onClick={() => onItemClick(item.path)}
          sx={{ mb: 0.5 }}
        >
          <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>
            {item.icon}
          </ListItemIcon>
          <ListItemText
            primary={item.label}
            slotProps={{ primary: { sx: { fontSize: '0.875rem' } } }}
          />
        </ListItemButton>
      ))}
    </List>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const { mode, setMode } = useThemeMode();

  // Shared nav-item click handler — routes, then closes the mobile drawer
  // so the user lands on the new page instead of staring at the menu.
  const handleNavClick = (path: string) => {
    router.push(path);
    if (isMobile) setMobileOpen(false);
  };

  // A small colored dot next to the app title that says "your Sheet is (not)
  // reachable". Fetch once on mount — the route has a 30s/10s TTL cache so this
  // is cheap. `ok === null` means we don't know yet or creds aren't saved, in
  // which case we render nothing (don't nag new users with red dots).
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [healthError, setHealthError] = useState<string | undefined>();
  useEffect(() => {
    let cancelled = false;
    fetch('/api/setup/health')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        // If the error is "Missing credentials", treat it as "not set up yet"
        // rather than a scary red dot. New users haven't failed at anything.
        if (!data.ok && data.error === 'Missing credentials') {
          setHealthOk(null);
        } else {
          setHealthOk(!!data.ok);
          setHealthError(data.error);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setHealthOk(false);
        setHealthError('Network error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const healthDot = healthOk === null ? null : (
    <Tooltip
      title={
        healthOk
          ? 'Google Sheet connected'
          : `Google Sheet unreachable${healthError ? `: ${healthError}` : ''}. Click to open Settings.`
      }
    >
      <IconButton
        size="small"
        onClick={() => router.push('/settings')}
        sx={{ color: healthOk ? 'success.main' : 'error.main', p: 0.5 }}
        aria-label={healthOk ? 'Google Sheet connected' : 'Google Sheet unreachable'}
      >
        <CircleIcon sx={{ fontSize: 10 }} />
      </IconButton>
    </Tooltip>
  );

  const cycleTheme = () => {
    const next = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
    setMode(next);
  };

  const themeIcon = mode === 'light' ? <LightModeIcon /> : mode === 'dark' ? <DarkModeIcon /> : <SettingsBrightnessIcon />;
  const themeLabel = mode === 'light' ? 'Light mode' : mode === 'dark' ? 'Dark mode' : 'System theme';

  const drawer = (
    <Box>
      <Toolbar sx={{ gap: 1.5 }}>
        <SchoolIcon sx={{ color: 'primary.main', fontSize: 28 }} />
        <Typography variant="h6" noWrap sx={{ fontWeight: 500, color: 'primary.main', flex: 1 }}>
          School Planner
        </Typography>
        {healthDot}
        <Tooltip title={themeLabel}>
          <IconButton size="small" onClick={cycleTheme} sx={{ color: 'text.secondary' }}>
            {themeIcon}
          </IconButton>
        </Tooltip>
      </Toolbar>
      <Divider />
      <Suspense fallback={<NavListFallback onItemClick={handleNavClick} />}>
        <NavListInner onItemClick={handleNavClick} />
      </Suspense>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* App bar – mobile only */}
      {isMobile && (
        <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
          <Toolbar>
            <IconButton edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
            <SchoolIcon sx={{ color: 'primary.main', mr: 1 }} />
            <Typography variant="h6" noWrap sx={{ fontWeight: 500, flex: 1 }}>
              School Planner
            </Typography>
            {healthDot}
            <Tooltip title={themeLabel}>
              <IconButton onClick={cycleTheme} sx={{ color: 'text.secondary' }}>
                {themeIcon}
              </IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>
      )}

      {/* Sidebar */}
      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
          >
            {drawer}
          </Drawer>
        ) : (
          <Drawer
            variant="permanent"
            sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}
            open
          >
            {drawer}
          </Drawer>
        )}
      </Box>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          mt: isMobile ? '64px' : 0,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          bgcolor: 'background.default',
          minHeight: '100vh',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

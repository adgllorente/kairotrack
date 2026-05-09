import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ListChecks,
  FolderKanban,
  Settings,
  LogOut,
  Moon,
  Sun,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/hooks/auth';
import { useTheme } from '@/components/theme-provider';
import { ActiveTimerBar } from '@/components/active-timer-bar';
import { cn } from '@/lib/utils';

const links = [
  { to: '/', label: 'Timer', icon: Clock, end: true },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/history', label: 'History', icon: ListChecks },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Layout() {
  const logout = useLogout();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-dvh flex flex-col md:flex-row">
      <aside className="md:w-56 md:min-h-dvh md:flex md:flex-col md:border-r border-b md:border-b-0 bg-card">
        <div className="p-4 flex md:block items-center justify-between">
          <img
            src="/logo.svg"
            alt="kairotrack"
            className="h-10 w-auto md:mx-auto dark:invert"
          />
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
        <nav className="flex md:flex-col gap-1 p-2 overflow-x-auto">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap',
                  isActive ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent',
                )
              }
            >
              <Icon className="size-4" /> <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="hidden md:flex flex-col gap-1 p-2 mt-auto">
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />} Theme
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={async () => {
              await logout.mutateAsync();
              navigate('/login');
            }}
          >
            <LogOut className="size-4" /> Logout
          </Button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col">
        <ActiveTimerBar />
        <div className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

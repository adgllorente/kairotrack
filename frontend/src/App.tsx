import { Routes, Route, Navigate } from 'react-router-dom';
import { useMe } from '@/hooks/auth';
import { Layout } from '@/components/layout';
import { LoginPage } from '@/pages/Login';
import { TimerPage } from '@/pages/Timer';
import { HistoryPage } from '@/pages/History';
import { ProjectsPage } from '@/pages/Projects';
import { DashboardPage } from '@/pages/Dashboard';
import { SettingsPage } from '@/pages/Settings';

function Protected({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useMe();
  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading...</div>;
  if (!data?.user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<TimerPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

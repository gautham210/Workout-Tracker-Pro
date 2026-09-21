import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppShell from './product/AppShell';

const LoginExperience = lazy(() => import('./product/LoginExperience'));
const HomeExperience = lazy(() => import('./product/HomeExperience'));
const WorkoutExperience = lazy(() => import('./product/WorkoutExperience'));
const ProgressExperience = lazy(() => import('./product/ProgressExperience'));
const NutritionExperience = lazy(() => import('./product/NutritionExperience'));
const HistoryExperience = lazy(() => import('./product/HistoryExperience'));
const CoachExperience = lazy(() => import('./product/CoachExperience'));
const BodyMetricsExperience = lazy(() => import('./product/BodyMetricsExperience'));
const ProfileExperience = lazy(() => import('./product/ProfileExperience'));
const ImportExperience = lazy(() => import('./product/ImportExperience'));
const AthleteSpaceExperience = lazy(() => import('./product/AthleteSpaceExperience'));

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  const { user } = useAuth();
  return (
    <BrowserRouter>
      <Suspense fallback={<main className="route-loading" aria-live="polite">Loading your workspace…</main>}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginExperience />} />
          <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route index element={<HomeExperience />} />
            <Route path="workout" element={<WorkoutExperience />} />
          <Route path="history" element={<HistoryExperience />} />
            <Route path="progress" element={<ProgressExperience />} />
            <Route path="nutrition" element={<NutritionExperience />} />
            <Route path="analytics" element={<Navigate to="/progress" replace />} />
          <Route path="bodyweight" element={<BodyMetricsExperience />} />
          <Route path="import" element={<ImportExperience />} />
          <Route path="ai-coach" element={<CoachExperience />} />
            <Route path="community" element={<AthleteSpaceExperience />} />
          <Route path="profile" element={<ProfileExperience />} />
          <Route path="settings" element={<ProfileExperience />} />
          </Route>
          <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;

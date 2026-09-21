import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import MainLayout from './components/MainLayout';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const WorkoutActive = lazy(() => import('./pages/WorkoutActive'));
const History = lazy(() => import('./pages/History'));
const Bodyweight = lazy(() => import('./pages/Bodyweight'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Profile = lazy(() => import('./pages/Profile'));
const ImportWorkout = lazy(() => import('./pages/ImportWorkout'));
const AICoach = lazy(() => import('./pages/AICoach'));
const Community = lazy(() => import('./pages/Community'));

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
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="workout" element={<WorkoutActive />} />
            <Route path="history" element={<History />} />
            <Route path="bodyweight" element={<Bodyweight />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="import" element={<ImportWorkout />} />
            <Route path="ai-coach" element={<AICoach />} />
            <Route path="community" element={<Community />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;

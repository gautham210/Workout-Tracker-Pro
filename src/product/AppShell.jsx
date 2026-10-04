import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Apple, ChevronLeft, Dumbbell, Home, Sparkles, TrendingUp, User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NetworkToast from '../components/NetworkToast';
import Dock from './react-bits/Dock';
import GlassSurface from './react-bits/GlassSurface';
import ProductLogo from './ProductLogo';
import { syncPendingWorkouts } from './workoutSync';

const primary = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/workout', label: 'Train', icon: Dumbbell },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
  { to: '/nutrition', label: 'Nutrition', icon: Apple },
  { to: '/ai-coach', label: 'Coach', icon: Sparkles },
  { to: '/profile', label: 'Profile', icon: User },
];

// Secondary routes belong to a primary tab: the dock highlights the parent and
// the Back affordance returns to it.
const SECTION_PARENT = {
  '/history': '/workout', '/library': '/workout', '/import': '/workout',
  '/bodyweight': '/progress', '/insights': '/progress',
  '/community': '/profile', '/settings': '/profile',
  '/nutritionist': '/nutrition',
};
const PARENT_LABEL = { '/workout': 'Train', '/progress': 'Progress', '/profile': 'Profile', '/nutrition': 'Nutrition' };

const sectionOf = (pathname) => {
  const top = '/' + (pathname.split('/')[1] || '');
  return SECTION_PARENT[top] || top;
};

function BackLink() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const parent = SECTION_PARENT['/' + (pathname.split('/')[1] || '')];
  if (!parent) return null;
  return (
    <button type="button" className="product-back" onClick={() => navigate(parent)} aria-label={`Back to ${PARENT_LABEL[parent]}`}>
      <ChevronLeft size={18} strokeWidth={2.3} aria-hidden="true" />
      <span>{PARENT_LABEL[parent]}</span>
    </button>
  );
}

export default function AppShell() {
  const { user, profile, networkError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const section = sectionOf(location.pathname);
  const userId = user?.id;

  // Finished workouts that could not reach the server are retried on load and on reconnect.
  useEffect(() => {
    if (!userId) return undefined;
    const run = () => { syncPendingWorkouts(userId).catch(() => {}); };
    run();
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [userId]);

  const dockItems = primary.map(({ to, label, icon: Icon }) => {
    const active = section === to;
    return {
      label,
      active,
      className: active ? 'is-active' : '',
      onClick: () => navigate(to),
      icon: <span className="product-dock-icon"><Icon size={19} strokeWidth={2.15} /><small>{label}</small></span>,
    };
  });

  return (
    <div className="product-app-shell">
      <div className="product-ambient" aria-hidden="true" />
      <header className="product-topbar">
        <GlassSurface width="100%" height={52} borderRadius={19} backgroundOpacity={0.16} saturation={1.45} className="product-topbar-glass">
          <NavLink to="/" className="product-wordmark" aria-label="Workout Tracker Pro home">
            <span className="product-mark"><ProductLogo size={31} /></span>
            <span>WORKOUT TRACKER PRO</span>
          </NavLink>
          <NavLink className="profile-orb" to="/profile" aria-label="Open your profile">
            {profile?.name?.trim()?.slice(0, 1).toUpperCase() || <User size={18} />}
          </NavLink>
        </GlassSurface>
      </header>

      <main className="product-main"><BackLink /><Outlet /></main>

      <nav className="product-react-bits-dock" aria-label="Primary navigation">
        <Dock items={dockItems} panelHeight={68} dockHeight={68} baseItemSize={46} magnification={52} distance={96} />
      </nav>
      <NetworkToast supabaseError={networkError} />
    </div>
  );
}

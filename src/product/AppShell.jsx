import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Apple, BarChart3, Dumbbell, History, Home, Lightbulb, Settings2, Sparkles, TrendingUp, Upload, User, Weight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NetworkToast from '../components/NetworkToast';
import Dock from './react-bits/Dock';
import GlassSurface from './react-bits/GlassSurface';

const primary = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/workout', label: 'Train', icon: Dumbbell },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
  { to: '/nutrition', label: 'Nutrition', icon: Apple },
  { to: '/ai-coach', label: 'Coach', icon: Sparkles },
  { to: '/profile', label: 'Profile', icon: User },
];

const explore = [
  { to: '/history', label: 'History', icon: History },
  { to: '/insights', label: 'Insights', icon: Lightbulb },
  { to: '/library', label: 'Library', icon: Dumbbell },
  { to: '/import', label: 'Import', icon: Upload },
  { to: '/bodyweight', label: 'Metrics', icon: Weight },
  { to: '/community', label: 'Athlete', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings2 },
];

function ProductExplorer() {
  const location = useLocation();
  return <nav className="product-explorer" aria-label="All product areas">
    <span className="product-explorer-label">Explore</span>
    <div>
      {explore.map(({ to, label, icon: Icon }) => <Link key={to} to={to} className={location.pathname === to ? 'is-current' : ''}><Icon size={13} /><span>{label}</span></Link>)}
    </div>
  </nav>;
}

export default function AppShell() {
  const { profile, networkError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const dockItems = primary.map(({ to, label, icon: Icon, end }) => ({
    label,
    className: (end ? location.pathname === to : location.pathname.startsWith(to)) ? 'is-active' : '',
    onClick: () => navigate(to),
    icon: <span className="product-dock-icon"><Icon size={19} strokeWidth={2.15} /><small>{label}</small></span>,
  }));

  return (
    <div className="product-app-shell">
      <div className="product-ambient" aria-hidden="true" />
      <header className="product-topbar">
        <GlassSurface width="100%" height={52} borderRadius={19} backgroundOpacity={0.16} saturation={1.45} className="product-topbar-glass">
          <NavLink to="/" className="product-wordmark" aria-label="Workout Tracker home">
            <span className="product-mark"><Dumbbell size={18} /></span>
            <span>WORKOUT</span>
          </NavLink>
          <NavLink className="profile-orb" to="/profile" aria-label="Open your profile">
            {profile?.name?.trim()?.slice(0, 1).toUpperCase() || <User size={18} />}
          </NavLink>
        </GlassSurface>
      </header>

      <ProductExplorer />

      <main className="product-main"><Outlet /></main>

      <nav className="product-react-bits-dock" aria-label="Primary navigation">
        <Dock items={dockItems} panelHeight={68} dockHeight={68} baseItemSize={46} magnification={52} distance={96} />
      </nav>
      <NetworkToast supabaseError={networkError} />
    </div>
  );
}

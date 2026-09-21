import { memo } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  Activity, BrainCircuit, Dumbbell, History as HistoryIcon, Home, Sparkles,
  Upload, User, Users, Weight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NetworkToast from './NetworkToast';

const primaryItems = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/workout', label: 'Train', icon: Dumbbell },
  { to: '/history', label: 'History', icon: HistoryIcon },
  { to: '/analytics', label: 'Progress', icon: Activity },
];

const studioItems = [
  { to: '/ai-coach', label: 'AI Coach', icon: Sparkles },
  { to: '/import', label: 'Workout import', icon: Upload },
  { to: '/bodyweight', label: 'Body metrics', icon: Weight },
  { to: '/community', label: 'Athlete space', icon: Users },
  { to: '/profile', label: 'Profile & settings', icon: User },
];

function NavigationLink({ item, compact = false }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
      <Icon aria-hidden="true" size={compact ? 20 : 19} strokeWidth={2.2} />
      <span>{item.label}</span>
    </NavLink>
  );
}

const MainLayout = () => {
  const { networkError } = useAuth();

  return (
    <div className="app-layout">
      <div className="particles-layer" aria-hidden="true" />
      <aside className="desktop-sidebar" aria-label="Primary navigation">
        <div className="brand-lockup">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div className="brand-mark"><Dumbbell size={20} strokeWidth={2.5} /></div>
            <div>
              <p className="brand-title">Workout Tracker</p>
              <span className="brand-kicker">Train with intent</span>
            </div>
          </div>
        </div>
        <div className="nav-group">
          {primaryItems.map((item) => <NavigationLink item={item} key={item.to} />)}
        </div>
        <div className="nav-section-label">Your studio</div>
        <div className="nav-group">
          {studioItems.map((item) => <NavigationLink item={item} key={item.to} />)}
        </div>
        <div style={{ marginTop: 'auto', padding: '18px 12px 4px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 650, lineHeight: 1.45 }}>
          <BrainCircuit size={15} style={{ verticalAlign: 'middle', marginRight: 7, color: 'var(--accent-color)' }} />
          Your data stays yours.
        </div>
      </aside>

      <main className="main-content-wrapper"><Outlet /></main>

      <nav className="mobile-bottom-nav" aria-label="Primary navigation">
        {primaryItems.map((item) => <NavigationLink item={item} compact key={item.to} />)}
        <NavigationLink item={{ to: '/profile', label: 'Profile', icon: User }} compact />
      </nav>
      <NetworkToast supabaseError={networkError} />
    </div>
  );
};

export default memo(MainLayout);

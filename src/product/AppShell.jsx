import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Dumbbell, Home, Menu, Sparkles, TrendingUp, User,
  X, History, Apple, Import, Scale, Users, Settings2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NetworkToast from '../components/NetworkToast';

const primary = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/workout', label: 'Train', icon: Dumbbell },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
  { to: '/ai-coach', label: 'Coach', icon: Sparkles },
];

const moreItems = [
  { to: '/history', label: 'Workout history', detail: 'Every completed session', icon: History },
  { to: '/nutrition', label: 'Nutrition', detail: 'AI meal analysis', icon: Apple },
  { to: '/import', label: 'Import workout', detail: 'Turn a log into a session', icon: Import },
  { to: '/bodyweight', label: 'Body metrics', detail: 'Weight and trend data', icon: Scale },
  { to: '/community', label: 'Athlete space', detail: 'Private by default', icon: Users },
  { to: '/settings', label: 'Settings', detail: 'Training rhythm and account', icon: Settings2 },
];

function Tab({ item }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => `product-tab ${isActive ? 'is-active' : ''}`}>
      <Icon size={20} strokeWidth={2.25} />
      <span>{item.label}</span>
    </NavLink>
  );
}

export default function AppShell() {
  const { profile, networkError } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const close = (event) => { if (event.key === 'Escape') setMoreOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [moreOpen]);

  return (
    <div className="product-app-shell">
      <div className="product-ambient" aria-hidden="true" />
      <header className="product-topbar">
        <NavLink to="/" className="product-wordmark" aria-label="Workout Tracker home">
          <span className="product-mark"><Dumbbell size={18} /></span>
          <span>WORKOUT</span>
        </NavLink>
        <button className="profile-orb" type="button" onClick={() => setMoreOpen(true)} aria-label="Open product menu">
          {profile?.name?.trim()?.slice(0, 1).toUpperCase() || <User size={18} />}
        </button>
      </header>

      <main className="product-main"><Outlet /></main>

      <nav className="product-nav" aria-label="Primary navigation">
        {primary.map((item) => <Tab item={item} key={item.to} />)}
        <button className={`product-tab ${moreOpen ? 'is-active' : ''}`} type="button" onClick={() => setMoreOpen(true)}>
          <Menu size={20} strokeWidth={2.25} />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={() => setMoreOpen(false)}>
          <section className="more-sheet" role="dialog" aria-modal="true" aria-label="More product areas" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">Your training space</p>
                <h2>More ways to move.</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setMoreOpen(false)} aria-label="Close menu"><X size={20} /></button>
            </div>
            <div className="more-grid">
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink to={item.to} key={item.to} className="more-link" onClick={() => setMoreOpen(false)}>
                    <span className="more-icon"><Icon size={19} /></span>
                    <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                  </NavLink>
                );
              })}
            </div>
          </section>
        </div>
      )}
      <NetworkToast supabaseError={networkError} />
    </div>
  );
}

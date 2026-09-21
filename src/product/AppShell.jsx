import { NavLink, Outlet } from 'react-router-dom';
import {
  Dumbbell, Home, Sparkles, TrendingUp, User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NetworkToast from '../components/NetworkToast';

const primary = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/workout', label: 'Train', icon: Dumbbell },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
  { to: '/ai-coach', label: 'Coach', icon: Sparkles },
  { to: '/profile', label: 'Profile', icon: User },
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

  return (
    <div className="product-app-shell">
      <div className="product-ambient" aria-hidden="true" />
      <header className="product-topbar">
        <NavLink to="/" className="product-wordmark" aria-label="Workout Tracker home">
          <span className="product-mark"><Dumbbell size={18} /></span>
          <span>WORKOUT</span>
        </NavLink>
        <NavLink className="profile-orb" to="/profile" aria-label="Open your profile">
          {profile?.name?.trim()?.slice(0, 1).toUpperCase() || <User size={18} />}
        </NavLink>
      </header>

      <main className="product-main"><Outlet /></main>

      <nav className="product-nav" aria-label="Primary navigation">
        {primary.map((item) => <Tab item={item} key={item.to} />)}
      </nav>
      <NetworkToast supabaseError={networkError} />
    </div>
  );
}

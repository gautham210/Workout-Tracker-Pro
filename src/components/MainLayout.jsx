import { Outlet, NavLink } from 'react-router-dom';
import { Home, Dumbbell, History as HistoryIcon, Activity, User, PieChart } from 'lucide-react';

const MainLayout = () => {
  return (
    <div className="app-layout">
      <div className="particles-layer"></div>
      <nav className="desktop-sidebar glass" style={{ borderRadius: 0, borderTop: 'none', borderBottom: 'none', borderLeft: 'none' }}>
        <div style={{ padding: '0 16px', marginBottom: '40px', marginTop: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0, background: 'linear-gradient(135deg, #2563eb, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Workout Tracker Pro</h2>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Training Intelligence</span>
          </div>
        </div>
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
          <Home size={22} />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/workout" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Dumbbell size={22} />
          <span>Workout</span>
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <HistoryIcon size={22} />
          <span>History</span>
        </NavLink>
        <NavLink to="/bodyweight" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Activity size={22} />
          <span>Bodyweight</span>
        </NavLink>
        <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <PieChart size={22} />
          <span>Intelligence</span>
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <User size={22} />
          <span>Identity</span>
        </NavLink>
      </nav>

      <div className="main-content-wrapper">
        <Outlet />
      </div>
      
      <nav className="mobile-bottom-nav" style={{ background: 'rgba(10, 14, 20, 0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.08)', borderRadius: 0, borderBottom: 'none', borderLeft: 'none', borderRight: 'none' }}>
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
          <Home size={24} />
          <span>Home</span>
        </NavLink>
        <NavLink to="/workout" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Dumbbell size={24} />
          <span>Workout</span>
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <HistoryIcon size={24} />
          <span>History</span>
        </NavLink>
        <NavLink to="/bodyweight" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Activity size={24} />
          <span>Weight</span>
        </NavLink>
        <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <PieChart size={24} />
          <span>Intel</span>
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <User size={24} />
          <span>Identity</span>
        </NavLink>
      </nav>
    </div>
  );
};

export default MainLayout;

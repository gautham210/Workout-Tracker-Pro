import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, ChevronRight, LockKeyhole, Sparkles, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function Community() {
  const { user, profile } = useAuth();
  const [sessionCount, setSessionCount] = useState(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase
      .from('workout_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_finished', true)
      .then(({ count }) => { if (active) setSessionCount(count ?? 0); });
    return () => { active = false; };
  }, [user]);

  return (
    <div className="page-enter community-page">
      <header className="community-hero">
        <div className="community-icon"><Users size={22} /></div>
        <div>
          <p className="subtitle" style={{ marginBottom: 8 }}>Athlete space</p>
          <h1 className="title" style={{ margin: 0 }}>Train together, honestly.</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '12px 0 0', lineHeight: 1.55, maxWidth: 560 }}>
            Your training identity is private by default. Community features will only use data you choose to share.
          </p>
        </div>
      </header>

      <section className="community-identity glass card">
        <div>
          <p className="subtitle" style={{ marginBottom: 8 }}>Your identity</p>
          <strong>{profile?.name?.trim() || user?.email?.split('@')[0] || 'Athlete'}</strong>
          <span>{sessionCount === null ? 'Loading completed sessions…' : `${sessionCount} completed ${sessionCount === 1 ? 'session' : 'sessions'}`}</span>
        </div>
        <Link className="btn btn-secondary" to="/profile">Edit profile <ChevronRight size={16} /></Link>
      </section>

      <section className="community-grid">
        <div className="glass card community-state">
          <Award size={22} color="var(--accent-color)" />
          <h2>Records stay personal</h2>
          <p>Your real strength, volume, and training patterns are available in Progress—without inventing rankings.</p>
          <Link to="/analytics">Open Progress <ChevronRight size={16} /></Link>
        </div>
        <div className="glass card community-state">
          <LockKeyhole size={22} color="var(--success-color)" />
          <h2>Privacy first</h2>
          <p>No follower graph, leaderboard, or public athlete data exists in the current production model. Nothing is shared from this screen.</p>
        </div>
        <div className="glass card community-state">
          <Sparkles size={22} color="var(--warning-color)" />
          <h2>Rank & achievements</h2>
          <p>Coming soon. These need a consent-aware social data model before they can be real; this app will not simulate them with placeholder scores.</p>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { ChevronRight, LockKeyhole, Medal, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function AthleteSpaceExperience() {
  const { user, profile } = useAuth();
  const [sessionCount, setSessionCount] = useState(null);
  useEffect(() => {
    let live = true;
    if (!user?.id) return undefined;
    supabase.from('workout_sessions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_finished', true)
      .then(({ count }) => { if (live) setSessionCount(count ?? 0); })
      .catch(() => { if (live) setSessionCount(null); });
    return () => { live = false; };
  }, [user?.id]);
  return <main className="experience athlete-space"><section className="space-hero"><div className="space-mark"><Users size={23} /></div><p className="eyebrow">Athlete space</p><h1>Training is personal.<br />Community is earned.</h1><p>Workout Tracker Pro keeps your records private by default. Sharing and competitive features need a consent-aware data model before they become real.</p></section><section className="athlete-identity"><span>{(profile?.name || user?.email || 'A').slice(0, 1).toUpperCase()}</span><div><p className="eyebrow">Your private identity</p><h2>{profile?.name || user?.email?.split('@')[0] || 'Athlete'}</h2><small>{sessionCount === null ? 'Loading completed sessions…' : `${sessionCount} completed ${sessionCount === 1 ? 'session' : 'sessions'}`}</small></div><Link to="/profile"><ChevronRight size={18} /></Link></section><section className="space-states"><article><Medal size={21} /><div><p className="eyebrow">Records</p><h2>Progress, without pretend rank.</h2><p>Your real volume and estimated strength are available in Progress. There is no fabricated leaderboard here.</p><Link to="/progress">Open progress <ChevronRight size={15} /></Link></div></article><article><LockKeyhole size={21} /><div><p className="eyebrow">Privacy</p><h2>Nothing is being shared.</h2><p>No public athlete profile, follower graph, or social feed is implemented in the production data model.</p></div></article></section></main>;
}

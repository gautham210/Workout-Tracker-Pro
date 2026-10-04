import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, LockKeyhole, Medal, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { computePersonalBests, computeStreak, sessionVolume, streakOptionsFromProfile } from './analytics';
import { fetchAllSessions, fetchTrainingDays } from './analyticsData';
import './dataExperiences.css';

const fmt = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value) || 0);

export default function AthleteSpaceExperience() {
  const { user, profile } = useAuth();
  const [data, setData] = useState({ sessions: null, days: [] });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    if (!user?.id) return undefined;
    Promise.all([fetchAllSessions(user.id), fetchTrainingDays(user.id, 400)])
      .then(([sessions, days]) => { if (live) setData({ sessions, days }); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [user?.id]);
  const { sessions, days } = data;
  const stats = useMemo(() => {
    if (!sessions) return null;
    const volume = sessions.reduce((total, session) => total + sessionVolume(session), 0);
    return { count: sessions.length, volume, streak: computeStreak(days.length ? days : sessions, streakOptionsFromProfile(profile)), best: computePersonalBests(sessions, 1)[0] || null };
  }, [sessions, days, profile]);
  const displayName = profile?.name?.trim() || user?.email?.split('@')[0] || 'Your profile';
  return <main className="experience athlete-space"><section className="space-hero"><div className="space-mark"><Users size={23} /></div><p className="eyebrow">Athlete space</p><h1>Training is personal.<br />Community is earned.</h1><p>Workout Tracker Pro keeps your records private by default. Sharing and competitive features need a consent-aware data model before they become real.</p></section>
    <section className="athlete-identity"><span>{displayName.slice(0, 1).toUpperCase()}</span><div><p className="eyebrow">Your private identity</p><h2>{displayName}</h2><small>{failed ? 'Your stats could not load right now.' : stats ? `${stats.count} completed ${stats.count === 1 ? 'session' : 'sessions'}` : 'Loading completed sessions…'}</small></div><Link to="/profile" aria-label="Open profile"><ChevronRight size={18} /></Link></section>
    {stats && <section className="athlete-stats space-stats" aria-label="Your own training stats"><div><strong>{stats.streak}</strong><span>day streak</span></div><div><strong>{fmt(stats.volume)}</strong><span>kg recorded</span></div><div><strong>{stats.best ? Math.round(stats.best.e1rm) : '—'}</strong><span>{stats.best ? `best e1RM · ${stats.best.name}` : 'best e1RM'}</span></div></section>}
    <section className="space-states"><article><Medal size={21} /><div><p className="eyebrow">Records</p><h2>Progress, without pretend rank.</h2><p>Your real volume and estimated strength are available in Progress. There is no fabricated leaderboard here.</p><Link to="/progress">Open progress <ChevronRight size={15} /></Link></div></article><article><LockKeyhole size={21} /><div><p className="eyebrow">Privacy</p><h2>Nothing is being shared.</h2><p>No public athlete profile, follower graph, or social feed is implemented in the production data model.</p></div></article></section></main>;
}

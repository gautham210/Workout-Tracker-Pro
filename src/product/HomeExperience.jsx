import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Flame, Play, Sparkles, Trophy, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ExerciseVisual from './ExerciseVisual';
import CountUp from './bits/CountUp';
import { computeStreak, getCompletedSessions, sessionVolume } from './trainingData';

function nextFocus(profile, sessions) {
  if (!sessions.length) return { title: 'Build your first session', caption: 'Choose movements that match today.', action: 'Start building' };
  const loop = profile?.custom_split || [];
  const last = sessions[0]?.split_day;
  if (loop.length) {
    const index = loop.findIndex((day) => day.toLowerCase() === String(last || '').toLowerCase());
    return { title: loop[(index + 1 + loop.length) % loop.length], caption: 'Next in your active split.', action: 'Start session' };
  }
  return { title: 'Continue your rhythm', caption: last ? `Your last completed focus was ${last}.` : 'Your next session is ready.', action: 'Build session' };
}

export default function HomeExperience() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!user?.id) return undefined;
    getCompletedSessions(user.id, 18)
      .then((data) => { if (alive) setSessions(data); })
      .catch(() => { if (alive) setError('Your training timeline could not be refreshed.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.id]);

  const snapshot = useMemo(() => {
    const recent = sessions.slice(0, 7);
    return {
      streak: computeStreak(sessions),
      sessions: sessions.length,
      volume: recent.reduce((total, session) => total + sessionVolume(session), 0),
      latest: sessions[0],
    };
  }, [sessions]);
  const focus = useMemo(() => nextFocus(profile, sessions), [profile, sessions]);
  const name = profile?.name?.trim()?.split(' ')[0] || user?.email?.split('@')[0] || 'Athlete';

  return (
    <div className="experience home-experience">
      <section className="home-intro">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1>Good to see you,<br />{name}.</h1>
        </div>
        <Link to="/ai-coach" className="coach-launch" aria-label="Open AI Coach"><Sparkles size={19} /></Link>
      </section>

      {error && <div className="inline-state is-error"><WifiOff size={17} /> {error}</div>}
      {loading ? <HomeSkeleton /> : (
        <>
          <section className="today-stage">
            <div className="stage-content">
              <p className="eyebrow">Today&apos;s training</p>
              <h2>{focus.title}</h2>
              <p>{focus.caption}</p>
              <button className="primary-action" type="button" onClick={() => navigate('/workout')}><Play size={17} fill="currentColor" /> {focus.action}</button>
            </div>
            <ExerciseVisual name={focus.title} muscle={focus.title} />
          </section>

          <section className="glance-strip" aria-label="Training summary">
            <div><Flame size={18} color="#ff8a00" /><strong><CountUp value={snapshot.streak} /></strong><span>day streak</span></div>
            <div><Trophy size={18} color="#007aff" /><strong><CountUp value={snapshot.sessions} /></strong><span>sessions</span></div>
            <div><ArrowUpRight size={18} color="#34c759" /><strong><CountUp value={Math.round(snapshot.volume)} /></strong><span>kg this week</span></div>
          </section>

          <section className="home-section">
            <div className="section-heading"><div><p className="eyebrow">Your path</p><h2>Recent training</h2></div><Link to="/history">See all</Link></div>
            {sessions.length ? (
              <div className="session-rail">
                {sessions.slice(0, 4).map((session) => (
                  <article className="session-mini" key={session.id}>
                    <div className="session-mini-head"><span>{new Date(session.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span>{Math.round(sessionVolume(session)).toLocaleString()} kg</span></div>
                    <h3>{session.split_day || 'Workout'}</h3>
                    <p>{session.session_exercises?.length || 0} movements · {session.duration_minutes || '—'} min</p>
                  </article>
                ))}
              </div>
            ) : <EmptyTraining />}
          </section>

          <section className="home-section home-coach-tease">
            <div><p className="eyebrow">Training intelligence</p><h2>Ask for a plan that uses your history.</h2><p>Coach receives your authenticated training context. No generic demo answers.</p></div>
            <Link to="/ai-coach" className="secondary-action">Talk to Coach <ArrowUpRight size={17} /></Link>
          </section>
        </>
      )}
    </div>
  );
}

function EmptyTraining() {
  return <div className="empty-state"><ExerciseVisual name="First workout" compact /><div><h3>Your story starts with one set.</h3><p>Build a session and your real trend, streak, and personal bests will appear here.</p></div><Link className="secondary-action" to="/workout">Build workout</Link></div>;
}

function HomeSkeleton() {
  return <div className="skeleton-stack" aria-label="Loading training data"><div className="skeleton hero" /><div className="skeleton short" /><div className="skeleton row" /></div>;
}

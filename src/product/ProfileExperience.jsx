import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, LogOut, Plus, Save, Settings2, Users, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { clearUserLocalCaches } from '../lib/api';
import { supabase } from '../lib/supabase';
import { computeStreak, getCompletedSessions, kg, sessionVolume } from './trainingData';

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ProfileExperience() {
  const { user, profile, refreshProfile } = useAuth();
  const location = useLocation();
  const settingsMode = location.pathname === '/settings';
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [split, setSplit] = useState([]);
  const [newDay, setNewDay] = useState('');
  const [restDays, setRestDays] = useState([]);
  const [includeRest, setIncludeRest] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [state, setState] = useState('loading');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!profile) return;
    queueMicrotask(() => {
      setName(profile.name || 'Athlete'); setTagline(profile.tagline || '');
      setSplit(Array.isArray(profile.custom_split) ? profile.custom_split : []);
      setRestDays(Array.isArray(profile.rest_days) ? profile.rest_days : []);
      setIncludeRest(Boolean(profile.include_rest_days));
    });
  }, [profile]);
  useEffect(() => { let live = true; getCompletedSessions(user?.id, 100).then((data) => { if (live) { setSessions(data); setState('ready'); } }).catch(() => { if (live) setState('error'); }); return () => { live = false; }; }, [user?.id]);
  const totalVolume = useMemo(() => sessions.reduce((sum, session) => sum + sessionVolume(session), 0), [sessions]);
  const save = async () => {
    if (!user?.id || saving) return;
    setSaving(true); setFeedback('');
    const { error } = await supabase.from('profiles').update({ name: name.trim(), tagline: tagline.trim(), custom_split: split.length ? split : null, rest_days: restDays, include_rest_days: includeRest }).eq('id', user.id);
    setSaving(false);
    if (error) { setFeedback(error.message || 'Profile could not be saved.'); return; }
    await refreshProfile(); setFeedback('Saved.');
  };
  const logout = async () => { if (user?.id) clearUserLocalCaches(user.id); await supabase.auth.signOut(); };
  const addDay = () => { const day = newDay.trim(); if (day && !split.includes(day) && split.length < 7) { setSplit((current) => [...current, day]); setNewDay(''); } };
  return <main className="experience profile-experience">{settingsMode ? <SettingsPanel {...{ split, setSplit, newDay, setNewDay, addDay, restDays, setRestDays, includeRest, setIncludeRest, save, saving, feedback, logout }} /> : <><section className="athlete-hero"><div className="athlete-avatar">{(name || 'A').slice(0, 1).toUpperCase()}</div><div><p className="eyebrow">Athlete profile</p><h1>{name || 'Athlete'}</h1><p>{tagline || 'Make your training count.'}</p></div><Link className="icon-button" to="/settings" aria-label="Open settings"><Settings2 size={18} /></Link></section><section className="athlete-stats">{state === 'loading' ? <><span /><span /><span /></> : <><div><strong>{sessions.length}</strong><span>sessions</span></div><div><strong>{computeStreak(sessions)}</strong><span>training streak</span></div><div><strong>{kg(totalVolume)}</strong><span>kg recorded</span></div></>}</section><section className="profile-section"><div className="section-heading"><div><p className="eyebrow">Identity</p><h2>Make it yours</h2></div></div><label className="profile-field">Display name<input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label><label className="profile-field">Training note<input maxLength={140} value={tagline} onChange={(event) => setTagline(event.target.value)} placeholder="A short training focus" /></label><button className="primary-action profile-save" type="button" disabled={saving} onClick={save}>{saving ? 'Saving…' : <><Save size={16} /> Save profile</>}</button>{feedback && <p className={feedback === 'Saved.' ? 'profile-feedback success' : 'profile-feedback'}>{feedback}</p>}</section><Link to="/community" className="profile-link athlete-space-link"><Users size={18} /><span><strong>Athlete space</strong><small>Your private training identity</small></span><ChevronRight size={18} /></Link><Link to="/settings" className="profile-link"><Settings2 size={18} /><span><strong>Training & account settings</strong><small>Split, rest days, and sign out</small></span><ChevronRight size={18} /></Link><section className="honest-gamification"><p className="eyebrow">Milestones</p><h2>Earned through real sessions.</h2><p>Achievement and social ranking are intentionally unavailable until there is verified account data to support them.</p></section></>}</main>;
}

function SettingsPanel({ split, setSplit, newDay, setNewDay, addDay, restDays, setRestDays, includeRest, setIncludeRest, save, saving, feedback, logout }) {
  return <><section className="settings-hero"><Link to="/profile" className="text-action">Profile</Link><p className="eyebrow">Settings</p><h1>Shape your<br />training rhythm.</h1><p>These preferences affect only your account and are saved through your authenticated profile.</p></section><section className="settings-section"><div className="section-heading"><div><p className="eyebrow">Training split</p><h2>Your rotation</h2></div></div><div className="split-chips">{split.length ? split.map((day) => <span key={day}>{day}<button type="button" aria-label={`Remove ${day}`} onClick={() => setSplit((current) => current.filter((value) => value !== day))}><X size={13} /></button></span>) : <p className="quiet-state">No custom days yet. You can still build a workout anytime.</p>}</div><div className="split-add"><input value={newDay} onChange={(event) => setNewDay(event.target.value)} maxLength={40} placeholder="e.g. Upper body" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addDay(); } }} /><button type="button" onClick={addDay} disabled={!newDay.trim() || split.length >= 7}><Plus size={16} /></button></div></section><section className="settings-section"><div className="section-heading"><div><p className="eyebrow">Rest</p><h2>Streak rules</h2></div></div><button type="button" className={`settings-switch ${includeRest ? 'is-on' : ''}`} onClick={() => setIncludeRest((value) => !value)}><span>Include planned rest days</span><i /></button><p className="settings-note">When enabled, your selected rest days will not interrupt your training streak.</p><div className="rest-days">{dayNames.map((day) => <button type="button" key={day} className={restDays.includes(day) ? 'is-selected' : ''} onClick={() => setRestDays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day])}>{day.slice(0, 3)}</button>)}</div></section><button className="primary-action settings-save" type="button" disabled={saving} onClick={save}>{saving ? 'Saving…' : <><Check size={16} /> Save settings</>}</button>{feedback && <p className={feedback === 'Saved.' ? 'profile-feedback success' : 'profile-feedback'}>{feedback}</p>}<section className="settings-section danger-zone"><p className="eyebrow">Account</p><h2>Sign out on this device</h2><p>Account-bound drafts and AI caches are cleared before the next person can use this browser.</p><button type="button" onClick={logout}><LogOut size={16} /> Sign out</button></section></>;
}

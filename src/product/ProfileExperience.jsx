import { useEffect, useMemo, useRef, useState } from 'react';
import { Apple, Check, ChevronRight, LogOut, Plus, Save, Scale, Settings2, Users, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { clearUserLocalCaches } from '../lib/api';
import { supabase } from '../lib/supabase';
import { computeStreak, dayNames, sessionVolume } from './analytics';
import { fetchAllSessions, fetchTrainingDays } from './analyticsData';
import './dataExperiences.css';

const kg = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value) || 0);

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
  const [dayRows, setDayRows] = useState([]);
  const [state, setState] = useState('loading');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Initialise the form once per profile id, and only while pristine, so a
  // background profile refresh never overwrites what the user is typing.
  const seeded = useRef({ id: null, dirty: false });
  const markDirty = () => { seeded.current.dirty = true; setFeedback(''); };
  useEffect(() => {
    if (!profile?.id || (seeded.current.id === profile.id && seeded.current.dirty)) return;
    seeded.current.id = profile.id;
    queueMicrotask(() => {
      setName(profile.name || ''); setTagline(profile.tagline || '');
      setSplit(Array.isArray(profile.custom_split) ? profile.custom_split : []);
      setRestDays(Array.isArray(profile.rest_days) ? profile.rest_days : []);
      setIncludeRest(Boolean(profile.include_rest_days));
    });
  }, [profile]);
  useEffect(() => {
    let live = true;
    if (!user?.id) return undefined;
    Promise.all([fetchAllSessions(user.id), fetchTrainingDays(user.id, 400)]).then(([data, days]) => { if (live) { setSessions(data); setDayRows(days); setState('ready'); } }).catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [user?.id]);
  const streak = useMemo(() => computeStreak(dayRows.length ? dayRows : sessions, { restDays, includeRestDays: includeRest }), [dayRows, sessions, restDays, includeRest]);
  const displayName = name.trim() || profile?.name?.trim() || user?.email?.split('@')[0] || 'Your profile';
  const totalVolume = useMemo(() => sessions.reduce((sum, session) => sum + sessionVolume(session), 0), [sessions]);
  const save = async () => {
    if (!user?.id || saving) return;
    setSaving(true); setFeedback('');
    const update = { tagline: tagline.trim(), custom_split: split.length ? split : null, rest_days: restDays, include_rest_days: includeRest };
    if (name.trim()) update.name = name.trim();
    const { data, error } = await supabase.from('profiles').update(update).eq('id', user.id).select().single();
    setSaving(false);
    if (error || !data || data.id !== user.id) {
      // PGRST116 means the update matched zero rows: nothing was stored.
      setFeedback(error?.code === 'PGRST116' || !data ? 'Nothing was saved: your profile row could not be found or updated. Sign out and back in, then try again.' : error.message || 'Profile could not be saved.');
      return;
    }
    seeded.current.dirty = false;
    await refreshProfile(); setFeedback('Saved.');
  };
  const logout = async () => { if (user?.id) clearUserLocalCaches(user.id); await supabase.auth.signOut(); };
  const addDay = () => { const day = newDay.trim(); if (day && !split.includes(day) && split.length < 7) { markDirty(); setSplit((current) => [...current, day]); setNewDay(''); } };
  return <main className="experience profile-experience">{settingsMode ? <SettingsPanel {...{ split, setSplit, newDay, setNewDay, addDay, restDays, setRestDays, includeRest, setIncludeRest, save, saving, feedback, logout, markDirty }} /> : <><section className="athlete-hero"><div className="athlete-avatar">{displayName.slice(0, 1).toUpperCase()}</div><div><p className="eyebrow">Athlete profile</p><h1>{displayName}</h1><p>{tagline || 'Make your training count.'}</p></div><Link className="icon-button" to="/settings" aria-label="Open settings"><Settings2 size={18} /></Link></section><section className="athlete-stats">{state === 'loading' ? <><span /><span /><span /></> : <><div><strong>{sessions.length}</strong><span>sessions</span></div><div><strong>{streak}</strong><span>day streak</span></div><div><strong>{kg(totalVolume)}</strong><span>kg recorded</span></div></>}</section><section className="profile-section"><div className="section-heading"><div><p className="eyebrow">Identity</p><h2>Make it yours</h2></div></div><label className="profile-field">Display name<input maxLength={80} value={name} onChange={(event) => { markDirty(); setName(event.target.value); }} placeholder="Your name" /></label><label className="profile-field">Training note<input maxLength={140} value={tagline} onChange={(event) => { markDirty(); setTagline(event.target.value); }} placeholder="A short training focus" /></label><button className="primary-action profile-save" type="button" disabled={saving} onClick={save}>{saving ? 'Saving…' : <><Save size={16} /> Save profile</>}</button>{feedback && <p className={feedback === 'Saved.' ? 'profile-feedback success' : 'profile-feedback'}>{feedback}</p>}</section><Link to="/bodyweight" className="profile-link"><Scale size={18} /><span><strong>Body metrics & targets</strong><small>Measurements, estimates, and nutrition targets</small></span><ChevronRight size={18} /></Link><Link to="/nutrition" className="profile-link"><Apple size={18} /><span><strong>Nutrition journal</strong><small>Meals, daily macros, and AI Nutritionist</small></span><ChevronRight size={18} /></Link><Link to="/community" className="profile-link athlete-space-link"><Users size={18} /><span><strong>Athlete space</strong><small>Your private training identity</small></span><ChevronRight size={18} /></Link><Link to="/settings" className="profile-link"><Settings2 size={18} /><span><strong>Training & account settings</strong><small>Split, rest days, and sign out</small></span><ChevronRight size={18} /></Link><section className="honest-gamification"><p className="eyebrow">Milestones</p><h2>Earned through real sessions.</h2><p>Achievement and social ranking are intentionally unavailable until there is verified account data to support them.</p></section></>}</main>;
}

function SettingsPanel({ split, setSplit, newDay, setNewDay, addDay, restDays, setRestDays, includeRest, setIncludeRest, save, saving, feedback, logout, markDirty }) {
  return <><section className="settings-hero"><Link to="/profile" className="text-action">Profile</Link><p className="eyebrow">Settings</p><h1>Shape your<br />training rhythm.</h1><p>These preferences affect only your account and are saved through your authenticated profile.</p></section><section className="settings-section"><div className="section-heading"><div><p className="eyebrow">Training split</p><h2>Your rotation</h2></div></div><div className="split-chips">{split.length ? split.map((day) => <span key={day}>{day}<button type="button" aria-label={`Remove ${day}`} onClick={() => { markDirty(); setSplit((current) => current.filter((value) => value !== day)); }}><X size={13} /></button></span>) : <p className="quiet-state">No custom days yet. You can still build a workout anytime.</p>}</div><div className="split-add"><input value={newDay} onChange={(event) => setNewDay(event.target.value)} maxLength={40} placeholder="e.g. Upper body" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addDay(); } }} /><button type="button" onClick={addDay} disabled={!newDay.trim() || split.length >= 7}><Plus size={16} /></button></div></section><section className="settings-section"><div className="section-heading"><div><p className="eyebrow">Rest</p><h2>Streak rules</h2></div></div><button type="button" className={`settings-switch ${includeRest ? 'is-on' : ''}`} onClick={() => { markDirty(); setIncludeRest((value) => !value); }}><span>Include planned rest days</span><i /></button><p className="settings-note">When enabled, a selected rest day with no workout will not break your streak. It does not add a day to the count, and any other missed day still ends it. {includeRest && !restDays.length ? 'Pick at least one rest day below for this to have an effect.' : ''}</p><div className="rest-days">{dayNames.map((day) => <button type="button" key={day} className={restDays.includes(day) ? 'is-selected' : ''} onClick={() => { markDirty(); setRestDays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day]); }}>{day.slice(0, 3)}</button>)}</div></section><button className="primary-action settings-save" type="button" disabled={saving} onClick={save}>{saving ? 'Saving…' : <><Check size={16} /> Save settings</>}</button>{feedback && <p className={feedback === 'Saved.' ? 'profile-feedback success' : 'profile-feedback'}>{feedback}</p>}<section className="settings-section danger-zone"><p className="eyebrow">Account</p><h2>Sign out on this device</h2><p>Account-bound drafts and AI caches are cleared before the next person can use this browser.</p><button type="button" onClick={logout}><LogOut size={16} /> Sign out</button></section></>;
}

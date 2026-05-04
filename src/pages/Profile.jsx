import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  LogOut, Calendar as CalIcon, Activity, Check, Save,
  HardDrive, AlertCircle, Plus, X, Repeat, ChevronRight,
} from 'lucide-react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_CUSTOM_DAYS = 7;

export default function Profile() {
  const { user, profile: globalProfile, refreshProfile } = useAuth();

  // ─── Form state ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: '', tagline: '', height_cm: '', age: '', gender: '',
    include_rest_days: false, rest_days: ['Sunday'],
  });

  // ─── Custom split state ────────────────────────────────────────────────────
  const [customSplit,    setCustomSplit]    = useState([]);   // string[]
  const [newDayName,     setNewDayName]     = useState('');
  const [customDirty,    setCustomDirty]    = useState(false);

  // ─── Active loop state ─────────────────────────────────────────────────────
  const [activeLoop,     setActiveLoop]     = useState(null); // null | { days:[{name,exercises}], length, start_date }
  const [loopSaving,     setLoopSaving]     = useState(false);
  const [loopGenMsg,     setLoopGenMsg]     = useState(null); // feedback after generation

  // ─── UI state ──────────────────────────────────────────────────────────────
  const [stats,       setStats]       = useState({ attendance30: 0, totalSessions: 0, firstDate: null, latestWeight: 0 });
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError,   setSaveError]   = useState(null);

  const initializedRef = useRef(false);

  // ─── Init from globalProfile (once) ───────────────────────────────────────
  useEffect(() => {
    if (!globalProfile || initializedRef.current) return;
    initializedRef.current = true;

    setForm({
      name:              globalProfile.name              ?? '',
      tagline:           globalProfile.tagline           ?? '',
      height_cm:         globalProfile.height_cm         ?? '',
      age:               globalProfile.age               ?? '',
      gender:            globalProfile.gender            ?? '',
      include_rest_days: globalProfile.include_rest_days ?? false,
      rest_days:         globalProfile.rest_days         ?? ['Sunday'],
    });
    setCustomSplit(globalProfile.custom_split ?? []);
    setActiveLoop(globalProfile.active_loop   ?? null);
  }, [globalProfile]);

  // ─── Stats fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !globalProfile) return;
    const load = async () => {
      const [{ data: sessions }, { data: logs }] = await Promise.all([
        supabase.from('workout_sessions').select('date').eq('user_id', user.id).order('date', { ascending: false }),
        supabase.from('bodyweight_logs').select('weight_kg').eq('user_id', user.id).order('date', { ascending: false }).limit(1),
      ]);
      let att30 = 0, total = 0, firstDate = null;
      if (sessions?.length) {
        total     = sessions.length;
        firstDate = new Date(sessions[sessions.length - 1].date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        const ago = new Date(); ago.setDate(ago.getDate() - 30); ago.setHours(0,0,0,0);
        att30 = sessions.filter(s => new Date(s.date) >= ago).length;
      }
      setStats({ attendance30: att30, totalSessions: total, firstDate, latestWeight: logs?.[0]?.weight_kg ?? 0 });
      setLoading(false);
    };
    load();
  }, [user, globalProfile]);

  // ─── Handlers: form ───────────────────────────────────────────────────────
  const handleChange = (field, value) => setForm(p => ({ ...p, [field]: value }));

  const handleRestDayToggle = (day) =>
    setForm(p => ({
      ...p,
      rest_days: p.rest_days.includes(day) ? p.rest_days.filter(d => d !== day) : [...p.rest_days, day],
    }));

  const handleSave = async () => {
    if (!user) return;
    setSaving(true); setSaveSuccess(false); setSaveError(null);

    const payload = {
      name: form.name.trim(), tagline: form.tagline.trim(),
      height_cm: form.height_cm !== '' ? parseFloat(form.height_cm) : null,
      age:       form.age       !== '' ? parseInt(form.age, 10)     : null,
      gender: form.gender, include_rest_days: form.include_rest_days, rest_days: form.rest_days,
      // always persist current custom_split and active_loop too
      custom_split: customSplit.length > 0 ? customSplit : null,
      active_loop:  activeLoop,
    };

    console.log('[PROFILE SAVE]', payload);
    const { data, error } = await supabase.from('profiles').update(payload).eq('id', user.id).select().single();
    console.log('[PROFILE SAVE result]', { data, error: error?.message });

    if (error) { setSaveError(`Failed: ${error.message}`); setSaving(false); return; }
    await refreshProfile();
    setCustomDirty(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
    setSaving(false);
  };

  // ─── Handlers: custom split ────────────────────────────────────────────────
  const addCustomDay = () => {
    const name = newDayName.trim();
    if (!name || customSplit.length >= MAX_CUSTOM_DAYS) return;
    setCustomSplit(p => [...p, name]);
    setNewDayName('');
    setCustomDirty(true);
  };

  const removeCustomDay = (idx) => {
    setCustomSplit(p => p.filter((_, i) => i !== idx));
    setCustomDirty(true);
  };

  const renameCustomDay = (idx, value) => {
    setCustomSplit(p => p.map((d, i) => i === idx ? value : d));
    setCustomDirty(true);
  };

  // ─── Handlers: active loop ─────────────────────────────────────────────────

  // Activate loop using custom split day names (no exercises yet)
  const activateLoop = async () => {
    if (!user || customSplit.length === 0) return;
    setLoopSaving(true);
    const loop = {
      days:       customSplit.map(name => ({ name, exercises: [] })),
      length:     customSplit.length,
      start_date: new Date().toISOString().split('T')[0],
    };
    const { error } = await supabase.from('profiles').update({ active_loop: loop }).eq('id', user.id);
    console.log('[LOOP ACTIVATE]', { loop, error: error?.message });
    if (!error) { setActiveLoop(loop); await refreshProfile(); }
    setLoopSaving(false);
  };

  // Generate loop from last 6 sessions — group by split_day, extract exercise ids
  const generateLoopFromHistory = async () => {
    if (!user) return;
    setLoopSaving(true);
    setLoopGenMsg(null);

    // Fetch last 6 sessions with their exercises
    const { data: sessions, error } = await supabase
      .from('workout_sessions')
      .select('id, split_day, split_type, session_exercises(exercise_id)')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(6);

    console.log('[LOOP GEN] sessions:', sessions?.length, error?.message);

    if (error || !sessions?.length) {
      setLoopGenMsg('No session history found.');
      setLoopSaving(false);
      return;
    }

    // Group by split_day preserving order of first appearance
    const seen  = new Map(); // split_day -> Set of exercise_ids
    const order = [];       // ordered unique split_days
    sessions.forEach(s => {
      const day = (s.split_day || '').trim();
      if (!day) return;
      if (!seen.has(day)) { seen.set(day, new Set()); order.push(day); }
      (s.session_exercises ?? []).forEach(se => {
        if (se.exercise_id) seen.get(day).add(se.exercise_id);
      });
    });

    if (!order.length) {
      setLoopGenMsg('Sessions have no split_day data.');
      setLoopSaving(false);
      return;
    }

    const days = order.map(name => ({
      name,
      exercises: [...seen.get(name)],
    }));

    const loop = {
      days,
      length:     days.length,
      start_date: new Date().toISOString().split('T')[0],
    };

    const { error: saveErr } = await supabase
      .from('profiles')
      .update({ active_loop: loop })
      .eq('id', user.id);

    console.log('[LOOP GEN] saved:', { days: days.length, saveErr: saveErr?.message });

    if (!saveErr) {
      setActiveLoop(loop);
      await refreshProfile();
      setLoopGenMsg(`Generated ${days.length}-day loop: ${order.join(' → ')}`);
    } else {
      setLoopGenMsg(`Save failed: ${saveErr.message}`);
    }
    setLoopSaving(false);
  };

  const deactivateLoop = async () => {
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ active_loop: null }).eq('id', user.id);
    if (!error) { setActiveLoop(null); setLoopGenMsg(null); await refreshProfile(); }
  };

  const handleLogout = () => supabase.auth.signOut();

  // ─── Derived ───────────────────────────────────────────────────────────────
  if (loading || !globalProfile) {
    return <div style={{ textAlign: 'center', paddingTop: '100px', color: 'var(--text-secondary)' }}>Loading profile...</div>;
  }

  const consistencyPct = Math.round((stats.attendance30 / 30) * 100);
  const heightNum = parseFloat(form.height_cm);
  const weight    = stats.latestWeight;
  let bmi = 0, bmiStatus = 'No height recorded', bmiColor = 'var(--text-secondary)';
  if (weight > 0 && heightNum > 0) {
    bmi = weight / Math.pow(heightNum / 100, 2);
    if      (bmi < 18.5) { bmiStatus = 'Underweight'; bmiColor = '#32ADE6'; }
    else if (bmi < 25)   { bmiStatus = 'Normal';      bmiColor = '#30D158'; }
    else if (bmi < 30)   { bmiStatus = 'Overweight';  bmiColor = '#FF9F0A'; }
    else                 { bmiStatus = 'Obese';        bmiColor = '#FF453A'; }
  }

  return (
    <div className="page-enter" style={{ paddingBottom: '60px', maxWidth: '900px', margin: '0 auto' }}>
      <style>{`
        .form-input { width:100%; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); color:white; padding:10px 12px; border-radius:8px; font-size:16px; font-weight:600; transition:all 0.2s; outline:none; }
        .form-input:focus { border-color:var(--accent-color); background:rgba(0,122,255,0.05); box-shadow:0 0 10px rgba(0,122,255,0.2); }
        .form-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--text-secondary); display:block; margin-bottom:6px; }
        .metrics-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
        .perf-grid    { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
        @media(max-width:767px){ .metrics-grid{grid-template-columns:repeat(2,1fr)} .perf-grid{grid-template-columns:1fr} }
        @keyframes successPop  { 0%{transform:scale(0.8);opacity:0} 50%{transform:scale(1.1);opacity:1} 100%{transform:scale(1);opacity:1} }
        @keyframes successFade { 0%{opacity:1} 80%{opacity:1} 100%{opacity:0} }
        .save-check { animation:successPop 0.3s cubic-bezier(0.2,0.8,0.2,1) forwards; }
        .save-text  { animation:successFade 2s linear forwards; }
        .rest-btn { background:transparent; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 16px; color:var(--text-secondary); cursor:pointer; font-weight:700; transition:all 0.2s; }
        .rest-btn.active { background:rgba(0,122,255,0.1); border-color:var(--accent-color); color:var(--accent-hover); box-shadow:0 0 15px rgba(0,122,255,0.2); }
        @keyframes spinKey { 100%{transform:rotate(360deg)} }
        .animate-spin { animation:spinKey 1s linear infinite; }
        .day-pill { display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:6px 10px 6px 14px; }
        .day-pill input { background:transparent; border:none; color:white; font-weight:700; font-size:14px; outline:none; width:100px; }
        .day-pill-remove { background:none; border:none; cursor:pointer; padding:2px; display:flex; color:var(--text-secondary); transition:color 0.2s; }
        .day-pill-remove:hover { color:var(--error-color); }
        .loop-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(48,209,88,0.1); border:1px solid rgba(48,209,88,0.3); color:#30D158; border-radius:100px; padding:4px 12px; font-size:12px; font-weight:800; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '16px', marginBottom: '32px' }}>
        <div style={{ flex: 1, paddingRight: '20px' }}>
          <input className="form-input" style={{ fontSize: '32px', fontWeight: '800', letterSpacing: '-1px', padding: '12px 16px', marginBottom: '8px', background: 'transparent' }} value={form.name} onChange={e => handleChange('name', e.target.value)} placeholder="Athlete Name" />
          <input className="form-input" style={{ fontSize: '15px', color: 'var(--accent-hover)', padding: '8px 16px', background: 'transparent', border: '1px dashed transparent' }} value={form.tagline} onChange={e => handleChange('tagline', e.target.value)} placeholder="Add a fitness tagline..." />
          <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '16px' }}>
            <CalIcon size={14} /> {stats.firstDate ? `Training since ${stats.firstDate}` : 'No sessions yet'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', marginTop: '12px' }}>
          <button onClick={handleSave} disabled={saving} style={{ display:'flex', alignItems:'center', gap:'8px', background:'var(--accent-color)', color:'white', border:'none', padding:'12px 24px', borderRadius:'12px', fontSize:'14px', fontWeight:'700', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? <Activity size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {saveSuccess && <div className="save-text" style={{ display:'flex', alignItems:'center', gap:'6px', color:'#30D158', fontSize:'13px', fontWeight:'700' }}><Check size={14} className="save-check" /> Saved</div>}
          {saveError   && <div style={{ display:'flex', alignItems:'center', gap:'6px', color:'var(--error-color)', fontSize:'13px', fontWeight:'700' }}><AlertCircle size={14} /> {saveError}</div>}
        </div>
      </div>

      {/* ── Metrics ── */}
      <div className="metrics-grid" style={{ marginBottom: '32px' }}>
        <div className="glass card interactive-card" style={{ padding: '16px', borderLeft: `3px solid ${bmiColor}`, margin: 0 }}>
          <span className="form-label">BMI</span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: 'white' }}>{bmi > 0 ? bmi.toFixed(1) : '--'}</div>
          <div style={{ fontSize: '11px', color: bmiColor, fontWeight: '700', marginTop: '2px' }}>{bmiStatus}</div>
        </div>
        <div className="glass card interactive-card" style={{ padding: '16px', margin: 0 }}>
          <span className="form-label">Latest Weight</span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: 'white' }}>{weight > 0 ? `${weight} kg` : '--'}</div>
        </div>
        <div className="glass card interactive-card" style={{ padding: '16px', margin: 0 }}>
          <label className="form-label">Height (cm)</label>
          <input className="form-input" type="number" value={form.height_cm} onChange={e => handleChange('height_cm', e.target.value)} placeholder="e.g. 175" />
        </div>
        <div className="glass card interactive-card" style={{ padding: '16px', margin: 0 }}>
          <label className="form-label">Age</label>
          <input className="form-input" type="number" value={form.age} onChange={e => handleChange('age', e.target.value)} placeholder="e.g. 25" />
        </div>
      </div>

      {/* ── Streak Settings ── */}
      <h2 className="subtitle" style={{ marginBottom: '12px' }}>Streak Settings</h2>
      <div className="glass card interactive-card" style={{ padding: '24px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: 'white', marginBottom: '4px' }}>Include Rest Days in Streak</div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Streak won't break on your selected rest days.</div>
          </div>
          <div onClick={() => handleChange('include_rest_days', !form.include_rest_days)} style={{ background: form.include_rest_days ? 'rgba(0,122,255,0.2)' : 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '24px', display: 'flex', alignItems: 'center', cursor: 'pointer', width: '56px', height: '32px', position: 'relative', transition: 'all 0.3s', flexShrink: 0 }}>
            <div style={{ background: form.include_rest_days ? 'var(--accent-hover)' : 'rgba(255,255,255,0.4)', width: '24px', height: '24px', borderRadius: '50%', position: 'absolute', left: form.include_rest_days ? '28px' : '4px', transition: 'all 0.3s cubic-bezier(0.2,0.8,0.2,1)' }} />
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '24px' }}>
          <div style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '700', letterSpacing: '1px', marginBottom: '16px' }}>Rest Days</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {DAYS.map(d => (
              <button key={d} className={`rest-btn ${form.rest_days?.includes(d) ? 'active' : ''}`} onClick={() => handleRestDayToggle(d)}>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Custom Training Split ── */}
      <h2 className="subtitle" style={{ marginBottom: '4px' }}>Custom Training Split</h2>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: '500' }}>
        Up to 7 days. Rename each inline. Takes priority over default splits.
      </p>
      <div className="glass card" style={{ padding: '20px', marginBottom: '12px' }}>
        {customSplit.length === 0 && (
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 16px', fontWeight: '500' }}>No custom split set. Add days below.</p>
        )}
        {customSplit.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
            {customSplit.map((day, idx) => (
              <div key={idx} className="day-pill">
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '700', minWidth: '20px' }}>{idx + 1}</span>
                <input
                  value={day}
                  onChange={e => renameCustomDay(idx, e.target.value)}
                  maxLength={20}
                />
                <button className="day-pill-remove" onClick={() => removeCustomDay(idx)}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {customSplit.length < MAX_CUSTOM_DAYS && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              className="form-input"
              style={{ flex: 1 }}
              placeholder='e.g. "Push" or "Chest & Tris"'
              value={newDayName}
              onChange={e => setNewDayName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomDay()}
              maxLength={20}
            />
            <button
              onClick={addCustomDay}
              disabled={!newDayName.trim()}
              style={{ display:'flex', alignItems:'center', gap:'6px', background:'rgba(0,122,255,0.15)', border:'1px solid rgba(0,122,255,0.3)', color:'var(--accent-hover)', padding:'10px 18px', borderRadius:'8px', fontWeight:'700', fontSize:'14px', cursor: newDayName.trim() ? 'pointer' : 'not-allowed', opacity: newDayName.trim() ? 1 : 0.5 }}
            >
              <Plus size={16} /> Add
            </button>
          </div>
        )}

        {customDirty && (
          <p style={{ fontSize: '12px', color: '#FF9F0A', marginTop: '10px', fontWeight: '600' }}>
            Unsaved changes — click Save Changes above to persist.
          </p>
        )}
      </div>

      {/* ── Active Loop ── */}
      <h2 className="subtitle" style={{ marginBottom: '4px', marginTop: '32px' }}>Active Program Loop</h2>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: '500' }}>
        Auto-rotates exercises daily. Generate from history or activate your custom split.
      </p>
      <div className="glass card" style={{ padding: '20px', marginBottom: '32px' }}>
        {activeLoop ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <div className="loop-badge" style={{ marginBottom: '8px' }}>
                  <Repeat size={12} /> Active Program
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '500' }}>
                  {activeLoop.days?.length}-day loop · started {new Date(activeLoop.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
              </div>
              <button onClick={deactivateLoop} style={{ background:'rgba(255,69,58,0.1)', border:'1px solid rgba(255,69,58,0.3)', color:'var(--error-color)', padding:'8px 16px', borderRadius:'8px', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}>
                Deactivate
              </button>
            </div>
            {/* Day pills — show name and exercise count */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {activeLoop.days?.map((d, i) => {
                const name  = typeof d === 'object' ? d.name : d;
                const count = typeof d === 'object' ? (d.exercises?.length ?? 0) : 0;
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:'4px', background:'rgba(48,209,88,0.08)', border:'1px solid rgba(48,209,88,0.2)', borderRadius:'8px', padding:'4px 12px', fontSize:'13px', fontWeight:'700', color:'#30D158' }}>
                    <span style={{ opacity:0.5, marginRight:'2px' }}>{i+1}</span>
                    {name}
                    {count > 0 && <span style={{ opacity:0.5, fontSize:'11px', marginLeft:'4px' }}>·{count}ex</span>}
                  </div>
                );
              })}
            </div>
            {/* Regenerate from history */}
            <button
              onClick={generateLoopFromHistory}
              disabled={loopSaving}
              style={{ display:'flex', alignItems:'center', gap:'6px', background:'rgba(0,122,255,0.1)', border:'1px solid rgba(0,122,255,0.25)', color:'var(--accent-hover)', padding:'8px 16px', borderRadius:'8px', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}
            >
              {loopSaving ? <Activity size={13} className="animate-spin" /> : <Repeat size={13} />}
              Sync From Last Cycle
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: 'white', marginBottom: '4px' }}>No loop active</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Generate from your workout history, or activate your custom split.
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {/* Generate from history — primary action */}
              <button
                onClick={generateLoopFromHistory}
                disabled={loopSaving}
                style={{ display:'flex', alignItems:'center', gap:'6px', background:'rgba(48,209,88,0.1)', border:'1px solid rgba(48,209,88,0.3)', color:'#30D158', padding:'10px 18px', borderRadius:'8px', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}
              >
                {loopSaving ? <Activity size={14} className="animate-spin" /> : <Repeat size={14} />}
                Generate From Last Cycle
              </button>
              {/* Activate from custom split */}
              <button
                onClick={activateLoop}
                disabled={customSplit.length === 0 || loopSaving}
                style={{ display:'flex', alignItems:'center', gap:'6px', background: customSplit.length > 0 ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.05)', border:`1px solid ${customSplit.length > 0 ? 'rgba(0,122,255,0.3)' : 'rgba(255,255,255,0.1)'}`, color: customSplit.length > 0 ? 'var(--accent-hover)' : 'var(--text-secondary)', padding:'10px 18px', borderRadius:'8px', fontWeight:'700', fontSize:'13px', cursor: customSplit.length > 0 ? 'pointer' : 'not-allowed', opacity: customSplit.length === 0 ? 0.5 : 1 }}
              >
                {loopSaving ? <Activity size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                Activate Custom Split
              </button>
            </div>
          </div>
        )}
        {loopGenMsg && (
          <div style={{ marginTop: '12px', fontSize: '13px', color: loopGenMsg.startsWith('Generated') ? '#30D158' : 'var(--error-color)', fontWeight: '600' }}>
            {loopGenMsg}
          </div>
        )}
      </div>

      {/* ── Performance ── */}
      <h2 className="subtitle" style={{ marginBottom: '12px' }}>Performance</h2>
      <div className="perf-grid" style={{ marginBottom: '48px' }}>
        <div className="glass card interactive-card" style={{ margin: 0, padding: '16px', textAlign: 'center' }}>
          <Activity size={24} color="var(--accent-color)" style={{ marginBottom: '6px' }} />
          <div style={{ fontSize: '28px', fontWeight: '800', color: 'white' }}>{consistencyPct}%</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px', fontWeight: '700' }}>30-Day Consistency</div>
        </div>
        <div className="glass card interactive-card" style={{ margin: 0, padding: '16px', textAlign: 'center' }}>
          <HardDrive size={24} color="#32ADE6" style={{ marginBottom: '6px' }} />
          <div style={{ fontSize: '28px', fontWeight: '800', color: 'white' }}>{stats.totalSessions}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px', fontWeight: '700' }}>Total Sessions</div>
        </div>
      </div>

      {/* ── Logout ── */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button onClick={handleLogout} style={{ background:'transparent', border:'1px solid rgba(255,69,58,0.4)', color:'var(--error-color)', padding:'12px 32px', borderRadius:'100px', display:'flex', alignItems:'center', gap:'8px', fontWeight:'700', fontSize:'14px', cursor:'pointer', transition:'all 0.3s' }} onMouseOver={e => { e.currentTarget.style.background='rgba(255,69,58,0.1)'; }} onMouseOut={e => { e.currentTarget.style.background='transparent'; }}>
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Plus, Search, X, Dumbbell, Trash, Check, Loader2, CheckCircle, Zap, Calendar, Repeat } from 'lucide-react';
import Dropdown from '../components/Dropdown';

// ── Utilities ─────────────────────────────────────────────────────────────────
const todayLocalISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatDateLabel = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const SPLITS_MAP = {
  "PPL":           ["Push", "Pull", "Legs"],
  "Bro Split":     ["Chest", "Back", "Shoulders", "Arms", "Legs"],
  "Upper / Lower": ["Upper", "Lower"],
  "Full Body":     ["Full Body"],
  "Custom":        [],
};
const SPLIT_KEYS = ["PPL", "Bro Split", "Upper / Lower", "Full Body"];

// ── localStorage keys ─────────────────────────────────────────────────────────
const DRAFT_KEY  = 'wtp_workout_draft_v2';
const DRAFT_TTL  = 24 * 60 * 60 * 1000; // 24 hours — auto-expire stale drafts

// ── Draft helpers ─────────────────────────────────────────────────────────────
function saveDraft(userId, state) {
  try {
    const draft = { userId, savedAt: Date.now(), ...state };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch { /* storage full — ignore */ }
}

function loadDraft(userId) {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (draft.userId !== userId) return null; // different user
    if (Date.now() - draft.savedAt > DRAFT_TTL) {
      localStorage.removeItem(DRAFT_KEY);
      return null; // expired
    }
    if (!draft.sessionExercises?.length) return null; // empty draft not worth restoring
    return draft;
  } catch {
    return null;
  }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function WorkoutActive() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // ── Core session state ────────────────────────────────────────────────────
  const [splitType,         setSplitType]         = useState('PPL');
  const [splitDay,          setSplitDay]          = useState('Push');
  const [sessionExercises,  setSessionExercises]  = useState([]);
  const [workoutDate,       setWorkoutDate]       = useState(todayLocalISO);
  const dateInputRef = useRef(null);

  // ── Resume & Scroll tracking ──────────────────────────────────────────────
  const resumeCheckedRef = useRef(false);

  // ── Search state ──────────────────────────────────────────────────────────
  const [isSearching,     setIsSearching]     = useState(false);
  const [searchQuery,     setSearchQuery]     = useState('');
  const [searchResults,   setSearchResults]   = useState([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError,     setSearchError]     = useState(null);

  // ── Save / completion state ───────────────────────────────────────────────
  const [saving,         setSaving]         = useState(false);
  const [saveError,      setSaveError]      = useState(null);
  const [isCompleteMode, setIsCompleteMode] = useState(false);
  const [completionData, setCompletionData] = useState({ vol: 0, sets: 0, prs: [] });

  // ── Loop template state ───────────────────────────────────────────────────
  const [loopPreloading, setLoopPreloading] = useState(false);
  const [loopDayName,    setLoopDayName]    = useState(null);
  const [lastWeights,    setLastWeights]    = useState({});
  const [loopTrigger,    setLoopTrigger]    = useState(0);

  // Autosave debounce timer ref
  const autosaveTimerRef = useRef(null);

  // ── Dark background for focus mode ────────────────────────────────────────
  useEffect(() => {
    document.body.style.background = '#06090c';
    return () => { document.body.style.background = 'var(--bg-color)'; };
  }, []);

  // ── Check and restore draft on mount ──────────────────────────────────────
  useEffect(() => {
    if (!user || resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;

    const draft = loadDraft(user.id);
    if (draft) {
      setSplitType(draft.splitType ?? 'PPL');
      setSplitDay(draft.splitDay   ?? 'Push');
      setWorkoutDate(draft.workoutDate ?? todayLocalISO());
      setSessionExercises(draft.sessionExercises ?? []);
    }
  }, [user]);

  // ── Restore scroll position on draft load ─────────────────────────────────
  useEffect(() => {
    if (sessionExercises.length > 0) {
      const savedScroll = localStorage.getItem('wtp_active_scroll');
      if (savedScroll) {
        const timer = setTimeout(() => {
          window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' });
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [sessionExercises.length]);

  // ── Save scroll position on scroll ────────────────────────────────────────
  useEffect(() => {
    const handleScroll = () => {
      if (sessionExercises.length > 0) {
        localStorage.setItem('wtp_active_scroll', String(window.scrollY));
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sessionExercises.length]);

  // ── Autosave: debounced whenever session state changes ────────────────────
  const autosave = useCallback(() => {
    if (!user) return;
    // Don't save if nothing meaningful exists
    if (sessionExercises.length === 0) {
      clearDraft();
      localStorage.removeItem('wtp_active_scroll');
      return;
    }
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      saveDraft(user.id, {
        splitType,
        splitDay,
        workoutDate,
        sessionExercises,
      });
    }, 800); // 800ms debounce
  }, [user, splitType, splitDay, workoutDate, sessionExercises]);

  useEffect(() => {
    autosave();
    return () => clearTimeout(autosaveTimerRef.current);
  }, [autosave]);

  // ── Loop template preload ─────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.active_loop || !user) return;
    // Don't overwrite an active session in progress
    if (sessionExercises.length > 0) return;
    const loop = profile.active_loop;
    const days = loop.days ?? [];
    if (!days.length) return;

    const start   = new Date(loop.start_date ?? new Date());
    start.setHours(0, 0, 0, 0);
    const today   = new Date(); today.setHours(0, 0, 0, 0);
    const elapsed = Math.floor((today - start) / 86_400_000);
    const slot    = days[elapsed % days.length];

    const dayName     = typeof slot === 'object' ? slot.name : slot;
    const exerciseIds = typeof slot === 'object' ? (slot.exercises ?? []) : [];

    if (!exerciseIds.length) {
      setLoopDayName(dayName);
      setSplitDay(dayName);
      setSplitType('Custom');
      return;
    }

    const preload = async () => {
      setLoopPreloading(true);
      setLoopDayName(dayName);
      setSplitDay(dayName);
      setSplitType('Custom');

      const { data: exRows } = await supabase
        .from('exercises')
        .select('id, name, muscle_group')
        .in('id', exerciseIds);

      const weightMap = {};
      await Promise.all((exRows ?? []).map(async (ex) => {
        const { data: seRows } = await supabase
          .from('session_exercises')
          .select('sets(weight_kg, reps), workout_sessions!inner(user_id, date)')
          .eq('workout_sessions.user_id', user.id)
          .eq('exercise_id', ex.id)
          .order('workout_sessions.date', { ascending: false })
          .limit(1)
          .single();

        if (seRows?.sets?.length) {
          const best = seRows.sets.reduce((b, s) =>
            (parseFloat(s.weight_kg) || 0) >= (parseFloat(b.weight_kg) || 0) ? s : b
          );
          weightMap[ex.id] = {
            weight: parseFloat(best.weight_kg) || 0,
            reps:   parseInt(best.reps, 10)    || 15,
          };
        }
      }));

      setLastWeights(weightMap);

      const orderedExercises = exerciseIds
        .map(id => exRows?.find(e => e.id === id))
        .filter(Boolean);

      const built = orderedExercises.map((ex, i) => {
        const last     = weightMap[ex.id];
        const setCount = i === 0 ? 4 : 3;
        const sets = Array.from({ length: setCount }, () => ({
          weight_kg: last ? String(last.weight) : '',
          reps:      last ? String(last.reps)   : '15',
        }));
        return { exercise: ex, sets, fromLoop: true };
      });

      setSessionExercises(built);
      setLoopPreloading(false);
    };

    preload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, user, loopTrigger]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const effectiveDays = splitType === 'Custom'
    ? (profile?.custom_split?.length > 0 ? profile.custom_split : [splitDay])
    : (SPLITS_MAP[splitType] ?? ['Custom']);

  const availableSplitKeys = profile?.active_loop || profile?.custom_split?.length > 0
    ? [...SPLIT_KEYS, 'Custom']
    : SPLIT_KEYS;

  const handleSplitTypeChange = (newType) => {
    setSplitType(newType);
    if (newType === 'Custom') {
      const days = profile?.custom_split ?? [];
      setSplitDay(days[0] || 'Custom');
    } else {
      const seq = SPLITS_MAP[newType];
      if (seq?.length > 0) setSplitDay(seq[0]);
      else setSplitDay('');
    }
  };

  // ── Exercise search ───────────────────────────────────────────────────────
  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      setIsSearchLoading(false);
      return;
    }
    setIsSearchLoading(true);
    setSearchError(null);
    const run = async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .ilike('name', `%${searchQuery}%`)
        .limit(20);
      if (error) setSearchError(error.message);
      else setSearchResults(data || []);
      setIsSearchLoading(false);
    };
    const timer = setTimeout(run, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const closeSearch = () => {
    setIsSearching(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
  };

  const addExercise = (exercise) => {
    setSessionExercises(prev => {
      const isFirst  = prev.length === 0;
      const setCount = isFirst ? 4 : 3;
      const sets     = Array.from({ length: setCount }, () => ({ weight_kg: '', reps: '15' }));
      return [...prev, { exercise, sets, fromLoop: false }];
    });
    closeSearch();
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100);
  };

  const addSet = (exIndex) => {
    setSessionExercises(prev => prev.map((item, i) => {
      if (i !== exIndex) return item;
      const last = item.sets[item.sets.length - 1];
      return { ...item, sets: [...item.sets, { weight_kg: last?.weight_kg ?? '', reps: '' }] };
    }));
  };

  const updateSet = (exIndex, setIndex, field, value) => {
    let val = value;
    if (val !== '') {
      const num = parseFloat(val);
      if (field === 'weight_kg') {
        if (num > 500) val = '500';
        else if (num < 0) val = '0';
      }
      if (field === 'reps') {
        if (num > 100) val = '100';
        else if (num < 1) val = '1';
      }
    }
    setSessionExercises(prev => prev.map((item, i) => {
      if (i !== exIndex) return item;
      return { ...item, sets: item.sets.map((set, j) => j !== setIndex ? set : { ...set, [field]: val }) };
    }));
  };

  const removeSet = (exIndex, setIndex) => {
    setSessionExercises(prev => prev.map((item, i) => {
      if (i !== exIndex) return item;
      return { ...item, sets: item.sets.filter((_, j) => j !== setIndex) };
    }));
  };

  const removeExercise = (exIndex) => {
    setSessionExercises(prev => prev.filter((_, i) => i !== exIndex));
  };

  // ── Save session ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (sessionExercises.length === 0) return;
    setSaving(true);
    setSaveError(null);

    const [y, m, d]     = workoutDate.split('-').map(Number);
    const sessionDateISO = new Date(y, m - 1, d, 12, 0, 0).toISOString();

    const { data: sessionData, error: sessionError } = await supabase
      .from('workout_sessions')
      .insert({ user_id: user.id, date: sessionDateISO, split_type: splitType, split_day: splitDay, notes: '' })
      .select()
      .single();

    if (sessionError || !sessionData) {
      setSaveError(sessionError?.message ?? 'Failed to save session.');
      setSaving(false);
      return;
    }

    let totalVol = 0, totalSetsCount = 0;
    let prsFound = [];

    for (let i = 0; i < sessionExercises.length; i++) {
      const item = sessionExercises[i];
      let currentExVol = 0, currentMaxW = 0, currentMaxRAtW = 0;

      item.sets.forEach(s => {
        if (s.reps === '') return;
        const w = parseFloat(s.weight_kg) || 0;
        const r = parseInt(s.reps, 10) || 0;
        currentExVol   += w * r;
        totalVol       += w * r;
        totalSetsCount++;
        if (w > currentMaxW)                            { currentMaxW = w; currentMaxRAtW = r; }
        else if (w === currentMaxW && r > currentMaxRAtW) { currentMaxRAtW = r; }
      });

      const { data: pastExData } = await supabase
        .from('session_exercises')
        .select('sets(weight_kg, reps), workout_sessions!inner(user_id, date)')
        .eq('workout_sessions.user_id', user.id)
        .eq('exercise_id', item.exercise.id)
        .order('workout_sessions.date', { ascending: false })
        .limit(1)
        .single();

      if (pastExData?.sets?.length > 0) {
        let pastVol = 0, pastMaxW = 0, pastMaxRAtW = 0;
        pastExData.sets.forEach(ps => {
          const pw = parseFloat(ps.weight_kg) || 0;
          const pr = parseInt(ps.reps) || 0;
          pastVol += pw * pr;
          if (pw > pastMaxW) { pastMaxW = pw; pastMaxRAtW = pr; }
          else if (pw === pastMaxW && pr > pastMaxRAtW) { pastMaxRAtW = pr; }
        });
        if (currentMaxW > pastMaxW) {
          prsFound.push({ exercise: item.exercise.name, type: 'STR', val: `+${(currentMaxW - pastMaxW).toFixed(1)}kg` });
        } else if (currentMaxW === pastMaxW && currentMaxRAtW > pastMaxRAtW) {
          prsFound.push({ exercise: item.exercise.name, type: 'REP', val: `+${currentMaxRAtW - pastMaxRAtW} reps` });
        } else if (currentExVol > pastVol) {
          prsFound.push({ exercise: item.exercise.name, type: 'VOL', val: `+${Math.round(currentExVol - pastVol)}kg vol` });
        }
      }

      const { data: seData } = await supabase
        .from('session_exercises')
        .insert({ session_id: sessionData.id, exercise_id: item.exercise.id, order_index: i })
        .select()
        .single();

      if (seData) {
        const validSets = item.sets.filter(s => s.reps !== '');
        if (validSets.length > 0) {
          await supabase.from('sets').insert(
            validSets.map((s, idx) => ({
              session_exercise_id: seData.id,
              set_number:          idx + 1,
              weight_kg:           s.weight_kg ? parseFloat(s.weight_kg) : 0,
              reps:                parseInt(s.reps, 10) || 0,
            }))
          );
        }
      }
    }

    // ── Clear draft after successful save ─────────────────────────────────
    clearDraft();

    setCompletionData({ vol: totalVol, sets: totalSetsCount, prs: prsFound });
    setSaving(false);
    setIsCompleteMode(true);
  };

  // ── Completion Screen ─────────────────────────────────────────────────────
  if (isCompleteMode) {
    return (
      <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, zIndex:1000, background:'#0b0f14', display:'flex', flexDirection:'column', padding:'24px', alignItems:'center', justifyContent:'center', overflowY:'auto' }}>
        <style>{`
          @keyframes scaleCheck { 0% { transform:scale(0.5); opacity:0; } 70% { transform:scale(1.1); box-shadow:0 0 60px rgba(48,209,88,0.4); } 100% { transform:scale(1); opacity:1; box-shadow:0 0 40px rgba(48,209,88,0.2); } }
          .pr-badge { animation: prPop 0.5s cubic-bezier(0.2,0.8,0.2,1) forwards; }
          @keyframes prPop { 0% { opacity:0; transform:translateY(10px) scale(0.9); } 100% { opacity:1; transform:translateY(0) scale(1); } }
          .stagger-1 { animation:prPop 0.4s ease forwards 100ms; opacity:0; }
          .stagger-2 { animation:prPop 0.4s ease forwards 200ms; opacity:0; }
          .stagger-3 { animation:prPop 0.4s ease forwards 300ms; opacity:0; }
          @keyframes spinKey { 100% { transform: rotate(360deg); } }
        `}</style>

        <div style={{ background:'rgba(48,209,88,0.1)', padding:'24px', borderRadius:'50%', marginBottom:'32px', animation:'scaleCheck 0.6s cubic-bezier(0.2,0.8,0.2,1) forwards' }}>
          <CheckCircle size={80} color="#30D158" />
        </div>
        <h1 style={{ fontSize:'42px', fontWeight:'800', margin:0, letterSpacing:'-1.5px', color:'white' }}>Session Complete.</h1>
        <p style={{ marginTop:'12px', fontSize:'18px', color:'var(--text-secondary)', fontWeight:'600', marginBottom:'40px', textAlign:'center' }}>
          You showed up. That's what matters.
        </p>

        <div className="glass card stagger-1" style={{ width:'100%', maxWidth:'400px', display:'flex', justifyContent:'space-around', padding:'24px', marginBottom: completionData.prs.length > 0 ? '24px' : '40px' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:'12px', textTransform:'uppercase', color:'var(--text-secondary)', letterSpacing:'1px', fontWeight:'700', marginBottom:'8px' }}>Volume</div>
            <div style={{ fontSize:'28px', fontWeight:'800', color:'#fff' }}>{Math.round(completionData.vol).toLocaleString()} <span style={{ fontSize:'14px', color:'var(--text-secondary)' }}>kg</span></div>
          </div>
          <div style={{ width:'1px', background:'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:'12px', textTransform:'uppercase', color:'var(--text-secondary)', letterSpacing:'1px', fontWeight:'700', marginBottom:'8px' }}>Sets</div>
            <div style={{ fontSize:'28px', fontWeight:'800', color:'#fff' }}>{completionData.sets}</div>
          </div>
        </div>

        {completionData.prs.length > 0 && (
          <div className="stagger-2" style={{ maxWidth:'400px', width:'100%', marginBottom:'32px' }}>
            <h3 style={{ fontSize:'13px', color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'2px', fontWeight:'800', marginBottom:'14px', textAlign:'center' }}>New Milestones</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              {completionData.prs.map((pr, idx) => (
                <div key={idx} className="glass pr-badge" style={{ padding:'14px 18px', borderLeft:'4px solid #30D158', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <Zap size={16} color="#30D158" style={{ filter:'drop-shadow(0 0 8px rgba(48,209,88,0.5))', flexShrink:0 }} />
                    <span style={{ fontWeight:'800', fontSize:'15px', color:'white' }}>{pr.exercise}</span>
                  </div>
                  <div style={{ background:'rgba(48,209,88,0.1)', color:'#30D158', padding:'5px 10px', borderRadius:'8px', fontSize:'12px', fontWeight:'800', flexShrink:0 }}>
                    {pr.type} | {pr.val}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="stagger-3" style={{ display:'flex', flexDirection:'column', gap:'12px', width:'100%', maxWidth:'400px' }}>
          <button
            className="btn-primary"
            onClick={() => {
              let nextDay = splitDay;
              if (!profile?.active_loop) {
                if (splitType === 'Custom' && profile?.custom_split?.length > 0) {
                  const idx = profile.custom_split.indexOf(splitDay);
                  nextDay = profile.custom_split[(idx + 1) % profile.custom_split.length] || profile.custom_split[0];
                } else if (SPLITS_MAP[splitType]) {
                  const days = SPLITS_MAP[splitType];
                  const idx  = days.indexOf(splitDay);
                  nextDay    = days[(idx + 1) % days.length] || days[0];
                }
              }
              setIsCompleteMode(false);
              setSessionExercises([]);
              setWorkoutDate(todayLocalISO());
              setSplitDay(nextDay);
              setSaveError(null);
              if (profile?.active_loop) setLoopTrigger(prev => prev + 1);
            }}
            style={{ padding:'18px', borderRadius:'16px', fontSize:'16px', display:'flex', alignItems:'center', justifyContent:'center', gap:'10px' }}
          >
            <Repeat size={18} /> Next Workout →
          </button>
          <button className="btn-primary" onClick={() => navigate('/analytics')} style={{ padding:'18px', borderRadius:'16px', fontSize:'16px' }}>
            View Analytics
          </button>
          <button className="btn-secondary" onClick={() => navigate('/')} style={{ padding:'18px', borderRadius:'16px', fontSize:'16px' }}>
            Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Main Workout UI ───────────────────────────────────────────────────────
  return (
    <div className="page-enter" style={{ position:'relative', paddingBottom:'calc(100px + env(safe-area-inset-bottom, 0px))' }}>
      <style>{`
        @keyframes spinKey { 100% { transform: rotate(360deg); } }
        .animate-spin { animation: spinKey 1s linear infinite; }
        .date-chip { display:inline-flex; align-items:center; gap:7px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:100px; padding:7px 14px; cursor:pointer; transition:all 0.2s; user-select:none; }
        .date-chip:hover { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); }
        .date-chip.changed { border-color:var(--accent-color); background:rgba(0,122,255,0.1); }
        .date-input-hidden { position:absolute; opacity:0; pointer-events:none; width:1px; height:1px; }
        .conclude-bar {
          position: fixed;
          bottom: 0;
          left: 0; right: 0;
          padding: 12px 20px;
          padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
          background: rgba(6,9,12,0.96);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-top: 1px solid rgba(255,255,255,0.08);
          z-index: 50;
          display: flex;
          justify-content: center;
        }
        @media (min-width: 768px) {
          .conclude-bar { left: 250px; padding-bottom: 16px; }
        }
        .set-row-input {
          background: transparent; border: none; color: #fff;
          font-size: 20px; font-weight: 800; outline: none;
          text-align: right; width: 100%; min-width: 0;
        }
        @media (max-width: 767px) {
          .set-row-input { font-size: 17px; }
          .ex-name { font-size: 17px !important; }
          .set-label { font-size: 13px !important; }
          .unit-label { font-size: 12px !important; }
        }
        .resume-banner {
          background: rgba(0,122,255,0.08);
          border: 1px solid rgba(0,122,255,0.3);
          border-radius: 16px;
          padding: 16px 18px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        @media (max-width: 480px) {
          .resume-banner { flex-direction: column; align-items: flex-start; gap: 10px; }
          .resume-banner-btns { width: 100%; }
        }
      `}</style>

      {/* ── Exercise Search Overlay ── */}
      {isSearching && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, zIndex:1000, background:'rgba(6,9,12,0.97)', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'20px 20px 0', display:'flex', justifyContent:'flex-end', maxWidth:'800px', margin:'0 auto', width:'100%' }}>
            <button onClick={closeSearch} style={{ background:'rgba(255,255,255,0.07)', borderRadius:'50%', width:'44px', height:'44px', color:'white', display:'flex', alignItems:'center', justifyContent:'center', border:'none', cursor:'pointer' }}>
              <X size={22} />
            </button>
          </div>
          <div style={{ padding:'0 20px', maxWidth:'800px', margin:'0 auto', width:'100%', flex:1, display:'flex', flexDirection:'column' }}>
            <h2 className="title" style={{ textAlign:'center', fontSize:'28px' }}>Exercise Library</h2>
            <div className="glass" style={{ borderRadius:'20px', padding:'6px 20px', display:'flex', alignItems:'center', marginBottom:'20px', border:'1px solid rgba(0,122,255,0.4)' }}>
              <Search size={24} color="var(--accent-color)" />
              <input
                autoFocus
                type="text"
                placeholder="Search movements..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ border:'none', background:'transparent', padding:'14px 16px', fontSize:'18px', flex:1, color:'white', outline:'none' }}
              />
              {isSearchLoading && <Loader2 className="animate-spin" size={22} color="var(--text-secondary)" />}
            </div>
            <div style={{ flex:1, overflowY:'auto', paddingBottom:'80px' }}>
              {searchError && <div style={{ padding:'14px', color:'var(--error-color)', fontSize:'14px', fontWeight:'600' }}>{searchError}</div>}
              {searchResults.length > 0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                  {searchResults.map(ex => (
                    <div key={ex.id} className="glass interactive-card" style={{ padding:'18px 22px', cursor:'pointer', margin:0 }} onClick={() => addExercise(ex)}>
                      <div style={{ fontWeight:'800', fontSize:'19px', color:'white', marginBottom:'4px' }}>{ex.name}</div>
                      <div style={{ color:'var(--text-secondary)', fontWeight:'600', fontSize:'13px' }}>{ex.muscle_group}</div>
                    </div>
                  ))}
                </div>
              )}
              {!isSearchLoading && searchQuery && searchResults.length === 0 && (
                <div style={{ textAlign:'center', color:'var(--text-secondary)', padding:'40px 0', fontWeight:'600' }}>No exercises found.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ marginTop:'16px', marginBottom:'24px' }}>

        {loopDayName && (
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'14px', padding:'7px 12px', background:'rgba(48,209,88,0.07)', border:'1px solid rgba(48,209,88,0.2)', borderRadius:'10px' }}>
            <Repeat size={12} color="#30D158" />
            <span style={{ fontSize:'11px', fontWeight:'700', color:'#30D158', letterSpacing:'1px', textTransform:'uppercase' }}>From your active program</span>
            {loopPreloading && <Loader2 size={12} color="#30D158" className="animate-spin" style={{ marginLeft:'auto' }} />}
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', gap:'12px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'12px', minWidth:0 }}>
            <h1 className="title" style={{ margin:0, fontSize:'28px', whiteSpace:'nowrap' }}>Active Block</h1>
            {sessionExercises.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('Reset the current session?')) {
                    setSessionExercises([]);
                    clearDraft();
                    setSplitDay(effectiveDays[0] || 'Push');
                  }
                }}
                style={{ background:'transparent', border:'1px solid rgba(255,69,58,0.3)', color:'var(--error-color)', padding:'5px 10px', borderRadius:'8px', fontSize:'11px', fontWeight:'700', cursor:'pointer', flexShrink:0 }}
              >
                Reset
              </button>
            )}
          </div>

          <div
            className={`date-chip${workoutDate !== todayLocalISO() ? ' changed' : ''}`}
            onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
            title="Tap to change session date"
            style={{ position:'relative', flexShrink:0 }}
          >
            <Calendar size={13} color={workoutDate !== todayLocalISO() ? 'var(--accent-hover)' : 'var(--text-secondary)'} />
            <span style={{ fontSize:'12px', fontWeight:'700', color: workoutDate !== todayLocalISO() ? 'var(--accent-hover)' : 'var(--text-secondary)', whiteSpace:'nowrap' }}>
              {formatDateLabel(workoutDate)}
            </span>
            <input ref={dateInputRef} type="date" className="date-input-hidden" value={workoutDate} max={todayLocalISO()} onChange={e => setWorkoutDate(e.target.value)} />
          </div>
        </div>

        <div className="glass" style={{ display:'flex', gap:'0', padding:'4px', borderRadius:'22px', alignItems:'center' }}>
          <Dropdown value={splitType} options={availableSplitKeys} onChange={handleSplitTypeChange} accentColor="var(--accent-color)" />
          <div style={{ width:'1px', background:'rgba(255,255,255,0.1)', height:'28px', flexShrink:0 }} />
          <Dropdown value={splitDay} options={effectiveDays.length > 0 ? effectiveDays : [splitDay || 'Custom']} onChange={setSplitDay} accentColor="white" />
        </div>
      </div>

      {/* ── Exercise Cards ── */}
      {sessionExercises.length === 0 ? (
        <div style={{ textAlign:'center', padding:'80px 0', color:'var(--text-secondary)' }}>
          {loopPreloading
            ? <Loader2 size={48} color="rgba(255,255,255,0.2)" className="animate-spin" style={{ marginBottom:'20px' }} />
            : <Dumbbell size={56} color="rgba(255,255,255,0.1)" style={{ marginBottom:'20px' }} />
          }
          <p style={{ fontSize:'22px', fontWeight:'800', color:'white', letterSpacing:'-0.5px', margin:0 }}>
            {loopPreloading ? 'Loading your program...' : "Let's build something strong today."}
          </p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'16px', marginBottom:'16px' }}>
          {sessionExercises.map((item, exIdx) => (
            <div key={exIdx} className="glass card animate-fade-in" style={{ padding:'0', overflow:'hidden', margin:0 }}>
              <div style={{ padding:'18px 20px', background:'rgba(255,255,255,0.02)', borderBottom:'1px solid rgba(255,255,255,0.05)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <h3 className="ex-name" style={{ margin:0, color:'#fff', fontSize:'19px', fontWeight:'800', letterSpacing:'-0.3px' }}>{item.exercise.name}</h3>
                  {item.fromLoop && lastWeights[item.exercise.id] && (
                    <div style={{ fontSize:'11px', color:'var(--text-secondary)', fontWeight:'600', marginTop:'3px' }}>
                      Last: {lastWeights[item.exercise.id].weight}kg × {lastWeights[item.exercise.id].reps}
                    </div>
                  )}
                  {item.suggestedPerformance && (
                    <div style={{ fontSize:'11px', color:'var(--accent-hover)', fontWeight:'700', marginTop:'3px' }}>
                      Suggested based on previous performance: {item.suggestedPerformance}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeExercise(exIdx)}
                  style={{ background:'none', border:'none', padding:'8px', cursor:'pointer', color:'var(--text-secondary)', display:'flex', borderRadius:'8px', transition:'background 0.2s' }}
                  onMouseOver={e => { e.currentTarget.style.background='rgba(255,69,58,0.1)'; e.currentTarget.style.color='var(--error-color)'; }}
                  onMouseOut={e  => { e.currentTarget.style.background='none'; e.currentTarget.style.color='var(--text-secondary)'; }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding:'16px 20px' }}>
                {item.sets.map((setInfo, setIdx) => (
                  <div key={setIdx} style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'12px' }}>
                    <div className="set-label" style={{ width:'36px', fontWeight:'800', color:'var(--text-secondary)', fontSize:'14px', flexShrink:0 }}>S{setIdx + 1}</div>
                    <div style={{ flex:1, display:'flex', alignItems:'center', background:'rgba(0,0,0,0.35)', borderRadius:'14px', padding:'5px 14px', border:'1px solid rgba(255,255,255,0.05)' }}>
                      <input
                        type="number" placeholder="0" value={setInfo.weight_kg}
                        onChange={e => updateSet(exIdx, setIdx, 'weight_kg', e.target.value)}
                        className="set-row-input"
                        inputMode="decimal"
                      />
                      <span className="unit-label" style={{ color:'var(--text-secondary)', marginLeft:'6px', fontSize:'13px', marginRight:'14px', fontWeight:'700', flexShrink:0 }}>kg</span>
                      <span style={{ color:'var(--accent-hover)', fontWeight:'800', fontSize:'16px', flexShrink:0 }}>×</span>
                      <input
                        type="number" placeholder="0" value={setInfo.reps}
                        onChange={e => updateSet(exIdx, setIdx, 'reps', e.target.value)}
                        className="set-row-input"
                        inputMode="numeric"
                      />
                      <span className="unit-label" style={{ color:'var(--text-secondary)', marginLeft:'6px', fontSize:'13px', fontWeight:'700', flexShrink:0 }}>reps</span>
                    </div>
                    <button onClick={() => removeSet(exIdx, setIdx)} style={{ background:'none', border:'none', padding:'6px', cursor:'pointer', display:'flex', flexShrink:0 }}>
                      <Trash size={16} color="var(--error-color)" />
                    </button>
                  </div>
                ))}
                <button onClick={() => addSet(exIdx)} style={{ width:'100%', padding:'13px', background:'transparent', border:'1px dashed rgba(255,255,255,0.12)', borderRadius:'14px', color:'var(--text-secondary)', fontWeight:'700', cursor:'pointer', marginTop:'8px', fontSize:'14px' }}>
                  + Add Set
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        className="btn-secondary"
        onClick={() => setIsSearching(true)}
        style={{ width:'100%', border:'1px solid rgba(0,122,255,0.3)', background:'rgba(0,122,255,0.05)', padding:'14px', fontSize:'15px', display:'flex', justifyContent:'center', color:'white', fontWeight:'800', borderRadius:'20px', marginTop:'8px' }}
      >
        <Plus size={18} color="var(--accent-hover)" style={{ marginRight:'8px' }} /> Add Exercise
      </button>

      {saveError && (
        <div style={{ marginTop:'14px', padding:'13px 18px', background:'rgba(255,69,58,0.08)', border:'1px solid rgba(255,69,58,0.3)', borderRadius:'14px', color:'var(--error-color)', fontSize:'14px', fontWeight:'600' }}>
          {saveError}
        </div>
      )}

      {sessionExercises.length > 0 && (
        <div className="conclude-bar">
          <button
            className="btn-primary"
            style={{ padding:'14px 40px', fontSize:'15px', borderRadius:'100px', display:'flex', gap:'10px', minWidth:'260px', maxWidth:'400px', width:'100%', boxShadow:'0 4px 20px rgba(0,122,255,0.3)' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
            {saving ? 'Saving...' : 'Conclude Session'}
          </button>
        </div>
      )}
    </div>
  );
}

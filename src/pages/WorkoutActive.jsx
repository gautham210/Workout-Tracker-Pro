import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, Search, X, Dumbbell, Trash, Check, Loader2, 
  CheckCircle, Zap, Calendar, Repeat, ArrowLeft, ArrowRight, Play, Eye
} from 'lucide-react';
import Dropdown from '../components/Dropdown';
import { getProgressionRecommendation } from '../lib/progressionEngine';
import WorkoutTimer from '../components/WorkoutTimer';
import HydrationManager from '../components/HydrationManager';

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
const DRAFT_TTL  = 24 * 60 * 60 * 1000; // 24 hours
const draftKey = (userId) => `wtp_workout_draft_v2_${userId}`;

// ── Draft helpers ─────────────────────────────────────────────────────────────
function saveDraft(userId, state) {
  try {
    const draft = { userId, savedAt: Date.now(), ...state };
    localStorage.setItem(draftKey(userId), JSON.stringify(draft));
  } catch { /* storage full */ }
}

function loadDraft(userId) {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (draft.userId !== userId) return null; // different user
    if (Date.now() - draft.savedAt > DRAFT_TTL) {
      localStorage.removeItem(draftKey(userId));
      return null; // expired
    }
    return draft;
  } catch {
    return null;
  }
}

function clearDraft(userId) {
  try { 
    if (userId) localStorage.removeItem(draftKey(userId));
    localStorage.removeItem('wtp_active_scroll');
  } catch { /* ignore */ }
}

export default function WorkoutActive() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // ── Core session state ────────────────────────────────────────────────────
  const [splitType,         setSplitType]         = useState('PPL');
  const [splitDay,          setSplitDay]          = useState('Push');
  const [sessionExercises,  setSessionExercises]  = useState([]);
  const [workoutDate,       setWorkoutDate]       = useState(todayLocalISO);
  
  // ── START/ACTIVE SESSION STATES ───────────────────────────────────────────
  const [sessionStarted,    setSessionStarted]    = useState(false);
  const [activeExIdx,       setActiveExIdx]       = useState(0);
  const [completedSetsCount, setCompletedSetsCount] = useState(0);
  const [restTimerTrigger,  setRestTimerTrigger]  = useState(0);
  const [activeExTimerName, setActiveExTimerName] = useState('');

  const dateInputRef = useRef(null);
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

  const autosaveTimerRef = useRef(null);

  // ── Dark background for focus mode ────────────────────────────────────────
  useEffect(() => {
    document.body.style.background = '#06090c';
    return () => { document.body.style.background = 'var(--bg-color)'; };
  }, []);

  // ── Load Progression Recommendations for all exercises ─────────────────────
  const enrichExercisesWithProgression = async (exercisesList) => {
    if (!user) return exercisesList;
    return await Promise.all(exercisesList.map(async (item) => {
      if (item.exercise && !item.suggestedPerformance) {
        const rec = await getProgressionRecommendation(user.id, item.exercise.id);
        return {
          ...item,
          sets: item.sets.map(s => ({
            ...s,
            suggestedWeight: s.suggestedWeight || rec.recommendedWeight,
            suggestedReps: s.suggestedReps || rec.recommendedReps
          })),
          suggestedPerformance: rec.reason
        };
      }
      return item;
    }));
  };

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
      setSessionStarted(draft.sessionStarted ?? false);
      setActiveExIdx(draft.activeExIdx ?? 0);
      setCompletedSetsCount(draft.completedSetsCount ?? 0);
    }
  }, [user]);

  // ── Autosave debounced state ──────────────────────────────────────────────
  const autosave = useCallback(() => {
    if (!user) return;
    if (sessionExercises.length === 0) {
      clearDraft(user.id);
      return;
    }
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      saveDraft(user.id, {
        splitType,
        splitDay,
        workoutDate,
        sessionExercises,
        sessionStarted,
        activeExIdx,
        completedSetsCount
      });
    }, 800);
  }, [user, splitType, splitDay, workoutDate, sessionExercises, sessionStarted, activeExIdx, completedSetsCount]);

  useEffect(() => {
    autosave();
    return () => clearTimeout(autosaveTimerRef.current);
  }, [autosave]);

  // ── Loop template preload ─────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.active_loop || !user) return;
    if (sessionExercises.length > 0) return; // don't override active session
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
          completed: false
        }));
        return { exercise: ex, sets, fromLoop: true };
      });

      // Enrich preloaded exercises with progression recommendations
      const enriched = await enrichExercisesWithProgression(built);
      setSessionExercises(enriched);
      setLoopPreloading(false);
    };

    preload();
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

  const addExercise = async (exercise) => {
    const isFirst  = sessionExercises.length === 0;
    const setCount = isFirst ? 4 : 3;
    const newExItem = {
      exercise,
      sets: Array.from({ length: setCount }, () => ({ weight_kg: '', reps: '15', completed: false })),
      fromLoop: false
    };

    const enriched = await enrichExercisesWithProgression([newExItem]);
    setSessionExercises(prev => [...prev, enriched[0]]);
    closeSearch();
  };

  const addSet = (exIndex) => {
    setSessionExercises(prev => prev.map((item, i) => {
      if (i !== exIndex) return item;
      const last = item.sets[item.sets.length - 1];
      return {
        ...item,
        sets: [
          ...item.sets,
          {
            weight_kg: last?.weight_kg ?? '',
            reps: '',
            suggestedWeight: last?.suggestedWeight ?? '',
            suggestedReps: last?.suggestedReps ?? '',
            completed: false
          }
        ]
      };
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
    setSessionExercises(prev => {
      const updated = prev.filter((_, i) => i !== exIndex);
      // Adjust active exercise pagination index if it falls off bounds
      if (activeExIdx >= updated.length && activeExIdx > 0) {
        setActiveExIdx(updated.length - 1);
      }
      return updated;
    });
  };

  const autofillExerciseTargets = (exIdx) => {
    setSessionExercises(prev => prev.map((item, i) => {
      if (i !== exIdx) return item;
      return {
        ...item,
        sets: item.sets.map(s => ({
          ...s,
          weight_kg: s.suggestedWeight && s.weight_kg === '' ? String(s.suggestedWeight) : s.weight_kg,
          reps: s.suggestedReps && s.reps === '' ? String(s.suggestedReps) : s.reps
        }))
      };
    }));
  };

  // ── Complete Checkbox Action (Trigger rest timer) ──────────────────────────
  const toggleSetComplete = (exIdx, setIdx) => {
    setSessionExercises(prev => prev.map((item, i) => {
      if (i !== exIdx) return item;
      return {
        ...item,
        sets: item.sets.map((s, j) => {
          if (j !== setIdx) return s;
          
          const willComplete = !s.completed;
          if (willComplete) {
            // Trigger automatic rest timer
            setActiveExTimerName(item.exercise.name);
            setRestTimerTrigger(prev => prev + 1);
            setCompletedSetsCount(prev => prev + 1);
          }
          
          return { ...s, completed: willComplete };
        })
      };
    }));
  };

  // ── START ACTIVE SESSION ──────────────────────────────────────────────────
  const handleStartSession = async () => {
    if (sessionExercises.length === 0) return;
    
    // Enrich all exercises with progression recommendations before starting
    const enriched = await enrichExercisesWithProgression(sessionExercises);
    setSessionExercises(enriched);
    
    setSessionStarted(true);
    setActiveExIdx(0);
  };

  // ── Save session ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (sessionExercises.length === 0) return;
    setSaving(true);
    setSaveError(null);

    const [y, m, d]     = workoutDate.split('-').map(Number);
    const sessionDateISO = new Date(y, m - 1, d, 12, 0, 0).toISOString();

    const completedExercises = sessionExercises.flatMap((item, exerciseIndex) => {
      const sets = item.sets.flatMap((set, setIndex) => {
        const weight = Number(set.weight_kg);
        const reps = Number(set.reps);
        if (!set.completed || !Number.isFinite(weight) || weight < 0 || weight > 1000 || !Number.isInteger(reps) || reps < 1 || reps > 500) return [];
        return [{ id: crypto.randomUUID(), set_number: setIndex + 1, weight_kg: weight, reps, completed: true, rpe: null, rir: null }];
      });
      return sets.length && item.exercise?.id ? [{ id: crypto.randomUUID(), exercise_id: item.exercise.id, order_index: exerciseIndex, sets }] : [];
    });
    if (!completedExercises.length) {
      setSaveError('Complete at least one set with a valid weight and rep count before finishing.');
      setSaving(false);
      return;
    }
    const totalVol = completedExercises.flatMap((exercise) => exercise.sets).reduce((sum, set) => sum + set.weight_kg * set.reps, 0);
    const totalSetsCount = completedExercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
    const graph = { id: crypto.randomUUID(), date: sessionDateISO, split_type: splitType, split_day: splitDay, notes: '', duration_minutes: null, is_finished: true, exercises: completedExercises };
    const { error: saveError } = await supabase.rpc('sync_workout_graph', { p_workout: graph });
    if (saveError) {
      setSaveError(saveError.message || 'Failed to save workout. Nothing was recorded.');
      setSaving(false);
      return;
    }

    clearDraft(user.id);

    setCompletionData({ vol: totalVol, sets: totalSetsCount, prs: [] });
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
        `}</style>

        <div style={{ background:'rgba(48,209,88,0.1)', padding:'24px', borderRadius:'50%', marginBottom:'32px', animation:'scaleCheck 0.6s cubic-bezier(0.2,0.8,0.2,1) forwards' }}>
          <CheckCircle size={80} color="#30D158" />
        </div>
        <h1 style={{ fontSize:'42px', fontWeight:'800', margin:0, letterSpacing:'-1.5px', color:'white' }}>Workout Finished</h1>
        <p style={{ marginTop:'12px', fontSize:'18px', color:'var(--text-secondary)', fontWeight:'600', marginBottom:'40px', textAlign:'center' }}>
          Outstanding work. Keep pushing forward!
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
              setSessionStarted(false);
              setCompletedSetsCount(0);
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

  // ── MAIN SCREEN RENDER ────────────────────────────────────────────────────
  const currentEx = sessionExercises[activeExIdx];

  return (
    <div className="page-enter" style={{ position:'relative', paddingBottom:'calc(120px + env(safe-area-inset-bottom, 0px))' }}>
      <style>{`
        .date-chip { display:inline-flex; align-items:center; gap:7px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:100px; padding:7px 14px; cursor:pointer; transition:all 0.2s; user-select:none; }
        .date-chip:hover { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); }
        .date-chip.changed { border-color:var(--accent-color); background:rgba(0,122,255,0.1); }
        .date-input-hidden { position:absolute; opacity:0; pointer-events:none; width:1px; height:1px; }
        
        .sticky-footer-blur {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          padding: 16px 20px;
          padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
          background: rgba(10, 14, 20, 0.95);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255,255,255,0.08);
          z-index: 100;
          display: flex;
          gap: 12px;
          justify-content: center;
        }
        @media (min-width: 768px) {
          .sticky-footer-blur { left: 250px; padding-bottom: 20px; }
        }
        
        .set-row-input {
          background: transparent; border: none; color: #fff;
          font-size: 18px; font-weight: 800; outline: none;
          text-align: right; width: 100%; min-width: 0;
        }
        .pagination-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: rgba(255,255,255,0.15);
          transition: background 0.2s, transform 0.2s;
        }
        .pagination-dot.active {
          background: var(--accent-hover);
          transform: scale(1.2);
        }
      `}</style>

      {/* ── Background Hydration Tracker & Reminders ── */}
      <HydrationManager completedSetsCount={completedSetsCount} />

      {/* ── Background Workout Rest Timer ── */}
      <WorkoutTimer 
        activeExerciseName={activeExTimerName} 
        triggerCount={restTimerTrigger} 
        onSkip={() => {}} 
      />

      {/* ── Exercise Search Modal Overlay ── */}
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

      {/* ── TOP HEADER CHIPS ── */}
      <div style={{ marginTop:'8px', marginBottom:'16px' }}>
        {loopDayName && !sessionStarted && (
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'14px', padding:'6px 12px', background:'rgba(48,209,88,0.07)', border:'1px solid rgba(48,209,88,0.2)', borderRadius:'10px' }}>
            <Repeat size={12} color="#30D158" />
            <span style={{ fontSize:'11px', fontWeight:'700', color:'#30D158', letterSpacing:'1px', textTransform:'uppercase' }}>From your active program</span>
            {loopPreloading && <Loader2 size={12} color="#30D158" className="animate-spin" style={{ marginLeft:'auto' }} />}
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px', gap:'12px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', minWidth:0 }}>
            <h1 className="title" style={{ margin:0, fontSize:'24px', whiteSpace:'nowrap' }}>
              {sessionStarted ? 'Active Block' : 'Workout Builder'}
            </h1>
            {sessionExercises.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('Reset the current session?')) {
                    setSessionExercises([]);
                    setSessionStarted(false);
                    setCompletedSetsCount(0);
                    clearDraft(user?.id);
                    setSplitDay(effectiveDays[0] || 'Push');
                  }
                }}
                style={{ background:'transparent', border:'1px solid rgba(255,69,58,0.3)', color:'var(--error-color)', padding:'4px 8px', borderRadius:'6px', fontSize:'10px', fontWeight:'700', cursor:'pointer', flexShrink:0 }}
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
            <Calendar size={12} color={workoutDate !== todayLocalISO() ? 'var(--accent-hover)' : 'var(--text-secondary)'} />
            <span style={{ fontSize:'11px', fontWeight:'700', color: workoutDate !== todayLocalISO() ? 'var(--accent-hover)' : 'var(--text-secondary)', whiteSpace:'nowrap' }}>
              {formatDateLabel(workoutDate)}
            </span>
            <input ref={dateInputRef} type="date" className="date-input-hidden" value={workoutDate} max={todayLocalISO()} onChange={e => setWorkoutDate(e.target.value)} />
          </div>
        </div>

        {/* Builder selection dropdown elements */}
        {!sessionStarted && (
          <div className="glass" style={{ display:'flex', gap:'0', padding:'4px', borderRadius:'16px', alignItems:'center', marginBottom: '16px' }}>
            <Dropdown value={splitType} options={availableSplitKeys} onChange={handleSplitTypeChange} accentColor="var(--accent-color)" />
            <div style={{ width:'1px', background:'rgba(255,255,255,0.1)', height:'24px', flexShrink:0 }} />
            <Dropdown value={splitDay} options={effectiveDays.length > 0 ? effectiveDays : [splitDay || 'Custom']} onChange={setSplitDay} accentColor="white" />
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════ STAGE 1: BUILDER SCREEN */}
      {!sessionStarted ? (
        <div className="animate-fade-in">
          {sessionExercises.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-secondary)' }}>
              {loopPreloading
                ? <Loader2 size={40} color="rgba(255,255,255,0.2)" className="animate-spin" style={{ marginBottom:'16px' }} />
                : <Dumbbell size={48} color="rgba(255,255,255,0.1)" style={{ marginBottom:'16px' }} />
              }
              <p style={{ fontSize:'18px', fontWeight:'800', color:'white', letterSpacing:'-0.5px', margin:0 }}>
                {loopPreloading ? 'Preloading training split...' : 'Build your exercise schedule.'}
              </p>
              <p style={{ fontSize:'13px', marginTop:'6px', color:'var(--text-secondary)' }}>
                Add exercises below, then trigger Start Session.
              </p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px', marginBottom:'20px' }}>
              {sessionExercises.map((item, exIdx) => (
                <div key={exIdx} className="glass card" style={{ padding:'12px 16px', margin:0, borderRadius: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: '800', fontSize: '13px' }}>
                        {exIdx + 1}.
                      </span>
                      <h3 style={{ margin:0, color:'#fff', fontSize:'15px', fontWeight:'800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.exercise.name}
                      </h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '6px' }}>
                        {item.sets.length} Sets
                      </span>
                      <button
                        onClick={() => removeExercise(exIdx)}
                        style={{ background:'none', border:'none', padding:'6px', cursor:'pointer', color:'var(--text-secondary)' }}
                      >
                        <Trash size={14} color="var(--error-color)" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick Start Builder buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
            <button
              className="btn-secondary"
              onClick={() => setIsSearching(true)}
              style={{ width:'100%', padding:'12px', fontSize:'14px', borderRadius:'14px', display:'flex', justifyContent:'center', color:'white', fontWeight:'800', gap: '6px' }}
            >
              <Plus size={16} color="var(--accent-hover)" /> Add Exercise
            </button>
            
            {sessionExercises.length > 0 && (
              <button
                className="btn-primary animate-pulse"
                onClick={handleStartSession}
                style={{ width:'100%', padding:'15px', fontSize:'15px', borderRadius:'14px', display:'flex', justifyContent:'center', color:'white', fontWeight:'800', gap: '8px', boxShadow:'0 4px 20px rgba(0,122,255,0.25)' }}
              >
                <Play fill="currentColor" size={16} /> START SESSION
              </button>
            )}
          </div>
        </div>
      ) : (
        // ═══════════════════════════════════════════════════ STAGE 2: ACTIVE SESSION
        <div className="animate-fade-in">
          {/* Active pagination indicator dots */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Movement {activeExIdx + 1} of {sessionExercises.length}
            </span>
            <div style={{ display: 'flex', gap: '5px' }}>
              {sessionExercises.map((_, idx) => (
                <div key={idx} className={`pagination-dot ${idx === activeExIdx ? 'active' : ''}`} />
              ))}
            </div>
          </div>

          {currentEx ? (
            <div className="glass card animate-fade-in" style={{ padding: '0', overflow: 'hidden', margin: 0, borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
              
              {/* Exercise Card Title */}
              <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0, color: '#fff', fontSize: '18px', fontWeight: '800', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentEx.exercise.name}
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px', display: 'block' }}>
                    {currentEx.exercise.muscle_group}
                  </span>
                  
                  {/* Progression suggestion prompt */}
                  {currentEx.suggestedPerformance && (
                    <div style={{ fontSize: '11px', color: 'var(--accent-hover)', fontWeight: '700', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Zap size={10} fill="var(--accent-hover)" />
                      <span>{currentEx.suggestedPerformance}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {currentEx.sets.some(s => s.suggestedWeight || s.suggestedReps) && (
                    <button
                      onClick={() => autofillExerciseTargets(activeExIdx)}
                      style={{
                        background: 'rgba(37,99,235,0.1)',
                        border: '1px solid rgba(37,99,235,0.3)',
                        color: 'var(--accent-hover)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '10px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Zap size={10} /> Autofill
                    </button>
                  )}
                  
                  <button
                    onClick={() => removeExercise(activeExIdx)}
                    style={{ background: 'rgba(255,69,58,0.1)', border: 'none', padding: '6px', cursor: 'pointer', color: 'var(--error-color)', borderRadius: '8px' }}
                  >
                    <Trash size={13} />
                  </button>
                </div>
              </div>

              {/* Exercise Sets Listing */}
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '0 8px' }}>
                  <div style={{ width: '32px', fontSize: '10px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Set</div>
                  <div style={{ flex: 1, fontSize: '10px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', textAlign: 'right', paddingRight: '25px' }}>Weight (kg)</div>
                  <div style={{ flex: 1, fontSize: '10px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', textAlign: 'right', paddingRight: '15px' }}>Reps</div>
                  <div style={{ width: '40px', fontSize: '10px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', textAlign: 'center' }}>State</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {currentEx.sets.map((setInfo, setIdx) => {
                    const isRowCompleted = setInfo.completed;
                    
                    return (
                      <div 
                        key={setIdx} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px', 
                          background: isRowCompleted ? 'rgba(48,209,88,0.06)' : 'rgba(0,0,0,0.2)',
                          borderRadius: '12px',
                          padding: '6px 8px',
                          border: isRowCompleted 
                            ? '1px solid rgba(48,209,88,0.25)' 
                            : '1px solid rgba(255,255,255,0.04)',
                          transition: 'all 0.2s'
                        }}
                      >
                        {/* Set index number */}
                        <div style={{ width: '32px', fontWeight: '800', color: isRowCompleted ? '#30D158' : 'var(--text-secondary)', fontSize: '13px' }}>
                          {setIdx + 1}
                        </div>

                        {/* Weight input */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                          <input
                            type="number"
                            placeholder={setInfo.suggestedWeight || "0"}
                            value={setInfo.weight_kg}
                            onChange={e => updateSet(activeExIdx, setIdx, 'weight_kg', e.target.value)}
                            className="set-row-input"
                            disabled={isRowCompleted}
                            inputMode="decimal"
                            style={{ color: isRowCompleted ? '#30D158' : 'white' }}
                          />
                        </div>

                        {/* Multiplication cross sign */}
                        <span style={{ color: isRowCompleted ? '#30D158' : 'var(--text-secondary)', fontWeight: '800', fontSize: '12px' }}>×</span>

                        {/* Reps input */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                          <input
                            type="number"
                            placeholder={setInfo.suggestedReps || "0"}
                            value={setInfo.reps}
                            onChange={e => updateSet(activeExIdx, setIdx, 'reps', e.target.value)}
                            className="set-row-input"
                            disabled={isRowCompleted}
                            inputMode="numeric"
                            style={{ color: isRowCompleted ? '#30D158' : 'white' }}
                          />
                        </div>

                        {/* Trash remove set item (only if not completed) */}
                        {!isRowCompleted ? (
                          <button 
                            onClick={() => removeSet(activeExIdx, setIdx)} 
                            style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex', alignSelf: 'center' }}
                          >
                            <Trash size={13} color="rgba(255,255,255,0.2)" />
                          </button>
                        ) : (
                          <div style={{ width: '21px' }} />
                        )}

                        {/* Checklist completion checkmark button */}
                        <button
                          onClick={() => toggleSetComplete(activeExIdx, setIdx)}
                          disabled={setInfo.reps === ''}
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            border: isRowCompleted ? 'none' : '1px solid rgba(255,255,255,0.15)',
                            background: isRowCompleted ? '#30D158' : 'rgba(255,255,255,0.02)',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: setInfo.reps === '' ? 'not-allowed' : 'pointer',
                            opacity: setInfo.reps === '' ? 0.3 : 1,
                            transition: 'all 0.15s'
                          }}
                        >
                          {isRowCompleted && <Check size={14} strokeWidth={3} />}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button 
                    onClick={() => addSet(activeExIdx)} 
                    style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '10px', color: 'var(--text-secondary)', fontWeight: '700', cursor: 'pointer', fontSize: '12px' }}
                  >
                    + Add Set
                  </button>
                </div>
              </div>

            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
              No active exercise. Return to Builder to add some.
            </div>
          )}

          {/* Pagination Navigation row controls */}
          {sessionExercises.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', gap: '10px' }}>
              <button
                onClick={() => setActiveExIdx(prev => Math.max(0, prev - 1))}
                disabled={activeExIdx === 0}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '12px',
                  padding: '12px',
                  color: activeExIdx === 0 ? 'rgba(255,255,255,0.15)' : 'white',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: activeExIdx === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                <ArrowLeft size={14} /> Prev Exercise
              </button>
              
              <button
                onClick={() => setActiveExIdx(prev => Math.min(sessionExercises.length - 1, prev + 1))}
                disabled={activeExIdx === sessionExercises.length - 1}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '12px',
                  padding: '12px',
                  color: activeExIdx === sessionExercises.length - 1 ? 'rgba(255,255,255,0.15)' : 'white',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: activeExIdx === sessionExercises.length - 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Next Exercise <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {saveError && (
        <div style={{ marginTop:'14px', padding:'13px 18px', background:'rgba(255,69,58,0.08)', border:'1px solid rgba(255,69,58,0.3)', borderRadius:'14px', color:'var(--error-color)', fontSize:'13px', fontWeight:'600' }}>
          {saveError}
        </div>
      )}

      {/* ── STICKY FOOTER PREMIUM BLURRED GLASS ACTION AREA ── */}
      {sessionExercises.length > 0 && (
        <div className="sticky-footer-blur">
          {sessionStarted ? (
            <>
              <button
                className="btn-secondary"
                onClick={() => setIsSearching(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '100px', flex: 1, justifyContent: 'center' }}
              >
                <Plus size={16} /> Add Exercise
              </button>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saving}
                style={{ flex: 1.5, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', borderRadius: '100px', boxShadow:'0 4px 20px rgba(48,209,88,0.25)', background: 'linear-gradient(135deg, #30D158 0%, #1c9c38 100%)' }}
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                {saving ? 'Saving...' : 'Finish Workout'}
              </button>
            </>
          ) : (
            <>
              <button
                className="btn-secondary"
                onClick={() => setIsSearching(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '100px', flex: 1, justifyContent: 'center' }}
              >
                <Plus size={16} /> Add Exercise
              </button>
              <button
                className="btn-primary"
                onClick={handleStartSession}
                style={{ flex: 1.5, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', borderRadius: '100px', boxShadow:'0 4px 20px rgba(0,122,255,0.25)' }}
              >
                <Play fill="currentColor" size={14} /> Start Session
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

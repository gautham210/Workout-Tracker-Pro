import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Plus, Search, X, Dumbbell, Trash, Check, Loader2, CheckCircle, Zap, Calendar, Repeat } from 'lucide-react';
import Dropdown from '../components/Dropdown';

// Returns today as YYYY-MM-DD in local timezone
const todayLocalISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Format YYYY-MM-DD → "Mon, Feb 23"
const formatDateLabel = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const SPLITS_MAP = {
  "PPL": ["Push", "Pull", "Legs"],
  "Bro Split": ["Chest", "Back", "Shoulders", "Arms", "Legs"],
  "Upper / Lower": ["Upper", "Lower"],
  "Full Body": ["Full Body"]
};

const SPLIT_KEYS = ["PPL", "Bro Split", "Upper / Lower", "Full Body"];

export default function WorkoutActive() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  
  const [splitType, setSplitType] = useState('PPL');
  const [splitDay, setSplitDay] = useState('Push');
  const [sessionExercises, setSessionExercises] = useState([]);
  const [workoutDate, setWorkoutDate] = useState(todayLocalISO); // ← NEW
  const dateInputRef = useRef(null);                              // ← NEW

  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [isCompleteMode, setIsCompleteMode] = useState(false);
  const [completionData, setCompletionData] = useState({ vol: 0, sets: 0, prs: [] });

  // Loop template state
  const [loopPreloading, setLoopPreloading] = useState(false);
  const [loopDayName,    setLoopDayName]    = useState(null);
  const [lastWeights,    setLastWeights]    = useState({});
  const [loopTrigger,    setLoopTrigger]    = useState(0); // increment to re-run preload

  // Focus Mode
  useEffect(() => {
    document.body.style.background = '#06090c';
    return () => { document.body.style.background = 'var(--bg-color)'; };
  }, []);

  // ── Loop template preload ──────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.active_loop || !user) return;
    const loop = profile.active_loop;
    const days = loop.days ?? [];
    if (!days.length) return;

    // Determine today's slot
    const start   = new Date(loop.start_date ?? new Date());
    start.setHours(0, 0, 0, 0);
    const today   = new Date(); today.setHours(0, 0, 0, 0);
    const elapsed = Math.floor((today - start) / 86_400_000);
    const slot    = days[elapsed % days.length];

    // slot may be { name, exercises } (new format) or a plain string (legacy)
    const dayName    = typeof slot === 'object' ? slot.name    : slot;
    const exerciseIds= typeof slot === 'object' ? (slot.exercises ?? []) : [];

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

      // 1. Fetch exercise details
      const { data: exRows } = await supabase
        .from('exercises')
        .select('id, name, muscle_group')
        .in('id', exerciseIds);

      console.log('[LOOP PRELOAD] exercises:', exRows?.length);

      // 2. For each exercise fetch last weight used
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

      // 3. Build sessionExercises — 4 sets for first, 3 for rest
      const orderedExercises = exerciseIds
        .map(id => exRows?.find(e => e.id === id))
        .filter(Boolean);

      const built = orderedExercises.map((ex, i) => {
        const last    = weightMap[ex.id];
        const setCount= i === 0 ? 4 : 3;
        const sets    = Array.from({ length: setCount }, () => ({
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

  const handleSplitTypeChange = (newType) => {
    setSplitType(newType);
    const seq = SPLITS_MAP[newType];
    if (seq && seq.length > 0) setSplitDay(seq[0]);
    else setSplitDay('');
  };

  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      setIsSearchLoading(false);
      return;
    }
    setIsSearchLoading(true);
    setSearchError(null);
    const searchExercises = async () => {
      const { data, error } = await supabase.from('exercises').select('*').ilike('name', `%${searchQuery}%`).limit(20);
      if (error) setSearchError(error.message);
      else setSearchResults(data || []);
      setIsSearchLoading(false);
    };
    const timer = setTimeout(searchExercises, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const closeSearch = () => { setIsSearching(false); setSearchQuery(''); setSearchResults([]); setSearchError(null); };

  const addExercise = (exercise) => {
    setSessionExercises(prev => {
      const isFirst = prev.length === 0;
      const setCount = isFirst ? 4 : 3;
      const initialSets = Array.from({ length: setCount }, () => ({ weight_kg: '', reps: '15' }));
      return [...prev, { exercise, sets: initialSets, fromLoop: false }];
    });
    closeSearch();
  };

  const addSet = (exIndex) => {
    setSessionExercises(prev => prev.map((item, i) => {
      if (i !== exIndex) return item;
      const lastSet = item.sets[item.sets.length - 1];
      return { 
        ...item, 
        sets: [...item.sets, { weight_kg: lastSet ? lastSet.weight_kg : '', reps: '' }] 
      };
    }));
  };

  const updateSet = (exIndex, setIndex, field, value) => {
    let val = value;
    if (val !== '') {
      const num = parseFloat(val);
      if (field === 'weight_kg') {
        if (num > 300) val = '300';
        else if (num < 0) val = '0';
      }
      if (field === 'reps') {
        if (num > 50) val = '50';
        else if (num < 1) val = '1';
      }
    }
    setSessionExercises(prev => prev.map((item, i) => {
      if (i !== exIndex) return item;
      return {
        ...item,
        sets: item.sets.map((set, j) => {
          if (j !== setIndex) return set;
          return { ...set, [field]: val };
        })
      };
    }));
  };

  const removeSet = (exIndex, setIndex) => {
    setSessionExercises(prev => prev.map((item, i) => {
      if (i !== exIndex) return item;
      return {
        ...item,
        sets: item.sets.filter((_, j) => j !== setIndex)
      };
    }));
  };

  const removeExercise = (exIndex) => {
    setSessionExercises(prev => prev.filter((_, i) => i !== exIndex));
  };

  const handleSave = async () => {
    if (sessionExercises.length === 0) return;
    setSaving(true);
    setSaveError(null);

    // Use selected date (local YYYY-MM-DD) stored at noon to avoid TZ edge cases
    const [y, m, d] = workoutDate.split('-').map(Number);
    const sessionDateISO = new Date(y, m - 1, d, 12, 0, 0).toISOString();

    const { data: sessionData, error: sessionError } = await supabase
      .from('workout_sessions')
      .insert({
        user_id: user.id,
        date: sessionDateISO,
        split_type: splitType,
        split_day: splitDay,
        notes: ''
      })
      .select().single();

    console.log('[WORKOUT SAVE] session insert:', { sessionData, error: sessionError?.message });

    if (sessionError || !sessionData) {
      setSaveError(sessionError?.message ?? 'Failed to save session.');
      setSaving(false);
      return;
    }

    let totalVol = 0;
    let totalSetsCount = 0;
    let prsFound = [];

    // Save Exercises and check PRs dynamically
    for (let i = 0; i < sessionExercises.length; i++) {
        const item = sessionExercises[i];
        
        let currentExVol = 0;
        let currentMaxW = 0;
        let currentMaxRAtW = 0;
        
        item.sets.forEach(s => {
           if (s.reps === '') return;
           const w = parseFloat(s.weight_kg) || 0;
           const r = parseInt(s.reps, 10) || 0;
           currentExVol += (w * r);
           totalVol += (w * r);
           totalSetsCount++;
           
           if (w > currentMaxW) { currentMaxW = w; currentMaxRAtW = r; }
           else if (w === currentMaxW && r > currentMaxRAtW) { currentMaxRAtW = r; }
        });

        // Compute PR logic safely
        const { data: pastExData } = await supabase.from('session_exercises')
           .select('sets(weight_kg, reps), workout_sessions!inner(user_id, date)')
           .eq('workout_sessions.user_id', user.id)
           .eq('exercise_id', item.exercise.id)
           .order('workout_sessions.date', { ascending: false })
           .limit(1).single();

        if (pastExData && pastExData.sets && pastExData.sets.length > 0) {
           let pastVol = 0; let pastMaxW = 0; let pastMaxRAtW = 0;
           pastExData.sets.forEach(ps => {
              const pw = parseFloat(ps.weight_kg)||0;
              const pr = parseInt(ps.reps)||0;
              pastVol += (pw * pr);
              if (pw > pastMaxW) { pastMaxW = pw; pastMaxRAtW = pr; }
              else if (pw === pastMaxW && pr > pastMaxRAtW) { pastMaxRAtW = pr; }
           });
           
           if (currentMaxW > pastMaxW) {
              prsFound.push({ exercise: item.exercise.name, type: 'STR', val: `+${currentMaxW - pastMaxW}kg` });
           } else if (currentMaxW === pastMaxW && currentMaxRAtW > pastMaxRAtW) {
              prsFound.push({ exercise: item.exercise.name, type: 'REP', val: `+${currentMaxRAtW - pastMaxRAtW} reps` });
           } else if (currentExVol > pastVol) {
              prsFound.push({ exercise: item.exercise.name, type: 'VOL', val: `+${Math.round(currentExVol - pastVol)}kg Vol` });
           }
        }

        const { data: seData } = await supabase.from('session_exercises')
          .insert({ session_id: sessionData.id, exercise_id: item.exercise.id, order_index: i })
          .select().single();
          
        if (seData && item.sets.length > 0) {
            const validSets = item.sets.filter(s => s.reps !== '');
            if (validSets.length > 0) {
                const setsToInsert = validSets.map((s, idx) => ({
                    session_exercise_id: seData.id,
                    set_number: idx + 1,
                    weight_kg: s.weight_kg ? parseFloat(s.weight_kg) : 0,
                    reps: parseInt(s.reps, 10) || 0
                }));
                await supabase.from('sets').insert(setsToInsert);
            }
        }
    }

    setCompletionData({ vol: totalVol, sets: totalSetsCount, prs: prsFound });
    setSaving(false);
    setIsCompleteMode(true);
  };

  if (isCompleteMode) {
     return (
       <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: '#0b0f14', display: 'flex', flexDirection: 'column', padding: '24px', alignItems: 'center', justifyContent: 'center' }}>
          <style>
            {`
              @keyframes scaleCheck { 0% { transform: scale(0.5); opacity: 0; box-shadow: 0 0 0 rgba(48,209,88,0); } 70% { transform: scale(1.1); box-shadow: 0 0 60px rgba(48,209,88,0.4); } 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 40px rgba(48,209,88,0.2); } }
              .pr-badge { animation: prPop 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
              @keyframes prPop { 0% { opacity: 0; transform: translateY(10px) scale(0.9); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
              .stagger-1 { animation: prPop 0.4s ease forwards 100ms; opacity: 0; }
              .stagger-2 { animation: prPop 0.4s ease forwards 200ms; opacity: 0; }
              .stagger-3 { animation: prPop 0.4s ease forwards 300ms; opacity: 0; }
            `}
          </style>
          
          <div style={{ background: 'rgba(48, 209, 88, 0.1)', padding: '24px', borderRadius: '50%', marginBottom: '32px', animation: 'scaleCheck 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards' }}>
             <CheckCircle size={80} color="#30D158" />
          </div>
          <h1 style={{ fontSize: '42px', fontWeight: '800', margin: 0, letterSpacing: '-1.5px', color: 'white', animation: 'pageFadeIn 0.4s ease forwards' }}>Session Complete.</h1>
          <p style={{ marginTop: '12px', fontSize: '18px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '48px', animation: 'pageFadeIn 0.4s ease forwards 50ms' }}>You showed up. That’s what matters.</p>

          <div className="glass card stagger-1" style={{ width: '100%', maxWidth: '400px', display: 'flex', justifyContent: 'space-between', padding: '24px' }}>
             <div style={{ textAlign: 'center' }}>
               <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '1px', fontWeight: '700', marginBottom: '8px' }}>Volume</div>
               <div style={{ fontSize: '24px', fontWeight: '800', color: '#fff' }}>{Math.round(completionData.vol).toLocaleString()} <span style={{fontSize: '14px', color: 'var(--text-secondary)'}}>kg</span></div>
             </div>
             <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
             <div style={{ textAlign: 'center' }}>
               <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '1px', fontWeight: '700', marginBottom: '8px' }}>Sets</div>
               <div style={{ fontSize: '24px', fontWeight: '800', color: '#fff' }}>{completionData.sets}</div>
             </div>
             <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
          </div>

          {completionData.prs.length > 0 && (
             <div className="stagger-2" style={{ maxWidth: '400px', width: '100%', marginBottom: '40px' }}>
               <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: '800', marginBottom: '16px', textAlign: 'center' }}>New Milestones</h3>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 {completionData.prs.map((pr, idx) => (
                    <div key={idx} className="glass pr-badge" style={{ padding: '16px', borderLeft: '4px solid #30D158', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Zap size={18} color="#30D158" style={{ filter: 'drop-shadow(0 0 10px rgba(48,209,88,0.5))' }} />
                          <span style={{ fontWeight: '800', fontSize: '16px', color: 'white' }}>{pr.exercise}</span>
                       </div>
                       <div style={{ background: 'rgba(48,209,88,0.1)', color: '#30D158', padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {pr.type} <span style={{ opacity: 0.5 }}>|</span> {pr.val}
                       </div>
                    </div>
                 ))}
               </div>
             </div>
          )}

          <div className="stagger-3" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '400px', marginTop: completionData.prs.length > 0 ? '0' : '40px' }}>
             <button
               className="btn-primary interactive-card"
               onClick={() => {
                 let nextDay = splitDay;
                 if (!profile?.active_loop) {
                   if (profile?.custom_split?.length > 0 && splitType === 'Custom') {
                     const idx = profile.custom_split.indexOf(splitDay);
                     nextDay = profile.custom_split[(idx + 1) % profile.custom_split.length] || profile.custom_split[0];
                   } else if (SPLITS_MAP[splitType]) {
                     const days = SPLITS_MAP[splitType];
                     const idx = days.indexOf(splitDay);
                     nextDay = days[(idx + 1) % days.length] || days[0];
                   }
                 }
                 setIsCompleteMode(false);
                 setSessionExercises([]);
                 setWorkoutDate(todayLocalISO());
                 setSplitDay(nextDay);
                 setSaveError(null);
                 if (profile?.active_loop) {
                   setLoopTrigger(prev => prev + 1);
                 }
               }}
               style={{ padding: '20px', borderRadius: '16px', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
             >
               <Repeat size={20} /> Next Workout &rarr;
             </button>
             <button className="btn-primary interactive-card" onClick={() => navigate('/analytics')} style={{ padding: '20px', borderRadius: '16px', fontSize: '18px' }}>View Analytics</button>
             <button className="btn-secondary interactive-card" onClick={() => navigate('/')} style={{ padding: '20px', borderRadius: '16px', fontSize: '18px' }}>Dashboard</button>
          </div>
       </div>
     )
  }

  return (
    <div className="page-enter" style={{ position: 'relative', paddingBottom: '120px' }}>
      <style>
        {`
          @keyframes spinKey { 100% { transform: rotate(360deg); } }
          .animate-spin { animation: spinKey 1s linear infinite; }
          .focus-input { appearance: none; background: transparent; border: none; color: white; outline: none; font-weight: 800; font-size: 24px; padding: 12px 16px; border-radius: 16px; transition: all 0.2s; }
          .focus-input:hover { background: rgba(255,255,255,0.05); }
          .focus-input option { background: var(--bg-color); color: white; }
          .date-chip { display:inline-flex; align-items:center; gap:7px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:100px; padding:7px 16px; cursor:pointer; transition:all 0.2s; user-select:none; }
          .date-chip:hover { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); }
          .date-chip.changed { border-color:var(--accent-color); background:rgba(0,122,255,0.1); }
          .date-input-hidden { position:absolute; opacity:0; pointer-events:none; width:1px; height:1px; }
        `}
      </style>

      {/* Focus Mode Rest of UI preserved safely... */}
      {isSearching && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: 'rgba(6, 9, 12, 0.95)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '24px', display: 'flex', justifyContent: 'flex-end', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
             <button onClick={closeSearch} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '50%', width: '48px', height: '48px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={24} /></button>
          </div>
          <div style={{ padding: '0 20px', maxWidth: '800px', margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 className="title" style={{ textAlign: 'center', fontSize: '32px' }}>Library</h2>
            <div className="glass" style={{ borderRadius: '24px', padding: '8px 24px', display: 'flex', alignItems: 'center', marginBottom: '24px', border: '1px solid rgba(0, 122, 255, 0.4)' }}>
               <Search size={28} color="var(--accent-color)" />
               <input autoFocus type="text" placeholder="Search movements..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ border: 'none', background: 'transparent', padding: '18px 20px', fontSize: '20px', flex: 1, color: 'white', outline: 'none' }} />
               {isSearchLoading && <Loader2 className="animate-spin" size={24} color="var(--text-secondary)" />}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>
               {searchResults.length > 0 && (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                   {searchResults.map((ex, idx) => (
                     <div key={ex.id} className="glass interactive-card" style={{ padding: '24px', cursor: 'pointer', margin: 0 }} onClick={() => addExercise(ex)}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                         <div style={{ fontWeight: '800', fontSize: '22px', color: 'white' }}>{ex.name}</div>
                       </div>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ color: 'var(--text-secondary)', fontWeight: '700', fontSize: '15px' }}>{ex.muscle_group}</span></div>
                     </div>
                   ))}
                 </div>
               )}
            </div>
          </div>
        </div>
      )}

      {/* Main Focus UI */}
      <div style={{ marginTop: '16px', marginBottom: '32px' }}>
        {/* Loop program banner */}
        {loopDayName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', padding: '8px 14px', background: 'rgba(48,209,88,0.07)', border: '1px solid rgba(48,209,88,0.2)', borderRadius: '10px' }}>
            <Repeat size={13} color="#30D158" />
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#30D158', letterSpacing: '1px', textTransform: 'uppercase' }}>From your active program</span>
            {loopPreloading && <Loader2 size={13} color="#30D158" className="animate-spin" style={{ marginLeft: 'auto' }} />}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h1 className="title" style={{ margin: 0 }}>Active Block</h1>
            {sessionExercises.length > 0 && (
              <button 
                onClick={() => {
                  if(window.confirm("Are you sure you want to reset the current session?")) {
                    setSessionExercises([]);
                    setSplitDay(SPLITS_MAP[splitType]?.[0] || 'Custom');
                  }
                }}
                style={{ background: 'transparent', border: '1px solid rgba(255,69,58,0.3)', color: 'var(--error-color)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
              >
                Reset Session
              </button>
            )}
          </div>

          {/* ── Inline date chip ── */}
          <div
            className={`date-chip${workoutDate !== todayLocalISO() ? ' changed' : ''}`}
            onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
            title="Tap to change session date"
          >
            <Calendar size={14} color={workoutDate !== todayLocalISO() ? 'var(--accent-hover)' : 'var(--text-secondary)'} />
            <span style={{ fontSize: '13px', fontWeight: '700', color: workoutDate !== todayLocalISO() ? 'var(--accent-hover)' : 'var(--text-secondary)' }}>
              {formatDateLabel(workoutDate)}
            </span>
            {/* Hidden native date input */}
            <input
              ref={dateInputRef}
              type="date"
              className="date-input-hidden"
              value={workoutDate}
              max={todayLocalISO()}
              onChange={e => setWorkoutDate(e.target.value)}
            />
          </div>
        </div>
        <div className="glass" style={{ display: 'flex', gap: '0', padding: '4px', borderRadius: '24px', alignItems: 'center' }}>

          {/* Split type */}
          <Dropdown
            value={splitType}
            options={SPLIT_KEYS}
            onChange={handleSplitTypeChange}
            accentColor="var(--accent-color)"
          />

          <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', height: '32px', flexShrink: 0 }} />

          {/* Split day */}
          <Dropdown
            value={splitDay}
            options={SPLITS_MAP[splitType] ?? ['Custom']}
            onChange={setSplitDay}
            accentColor="white"
          />

        </div>
      </div>

      {sessionExercises.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '100px 0', color: 'var(--text-secondary)' }}>
          {loopPreloading
            ? <Loader2 size={48} color="rgba(255,255,255,0.2)" className="animate-spin" style={{ marginBottom: '24px' }} />
            : <Dumbbell size={64} color="rgba(255,255,255,0.1)" style={{ marginBottom: '24px' }} />
          }
          <p style={{ fontSize: '24px', fontWeight: '800', color: 'white', letterSpacing: '-0.5px' }}>
            {loopPreloading ? 'Loading your program...' : "Let's build something strong today."}
          </p>
        </div>
      ) : (
        <div style={{ marginBottom: '24px' }}>
          {sessionExercises.map((item, exIdx) => (
            <div key={exIdx} className="glass card animate-fade-in" style={{ padding: '0', overflow: 'hidden' }}>
              <div className="flex-between" style={{ padding: '24px', background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#fff', fontSize: '22px', fontWeight: '800' }}>{item.exercise.name}</h3>
                  {item.fromLoop && lastWeights[item.exercise.id] && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginTop: '4px' }}>
                      Last: {lastWeights[item.exercise.id].weight}kg × {lastWeights[item.exercise.id].reps}
                    </div>
                  )}
                </div>
                <button className="btn-ghost" onClick={() => removeExercise(exIdx)} style={{ padding: '8px', color: 'var(--text-secondary)' }}><X size={20} /></button>
              </div>

              <div style={{ padding: '20px 24px' }}>
                {item.sets.map((setInfo, setIdx) => (
                  <div key={setIdx} style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ width: '40px', fontWeight: '800', color: 'var(--text-secondary)', fontSize: '15px' }}>S{setIdx + 1}</div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.4)', borderRadius: '16px', padding: '6px 16px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <input type="number" placeholder="0" value={setInfo.weight_kg} onChange={(e) => updateSet(exIdx, setIdx, 'weight_kg', e.target.value)} style={{ width: '50%;', flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: '22px', fontWeight: '800', outline: 'none', textAlign: 'right' }} />
                      <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '14px', marginRight: '16px', fontWeight: '700' }}>kg</span>
                      <span style={{ color: 'var(--accent-hover)', fontWeight: '800', fontSize: '18px' }}>×</span>
                      <input type="number" placeholder="0" value={setInfo.reps} onChange={(e) => updateSet(exIdx, setIdx, 'reps', e.target.value)} style={{ width: '50%', flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: '22px', fontWeight: '800', outline: 'none', textAlign: 'right' }} />
                      <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '14px', fontWeight: '700' }}>reps</span>
                    </div>
                    <button onClick={() => removeSet(exIdx, setIdx)} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', display: 'flex' }}><Trash size={18} color="var(--error-color)" /></button>
                  </div>
                ))}
                
                <button onClick={() => addSet(exIdx)} style={{ width: '100%', padding: '16px', background: 'transparent', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: '16px', color: 'var(--text-secondary)', fontWeight: '700', cursor: 'pointer', marginTop: '12px' }}>+ Add Telemetry Set</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="btn-secondary interactive-card" onClick={() => setIsSearching(true)} style={{ width: '100%', border: '1px solid rgba(0,122,255,0.3)', background: 'rgba(0, 122, 255, 0.05)', padding: '24px', fontSize: '18px', display: 'flex', justifyContent: 'center', color: 'white', fontWeight: '800', borderRadius: '24px' }}>
        <Plus size={24} color="var(--accent-hover)" style={{ marginRight: '8px' }} /> Expand Protocol
      </button>

      {/* Inline save error */}
      {saveError && (
        <div style={{ marginTop: '16px', padding: '14px 20px', background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: '14px', color: 'var(--error-color)', fontSize: '14px', fontWeight: '600' }}>
          {saveError}
        </div>
      )}

      {sessionExercises.length > 0 && (
         <div style={{ position: 'fixed', bottom: '110px', left: '0', right: '0', padding: '0 20px', zIndex: 50, display: 'flex', justifyContent: 'center', pointerEvents: 'none', maxWidth: '1100px', margin: '0 auto' }}>
           <button className="btn-primary" style={{ padding: '20px 48px', fontSize: '20px', borderRadius: '100px', pointerEvents: 'auto', display: 'flex', gap: '12px', minWidth: '300px' }} onClick={handleSave} disabled={saving}>
             {saving ? <Loader2 className="animate-spin" /> : <Check size={24} />} {saving ? 'Saving...' : 'Conclude Session'}
           </button>
         </div>
      )}
    </div>
  );
}

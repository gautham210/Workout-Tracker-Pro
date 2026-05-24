import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  Upload, Sparkles, Loader2, Check, AlertTriangle,
  ChevronDown, X, Zap, Calendar, Dumbbell, ArrowRight,
  ClipboardPaste, RotateCcw, CheckCircle,
} from 'lucide-react';

// ── Example placeholder text ──────────────────────────────────────────────────
const EXAMPLE_TEXT = `Monday Push - March 3
Flat db
30kg x12
32.5kg x10
35kg x8

Wednesday Legs - March 5
Curls
40kg x15
45kg x12

Friday Pull - March 7
Latpulldown steelwide
50kg x12
55kg x10`;

// ── Step definitions ──────────────────────────────────────────────────────────
const STEPS = ['paste', 'parsing', 'clarify', 'preview', 'saving', 'done'];

// ── Global Standard Seed Exercises (Synonyms, aliases, type categories) ───────
const STANDARD_SEED_EXERCISES = [
  { name: 'Reverse Fly', muscle_group: 'Shoulders', type: 'Rear Delt Fly, Back, Shoulders' },
  { name: 'Dumbbell Reverse Fly', muscle_group: 'Shoulders', type: 'Rear Delt Fly, Back, Shoulders' },
  { name: 'Pec Deck Rear Delt Fly', muscle_group: 'Shoulders', type: 'Rear Delt Fly, Back, Shoulders' },
  { name: 'Lat Pulldown', muscle_group: 'Back', type: 'Lats, Pull, Back' },
  { name: 'Wide Grip Lat Pulldown', muscle_group: 'Back', type: 'Lats, Pull, Back' },
  { name: 'Close Grip Lat Pulldown', muscle_group: 'Back', type: 'Lats, Pull, Back' },
  { name: 'Flat Dumbbell Press', muscle_group: 'Chest', type: 'Chest, Push, Flat db' },
  { name: 'Incline Dumbbell Press', muscle_group: 'Chest', type: 'Chest, Push, Incline db' },
  { name: 'Flat Barbell Bench Press', muscle_group: 'Chest', type: 'Chest, Push, Bench Press' },
  { name: 'Incline Barbell Bench Press', muscle_group: 'Chest', type: 'Chest, Push, Incline Bench' },
  { name: 'Leg Curl', muscle_group: 'Legs', type: 'Hamstrings, Legs, Curls' },
  { name: 'Bicep Curl', muscle_group: 'Arms', type: 'Biceps, Arms, Curls' },
  { name: 'Barbell Curl', muscle_group: 'Arms', type: 'Biceps, Arms' },
  { name: 'Dumbbell Bicep Curl', muscle_group: 'Arms', type: 'Biceps, Arms' },
  { name: 'Hammer Curl', muscle_group: 'Arms', type: 'Biceps, Arms' },
  { name: 'Overhead Tricep Extension', muscle_group: 'Arms', type: 'Triceps, Arms, Overhead Extension' },
  { name: 'Dumbbell Overhead Tricep Extension', muscle_group: 'Arms', type: 'Triceps, Arms' },
  { name: 'Chest Fly', muscle_group: 'Chest', type: 'Chest, Push, Flys' },
  { name: 'Dumbbell Chest Fly', muscle_group: 'Chest', type: 'Chest, Push, Flys' },
  { name: 'Pec Deck Chest Fly', muscle_group: 'Chest', type: 'Chest, Push, Flys' },
  { name: 'Lateral Raise', muscle_group: 'Shoulders', type: 'Side Delts, Shoulders' },
  { name: 'Dumbbell Lateral Raise', muscle_group: 'Shoulders', type: 'Side Delts, Shoulders' },
  { name: 'Cable Lateral Raise', muscle_group: 'Shoulders', type: 'Side Delts, Shoulders' },
  { name: 'Barbell Squat', muscle_group: 'Legs', type: 'Quads, Legs' },
  { name: 'Leg Press', muscle_group: 'Legs', type: 'Quads, Legs' },
  { name: 'Barbell Deadlift', muscle_group: 'Back', type: 'Hamstrings, Back, Lower Back' },
  { name: 'Romanian Deadlift', muscle_group: 'Legs', type: 'Hamstrings, Legs, RDL' },
  { name: 'Dumbbell Row', muscle_group: 'Back', type: 'Lats, Back, Rows' },
  { name: 'Barbell Row', muscle_group: 'Back', type: 'Lats, Back, Rows' },
  { name: 'Seated Cable Row', muscle_group: 'Back', type: 'Lats, Back, Rows' },
  { name: 'Seated Calf Raise', muscle_group: 'Legs', type: 'Calves, Legs' },
  { name: 'Standing Calf Raise', muscle_group: 'Legs', type: 'Calves, Legs' },
  { name: 'Seated Calf - 30kg x3', muscle_group: 'Legs', type: 'Calves, Legs' },
  { name: 'Overhead Shoulder Press', muscle_group: 'Shoulders', type: 'Front Delts, Shoulders' },
  { name: 'Dumbbell Shoulder Press', muscle_group: 'Shoulders', type: 'Front Delts, Shoulders' },
  { name: 'Arnold Press', muscle_group: 'Shoulders', type: 'Shoulders, Press' },
  { name: 'Tricep Rope Pushdown', muscle_group: 'Arms', type: 'Triceps, Arms' },
  { name: 'Tricep Pushdown', muscle_group: 'Arms', type: 'Triceps, Arms' },
  { name: 'Dips', muscle_group: 'Arms', type: 'Triceps, Chest, Bodyweight' },
  { name: 'Pullups', muscle_group: 'Back', type: 'Lats, Back, Bodyweight' },
  { name: 'Pushups', muscle_group: 'Chest', type: 'Chest, Push, Bodyweight' },
  { name: 'Cable Crossover', muscle_group: 'Chest', type: 'Chest, Flys' },
  { name: 'Face Pulls', muscle_group: 'Shoulders', type: 'Rear Delts, Shoulders, Back' }
];

// ── Confidence badge color ────────────────────────────────────────────────────
function confidenceColor(c) {
  if (c >= 0.9) return '#30D158';
  if (c >= 0.7) return '#FF9F0A';
  return '#FF453A';
}

function confidenceLabel(c) {
  if (c >= 0.9) return 'High';
  if (c >= 0.7) return 'Medium';
  return 'Low';
}

// ── Human-friendly Parsed Date Formatter ──────────────────────────────────────
function formatParsedDate(dateStr, splitVal, index) {
  if (!dateStr) {
    return `${splitVal || 'Workout'} Day ${index + 1}`;
  }

  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
  } catch (e) {}

  return `${splitVal ? `${splitVal} — ` : ''}${dateStr}`;
}

// ── Smart Exercise Candidate Validation ──────────────────────────────────────
function isLikelyExerciseName(name) {
  if (!name || typeof name !== 'string') return false;
  const clean = name.trim().toLowerCase();
  
  if (clean.length < 3) return false;
  
  // 1. Blacklist exact words or patterns
  const blacklist = new Set([
    'mid', 'close', 'normal', 'standing', 'seated', 'flat', 'incline', 'decline',
    'legs', 'push', 'pull', 'arms', 'chest', 'back', 'shoulders', 'biceps', 'triceps',
    'day', 'workout', 'session', 'date', 'split', 'week', 'warmup', 'warm-up',
    'heavy', 'light', 'max', 'failure', 'drop', 'dropset', 'set', 'sets', 'reps',
    'cardio', 'weight', 'weights', 'kg', 'lbs', 'lbs.', 'amrap'
  ]);
  
  if (blacklist.has(clean)) return false;
  
  // 2. Reject pure numeric or pure weight/rep structures (e.g. "10kg 10kg 15kg", "20 incline", "10 10 12")
  const numericWeightNoiseRegex = /^[0-9\s.,kglbsx*+\/-]+$/i;
  if (numericWeightNoiseRegex.test(clean)) return false;
  
  // Check if it starts with a number followed only by a few noise words (e.g., "20 incline", "30 flat")
  const numThenModifierRegex = /^\d+\s*(?:incline|decline|flat|seated|standing|heavy|light|kg|lbs|lbs.)?$/i;
  if (numThenModifierRegex.test(clean)) return false;

  // 3. Blacklist of patterns (e.g. "pull day 5", "day 3")
  if (/\b(?:day|workout|session|split|week)\s*\d+/i.test(clean)) return false;
  if (/\d+\s*(?:day|workout|session|split|week)/i.test(clean)) return false;

  // 4. Token list analysis
  const tokens = clean.split(/[\s_\-\/]+/).filter(Boolean);
  if (tokens.length === 0) return false;
  
  // If it's a single word (single token), it MUST be a recognized exercise keyword or derivative.
  const exerciseKeywords = new Set([
    'press', 'bench', 'fly', 'flys', 'curl', 'curls', 'squat', 'squats', 'deadlift', 'deadlifts',
    'row', 'rows', 'pulldown', 'pulldowns', 'raise', 'raises', 'extension', 'extensions', 'pushdown', 'pushdowns',
    'dip', 'dips', 'pullup', 'pullups', 'pushup', 'pushups', 'chinup', 'chinups', 'lunge', 'lunges',
    'presses', 'shrug', 'shrugs', 'crunch', 'crunches', 'plank', 'planks', 'run', 'cardio', 'walk', 'cycle',
    'crossover', 'covers', 'facepull', 'facepulls', 'pec', 'deck', 'cable', 'barbell', 'dumbbell', 'db', 'bb',
    'lateral', 'front', 'rear', 'overhead', 'skullcrusher', 'skullcrushers', 'clean', 'jerk', 'snatch'
  ]);
  
  if (tokens.length === 1) {
    const t = tokens[0];
    const isKnownKeyword = exerciseKeywords.has(t) || 
                           (t.endsWith('s') && exerciseKeywords.has(t.slice(0, -1))) ||
                           (t.endsWith('es') && exerciseKeywords.has(t.slice(0, -2)));
    if (!isKnownKeyword) {
      return false;
    }
  }
  
  // 5. Ensure it contains at least one non-noise token
  const noiseAdjectives = new Set([
    'max', 'incline', 'no', 'weight', 'heavy', 'light', 'set', 'sets', 'rep', 'reps', 'kg', 'lbs'
  ]);
  const nonNoiseTokens = tokens.filter(t => !noiseAdjectives.has(t) && !blacklist.has(t));
  if (nonNoiseTokens.length === 0) return false;

  return true;
}

// ── Boundary Detection Splitter Chunker ───────────────────────────────────────
function chunkRawWorkoutText(rawText) {
  const lines = rawText.split('\n');
  const chunks = [];
  let currentChunk = [];
  let currentSplit = 'Custom';
  let currentDate = null;

  const splitRegex = /\b(push|pull|legs|upper|lower|full\s*body|chest|back|shoulders|arms|biceps|triceps|cardio)\b/i;
  const dateRegex = /\b(\d{1,2}[-\/.]\d{1,2}[-\/.]?\d{0,4})|((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:\s+\d{4})?)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  const dayMarkerRegex = /\b(day\s+\d+|workout\s+\d+|session\s+\d+)\b/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (currentChunk.length > 0) {
        currentChunk.push(lines[i]);
      }
      continue;
    }

    const isSplit = splitRegex.test(line);
    const isDate = dateRegex.test(line);
    const isDayMarker = dayMarkerRegex.test(line);

    if ((isDate || isSplit || isDayMarker) && currentChunk.filter(l => l.trim()).length > 0) {
      chunks.push({
        rawChunk: currentChunk.join('\n').trim(),
        date: currentDate,
        split: currentSplit
      });
      currentChunk = [];
      // STRICT SESSION ISOLATION: reset context for the next chunk segment
      currentDate = null;
      currentSplit = 'Custom';
    }

    if (isDate || isSplit || isDayMarker) {
      const dateMatch = line.match(dateRegex);
      if (dateMatch) {
        currentDate = dateMatch[0];
      }
      
      const splitMatch = line.match(splitRegex);
      if (splitMatch) {
        currentSplit = splitMatch[0].charAt(0).toUpperCase() + splitMatch[0].slice(1).toLowerCase();
      }
    }

    currentChunk.push(lines[i]);
  }

  if (currentChunk.filter(l => l.trim()).length > 0) {
    chunks.push({
      rawChunk: currentChunk.join('\n').trim(),
      date: currentDate,
      split: currentSplit
    });
  }

  if (chunks.length === 0) {
    chunks.push({
      rawChunk: rawText.trim(),
      date: null,
      split: 'Custom'
    });
  }

  return chunks;
}

// ── Searchable Autocomplete selector Dropdown (Combobox) ─────────────────────
function ExerciseSearchSelector({ value, onChange, allDbExercises }) {
  const [search, setSearch] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Premium fuzzy search including synonyms, aliases, keywords, typo bounds
  const getFilteredExercises = () => {
    if (!search.trim()) return allDbExercises.slice(0, 8);
    const query = search.toLowerCase().trim();
    
    const scored = allDbExercises.map(ex => {
      const name = ex.name.toLowerCase();
      const group = (ex.muscle_group || '').toLowerCase();
      const type = (ex.type || '').toLowerCase();
      
      let score = 0;
      
      if (name === query) score += 100;
      else if (name.startsWith(query)) score += 80;
      else if (name.includes(query)) score += 50;
      
      if (group.includes(query)) score += 25;
      if (type.includes(query)) score += 40;
      
      // Synonym/abbreviation logic: lat, db, reverse, curls, etc.
      if (query === 'db' && name.includes('dumbbell')) score += 45;
      if (query === 'lat' && name.includes('lat pulldown')) score += 45;
      if (query === 'fly' && name.includes('fly')) score += 45;
      if (query === 'reverse' && name.includes('reverse fly')) score += 70;
      
      return { ex, score };
    });
    
    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.ex)
      .slice(0, 10);
  };

  const filtered = getFilteredExercises();

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', marginTop: '6px' }}>
      <input
        type="text"
        value={search}
        onChange={e => { setSearch(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Type to search entire exercise database..."
        style={{
          width: '100%',
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: 'white',
          borderRadius: '10px',
          padding: '10px 14px',
          fontSize: '14px',
          fontWeight: '600',
          outline: 'none',
          transition: 'border-color 0.2s',
          boxSizing: 'border-box'
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '6px',
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
          zIndex: 10000, maxHeight: '240px', overflowY: 'auto',
          overflowX: 'hidden'
        }}>
          {filtered.map(ex => (
            <div
              key={ex.id}
              onClick={() => { onChange(ex.name); setSearch(ex.name); setOpen(false); }}
              style={{
                padding: '12px 16px', cursor: 'pointer', fontSize: '13px',
                color: 'rgba(255,255,255,0.9)', transition: 'all 0.15s',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--accent-color)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
              }}
            >
              <div>
                <strong>{ex.name}</strong>
                {ex.type && (
                  <span style={{ fontSize: '10px', opacity: 0.6, display: 'block', marginTop: '2px' }}>
                    Keywords: {ex.type}
                  </span>
                )}
              </div>
              <span style={{ 
                background: 'rgba(255,255,255,0.1)', 
                color: 'white', 
                fontSize: '10px', 
                fontWeight: '700', 
                padding: '2px 8px', 
                borderRadius: '6px' 
              }}>
                {ex.muscle_group}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────────────────────────
export default function ImportWorkout() {
  const { user } = useAuth();

  const [step,            setStep]            = useState('paste');
  const [rawText,         setRawText]         = useState('');
  const [reviewSessions,  setReviewSessions]  = useState([]);
  const [resolutions,     setResolutions]     = useState({});
  const [parseError,      setParseError]      = useState(null);
  const [saveError,       setSaveError]       = useState(null);
  const [savedData,       setSavedData]       = useState(null);

  const [showExplanation, setShowExplanation] = useState({});
  const [allDbExercises,  setAllDbExercises]  = useState([]);

  // Chunker states
  const [parsingProgress, setParsingProgress] = useState({ current: 0, total: 0, currentLabel: '' });

  // Index standard seeds + database exercises cleanly on mount
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const { data } = await supabase.from('exercises').select('id, name, muscle_group').order('name');
        
        const mergedMap = new Map();
        
        // Seed Standard lists first to guarantee coverage
        STANDARD_SEED_EXERCISES.forEach(item => {
          mergedMap.set(item.name.toLowerCase(), {
            id: `seed-${item.name.replace(/\s+/g, '-').toLowerCase()}`,
            name: item.name,
            muscle_group: item.muscle_group,
            type: item.type
          });
        });
        
        if (data) {
          data.forEach(item => {
            mergedMap.set(item.name.toLowerCase(), {
              id: item.id,
              name: item.name,
              muscle_group: item.muscle_group || 'Other',
              type: ''
            });
          });
        }
        
        setAllDbExercises(Array.from(mergedMap.values()));
      } catch (e) {
        setAllDbExercises(STANDARD_SEED_EXERCISES.map((item, idx) => ({
          id: `seed-${idx}`,
          name: item.name,
          muscle_group: item.muscle_group,
          type: item.type
        })));
      }
    };
    fetchAll();
  }, []);

  const allResolved = reviewSessions.every((session, sIdx) => 
    (session.ambiguous ?? []).every(a => resolutions[`${sIdx}-${a.raw}`])
  );

  // ── Step 1: Sequential Batch Parser ─────────────────────────────────────────
  const handleParse = async () => {
    if (!rawText.trim()) return;
    setStep('parsing');
    setParseError(null);

    const chunks = chunkRawWorkoutText(rawText);
    setParsingProgress({ current: 0, total: chunks.length, currentLabel: 'Initiating parsing engine...' });

    let exerciseNames = [];
    try {
      const { data } = await supabase.from('exercises').select('name').limit(500);
      exerciseNames = data?.map(e => e.name) ?? [];
    } catch { /* fallback */ }

    const parsedSessionsTemp = [];

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const dayLabel = chunk.split !== 'Custom' ? chunk.split : 'Workout';
        const dateLabel = chunk.date ? ` (${chunk.date})` : '';

        setParsingProgress({
          current: i + 1,
          total: chunks.length,
          currentLabel: `Parsing day ${i + 1}/${chunks.length}: ${dayLabel}${dateLabel}...`
        });

        const res = await fetch('/api/parse-workout', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ rawText: chunk.rawChunk, exercises: exerciseNames }),
        });

        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error ?? `AI failed to parse day block ${i + 1}`);
        }

        parsedSessionsTemp.push({
          date: json.date ?? chunk.date ?? new Date().toLocaleDateString('en-CA'),
          split: json.split ?? chunk.split ?? 'Custom',
          exercises: json.exercises?.map(ex => ({
            ...ex,
            id: ex.id || `temp-${Date.now()}-${Math.random()}`
          })) ?? [],
          ambiguous: json.ambiguous ?? []
        });
      }

      setReviewSessions(parsedSessionsTemp);

      const hasAmbiguities = parsedSessionsTemp.some(s => s.ambiguous?.length > 0);
      setStep(hasAmbiguities ? 'clarify' : 'preview');
    } catch (err) {
      setParseError(err.message ?? 'Failure parsing raw workout logs');
      setStep('paste');
    }
  };

  const handleConfirmClarify = () => {
    setReviewSessions(prev => prev.map((session, sIdx) => {
      const updatedExercises = session.exercises.map(ex => {
        const ambiguity = session.ambiguous?.find(a => 
          a.options.includes(ex.name) || ex.name.toLowerCase().includes(a.raw.toLowerCase())
        );
        if (ambiguity) {
          const resVal = resolutions[`${sIdx}-${ambiguity.raw}`];
          if (resVal === '__SKIP__') {
            return { ...ex, confidence: 1.0 }; // skip mapping, accept raw
          } else if (resVal) {
            return { ...ex, name: resVal, confidence: 1.0 };
          }
        }
        return ex;
      });
      return { ...session, exercises: updatedExercises };
    }));
    setStep('preview');
  };

  // ── Step 2: Confirm & Aggregate Save ────────────────────────────────────────
  const handleImport = async () => {
    if (reviewSessions.length === 0) return;

    // Safety checks: cancel if naming empty
    const hasEmptyNames = reviewSessions.some(session => 
      session.exercises.some(ex => !ex.name.trim())
    );

    if (hasEmptyNames) {
      setSaveError('Please enter a valid exercise name for all preview items.');
      return;
    }

    setStep('saving');
    setSaveError(null);

    let totalVol  = 0;
    let totalSets = 0;

    try {
      for (let sIdx = 0; sIdx < reviewSessions.length; sIdx++) {
        const session = reviewSessions[sIdx];
        if (session.exercises.length === 0) continue;

        let sessionDate = session.date
          ? new Date(session.date + 'T12:00:00').toISOString()
          : new Date(new Date().toLocaleDateString('en-CA') + 'T12:00:00').toISOString();

        // Create separate workout sessions
        const { data: sessionData, error: sessionError } = await supabase
          .from('workout_sessions')
          .insert({
            user_id:    user.id,
            date:       sessionDate,
            split_type: 'AI Import',
            split_day:  session.split || 'Custom',
            notes:      `AI chunked import.`,
          })
          .select()
          .single();

        if (sessionError || !sessionData) {
          throw new Error(sessionError?.message ?? `Failed to create session for Day ${sIdx + 1}`);
        }

        for (let i = 0; i < session.exercises.length; i++) {
          const ex = session.exercises[i];
          if (!ex.name.trim()) continue;

          const { data: dbEx } = await supabase
            .from('exercises')
            .select('id')
            .ilike('name', ex.name.trim())
            .limit(1)
            .single();

          let exerciseId = dbEx?.id ?? null;

          if (!exerciseId) {
            const { data: newEx } = await supabase
              .from('exercises')
              .insert({ name: ex.name.trim(), muscle_group: 'Other' })
              .select('id')
              .single();
            exerciseId = newEx?.id ?? null;
          }

          if (!exerciseId) continue;

          const { data: seData } = await supabase
            .from('session_exercises')
            .insert({ session_id: sessionData.id, exercise_id: exerciseId, order_index: i })
            .select()
            .single();

          if (seData && ex.sets?.length > 0) {
            const validSets = ex.sets.filter(s => s.reps > 0);
            if (validSets.length > 0) {
              await supabase.from('sets').insert(
                validSets.map((s, idx) => ({
                  session_exercise_id: seData.id,
                  set_number:          idx + 1,
                  weight_kg:           s.weight_kg ?? 0,
                  reps:                s.reps       ?? 0,
                }))
              );
              validSets.forEach(s => {
                totalVol  += (s.weight_kg ?? 0) * (s.reps ?? 0);
                totalSets += 1;
              });
            }
          }
        }
      }

      setSavedData({ vol: totalVol, sets: totalSets });
      setStep('done');
    } catch (err) {
      setSaveError(err.message ?? 'Import encountered database issues.');
      setStep('preview');
    }
  };

  // ── Preview Modification Handlers ──────────────────────────────────────────
  const updateExerciseName = (sessionIdx, exIdx, newName) => {
    setReviewSessions(prev => prev.map((s, i) => {
      if (i !== sessionIdx) return s;
      return {
        ...s,
        exercises: s.exercises.map((ex, j) => j === exIdx ? { ...ex, name: newName } : ex)
      };
    }));
  };

  const removeExercise = (sessionIdx, exIdx) => {
    setReviewSessions(prev => prev.map((s, i) => {
      if (i !== sessionIdx) return s;
      return { ...s, exercises: s.exercises.filter((_, j) => j !== exIdx) };
    }));
  };

  const updateSetField = (sessionIdx, exIdx, setIdx, field, value) => {
    setReviewSessions(prev => prev.map((s, i) => {
      if (i !== sessionIdx) return s;
      return {
        ...s,
        exercises: s.exercises.map((ex, j) => {
          if (j !== exIdx) return ex;
          return {
            ...ex,
            sets: ex.sets.map((set, k) => k === setIdx ? { ...set, [field]: value === '' ? 0 : parseFloat(value) } : set)
          };
        })
      };
    }));
  };

  const removeSet = (sessionIdx, exIdx, setIdx) => {
    setReviewSessions(prev => prev.map((s, i) => {
      if (i !== sessionIdx) return s;
      return {
        ...s,
        exercises: s.exercises.map((ex, j) => {
          if (j !== exIdx) return ex;
          return { ...ex, sets: ex.sets.filter((_, k) => k !== setIdx) };
        })
      };
    }));
  };

  const addSet = (sessionIdx, exIdx) => {
    setReviewSessions(prev => prev.map((s, i) => {
      if (i !== sessionIdx) return s;
      return {
        ...s,
        exercises: s.exercises.map((ex, j) => {
          if (j !== exIdx) return ex;
          const lastSet = ex.sets[ex.sets.length - 1];
          return {
            ...ex,
            sets: [...ex.sets, { weight_kg: lastSet?.weight_kg ?? 0, reps: lastSet?.reps ?? 10 }]
          };
        })
      };
    }));
  };

  const addExercise = (sessionIdx) => {
    setReviewSessions(prev => prev.map((s, i) => {
      if (i !== sessionIdx) return s;
      return {
        ...s,
        exercises: [
          ...s.exercises,
          { name: '', confidence: 1.0, sets: [{ weight_kg: 0, reps: 10 }] }
        ]
      };
    }));
  };

  const updateSessionDate = (sessionIdx, newDate) => {
    setReviewSessions(prev => prev.map((s, i) => i === sessionIdx ? { ...s, date: newDate } : s));
  };

  const updateSessionSplit = (sessionIdx, newSplit) => {
    setReviewSessions(prev => prev.map((s, i) => i === sessionIdx ? { ...s, split: newSplit } : s));
  };

  const deleteSession = (sessionIdx) => {
    setReviewSessions(prev => prev.filter((_, i) => i !== sessionIdx));
  };

  const handleReset = () => {
    setStep('paste');
    setRawText('');
    setReviewSessions([]);
    setResolutions({});
    setParseError(null);
    setSaveError(null);
    setSavedData(null);
    setShowExplanation({});
  };

  // ── Import Safety Warning Validator ──
  const getValidationWarnings = () => {
    const warnings = [];
    reviewSessions.forEach((session, sIdx) => {
      const dayLabel = `Workout Day ${sIdx + 1}`;
      if (!session.date) {
        warnings.push(`${dayLabel}: Missing date selection. Defaults to today's date.`);
      }
      if (session.exercises.length === 0) {
        warnings.push(`${dayLabel}: Has no exercises defined.`);
      }
      session.exercises.forEach((ex, exIdx) => {
        const nameLabel = ex.name.trim() || `Unnamed #${exIdx + 1}`;
        if (!ex.name.trim()) {
          warnings.push(`${dayLabel}, Exercise #${exIdx + 1}: Exercise name field is empty.`);
        } else if (!isLikelyExerciseName(ex.name)) {
          warnings.push(`${dayLabel}, "${nameLabel}": This name contains numbers or formatting noise.`);
        }
        if (!ex.sets || ex.sets.length === 0) {
          warnings.push(`${dayLabel}, "${nameLabel}": Contains zero set logs.`);
        } else {
          ex.sets.forEach((s, sNo) => {
            if (s.reps <= 0) {
              warnings.push(`${dayLabel}, "${nameLabel}" Set ${sNo + 1}: Reps must be greater than 0.`);
            }
          });
        }
      });
    });
    return warnings;
  };

  const validationWarnings = getValidationWarnings();

  return (
    <div className="page-enter" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '120px' }}>
      <style>{`
        @keyframes spinKey { 100% { transform: rotate(360deg); } }
        .animate-spin { animation: spinKey 1s linear infinite; }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(0,122,255,0.2); }
          50%       { box-shadow: 0 0 40px rgba(0,122,255,0.5); }
        }
        .parsing-pulse { animation: pulseGlow 1.5s ease-in-out infinite; }
        .import-textarea {
          width: 100%; min-height: 240px; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 20px;
          color: white; font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
          font-size: 14px; line-height: 1.7; padding: 20px 24px;
          resize: vertical; outline: none; transition: border-color 0.2s;
        }
        .import-textarea:focus { border-color: rgba(0,122,255,0.5); background: rgba(0,0,0,0.4); }
        .import-textarea::placeholder { color: rgba(255,255,255,0.2); font-family: inherit; }
        
        .ex-preview-card {
          border-radius: 16px;
          overflow: visible;
          margin-bottom: 14px;
          transition: all 0.2s ease-in-out;
        }
        .ex-preview-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        }
        .sticky-action-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(15, 23, 42, 0.9);
          backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255,255,255,0.1);
          padding: 16px 24px;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sticky-inner {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
        }
        
        @media (min-width: 600px) {
          .progress-label { display: block !important; }
          .progress-divider { width: 40px !important; }
        }
      `}</style>

      {/* ── Title Header ── */}
      <div style={{ marginTop: '16px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{ background: 'rgba(0,122,255,0.15)', padding: '10px', borderRadius: '14px' }}>
            <Sparkles size={22} color="var(--accent-hover)" />
          </div>
          <h1 className="title" style={{ margin: 0, fontSize: '32px' }}>AI Workout Import</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px', margin: 0, fontWeight: '500' }}>
          Paste messy training logs. The sequential multi-day AI parser categorizes them automatically.
        </p>
      </div>

      {/* ── Top Progress Flow Indicator ── */}
      <div className="glass" style={{ display: 'flex', borderRadius: '16px', padding: '16px 20px', marginBottom: '32px', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          { label: '1. Parse Log', activeStep: 'paste', doneSteps: ['parsing', 'clarify', 'preview', 'saving', 'done'] },
          { label: '2. Clarify Ambiguity', activeStep: 'clarify', doneSteps: ['preview', 'saving', 'done'] },
          { label: '3. Review Session', activeStep: 'preview', doneSteps: ['saving', 'done'] },
          { label: '4. Done', activeStep: 'done', doneSteps: [] }
        ].map((stage, idx) => {
          const isActive = step === stage.activeStep || (step === 'parsing' && stage.activeStep === 'paste') || (step === 'saving' && stage.activeStep === 'preview');
          const isDone = stage.doneSteps.includes(step);
          
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: isActive ? 'var(--accent-color)' : isDone ? '#30D158' : 'rgba(255,255,255,0.08)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: '800',
                  border: isActive ? '2px solid var(--accent-hover)' : 'none',
                  boxShadow: isActive ? '0 0 12px rgba(0,122,255,0.5)' : 'none',
                  transition: 'all 0.3s'
                }}>
                  {isDone ? '✓' : idx + 1}
                </div>
                <span style={{
                  fontSize: '13px',
                  fontWeight: isActive || isDone ? '700' : '500',
                  color: isActive ? 'white' : isDone ? '#30D158' : 'rgba(255,255,255,0.4)',
                  display: 'none'
                }} className="progress-label">
                  {stage.label.split('. ')[1]}
                </span>
              </div>
              {idx < 3 && <div className="progress-divider" style={{ width: '20px', height: '1px', background: 'rgba(255,255,255,0.1)', marginLeft: '12px', marginRight: '4px' }} />}
            </div>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════ STEP: PASTE */}
      {step === 'paste' && (
        <div className="animate-fade-in">
          <div className="glass card" style={{ padding: '24px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Workout log pastebox
              </label>
              <button
                onClick={() => setRawText(EXAMPLE_TEXT)}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--text-secondary)', padding: '5px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
              >
                Load Example
              </button>
            </div>
            <textarea
              className="import-textarea"
              placeholder={`Paste raw workout entries here...\n\nExample:\nMarch 3 Push\nFlat db\n30kg x12\n35kg x8`}
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              spellCheck={false}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
              <span style={{ fontSize: '12px', color: rawText.length > 12000 ? 'var(--error-color)' : 'var(--text-secondary)', fontWeight: '600' }}>
                {rawText.length.toLocaleString()} / 12,000 chars
              </span>
              {rawText && (
                <button
                  onClick={() => setRawText('')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <X size={12} /> Clear
                </button>
              )}
            </div>
          </div>

          {parseError && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px 20px', background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: '14px', marginBottom: '20px' }}>
              <AlertTriangle size={18} color="var(--error-color)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--error-color)', marginBottom: '4px' }}>Parse failed</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{parseError}</div>
              </div>
            </div>
          )}

          <button
            className="btn-primary"
            onClick={handleParse}
            disabled={!rawText.trim() || rawText.length > 12000}
            style={{ width: '100%', padding: '18px', fontSize: '16px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', opacity: !rawText.trim() ? 0.5 : 1 }}
          >
            <Sparkles size={20} />
            Parse with AI
            <ArrowRight size={18} />
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ STEP: PARSING */}
      {step === 'parsing' && (
        <div className="animate-fade-in" style={{ textAlign: 'center', padding: '80px 0' }}>
          <div className="glass card parsing-pulse" style={{ display: 'inline-flex', padding: '28px', borderRadius: '50%', marginBottom: '32px' }}>
            <Sparkles size={48} color="var(--accent-hover)" />
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px', marginBottom: '12px' }}>Analyzing training data…</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: '500' }}>
            {parsingProgress.currentLabel}
          </p>
          {parsingProgress.total > 1 && (
            <div style={{ maxWidth: '300px', margin: '20px auto 0', background: 'rgba(255,255,255,0.06)', borderRadius: '10px', height: '6px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  height: '100%', 
                  background: 'var(--accent-color)', 
                  width: `${(parsingProgress.current / parsingProgress.total) * 100}%`,
                  transition: 'width 0.4s ease'
                }} 
              />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
            <Loader2 className="animate-spin" size={20} color="var(--text-secondary)" />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>Processing chunk sequentially</span>
          </div>
        </div>
      )}

      {/* ─── Clarify Step ─── */}
      {step === 'clarify' && reviewSessions.length > 0 && (
        <div className="animate-fade-in">
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px' }}>Clarify Ambiguous Exercises</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>
              Select standardized exercises for any ambiguous terms identified:
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
            {reviewSessions.map((session, sIdx) => 
              (session.ambiguous ?? []).map((amb, aIdx) => {
                const resolutionKey = `${sIdx}-${amb.raw}`;
                const resolvedVal = resolutions[resolutionKey] || '';
                const isSkipped = resolutions[resolutionKey] === '__SKIP__';
                
                return (
                  <div key={`${sIdx}-${aIdx}`} className="glass card animate-fade-in" style={{ padding: '24px', margin: 0, borderLeft: '4px solid #FF9F0A' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ background: 'rgba(255,159,10,0.12)', padding: '8px', borderRadius: '10px' }}>
                          <AlertTriangle size={18} color="#FF9F0A" />
                        </div>
                        <div>
                          <div style={{ fontWeight: '800', fontSize: '17px', color: 'white' }}>"{amb.raw}"</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginTop: '2px' }}>
                            {formatParsedDate(session.date, session.split, sIdx)} — Low Confidence Match
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', color: '#FF9F0A', background: 'rgba(255,159,10,0.1)', padding: '4px 10px', borderRadius: '8px', fontWeight: '700', textTransform: 'uppercase' }}>
                        Ambiguous
                      </span>
                    </div>

                    {/* SELECT EXERCISE SEARCH BAR */}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Select Standardized Movement
                      </label>
                      <ExerciseSearchSelector
                        value={isSkipped ? '' : resolvedVal}
                        onChange={val => setResolutions(prev => ({ ...prev, [resolutionKey]: val }))}
                        allDbExercises={allDbExercises}
                      />
                    </div>

                    {/* Visible action buttons */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
                      {resolvedVal && (
                        <button
                          onClick={() => setResolutions(prev => {
                            const copy = { ...prev };
                            delete copy[resolutionKey];
                            return copy;
                          })}
                          style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '10px', padding: '8px 14px', color: 'white', fontWeight: '700',
                            fontSize: '12px', cursor: 'pointer'
                          }}
                        >
                          Reset
                        </button>
                      )}
                      
                      <button
                        onClick={() => setResolutions(prev => ({ ...prev, [resolutionKey]: '__SKIP__' }))}
                        style={{
                          background: isSkipped ? 'rgba(0,122,255,0.2)' : 'rgba(255,255,255,0.04)', 
                          border: isSkipped ? '1px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '10px', padding: '8px 14px', 
                          color: isSkipped ? 'var(--accent-hover)' : 'rgba(255,255,255,0.7)', 
                          fontWeight: '700', fontSize: '12px', cursor: 'pointer'
                        }}
                      >
                        {isSkipped ? 'Skipped ✓' : 'Skip & Leave Raw'}
                      </button>

                      <button
                        onClick={() => {
                          setReviewSessions(prev => prev.map((s, idx) => {
                            if (idx !== sIdx) return s;
                            return {
                              ...s,
                              exercises: s.exercises.filter(ex => ex.name !== amb.raw),
                              ambiguous: s.ambiguous.filter(a => a.raw !== amb.raw)
                            };
                          }));
                        }}
                        style={{
                          background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.2)',
                          borderRadius: '10px', padding: '8px 14px', color: 'var(--error-color)', fontWeight: '700',
                          fontSize: '12px', cursor: 'pointer', marginLeft: 'auto'
                        }}
                      >
                        Remove Entry
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn-secondary"
              onClick={handleConfirmClarify}
              style={{ flex: 1, padding: '16px', borderRadius: '16px', fontSize: '15px' }}
            >
              Skip → Preview
            </button>
            <button
              className="btn-primary"
              onClick={handleConfirmClarify}
              disabled={!allResolved}
              style={{ flex: 2, padding: '16px', borderRadius: '16px', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: allResolved ? 1 : 0.6 }}
            >
              <Check size={18} /> Confirm & Preview
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ STEP: PREVIEW */}
      {step === 'preview' && reviewSessions.length > 0 && (
        <div className="animate-fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px' }}>Review & Edit Import</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', margin: 0 }}>
                Adjust dates, sets, names, or remove split segments cleanly.
              </p>
            </div>
            <button
              onClick={handleReset}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'var(--text-secondary)', padding: '8px 14px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={13} /> Start over
            </button>
          </div>

          {/* Validation Warnings Panel */}
          {validationWarnings.length > 0 && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '10px', 
              padding: '16px 20px', 
              background: 'rgba(255,159,10,0.08)', 
              border: '1px solid rgba(255,159,10,0.25)', 
              borderRadius: '14px', 
              marginBottom: '24px' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FF9F0A', fontWeight: '800', fontSize: '14px' }}>
                <AlertTriangle size={16} />
                <span>Import Safety Warnings ({validationWarnings.length})</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'rgba(255,255,255,0.85)', display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: '500' }}>
                {validationWarnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Workout Sessions Cards list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', marginBottom: '80px' }}>
            {reviewSessions.map((session, sIdx) => (
              <div 
                key={sIdx} 
                className="glass card animate-fade-in" 
                style={{ 
                  padding: '24px', 
                  margin: 0, 
                  border: '1px solid rgba(255,255,255,0.08)', 
                  position: 'relative',
                  overflow: 'visible' // critical fix: prevent selector clipping
                }}
              >
                {/* Session Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ background: 'rgba(0,122,255,0.15)', padding: '8px', borderRadius: '10px' }}>
                      <Calendar size={18} color="var(--accent-hover)" />
                    </div>
                    <span style={{ fontSize: '18px', fontWeight: '800', color: 'white' }}>
                      {formatParsedDate(session.date, session.split, sIdx)}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteSession(sIdx)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--error-color)', cursor: 'pointer', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <X size={14} /> Remove Day
                  </button>
                </div>

                {/* Session details */}
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Date:</span>
                    <input
                      type="date"
                      value={session.date}
                      max={new Date().toLocaleDateString('en-CA')}
                      onChange={e => updateSessionDate(sIdx, e.target.value)}
                      style={{
                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', color: 'white',
                        fontWeight: '700', fontSize: '13px', padding: '6px 12px', borderRadius: '8px', outline: 'none', cursor: 'pointer'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Split:</span>
                    <input
                      type="text"
                      value={session.split}
                      onChange={e => updateSessionSplit(sIdx, e.target.value)}
                      placeholder="e.g. Push"
                      style={{
                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', color: 'white',
                        fontWeight: '700', fontSize: '13px', padding: '6px 12px', borderRadius: '8px', outline: 'none', width: '100px'
                      }}
                    />
                  </div>
                </div>

                {/* Exercises Preview Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {session.exercises.map((ex, exIdx) => {
                    const isLowConfidence = (ex.confidence ?? 0) < 0.7;
                    const showEx = showExplanation[`${sIdx}-${exIdx}`] || isLowConfidence;
                    const hasSets = ex.sets && ex.sets.length > 0;

                    return (
                      <div 
                        key={exIdx} 
                        className="glass card ex-preview-card animate-fade-in" 
                        style={{ 
                          padding: '0', 
                          overflow: 'visible', // critical: allow searchable dropdown to overflow card cleanly
                          margin: 0, 
                          background: 'rgba(255,255,255,0.01)',
                          border: isLowConfidence 
                            ? '1px dashed rgba(255,69,58,0.35)' 
                            : '1px solid rgba(255,255,255,0.05)',
                          boxShadow: isLowConfidence ? '0 0 16px rgba(255,69,58,0.05)' : 'none'
                        }}
                      >
                        {/* Exercise Card Header */}
                        <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1, marginRight: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '12px', fontWeight: '800', color: 'rgba(255,255,255,0.3)' }}>#{exIdx + 1}</span>
                              <input
                                type="text"
                                value={ex.name}
                                onChange={e => updateExerciseName(sIdx, exIdx, e.target.value)}
                                placeholder="Movement Name"
                                style={{
                                  background: 'transparent', border: 'none', color: '#fff',
                                  fontSize: '15px', fontWeight: '800', outline: 'none',
                                  width: '100%', padding: '2px 0'
                                }}
                              />
                            </div>
                            <div
                              onClick={() => setShowExplanation(prev => ({ ...prev, [`${sIdx}-${exIdx}`]: !prev[`${sIdx}-${exIdx}`] }))}
                              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '4px', userSelect: 'none' }}
                            >
                              <div style={{ width: '60px', height: '3px', borderRadius: '100px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                <div
                                  style={{ height: '100%', borderRadius: '100px', width: `${(ex.confidence ?? 0) * 100}%`, background: confidenceColor(ex.confidence ?? 0) }}
                                />
                              </div>
                              <span style={{ fontSize: '10px', fontWeight: '700', color: confidenceColor(ex.confidence ?? 0), textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {confidenceLabel(ex.confidence ?? 0)} Match ▾
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => removeExercise(sIdx, exIdx)}
                            style={{ background: 'none', border: 'none', padding: '6px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', borderRadius: '8px', transition: 'background 0.2s' }}
                            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; e.currentTarget.style.color = 'var(--error-color)'; }}
                            onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                          >
                            <X size={16} />
                          </button>
                        </div>

                        {/* Remapping Explanations Drawer */}
                        {showEx && (
                          <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                              <Zap size={12} color={isLowConfidence ? '#FF9F0A' : 'var(--accent-hover)'} />
                              <span style={{ fontSize: '11px', fontWeight: '800', color: isLowConfidence ? '#FF9F0A' : 'rgba(255,255,255,0.9)' }}>
                                {isLowConfidence ? 'Action Required: Confirm Movement' : 'Inference Match Details'}
                              </span>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '11px', lineHeight: '1.4', margin: '0 0 8px', fontWeight: '500' }}>
                              {isLowConfidence
                                ? `Parsed term "${ex.name || 'empty'}" needs verification. Select a standardized movement name:`
                                : `Standardized match from log text. Use the search input below if you wish to override the mapping:`}
                            </p>
                            <ExerciseSearchSelector
                              value={ex.name}
                              onChange={val => updateExerciseName(sIdx, exIdx, val)}
                              allDbExercises={allDbExercises}
                            />
                          </div>
                        )}

                        {/* Exercise Sets */}
                        <div style={{ padding: '12px 16px' }}>
                          {hasSets ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {ex.sets.map((s, si) => (
                                <div key={si} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', width: '24px' }}>S{si + 1}</span>
                                  
                                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', padding: '3px 10px', border: '1px solid rgba(255,255,255,0.04)' }}>
                                    <input
                                      type="number"
                                      placeholder="0"
                                      value={s.weight_kg === 0 ? '' : s.weight_kg}
                                      onChange={e => updateSetField(sIdx, exIdx, si, 'weight_kg', e.target.value)}
                                      style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', fontWeight: '700', outline: 'none', width: '100%', textAlign: 'right' }}
                                      inputMode="decimal"
                                    />
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '700', marginLeft: '3px', marginRight: '8px' }}>kg</span>
                                    <span style={{ color: 'var(--accent-hover)', fontWeight: '800', fontSize: '12px' }}>×</span>
                                    <input
                                      type="number"
                                      placeholder="0"
                                      value={s.reps === 0 ? '' : s.reps}
                                      onChange={e => updateSetField(sIdx, exIdx, si, 'reps', e.target.value)}
                                      style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', fontWeight: '700', outline: 'none', width: '100%', textAlign: 'right' }}
                                      inputMode="numeric"
                                    />
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '700', marginLeft: '3px' }}>reps</span>
                                  </div>

                                  <button
                                    onClick={() => removeSet(sIdx, exIdx, si)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '3px' }}
                                  >
                                    <X size={14} color="var(--error-color)" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '6px' }}>No sets added.</div>
                          )}
                          <button
                            onClick={() => addSet(sIdx, exIdx)}
                            style={{ width: '100%', padding: '8px', background: 'transparent', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '8px', color: 'var(--text-secondary)', fontWeight: '700', cursor: 'pointer', marginTop: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                          >
                            + Add Set
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => addExercise(sIdx)}
                  className="btn-secondary"
                  style={{ width: '100%', border: '1px dashed rgba(0,122,255,0.2)', background: 'rgba(0,122,255,0.03)', padding: '10px', fontSize: '13px', display: 'flex', justifyContent: 'center', color: 'white', fontWeight: '700', borderRadius: '12px', marginTop: '16px', gap: '6px' }}
                >
                  <Dumbbell size={14} color="var(--accent-hover)" /> + Add Missing Exercise
                </button>
              </div>
            ))}
          </div>

          {saveError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 18px', background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: '14px', marginBottom: '16px' }}>
              <AlertTriangle size={16} color="var(--error-color)" />
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--error-color)' }}>{saveError}</span>
            </div>
          )}

          {/* Sticky Bottom Premium Action Bar */}
          <div className="sticky-action-bar animate-fade-in">
            <div className="sticky-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Aggregate Summary
                </span>
                <span style={{ fontSize: '14px', fontWeight: '800', color: 'white' }}>
                  {reviewSessions.length} Day{reviewSessions.length !== 1 ? 's' : ''} • {reviewSessions.reduce((acc, s) => acc + s.exercises.length, 0)} Exercise{reviewSessions.reduce((acc, s) => acc + s.exercises.length, 0) !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                className="btn-primary"
                onClick={handleImport}
                disabled={reviewSessions.length === 0}
                style={{ 
                  padding: '12px 28px', 
                  fontSize: '15px', 
                  borderRadius: '12px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  cursor: 'pointer',
                  border: 'none',
                  fontWeight: '700'
                }}
              >
                <Upload size={16} /> Import Workout Logs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ STEP: SAVING */}
      {step === 'saving' && (
        <div className="animate-fade-in" style={{ textAlign: 'center', padding: '80px 0' }}>
          <div className="glass card parsing-pulse" style={{ display: 'inline-flex', padding: '28px', borderRadius: '50%', marginBottom: '32px' }}>
            <Loader2 size={48} color="var(--accent-hover)" className="animate-spin" />
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px', marginBottom: '12px' }}>Saving to your account…</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: '500' }}>Inserting sessions, exercises, and sets into the database sequentially.</p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ STEP: DONE */}
      {step === 'done' && savedData && (
        <div className="animate-fade-in" style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ background: 'rgba(48,209,88,0.1)', padding: '24px', borderRadius: '50%', display: 'inline-flex', marginBottom: '28px' }}>
            <CheckCircle size={72} color="#30D158" />
          </div>
          <h2 style={{ fontSize: '36px', fontWeight: '800', letterSpacing: '-1px', marginBottom: '12px' }}>Import Complete!</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '16px', fontWeight: '500', marginBottom: '40px' }}>
            All parsed workout segments have been synchronized to your workout history database.
          </p>

          <div className="glass card" style={{ display: 'inline-flex', gap: '40px', padding: '24px 40px', marginBottom: '40px', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '32px', fontWeight: '800', color: 'white' }}>{Math.round(savedData.vol).toLocaleString()}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700', marginTop: '4px' }}>Volume (kg)</div>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
            <div>
              <div style={{ fontSize: '32px', fontWeight: '800', color: 'white' }}>{savedData.sets}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700', marginTop: '4px' }}>Sets Logged</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={handleReset} style={{ padding: '16px 32px', borderRadius: '16px', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ClipboardPaste size={18} /> Import Another
            </button>
            <a href="/history" className="btn-secondary" style={{ padding: '16px 32px', borderRadius: '16px', fontSize: '15px', display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
              View History
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

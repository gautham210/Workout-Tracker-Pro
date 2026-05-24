import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  Upload, Sparkles, Loader2, Check, AlertTriangle,
  ChevronDown, X, Zap, Calendar, Dumbbell, ArrowRight,
  ClipboardPaste, RotateCcw, CheckCircle,
} from 'lucide-react';

// ── Example placeholder text ──────────────────────────────────────────────────
const EXAMPLE_TEXT = `March 3 Push

Bench
60x15
60x15
65x12

Incline DB
20x15
20x15

Lateral Raise
10x15
10x12`;

// ── Step definitions ──────────────────────────────────────────────────────────
const STEPS = ['paste', 'parsing', 'clarify', 'preview', 'saving', 'done'];

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

// ── Tiny inline dropdown for ambiguity resolution ─────────────────────────────
function AmbiguityDropdown({ raw, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'rgba(0,122,255,0.1)', border: '1px solid rgba(0,122,255,0.3)',
          borderRadius: '10px', padding: '8px 14px',
          color: 'var(--accent-hover)', fontWeight: '700', fontSize: '14px',
          cursor: 'pointer', width: '100%', justifyContent: 'space-between',
        }}
      >
        <span>{value || 'Select exercise…'}</span>
        <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
          background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px', boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
          zIndex: 9999, overflow: 'hidden',
        }}>
          {options.map(opt => (
            <div
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              style={{
                padding: '11px 16px', cursor: 'pointer', fontWeight: '600',
                fontSize: '14px', color: opt === value ? 'var(--accent-hover)' : 'rgba(255,255,255,0.85)',
                background: opt === value ? 'rgba(0,122,255,0.1)' : 'transparent',
                borderLeft: opt === value ? '3px solid var(--accent-color)' : '3px solid transparent',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { if (opt !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { if (opt !== value) e.currentTarget.style.background = 'transparent'; }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ImportWorkout() {
  const { user } = useAuth();

  const [step,        setStep]        = useState('paste');
  const [rawText,     setRawText]     = useState('');
  const [parsed,      setParsed]      = useState(null);   // AI response
  const [resolutions, setResolutions] = useState({});     // ambiguous raw → chosen name
  const [parseError,  setParseError]  = useState(null);
  const [saveError,   setSaveError]   = useState(null);
  const [savedData,   setSavedData]   = useState(null);   // { vol, sets }

  // Map resolved exercise names back into the parsed exercises list
  const resolvedExercises = parsed?.exercises?.map(ex => {
    const ambiguity = parsed?.ambiguous?.find(a => {
      // Match if the exercise name is one of the ambiguous options
      return a.options.includes(ex.name) || ex.name.toLowerCase().includes(a.raw.toLowerCase());
    });
    if (ambiguity && resolutions[ambiguity.raw]) {
      return { ...ex, name: resolutions[ambiguity.raw], resolved: true };
    }
    return ex;
  }) ?? [];

  // Check if all ambiguities are resolved
  const allResolved = (parsed?.ambiguous ?? []).every(a => resolutions[a.raw]);

  // ── Step 1: Parse ───────────────────────────────────────────────────────────
  const handleParse = async () => {
    if (!rawText.trim()) return;
    setStep('parsing');
    setParseError(null);

    // Fetch available exercise names to help AI map
    let exerciseNames = [];
    try {
      const { data } = await supabase.from('exercises').select('name').limit(500);
      exerciseNames = data?.map(e => e.name) ?? [];
    } catch { /* non-critical */ }

    try {
      console.log('[AI_IMPORT] Sending raw text for parsing.');
      const res = await fetch('/api/parse-workout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rawText, exercises: exerciseNames }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error ?? `Server error ${res.status}`);
      }

      setParsed(json);

      // Require user interaction for disambiguating low-confidence/ambiguous exercises
      setResolutions({});

      // Skip clarify step if no ambiguities
      setStep(json.ambiguous?.length > 0 ? 'clarify' : 'preview');
    } catch (err) {
      setParseError(err.message ?? 'Failed to parse workout');
      setStep('paste');
    }
  };

  // ── Step 2: Confirm & Save ──────────────────────────────────────────────────
  const handleImport = async () => {
    if (!parsed || resolvedExercises.length === 0) return;
    setStep('saving');
    setSaveError(null);

    // Resolve date
    let sessionDate = parsed.date
      ? new Date(parsed.date + 'T12:00:00').toISOString()
      : new Date(new Date().toLocaleDateString('en-CA') + 'T12:00:00').toISOString();

    // Insert workout session
    const { data: sessionData, error: sessionError } = await supabase
      .from('workout_sessions')
      .insert({
        user_id:    user.id,
        date:       sessionDate,
        split_type: 'AI Import',
        split_day:  parsed.split ?? 'Unknown',
        notes:      `Imported via AI — original text length: ${rawText.length} chars`,
      })
      .select()
      .single();

    if (sessionError || !sessionData) {
      setSaveError(sessionError?.message ?? 'Failed to create session');
      setStep('preview');
      return;
    }

    let totalVol  = 0;
    let totalSets = 0;

    // For each resolved exercise, find or match in DB, then insert
    for (let i = 0; i < resolvedExercises.length; i++) {
      const ex = resolvedExercises[i];

      // Try to find exercise in DB by exact name (case-insensitive)
      const { data: dbEx } = await supabase
        .from('exercises')
        .select('id')
        .ilike('name', ex.name)
        .limit(1)
        .single();

      let exerciseId = dbEx?.id ?? null;

      // If not found, insert a custom exercise
      if (!exerciseId) {
        const { data: newEx } = await supabase
          .from('exercises')
          .insert({ name: ex.name, muscle_group: 'Other' })
          .select('id')
          .single();
        exerciseId = newEx?.id ?? null;
      }

      if (!exerciseId) continue; // skip if we still can't get an ID

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

    setSavedData({ vol: totalVol, sets: totalSets });
    setStep('done');
  };

  const handleReset = () => {
    setStep('paste');
    setRawText('');
    setParsed(null);
    setResolutions({});
    setParseError(null);
    setSaveError(null);
    setSavedData(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
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
        .step-indicator { display: flex; align-items: center; gap: 8px; margin-bottom: 32px; }
        .step-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: rgba(255,255,255,0.15); transition: all 0.3s;
        }
        .step-dot.active { background: var(--accent-color); box-shadow: 0 0 12px rgba(0,122,255,0.6); width: 24px; border-radius: 4px; }
        .step-dot.done   { background: #30D158; }
        .import-textarea {
          width: 100%; min-height: 240px; background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 20px;
          color: white; font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
          font-size: 14px; line-height: 1.7; padding: 20px 24px;
          resize: vertical; outline: none; transition: border-color 0.2s;
        }
        .import-textarea:focus { border-color: rgba(0,122,255,0.5); background: rgba(0,0,0,0.4); }
        .import-textarea::placeholder { color: rgba(255,255,255,0.2); font-family: inherit; }
        .ex-preview-card { border-radius: 16px; overflow: hidden; margin-bottom: 14px; }
        .confidence-bar { height: 3px; border-radius: 100px; background: rgba(255,255,255,0.08); margin-top: 8px; overflow: hidden; }
        .confidence-fill { height: 100%; border-radius: 100px; transition: width 0.6s ease; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ marginTop: '16px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{ background: 'rgba(0,122,255,0.15)', padding: '10px', borderRadius: '14px' }}>
            <Sparkles size={22} color="var(--accent-hover)" />
          </div>
          <h1 className="title" style={{ margin: 0, fontSize: '32px' }}>AI Workout Import</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px', margin: 0, fontWeight: '500' }}>
          Paste any messy workout log. AI parses, maps, and imports it automatically.
        </p>
      </div>

      {/* ── Step Indicator ── */}
      <div className="step-indicator">
        {['paste', 'parsing', 'clarify', 'preview', 'saving', 'done'].map((s, i) => {
          const stepIdx = STEPS.indexOf(step);
          const thisIdx = STEPS.indexOf(s);
          return (
            <div
              key={s}
              className={`step-dot ${thisIdx === stepIdx ? 'active' : thisIdx < stepIdx ? 'done' : ''}`}
            />
          );
        })}
        <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>
          {{ paste: 'Paste', parsing: 'Parsing…', clarify: 'Clarify', preview: 'Preview', saving: 'Saving…', done: 'Done' }[step]}
        </span>
      </div>

      {/* ═══════════════════════════════════════════════════════ STEP: PASTE */}
      {step === 'paste' && (
        <div className="animate-fade-in">
          <div className="glass card" style={{ padding: '24px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Raw Workout Log
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
              placeholder={`Paste your workout log here...\n\nExample:\nMarch 3 Push\n\nBench\n60x15\n60x15\n\nIncline DB\n20x15`}
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              spellCheck={false}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
              <span style={{ fontSize: '12px', color: rawText.length > 10000 ? 'var(--error-color)' : 'var(--text-secondary)', fontWeight: '600' }}>
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

          {/* Tips */}
          <div className="glass card" style={{ padding: '20px', marginTop: '24px', margin: '24px 0 0' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', marginBottom: '14px' }}>Supported formats</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                ['60x15', 'weight × reps (60kg × 15)'],
                ['x15 or just 15', 'reps only (bodyweight)'],
                ['March 3 Push', 'date + split name'],
                ['Incline DB Press', 'full or partial exercise names'],
                ['Curl (ambiguous)', 'AI asks for clarification'],
              ].map(([code, desc]) => (
                <div key={code} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <code style={{ background: 'rgba(255,255,255,0.07)', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', color: 'var(--accent-hover)', fontWeight: '700', flexShrink: 0 }}>{code}</code>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ STEP: PARSING */}
      {step === 'parsing' && (
        <div className="animate-fade-in" style={{ textAlign: 'center', padding: '80px 0' }}>
          <div className="glass card parsing-pulse" style={{ display: 'inline-flex', padding: '28px', borderRadius: '50%', marginBottom: '32px' }}>
            <Sparkles size={48} color="var(--accent-hover)" />
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px', marginBottom: '12px' }}>Analyzing your workout…</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: '500' }}>
            AI is parsing exercises, weights, and mapping muscle groups.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
            <Loader2 className="animate-spin" size={20} color="var(--text-secondary)" />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>This takes 5–15 seconds</span>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ STEP: CLARIFY */}
      {step === 'clarify' && parsed && (
        <div className="animate-fade-in">
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px' }}>Clarify Ambiguous Exercises</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>
              {parsed.ambiguous.length} exercise{parsed.ambiguous.length !== 1 ? 's need' : ' needs'} clarification before we can import.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
            {parsed.ambiguous.map(amb => (
              <div key={amb.raw} className="glass card" style={{ padding: '20px', margin: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ background: 'rgba(255,159,10,0.12)', padding: '7px', borderRadius: '10px' }}>
                    <AlertTriangle size={16} color="#FF9F0A" />
                  </div>
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '16px', color: 'white' }}>"{amb.raw}"</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginTop: '2px' }}>Could not be identified with high confidence</div>
                  </div>
                </div>
                <AmbiguityDropdown
                  raw={amb.raw}
                  options={amb.options ?? []}
                  value={resolutions[amb.raw] ?? ''}
                  onChange={val => setResolutions(prev => ({ ...prev, [amb.raw]: val }))}
                />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn-secondary"
              onClick={() => setStep('preview')}
              style={{ flex: 1, padding: '16px', borderRadius: '16px', fontSize: '15px' }}
            >
              Skip → Preview
            </button>
            <button
              className="btn-primary"
              onClick={() => setStep('preview')}
              disabled={!allResolved}
              style={{ flex: 2, padding: '16px', borderRadius: '16px', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: allResolved ? 1 : 0.6 }}
            >
              <Check size={18} /> Confirm & Preview
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ STEP: PREVIEW */}
      {step === 'preview' && parsed && (
        <div className="animate-fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px' }}>Preview Import</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', margin: 0 }}>
                Review before saving to your account.
              </p>
            </div>
            <button
              onClick={handleReset}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'var(--text-secondary)', padding: '8px 14px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={13} /> Start over
            </button>
          </div>

          {/* Session meta */}
          <div className="glass card" style={{ padding: '20px', marginBottom: '20px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Calendar size={16} color="var(--accent-hover)" />
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Date</div>
                <div style={{ fontWeight: '800', fontSize: '15px' }}>{parsed.date ?? 'Today'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Dumbbell size={16} color="#30D158" />
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Split</div>
                <div style={{ fontWeight: '800', fontSize: '15px' }}>{parsed.split ?? 'Unknown'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Zap size={16} color="#FF9F0A" />
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Exercises</div>
                <div style={{ fontWeight: '800', fontSize: '15px' }}>{resolvedExercises.length}</div>
              </div>
            </div>
          </div>

          {/* Exercise preview cards */}
          {resolvedExercises.map((ex, idx) => (
            <div key={idx} className="glass ex-preview-card" style={{ margin: '0 0 14px' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '800', fontSize: '17px', color: 'white' }}>{ex.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                    <div style={{ width: '120px' }}>
                      <div className="confidence-bar">
                        <div
                          className="confidence-fill"
                          style={{ width: `${(ex.confidence ?? 0) * 100}%`, background: confidenceColor(ex.confidence ?? 0) }}
                        />
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: confidenceColor(ex.confidence ?? 0), textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {confidenceLabel(ex.confidence ?? 0)} confidence
                    </span>
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '800', color: 'var(--text-secondary)' }}>
                  {ex.sets?.length ?? 0} sets
                </div>
              </div>
              <div style={{ padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {ex.sets?.map((s, si) => (
                  <div key={si} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', fontWeight: '700', color: 'white' }}>
                    {s.weight_kg > 0 ? `${s.weight_kg}kg` : 'BW'} × {s.reps}
                  </div>
                ))}
                {(!ex.sets || ex.sets.length === 0) && (
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No sets detected</span>
                )}
              </div>
            </div>
          ))}

          {saveError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 18px', background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: '14px', marginBottom: '16px' }}>
              <AlertTriangle size={16} color="var(--error-color)" />
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--error-color)' }}>{saveError}</span>
            </div>
          )}

          <button
            className="btn-primary"
            onClick={handleImport}
            disabled={resolvedExercises.length === 0}
            style={{ width: '100%', padding: '18px', fontSize: '16px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '8px' }}
          >
            <Upload size={20} />
            Import {resolvedExercises.length} Exercise{resolvedExercises.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ STEP: SAVING */}
      {step === 'saving' && (
        <div className="animate-fade-in" style={{ textAlign: 'center', padding: '80px 0' }}>
          <div className="glass card parsing-pulse" style={{ display: 'inline-flex', padding: '28px', borderRadius: '50%', marginBottom: '32px' }}>
            <Loader2 size={48} color="var(--accent-hover)" className="animate-spin" />
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px', marginBottom: '12px' }}>Saving to your account…</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: '500' }}>Inserting exercises and sets into the database.</p>
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
            Your workout has been saved and is now in your history.
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

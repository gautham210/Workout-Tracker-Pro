import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  Sparkles, Send, Loader2, ArrowRight, Check,
  Bot, User as UserIcon, Dumbbell, ClipboardList, TrendingUp
} from 'lucide-react';

function AICoach() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages]   = useState(() => {
    try {
      const cached = localStorage.getItem('wtp_coach_chat_history');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return [
      {
        role:    'assistant',
        content: "Hello! I am your AI Gym Coach. I have analyzed your fitness context and database history.\n\nAsk me anything about your splits, suggestions for progressive overload, recovery gaps, or high-protein macro targets!",
      }
    ];
  });
  const [inputText, setInputText] = useState('');
  const [loading, setLoading]     = useState(false);
  const [applying, setApplying]   = useState(false);

  // Cache the chat history locally on every message state update
  useEffect(() => {
    try {
      localStorage.setItem('wtp_coach_chat_history', JSON.stringify(messages));
    } catch (e) {}
  }, [messages]);

  // Training Context gathered from Supabase
  const [context, setContext] = useState(null);
  const [contextLoaded, setContextLoaded] = useState(false);

  const messagesEndRef = useRef(null);

  // ── Gather User Training Context ──────────────────────────────────────────
  useEffect(() => {
    if (!user || contextLoaded) return;

    const gatherContext = async () => {
      try {
        // 1. Fetch recent sessions (strictly limit to latest 3)
        const { data: rawSessions } = await supabase
          .from('workout_sessions')
          .select('id, date, split_type, split_day')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(3);

        const recentSessions = rawSessions ?? [];

        // 2. Fetch bodyweight trends (strictly limit to latest 1 mass log)
        const { data: rawBW } = await supabase
          .from('bodyweight_logs')
          .select('date, weight_kg')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(1);

        const bodyweightTrends = rawBW ?? [];

        // 3. Resolve active split
        let activeSplit = 'PPL';
        if (profile?.active_loop) {
          activeSplit = profile.active_loop.name ?? 'Active Program';
        } else if (profile?.custom_split?.length > 0) {
          activeSplit = 'Custom Split';
        }

        // 4. Fetch strongest lifts (strictly limit to top 5, slice top 3 unique milestone lifts)
        const { data: maxSets } = await supabase
          .from('sets')
          .select('weight_kg, reps, session_exercises!inner(exercise_id, exercises(name), workout_sessions!inner(user_id))')
          .eq('session_exercises.workout_sessions.user_id', user.id)
          .order('weight_kg', { ascending: false })
          .limit(5);

        const strongestLifts = [];
        const seenExercises = new Set();
        if (maxSets) {
          maxSets.forEach(s => {
            const exName = s.session_exercises?.exercises?.name;
            if (exName && !seenExercises.has(exName)) {
              seenExercises.add(exName);
              strongestLifts.push({
                exercise: exName,
                weight: s.weight_kg,
                reps: s.reps
              });
            }
          });
        }

        // 5. Calculate recovery gaps (days since last session)
        let recoveryGaps = 'No recent sessions logged';
        if (recentSessions.length > 0) {
          const lastDate = new Date(recentSessions[0].date);
          const diffDays = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
          recoveryGaps = `${diffDays} day${diffDays !== 1 ? 's' : ''} since your last training session`;
        }

        // 6. Calculate consistency %
        let consistency = 0;
        if (recentSessions.length > 0) {
          const thirtyAgo = new Date();
          thirtyAgo.setDate(thirtyAgo.getDate() - 30);
          const sessions30 = recentSessions.filter(s => new Date(s.date) >= thirtyAgo).length;
          consistency = Math.min(Math.round((sessions30 / 12) * 100), 100); // 12 workouts in 30 days as 100% standard
        }

        setContext({
          recentSessions,
          bodyweightTrends,
          activeSplit,
          strongestLifts: strongestLifts.slice(0, 3),
          recoveryGaps,
          consistency
        });
        setContextLoaded(true);
      } catch (err) {
        console.error('[AI_CHAT] Context extraction failed:', err.message);
        setContextLoaded(true); // graceful fallback to empty context
      }
    };

    gatherContext();
  }, [user, profile, contextLoaded]);

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ── Send Message ──────────────────────────────────────────────────────────
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const promptText = inputText.trim();
    if (!promptText || loading) return;

    const userMessage = { role: 'user', content: promptText };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    // 1. Check prompt/response cache in localStorage with 1-hour TTL
    try {
      const cleanPrompt = promptText.toLowerCase().trim();
      const rawCache = localStorage.getItem('wtp_coach_chat_cache');
      const cacheMap = rawCache ? JSON.parse(rawCache) : {};
      const cachedItem = cacheMap[cleanPrompt];

      if (cachedItem && Date.now() - cachedItem.timestamp < 60 * 60 * 1000) {
        // Natural brief loader delay to feel organic
        setTimeout(() => {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: cachedItem.response, intent: cachedItem.intent }
          ]);
          setLoading(false);
        }, 500);
        return;
      }
    } catch (e) {}

    let attempt = 1;
    let success = false;
    let data = null;
    let lastError = null;

    while (attempt <= 2 && !success) {
      const controller = new AbortController();
      const abortTimeout = setTimeout(() => {
        controller.abort();
      }, 9000); // 9000ms AbortController timeout

      try {
        const res = await fetch('/api/ai-chat', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          signal:  controller.signal,
          body:    JSON.stringify({
            messages: [...messages, userMessage],
            context
          })
        });

        clearTimeout(abortTimeout);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error ?? `Server error (${res.status})`);
        }

        data = await res.json();
        success = true;
      } catch (err) {
        clearTimeout(abortTimeout);
        lastError = err;
        console.warn(`[AI_CHAT] Attempt ${attempt} failed:`, err.message);
        if (attempt === 1) {
          // Wait 500ms before automatic retry
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      attempt++;
    }

    if (success && data) {
      setMessages(prev => [...prev, { role: 'assistant', content: data.text, intent: data.intent }]);

      // Store response inside prompt cache
      try {
        const cleanPrompt = promptText.toLowerCase().trim();
        const rawCache = localStorage.getItem('wtp_coach_chat_cache');
        const cacheMap = rawCache ? JSON.parse(rawCache) : {};
        cacheMap[cleanPrompt] = {
          response: data.text,
          intent: data.intent,
          timestamp: Date.now()
        };
        localStorage.setItem('wtp_coach_chat_cache', JSON.stringify(cacheMap));
      } catch (e) {}
    } else {
      console.error('[AI_CHAT] All retry attempts exhausted:', lastError?.message);
      setMessages(prev => [
        ...prev,
        {
          role:    'assistant',
          content: '⚠️ AI Coach is temporarily overloaded. Try again in a few seconds.',
          intent:  'unrelated'
        }
      ]);
    }

    setLoading(false);
  };

  // ── Apply Suggested Workout ───────────────────────────────────────────────
  const handleApplyWorkout = async (workoutToApply) => {
    if (!workoutToApply || applying || !user) return;
    setApplying(true);

    try {
      const builtExercises = await Promise.all(
        workoutToApply.exercises.map(async (item) => {
          // Resolve item name (can be string or object)
          const name = typeof item === 'object' && item !== null ? item.name : item;
          const aiWeight = typeof item === 'object' && item !== null ? item.weight : null;
          const aiReps = typeof item === 'object' && item !== null ? item.reps : null;

          // 1. Resolve exercise in database
          let exerciseObj = null;
          try {
            const { data } = await supabase
              .from('exercises')
              .select('id, name, muscle_group')
              .ilike('name', name)
              .limit(1)
              .single();
            exerciseObj = data;
          } catch { /* not found in db */ }

          if (!exerciseObj) {
            exerciseObj = { id: `custom-${Date.now()}-${Math.random()}`, name, muscle_group: 'Other' };
          }

          // 2. Fetch user's absolute best set performance for suggestion display
          let suggestedPerformance = null;
          let bestWeight = null;
          let bestReps = null;
          try {
            const { data: bestSets } = await supabase
              .from('sets')
              .select('weight_kg, reps, session_exercises!inner(exercise_id, workout_sessions!inner(user_id))')
              .eq('session_exercises.exercise_id', exerciseObj.id)
              .eq('session_exercises.workout_sessions.user_id', user.id)
              .order('weight_kg', { ascending: false })
              .order('reps', { ascending: false })
              .limit(1)
              .single();

            if (bestSets) {
              bestWeight = bestSets.weight_kg;
              bestReps = bestSets.reps;
              suggestedPerformance = `${bestSets.weight_kg}kg × ${bestSets.reps}`;
            }
          } catch { /* no previous data */ }

          // Resolve targets: AI explicit > User Best Performance > default values
          const targetObj = workoutToApply.targets?.[name];
          const finalSuggestedWeight = targetObj?.weight ?? aiWeight ?? bestWeight ?? '';
          const finalSuggestedReps = targetObj?.reps ?? aiReps ?? bestReps ?? '12';

          return {
            exercise: exerciseObj,
            sets: [
              { weight_kg: '', reps: '', suggestedWeight: String(finalSuggestedWeight), suggestedReps: String(finalSuggestedReps) },
              { weight_kg: '', reps: '', suggestedWeight: String(finalSuggestedWeight), suggestedReps: String(finalSuggestedReps) },
              { weight_kg: '', reps: '', suggestedWeight: String(finalSuggestedWeight), suggestedReps: String(finalSuggestedReps) }
            ],
            suggestedPerformance
          };
        })
      );

      // Construct localStorage draft object
      const draft = {
        userId: user.id,
        savedAt: Date.now(),
        splitType: 'Custom',
        splitDay: workoutToApply.split ?? 'Push',
        workoutDate: new Date().toLocaleDateString('en-CA'),
        sessionExercises: builtExercises
      };

      localStorage.setItem('wtp_workout_draft_v2', JSON.stringify(draft));
      localStorage.removeItem('wtp_active_scroll'); // clear scroll

      // Redirect immediately to workout active page
      navigate('/workout');
    } catch (err) {
      console.error('[AI_CHAT] Applying workout failed:', err.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', maxWidth: '800px', margin: '0 auto', paddingBottom: '20px' }}>
      <style>{`
        @keyframes typingBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .typing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-hover); animation: typingBounce 1s infinite ease-in-out; }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
        .coach-chat-box { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 20px; display: flex; flex-direction: column; gap: 16px; border-radius: 20px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255,255,255,0.06); min-height: 0; }
        .message-bubble { max-width: 85%; border-radius: 18px; padding: 12px 18px; font-size: 14px; line-height: 1.6; font-weight: 500; display: flex; flex-direction: column; width: fit-content; word-break: break-word; }
        .message-bubble.assistant { background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.9); border-bottom-left-radius: 4px; border: 1px solid rgba(255,255,255,0.04); align-self: flex-start; }
        .message-bubble.user { background: var(--accent-color); color: white; align-self: flex-end; border-bottom-right-radius: 4px; box-shadow: 0 4px 16px rgba(0,122,255,0.25); }
      `}</style>

      {/* ── Title Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', marginTop: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'linear-gradient(135deg, #2563eb, #60a5fa)', padding: '10px', borderRadius: '14px', boxShadow: '0 4px 20px rgba(37,99,235,0.3)' }}>
            <Sparkles size={20} color="white" />
          </div>
          <div>
            <h1 className="title" style={{ margin: 0, fontSize: '24px' }}>AI Gym Coach</h1>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Intelligence & Guidance</span>
          </div>
        </div>
      </div>

      {/* ── Conversational Window ── */}
      <div className="coach-chat-box">
        {messages.map((msg, idx) => {
          // Format text cleanly (remove code blocks from visual render if it is suggestedWorkout block)
          let cleanContent = msg.content;
          let suggestedWorkoutForMsg = null;
          if (msg.role === 'assistant') {
            cleanContent = cleanContent.replace(/```workout-suggested([\s\S]*?)```/g, '').trim();
            const match = msg.content.match(/```workout-suggested([\s\S]*?)```/);
            if (match && msg.intent === 'workout_generation') {
              try {
                suggestedWorkoutForMsg = JSON.parse(match[1].trim());
              } catch (e) {
                console.error('Failed to parse suggested workout JSON from message:', e);
              }
            }
          }

          return (
            <div
              key={idx}
              className={`message-bubble ${msg.role}`}
              style={{ whiteSpace: 'pre-wrap' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '11px', color: msg.role === 'assistant' ? 'var(--accent-hover)' : 'rgba(255,255,255,0.6)', fontWeight: '700' }}>
                {msg.role === 'assistant' ? <Bot size={13} /> : <UserIcon size={13} />}
                {msg.role === 'assistant' ? 'AI Coach' : 'You'}
              </div>
              <div style={{ wordBreak: 'break-word' }}>{cleanContent}</div>

              {/* ── Suggested Workout Hydration Block (Inline) ── */}
              {suggestedWorkoutForMsg && (
                <div 
                  className="glass card animate-fade-in" 
                  style={{ 
                    marginTop: '12px', 
                    borderLeft: '4px solid var(--accent-hover)', 
                    background: 'rgba(255, 255, 255, 0.03)', 
                    padding: '12px', 
                    borderRadius: '12px', 
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <Dumbbell size={15} color="var(--accent-hover)" />
                    <span style={{ fontWeight: '800', fontSize: '13px', color: 'white' }}>Suggested Workout Routine</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '12px' }}>
                    Split Day: <strong style={{ color: 'white' }}>{suggestedWorkoutForMsg.split ?? 'Custom'}</strong>
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {suggestedWorkoutForMsg.exercises.map((ex, i) => {
                        const name = typeof ex === 'object' && ex !== null ? ex.name : ex;
                        const weight = typeof ex === 'object' && ex !== null ? ex.weight : null;
                        const reps = typeof ex === 'object' && ex !== null ? ex.reps : null;
                        const spec = weight && reps ? ` (${weight}kg × ${reps})` : '';
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--text-secondary)' }} />
                            <span style={{ color: 'rgba(255,255,255,0.85)' }}>{name}{spec}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    onClick={() => handleApplyWorkout(suggestedWorkoutForMsg)}
                    disabled={applying}
                    className="btn-primary"
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px', 
                      fontSize: '12px', 
                      borderRadius: '8px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '6px',
                      cursor: 'pointer',
                      border: 'none',
                      fontWeight: '700'
                    }}
                  >
                    {applying ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {applying ? 'Preloading Workout...' : 'Apply Suggested Workout'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="message-bubble assistant" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '14px 20px' }}>
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Context Dashboard (Compact, premium overlay) ── */}
      {context && (
        <div className="glass" style={{ display: 'flex', gap: '16px', padding: '10px 16px', borderRadius: '16px', margin: '12px 0 0', justifyContent: 'space-around', alignItems: 'center', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ClipboardList size={14} color="var(--accent-hover)" />
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.8)' }}>Split: {context.activeSplit}</span>
          </div>
          <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', height: '14px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <TrendingUp size={14} color="#30D158" />
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.8)' }}>Consistency: {context.consistency}%</span>
          </div>
        </div>
      )}

      {/* ── Input bar ── */}
      <form
        onSubmit={handleSendMessage}
        className="glass"
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '18px', marginTop: '12px', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <input
          type="text"
          placeholder="Ask AI Coach..."
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          disabled={loading}
          style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', padding: '10px', fontSize: '14px', outline: 'none' }}
        />
        <button
          type="submit"
          disabled={loading || !inputText.trim()}
          style={{
            background: inputText.trim() ? 'var(--accent-color)' : 'rgba(255,255,255,0.04)',
            color: inputText.trim() ? 'white' : 'rgba(255,255,255,0.2)',
            border: 'none', borderRadius: '12px', width: '38px', height: '38px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            transition: 'background 0.2s, transform 0.1s',
            transform: loading ? 'scale(0.95)' : 'none'
          }}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

export default memo(AICoach);

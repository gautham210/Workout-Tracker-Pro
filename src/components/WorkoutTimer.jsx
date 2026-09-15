import { useState, useEffect, useRef } from 'react';
import { Timer, X, Play, Pause, Plus, RefreshCw } from 'lucide-react';

/**
 * Heuristic to classify exercises into isolation, compound, or hypertrophy rest defaults.
 */
export function getRestDurationForExercise(exerciseName) {
  const name = (exerciseName || '').toLowerCase();
  const compounds = ['squat', 'bench', 'deadlift', 'press', 'row', 'pullup', 'chinup', 'dips', 'lunge', 'clean', 'jerk', 'snatch'];
  const isolations = ['lateral raise', 'fly', 'curl', 'extension', 'pushdown', 'calf raise', 'shrug', 'face pull', 'rear delt', 'plank', 'crunch'];
  
  if (compounds.some(c => name.includes(c))) return 120; // 120s compound
  if (isolations.some(i => name.includes(i))) return 60;  // 60s isolation
  return 90; // 90s hypertrophy default
}

export default function WorkoutTimer({ activeExerciseName, triggerCount, onSkip }) {
  const [isActive, setIsActive] = useState(false);
  const [duration, setDuration] = useState(90); // default 90s
  const [timeLeft, setTimeLeft] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  
  const timerRef = useRef(null);

  // Sync with localStorage on trigger
  useEffect(() => {
    if (triggerCount === 0) return;

    // Determine target rest duration
    const targetSec = getRestDurationForExercise(activeExerciseName);
    const endTimestamp = Date.now() + targetSec * 1000;

    localStorage.setItem('wtp_timer_active', 'true');
    localStorage.setItem('wtp_timer_duration', String(targetSec));
    localStorage.setItem('wtp_timer_end', String(endTimestamp));
    localStorage.setItem('wtp_timer_paused', 'false');
    localStorage.setItem('wtp_timer_paused_remaining', '0');

    setDuration(targetSec);
    setTimeLeft(targetSec);
    setIsPaused(false);
    setIsActive(true);
  }, [triggerCount, activeExerciseName]);

  // Restore state from localStorage on mount
  useEffect(() => {
    const localActive = localStorage.getItem('wtp_timer_active') === 'true';
    if (!localActive) return;

    const localDuration = parseInt(localStorage.getItem('wtp_timer_duration') || '90', 10);
    const localPaused = localStorage.getItem('wtp_timer_paused') === 'true';
    const localEnd = parseInt(localStorage.getItem('wtp_timer_end') || '0', 10);
    const localPausedRem = parseInt(localStorage.getItem('wtp_timer_paused_remaining') || '0', 10);

    setDuration(localDuration);
    setIsPaused(localPaused);

    if (localPaused) {
      setTimeLeft(Math.max(0, Math.ceil(localPausedRem / 1000)));
      setIsActive(true);
    } else {
      const remainingSec = Math.max(0, Math.ceil((localEnd - Date.now()) / 1000));
      if (remainingSec > 0) {
        setTimeLeft(remainingSec);
        setIsActive(true);
      } else {
        clearTimerState();
      }
    }
  }, []);

  // Timer interval engine
  useEffect(() => {
    if (!isActive || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      const localEnd = parseInt(localStorage.getItem('wtp_timer_end') || '0', 10);
      const diffSec = Math.max(0, Math.ceil((localEnd - Date.now()) / 1000));
      
      if (diffSec <= 0) {
        clearInterval(timerRef.current);
        setIsActive(false);
        clearTimerState();
        // Play gentle vibration pattern if supported
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
      } else {
        setTimeLeft(diffSec);
      }
    }, 200);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, isPaused]);

  const clearTimerState = () => {
    localStorage.removeItem('wtp_timer_active');
    localStorage.removeItem('wtp_timer_duration');
    localStorage.removeItem('wtp_timer_end');
    localStorage.removeItem('wtp_timer_paused');
    localStorage.removeItem('wtp_timer_paused_remaining');
    setIsActive(false);
    if (onSkip) onSkip();
  };

  const handlePauseToggle = () => {
    if (isPaused) {
      // Resume timer
      const remainingMs = timeLeft * 1000;
      const newEnd = Date.now() + remainingMs;
      localStorage.setItem('wtp_timer_end', String(newEnd));
      localStorage.setItem('wtp_timer_paused', 'false');
      setIsPaused(false);
    } else {
      // Pause timer
      const currentEnd = parseInt(localStorage.getItem('wtp_timer_end') || '0', 10);
      const remainingMs = Math.max(0, currentEnd - Date.now());
      localStorage.setItem('wtp_timer_paused', 'true');
      localStorage.setItem('wtp_timer_paused_remaining', String(remainingMs));
      setIsPaused(true);
    }
  };

  const handleAdd15s = () => {
    const additionalSec = 15;
    const newDuration = duration + additionalSec;
    setDuration(newDuration);
    localStorage.setItem('wtp_timer_duration', String(newDuration));

    if (isPaused) {
      const newTimeLeft = timeLeft + additionalSec;
      setTimeLeft(newTimeLeft);
      localStorage.setItem('wtp_timer_paused_remaining', String(newTimeLeft * 1000));
    } else {
      const currentEnd = parseInt(localStorage.getItem('wtp_timer_end') || '0', 10);
      const newEnd = Math.max(Date.now(), currentEnd) + additionalSec * 1000;
      localStorage.setItem('wtp_timer_end', String(newEnd));
      setTimeLeft(Math.max(0, Math.ceil((newEnd - Date.now()) / 1000)));
    }
  };

  const handleOverrideDuration = (sec) => {
    setDuration(sec);
    setTimeLeft(sec);
    localStorage.setItem('wtp_timer_duration', String(sec));
    if (isPaused) {
      localStorage.setItem('wtp_timer_paused_remaining', String(sec * 1000));
    } else {
      const newEnd = Date.now() + sec * 1000;
      localStorage.setItem('wtp_timer_end', String(newEnd));
    }
  };

  if (!isActive) return null;

  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const seconds = String(timeLeft % 60).padStart(2, '0');
  const progressPercent = Math.min(100, Math.max(0, (timeLeft / duration) * 100));

  return (
    <div 
      className="glass" 
      style={{ 
        position: 'fixed', 
        bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))', 
        left: '20px', 
        right: '20px', 
        zIndex: 200, 
        padding: '16px 20px', 
        borderRadius: '20px', 
        background: 'rgba(10, 14, 20, 0.96)', 
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '500px',
        margin: '0 auto'
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Timer size={16} color="var(--accent-hover)" className={!isPaused ? 'animate-pulse' : ''} />
          <span style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)' }}>
            Resting • {activeExerciseName}
          </span>
        </div>
        <button 
          onClick={clearTimerState} 
          style={{ background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Main Row: Time & Control Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Time Left Display */}
        <div style={{ fontSize: '42px', fontWeight: '900', fontFamily: 'monospace', color: 'white', letterSpacing: '-1px' }}>
          {minutes}:{seconds}
        </div>

        {/* Buttons Row */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={handleAdd15s}
            style={{ 
              background: 'rgba(255,255,255,0.06)', 
              border: '1px solid rgba(255,255,255,0.08)', 
              borderRadius: '12px', 
              padding: '10px 14px', 
              color: 'white', 
              fontSize: '13px', 
              fontWeight: '700', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px',
              cursor: 'pointer' 
            }}
          >
            <Plus size={14} /> +15s
          </button>
          
          <button 
            onClick={handlePauseToggle}
            style={{ 
              background: isPaused ? 'rgba(48,209,88,0.15)' : 'rgba(255,159,10,0.15)', 
              border: isPaused ? '1px solid rgba(48,209,88,0.3)' : '1px solid rgba(255,159,10,0.3)', 
              borderRadius: '12px', 
              padding: '10px 14px', 
              color: isPaused ? '#30D158' : '#FF9F0A', 
              fontSize: '13px', 
              fontWeight: '700', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>

          <button 
            onClick={clearTimerState}
            style={{ 
              background: 'rgba(255,69,58,0.1)', 
              border: '1px solid rgba(255,69,58,0.3)', 
              borderRadius: '12px', 
              padding: '10px 14px', 
              color: '#FF453A', 
              fontSize: '13px', 
              fontWeight: '700', 
              cursor: 'pointer'
            }}
          >
            Skip
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '100px', height: '6px', overflow: 'hidden', position: 'relative' }}>
        <div 
          style={{ 
            height: '100%', 
            background: 'var(--accent-hover)', 
            width: `${progressPercent}%`, 
            transition: 'width 0.25s linear', 
            borderRadius: '100px' 
          }} 
        />
      </div>

      {/* Override Quick Chips */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
        {[45, 60, 90, 120, 180].map(sec => (
          <button
            key={sec}
            onClick={() => handleOverrideDuration(sec)}
            style={{
              background: duration === sec ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.04)',
              border: duration === sec ? '1px solid var(--accent-hover)' : '1px solid rgba(255,255,255,0.06)',
              borderRadius: '8px',
              padding: '4px 10px',
              color: duration === sec ? 'white' : 'rgba(255,255,255,0.6)',
              fontSize: '11px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
          </button>
        ))}
      </div>
    </div>
  );
}

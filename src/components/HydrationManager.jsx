import { useState, useEffect, useRef } from 'react';
import { Droplet, Settings, X, Check } from 'lucide-react';

export default function HydrationManager({ completedSetsCount }) {
  const [showPopup, setShowPopup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Hydration Settings (saved in localStorage)
  const [type, setType] = useState(() => localStorage.getItem('wtp_hydro_type') || 'disabled'); // 'disabled' | 'time' | 'sets'
  const [interval, setIntervalVal] = useState(() => parseInt(localStorage.getItem('wtp_hydro_interval') || '15', 10)); // 10 | 15 | 20 (min) or 4 | 5 (sets)

  const setsTrackerRef = useRef(0);
  const timerRef = useRef(null);

  // Save settings when they change
  const saveSettings = (newType, newInterval) => {
    setType(newType);
    setIntervalVal(newInterval);
    localStorage.setItem('wtp_hydro_type', newType);
    localStorage.setItem('wtp_hydro_interval', String(newInterval));
    setShowSettings(false);
    
    // Reset tracker contexts
    setsTrackerRef.current = 0;
    setupTimer(newType, newInterval);
  };

  // Setup time-based background timer
  const setupTimer = (activeType, activeInterval) => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    if (activeType === 'time') {
      const ms = activeInterval * 60 * 1000;
      timerRef.current = setInterval(() => {
        setShowPopup(true);
      }, ms);
    }
  };

  // Initialize timer on mount
  useEffect(() => {
    setupTimer(type, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [type, interval]);

  // Track checked sets changes reactively
  useEffect(() => {
    if (type !== 'sets' || completedSetsCount === 0) return;

    // Increment completed sets counter
    setsTrackerRef.current += 1;

    if (setsTrackerRef.current >= interval) {
      setShowPopup(true);
      setsTrackerRef.current = 0; // reset
    }
  }, [completedSetsCount, type, interval]);

  if (!showPopup && !showSettings) {
    // Render a small hydration chip so the user knows they can configure reminders
    return (
      <div style={{ position: 'fixed', right: '16px', top: '16px', zIndex: 100 }}>
        <button
          onClick={() => setShowSettings(true)}
          style={{
            background: type !== 'disabled' ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${type !== 'disabled' ? 'rgba(0,122,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: '100px',
            padding: '6px 12px',
            color: type !== 'disabled' ? 'var(--accent-hover)' : 'var(--text-secondary)',
            fontSize: '11px',
            fontWeight: '700',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            transition: 'all 0.2s'
          }}
        >
          <Droplet size={13} fill={type !== 'disabled' ? 'var(--accent-hover)' : 'none'} />
          <span>💧 Hydration {type !== 'disabled' ? 'On' : 'Off'}</span>
        </button>
      </div>
    );
  }

  return (
    <div 
      style={{ 
        position: 'fixed', 
        top: '0', left: '0', right: '0', bottom: '0', 
        background: 'rgba(21,32,51,0.22)',
        backdropFilter: 'blur(10px)', 
        zIndex: 500, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div 
        className="glass" 
        style={{ 
          width: '100%', 
          maxWidth: '380px', 
          background: 'rgba(255,255,255,0.98)',
          border: '1px solid rgba(35,55,88,0.10)',
          borderRadius: '24px', 
          padding: '24px',
          boxShadow: '0 20px 48px rgba(30,50,82,0.18)',
          textAlign: 'center',
          animation: 'pageFadeIn 0.3s cubic-bezier(0.2,0.8,0.2,1) forwards'
        }}
      >
        {showSettings ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={18} color="var(--accent-hover)" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>Hydration Config</h3>
              </div>
              <button 
                onClick={() => setShowSettings(false)} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Reminder Type Selectors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px', textAlign: 'left' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
                Reminder Trigger
              </span>
              {[
                { key: 'disabled', label: 'Disabled (No Reminders)' },
                { key: 'time', label: 'Time Interval' },
                { key: 'sets', label: 'Completed Sets Count' }
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => saveSettings(opt.key, opt.key === 'time' ? 15 : 4)}
                  style={{
                    background: type === opt.key ? 'rgba(0,122,255,0.10)' : '#f5f7fb',
                    border: type === opt.key ? '1px solid var(--accent-hover)' : '1px solid rgba(35,55,88,0.08)',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    color: 'var(--text-primary)',
                    fontWeight: '700',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.15s'
                  }}
                >
                  <span>{opt.label}</span>
                  {type === opt.key && <Check size={14} color="var(--accent-hover)" />}
                </button>
              ))}
            </div>

            {/* Custom Values Suboptions */}
            {type !== 'disabled' && (
              <div style={{ textAlign: 'left', marginBottom: '20px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                  {type === 'time' ? 'Reminder Frequency (minutes)' : 'Set Frequency (sets)'}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(type === 'time' ? [10, 15, 20] : [3, 4, 5]).map(val => (
                    <button
                      key={val}
                      onClick={() => saveSettings(type, val)}
                      style={{
                        flex: 1,
                        background: interval === val ? 'rgba(0,122,255,0.10)' : '#f5f7fb',
                        border: interval === val ? '1px solid var(--accent-hover)' : '1px solid rgba(35,55,88,0.08)',
                        borderRadius: '10px',
                        padding: '10px',
                        color: 'var(--text-primary)',
                        fontWeight: '800',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {val} {type === 'time' ? 'min' : 'sets'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ background: 'rgba(0,122,255,0.1)', padding: '16px', borderRadius: '50%', display: 'inline-flex', marginBottom: '16px', color: 'var(--accent-hover)' }}>
              <Droplet size={36} fill="var(--accent-hover)" />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: '900', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
              💧 Hydration Check
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', fontWeight: '500' }}>
              Take a few deep sips of water now. Fuel your working muscles.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className="btn-primary"
                onClick={() => setShowPopup(false)}
                style={{ width: '100%', padding: '12px', borderRadius: '12px', fontSize: '14px' }}
              >
                Dismiss Check
              </button>
              <button
                onClick={() => { setShowPopup(false); setShowSettings(true); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '11px', fontWeight: '700', padding: '6px' }}
              >
                Configure Reminders
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Premium custom dropdown — no <select>, dark theme, smooth animation.
 * Props: value, options (string[]), onChange, accentColor (optional)
 */
export default function Dropdown({ value, options, onChange, accentColor = 'var(--accent-hover)' }) {
  const [open, setOpen] = useState(false);
  const ref             = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '12px 16px', borderRadius: '16px',
          color: 'white', fontWeight: '800', fontSize: '20px',
          transition: 'background 0.2s',
        }}
        onMouseOver={e  => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
        onMouseOut={e   => { e.currentTarget.style.background = 'transparent'; }}
        onMouseDown={e  => { e.currentTarget.style.transform = 'scale(0.97)'; }}
        onMouseUp={e    => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <span style={{ color: accentColor }}>{value}</span>
        <ChevronDown
          size={18}
          color={accentColor}
          style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
        />
      </button>

      {/* Menu */}
      <div style={{
        position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 200,
        background: '#0f172a',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
        // Animate open/close
        opacity:    open ? 1 : 0,
        transform:  open ? 'translateY(0)' : 'translateY(-8px)',
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 0.18s ease, transform 0.18s ease',
      }}>
        {options.map((opt) => {
          const isSelected = opt === value;
          return (
            <div
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              style={{
                padding: '12px 18px',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '15px',
                color: isSelected ? accentColor : 'rgba(255,255,255,0.8)',
                background: isSelected ? 'rgba(0,122,255,0.12)' : 'transparent',
                borderLeft: isSelected ? `3px solid ${accentColor}` : '3px solid transparent',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseOver={e => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'rgba(0,122,255,0.08)';
                  e.currentTarget.style.color = 'white';
                }
              }}
              onMouseOut={e => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
                }
              }}
              onMouseDown={e => { e.currentTarget.style.background = 'rgba(0,122,255,0.18)'; }}
              onMouseUp={e   => { e.currentTarget.style.background = isSelected ? 'rgba(0,122,255,0.12)' : 'rgba(0,122,255,0.08)'; }}
            >
              {opt}
            </div>
          );
        })}
      </div>
    </div>
  );
}

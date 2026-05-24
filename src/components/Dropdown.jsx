import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

/**
 * Premium custom dropdown — portal-rendered, viewport-collision-safe.
 * Props: value, options (string[]), onChange, accentColor (optional)
 *
 * Fixes vs previous version:
 *  - Menu rendered via React Portal → never clipped by overflow:hidden parents
 *  - Position recalculated fresh on every open (not stale useEffect)
 *  - Viewport bottom-edge detection → flips upward when near bottom of screen
 *  - Viewport right-edge detection → shifts left when menu would overflow
 *  - Stable outside-click detection that handles the portal correctly
 */
export default function Dropdown({ value, options, onChange, accentColor = 'var(--accent-hover)' }) {
  const [open, setOpen]         = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const triggerRef              = useRef(null);
  const menuRef                 = useRef(null);

  const MENU_MAX_HEIGHT = 320;
  const ITEM_HEIGHT     = 48;
  const MENU_PADDING    = 16;

  // Compute stable position every time we open
  const positionMenu = useCallback(() => {
    if (!triggerRef.current) return;
    const rect        = triggerRef.current.getBoundingClientRect();
    const approxH     = Math.min(options.length * ITEM_HEIGHT + MENU_PADDING, MENU_MAX_HEIGHT);
    const spaceBelow  = window.innerHeight - rect.bottom - 8;
    const spaceAbove  = rect.top - 8;
    const openUpward  = spaceBelow < approxH && spaceAbove > spaceBelow;

    let top  = openUpward ? rect.top - approxH - 4 : rect.bottom + 8;
    let left = rect.left;

    // Right-edge guard
    const menuWidth = Math.max(rect.width, 160);
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }
    // Left-edge guard
    if (left < 8) left = 8;

    setMenuStyle({
      position:  'fixed',
      top:       Math.max(top, 8),
      left,
      minWidth:  menuWidth,
      maxHeight: MENU_MAX_HEIGHT,
      overflowY: 'auto',
      zIndex:    999999,
    });
  }, [options.length]);

  const openMenu = () => {
    positionMenu();
    setOpen(true);
  };

  const closeMenu = () => setOpen(false);

  const toggle = (e) => {
    e.stopPropagation();
    if (open) closeMenu();
    else openMenu();
  };

  // Outside-click: check both trigger and portal menu
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        triggerRef.current?.contains(e.target) ||
        menuRef.current?.contains(e.target)
      ) return;
      closeMenu();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  // Reposition on scroll / resize while open
  useEffect(() => {
    if (!open) return;
    const update = () => positionMenu();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, positionMenu]);

  const menu = open && createPortal(
    <div
      ref={menuRef}
      style={{
        ...menuStyle,
        background:   '#0f172a',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius: '14px',
        boxShadow:    '0 20px 60px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.4)',
        animation:    'dropdownIn 0.16s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
      }}
    >
      <style>{`
        @keyframes dropdownIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
      `}</style>
      {options.map((opt) => {
        const isSelected = opt === value;
        return (
          <div
            key={opt}
            onMouseDown={(e) => {
              e.preventDefault(); // prevent blur before onClick
              onChange(opt);
              closeMenu();
            }}
            style={{
              padding:     '12px 18px',
              cursor:      'pointer',
              fontWeight:  '700',
              fontSize:    '15px',
              color:       isSelected ? accentColor : 'rgba(255,255,255,0.8)',
              background:  isSelected ? 'rgba(0,122,255,0.12)' : 'transparent',
              borderLeft:  isSelected ? `3px solid ${accentColor}` : '3px solid transparent',
              transition:  'background 0.12s, color 0.12s',
              whiteSpace:  'nowrap',
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = 'rgba(0,122,255,0.08)';
                e.currentTarget.style.color      = 'white';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color      = 'rgba(255,255,255,0.8)';
              }
            }}
          >
            {opt}
          </div>
        );
      })}
    </div>,
    document.body
  );

  return (
    <div ref={triggerRef} style={{ position: 'relative', flex: 1 }}>
      <button
        onClick={toggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '8px 14px', borderRadius: '12px',
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
          style={{
            transition: 'transform 0.2s',
            transform:  open ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        />
      </button>
      {menu}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { WifiOff, Wifi, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { resetNetworkCooldown } from '../lib/supabase';

/**
 * NetworkToast
 * Shows a persistent offline banner when navigator.onLine is false,
 * and a transient "Back online" confirmation when reconnected.
 * Also accepts a `supabaseError` prop (networkError from AuthContext)
 * to show a Supabase-specific reconnect prompt.
 */
export default function NetworkToast({ supabaseError }) {
  const { refreshProfile } = useAuth();
  const [isOnline,     setIsOnline]     = useState(navigator.onLine);
  const [showBack,     setShowBack]     = useState(false);
  const [dismissed,   setDismissed]    = useState(false);
  const [retrying,    setRetrying]      = useState(false);
  const backTimerRef = useRef(null);

  useEffect(() => {
    const handleOnline  = () => {
      setIsOnline(true);
      setDismissed(false);
      setShowBack(true);
      clearTimeout(backTimerRef.current);
      backTimerRef.current = setTimeout(() => setShowBack(false), 3000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowBack(false);
      setDismissed(false);
    };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(backTimerRef.current);
    };
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      // Try a lightweight network probe
      await fetch('https://dns.google/resolve?name=supabase.com&type=A', { mode: 'cors', cache: 'no-store', signal: AbortSignal.timeout(4000) });
      
      // Clear network fetch cooldowns and re-sync auth profile without page refresh
      console.log('[NETWORK] Manual retry successful. Syncing profile.');
      resetNetworkCooldown();
      await refreshProfile();
      setDismissed(true);
    } catch (err) {
      console.error('[NETWORK] Manual reconnect probe failed:', err.message);
    } finally {
      setRetrying(false);
    }
  };

  // "Back online" flash — brief green confirmation
  if (showBack) {
    return (
      <div style={{
        position: 'fixed', bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
        left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(255,255,255,0.84)', border: '1px solid rgba(52,199,89,0.34)',
        color: '#30D158', borderRadius: '100px', padding: '10px 20px',
        display: 'flex', alignItems: 'center', gap: '8px',
        fontWeight: '700', fontSize: '14px', zIndex: 9999,
        backdropFilter: 'blur(16px)', whiteSpace: 'nowrap',
        animation: 'slideUp 0.3s cubic-bezier(0.2,0.8,0.2,1) forwards',
      }}>
        <style>{`@keyframes slideUp { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
        <Wifi size={16} /> Back online
      </div>
    );
  }

  // Offline banner — persistent
  if (!isOnline && !dismissed) {
    return (
      <div style={{
        position: 'fixed', bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
        left: '16px', right: '16px',
        background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(255,159,10,0.35)',
        borderRadius: '16px', padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: '12px',
        zIndex: 9999, backdropFilter: 'blur(20px)',
        animation: 'slideUp 0.3s cubic-bezier(0.2,0.8,0.2,1) forwards',
      }}>
        <WifiOff size={18} color="#FF9F0A" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '800', fontSize: '14px', color: '#FF9F0A' }}>No Internet Connection</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', fontWeight: '500' }}>Your workout data is saved locally.</div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)', flexShrink: 0 }}
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  // Supabase error banner (online but Supabase unreachable)
  if (isOnline && supabaseError === 'network' && !dismissed) {
    return (
      <div style={{
        position: 'fixed', bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
        left: '16px', right: '16px',
        background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(255,69,58,0.3)',
        borderRadius: '16px', padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: '12px',
        zIndex: 9999, backdropFilter: 'blur(20px)',
      }}>
        <WifiOff size={18} color="var(--error-color)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '800', fontSize: '14px', color: 'var(--error-color)' }}>Server Unreachable</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', fontWeight: '500' }}>Could not connect to database.</div>
        </div>
        <button
          onClick={handleRetry}
          disabled={retrying}
          style={{ background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: '10px', color: 'var(--error-color)', padding: '7px 12px', fontSize: '12px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
        >
          {retrying ? <RefreshCw size={12} style={{ animation: 'spinKey 1s linear infinite' }} /> : <RefreshCw size={12} />}
          Retry
        </button>
        <button onClick={() => setDismissed(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)', flexShrink: 0 }}>
          <X size={16} />
        </button>
      </div>
    );
  }

  return null;
}

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Target, TrendingDown, TrendingUp, Minus, Calendar } from 'lucide-react';

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

export default function Bodyweight() {
  const { user } = useAuth();
  const [logs,        setLogs]        = useState([]);
  const [weightInput, setWeightInput] = useState('');
  const [weightDate,  setWeightDate]  = useState(todayLocalISO);  // ← new
  const [loading,     setLoading]     = useState(true);
  const [logError,    setLogError]    = useState(null);            // ← new
  const dateInputRef = useRef(null);                               // ← new

  const fetchLogs = async () => {
    const { data, error } = await supabase
      .from('bodyweight_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    console.log('[BODYWEIGHT FETCH]', { count: data?.length, error: error?.message });
    if (data) setLogs(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [user]);

  const handleAddWeight = async () => {
    if (!weightInput) return;
    setLogError(null);
    setLoading(true);

    // Store at noon local time to avoid timezone-crossing issues
    const [y, m, d] = weightDate.split('-').map(Number);
    const dateISO   = new Date(y, m - 1, d, 12, 0, 0).toISOString();

    // Check for existing entry on the same DATE (not datetime)
    // Compare by truncated date string so we catch any time-of-day variation
    const dayPrefix = weightDate; // YYYY-MM-DD
    const existing  = logs.find(l => l.date?.startsWith(dayPrefix) || l.date?.slice(0, 10) === dayPrefix);

    console.log('[BODYWEIGHT LOG]', { weightDate, dateISO, existingId: existing?.id });

    let error;
    if (existing) {
      // UPDATE silently — user is correcting that day's entry
      ({ error } = await supabase
        .from('bodyweight_logs')
        .update({ weight_kg: parseFloat(weightInput) })
        .eq('id', existing.id));
      console.log('[BODYWEIGHT UPDATE]', { id: existing.id, error: error?.message });
    } else {
      // INSERT new entry
      ({ error } = await supabase
        .from('bodyweight_logs')
        .insert({ user_id: user.id, date: dateISO, weight_kg: parseFloat(weightInput) }));
      console.log('[BODYWEIGHT INSERT]', { error: error?.message });
    }

    if (error) {
      setLogError(`Failed to save: ${error.message}`);
      setLoading(false);
      return;
    }

    setWeightInput('');
    setWeightDate(todayLocalISO()); // reset date to today after successful log
    await fetchLogs();
  };

  if (loading && logs.length === 0) return null;

  const currentWeight = logs.length > 0 ? logs[0].weight_kg : 0;

  let weeklyChange = 0;
  if (logs.length > 1) {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    let pastLog = logs.find(log => new Date(log.date) <= oneWeekAgo);
    if (!pastLog) pastLog = logs[logs.length - 1];
    weeklyChange = currentWeight - pastLog.weight_kg;
  }

  const chartData = [...logs].reverse().map(d => ({
    ...d,
    displayDate: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }));

  const timelineData = logs.map((log, idx) => {
    const prevLog = idx < logs.length - 1 ? logs[idx + 1] : null;
    const diff    = prevLog ? (log.weight_kg - prevLog.weight_kg) : 0;
    return { ...log, diff };
  });

  return (
    <div style={{ paddingBottom: '32px' }}>
      <style>{`
        .date-chip { display:inline-flex; align-items:center; gap:7px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:100px; padding:6px 14px; cursor:pointer; transition:all 0.2s; user-select:none; flex-shrink:0; }
        .date-chip:hover { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); }
        .date-chip.changed { border-color:var(--accent-color); background:rgba(0,122,255,0.1); }
        .date-input-hidden { position:absolute; opacity:0; pointer-events:none; width:1px; height:1px; }
      `}</style>

      <h1 className="title" style={{ marginTop: '16px' }}>Body Metrics</h1>

      {logs.length > 0 ? (
        <div className="glass card interactive-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px' }}>
          <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', letterSpacing: '2px', textTransform: 'uppercase' }}>Current Mass</span>
          <div style={{ fontSize: '72px', fontWeight: '800', margin: '8px 0', color: 'white', letterSpacing: '-2px' }}>
            {currentWeight.toFixed(1)} <span style={{ fontSize: '24px', color: 'var(--text-secondary)', letterSpacing: '0' }}>kg</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '8px 16px', borderRadius: '100px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: weeklyChange < 0 ? '#30D158' : (weeklyChange > 0 ? '#FF453A' : 'var(--text-secondary)') }}>
              {weeklyChange < 0 ? <TrendingDown size={18} /> : (weeklyChange > 0 ? <TrendingUp size={18} /> : <Minus size={18} />)}
              <span style={{ fontWeight: '700', fontSize: '16px' }}>{Math.abs(weeklyChange).toFixed(1)} kg</span>
              <span style={{ color: 'var(--text-secondary)', fontWeight: '600', fontSize: '13px' }}>7-day trend</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', fontWeight: '600' }}>No weight data yet.</div>
      )}

      {/* ── Log entry ── */}
      <h2 className="subtitle" style={{ marginBottom: '12px', marginTop: '40px' }}>Log Entry</h2>
      <div className="glass card interactive-card" style={{ padding: '8px 8px 8px 16px', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
        <Target size={22} color="var(--accent-color)" style={{ flexShrink: 0 }} />

        <input
          type="number"
          step="0.1"
          placeholder="Weight (kg)"
          value={weightInput}
          onChange={e => setWeightInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddWeight()}
          style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', fontSize: '18px', fontWeight: '700', outline: 'none', padding: '8px 12px', minWidth: 0 }}
        />

        {/* ── Date chip ── */}
        <div
          className={`date-chip${weightDate !== todayLocalISO() ? ' changed' : ''}`}
          onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
          title="Tap to change entry date"
          style={{ position: 'relative' }}
        >
          <Calendar size={13} color={weightDate !== todayLocalISO() ? 'var(--accent-hover)' : 'var(--text-secondary)'} />
          <span style={{ fontSize: '12px', fontWeight: '700', color: weightDate !== todayLocalISO() ? 'var(--accent-hover)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {formatDateLabel(weightDate)}
          </span>
          <input
            ref={dateInputRef}
            type="date"
            className="date-input-hidden"
            value={weightDate}
            max={todayLocalISO()}
            onChange={e => setWeightDate(e.target.value)}
          />
        </div>

        <button
          className="btn-primary"
          onClick={handleAddWeight}
          disabled={!weightInput || loading}
          style={{ padding: '12px 24px', flexShrink: 0 }}
        >
          Log
        </button>
      </div>

      {/* Inline error */}
      {logError && (
        <div style={{ marginTop: '10px', padding: '10px 16px', background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: '10px', color: 'var(--error-color)', fontSize: '13px', fontWeight: '600' }}>
          {logError}
        </div>
      )}

      {/* ── Chart ── */}
      <h2 className="subtitle" style={{ marginBottom: '16px', marginTop: '40px' }}>Projection Chart</h2>
      <div className="glass card" style={{ padding: '32px 16px', height: '320px' }}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: '600', fill: 'var(--text-secondary)' }} dy={15} />
              <YAxis domain={['dataMin - 1', 'dataMax + 1']} axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: '600', fill: 'var(--text-secondary)' }} width={30} dx={-10} />
              <Tooltip
                contentStyle={{ borderRadius: '16px', border: '1px solid var(--border-color)', background: 'rgba(11,15,20,0.95)', backdropFilter: 'blur(16px)', color: 'white', fontWeight: '700', padding: '12px' }}
                itemStyle={{ color: 'var(--accent-hover)' }}
              />
              <Line type="monotone" dataKey="weight_kg" stroke="url(#colorGv)" strokeWidth={4} dot={false} activeDot={{ r: 8, strokeWidth: 0, fill: 'var(--accent-color)' }} />
              <defs>
                <linearGradient id="colorGv" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"   stopColor="#1e5ce6" />
                  <stop offset="100%" stopColor="var(--accent-hover)" />
                </linearGradient>
              </defs>
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Log weight to see timeline.</div>
        )}
      </div>

      {/* ── Timeline ── */}
      <h2 className="subtitle" style={{ marginBottom: '16px', marginTop: '40px' }}>Timeline</h2>
      <div style={{ marginBottom: '20px' }}>
        {timelineData.map((entry, idx) => (
          <div key={entry.id} style={{ display: 'flex', alignItems: 'center', padding: '20px 0', borderBottom: idx < timelineData.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '700', fontSize: '18px', marginBottom: '4px', color: 'white' }}>
                {new Date(entry.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={{ fontSize: '22px', fontWeight: '800', color: 'white' }}>
                {entry.weight_kg.toFixed(1)} <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>kg</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: entry.diff < 0 ? '#30D158' : (entry.diff > 0 ? '#FF453A' : 'var(--text-secondary)') }}>
                {entry.diff > 0 ? '+' : ''}{entry.diff !== 0 ? entry.diff.toFixed(1) : '—'} kg
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

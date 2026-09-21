import { useEffect, useState } from 'react';
import { Plus, Scale } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const dayKey = () => new Date().toLocaleDateString('en-CA');

export default function BodyMetricsExperience() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(dayKey());
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const load = async () => {
    const { data, error: loadError } = await supabase.from('bodyweight_logs').select('id,date,weight_kg').eq('user_id', user.id).order('date', { ascending: true }).limit(120);
    if (loadError) { setState('error'); setError(loadError.message); return; }
    setLogs(data || []); setState('ready');
  };
  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    supabase.from('bodyweight_logs').select('id,date,weight_kg').eq('user_id', user.id).order('date', { ascending: true }).limit(120)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) { setState('error'); setError(loadError.message); return; }
        setLogs(data || []); setState('ready');
      });
    return () => { active = false; };
  }, [user?.id]);
  const latest = logs.at(-1)?.weight_kg;
  const earliest = logs[0]?.weight_kg;
  const change = latest && earliest ? latest - earliest : null;
  const max = Math.max(...logs.map((entry) => Number(entry.weight_kg) || 0), 1);
  const min = Math.min(...logs.map((entry) => Number(entry.weight_kg) || max), max);
  const range = Math.max(1, max - min);
  const save = async (event) => {
    event.preventDefault(); setError('');
    const value = Number(weight);
    if (!Number.isFinite(value) || value <= 0 || value > 500) { setError('Enter a bodyweight between 0 and 500 kg.'); return; }
    setSaving(true);
    const sameDay = logs.find((entry) => entry.date === date);
    const request = sameDay
      ? supabase.from('bodyweight_logs').update({ weight_kg: value }).eq('id', sameDay.id).eq('user_id', user.id)
      : supabase.from('bodyweight_logs').insert({ user_id: user.id, date, weight_kg: value });
    const { error: saveError } = await request;
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    setWeight(''); await load();
  };
  return <main className="experience metrics-experience"><section className="metrics-hero"><div><p className="eyebrow">Body metrics</p><h1>Watch the trend,<br />not one day.</h1><p>These are your own bodyweight records—nothing estimated or filled in for you.</p></div><div className="metric-orb"><Scale size={21} /></div></section>{state === 'loading' && <div className="history-skeleton"><span /><span /></div>}{state === 'error' && <div className="quiet-panel"><h2>Metrics could not load.</h2><p>{error}</p></div>}{state === 'ready' && <><section className="weight-highlight"><span>Latest bodyweight</span><strong>{latest ? `${Number(latest).toFixed(1)} kg` : '—'}</strong><p>{change === null ? 'Add your first measurement to establish a baseline.' : `${change > 0 ? '+' : ''}${change.toFixed(1)} kg across your recorded history`}</p><div className="weight-chart" aria-label="Bodyweight history">{logs.length ? logs.slice(-30).map((entry) => <i key={entry.id} style={{ height: `${18 + ((Number(entry.weight_kg) - min) / range) * 72}%` }} title={`${entry.date}: ${entry.weight_kg} kg`} />) : <span>No data yet</span>}</div></section><form className="weight-log-form" onSubmit={save}><div><label htmlFor="bodyweight">Log bodyweight</label><input id="bodyweight" value={weight} onChange={(event) => setWeight(event.target.value)} inputMode="decimal" placeholder="kg" /></div><input aria-label="Bodyweight log date" type="date" max={dayKey()} value={date} onChange={(event) => setDate(event.target.value)} /><button className="primary-action" disabled={saving} type="submit"><Plus size={16} />{saving ? 'Saving…' : 'Add'}</button></form>{error && <div className="inline-state is-error">{error}</div>}<section className="metric-log"><div className="section-heading"><div><p className="eyebrow">Record</p><h2>Recent entries</h2></div></div>{logs.length ? [...logs].reverse().slice(0, 8).map((entry, index) => <article key={entry.id}><span>{new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><strong>{Number(entry.weight_kg).toFixed(1)} kg</strong>{index > 0 && <small>{(Number(entry.weight_kg) - Number([...logs].reverse()[index - 1].weight_kg)).toFixed(1)} kg</small>}</article>) : <div className="empty-state"><p>Your private measurements will appear here after you add one.</p></div>}</section></>}</main>;
}

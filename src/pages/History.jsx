import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { ChevronDown, ChevronRight, Activity } from 'lucide-react';

export default function History() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('workout_sessions')
        .select(`id, date, split_type, split_day, session_exercises (id, exercises (name), sets (weight_kg, reps))`)
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (data) setSessions(data);
      setLoading(false);
    };
    fetchHistory();
  }, [user]);

  if (loading) return null;

  const grouped = sessions.reduce((acc, sess) => {
    const dateKey = new Date(sess.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(sess);
    return acc;
  }, {});

  return (
    <div>
      <h1 className="title" style={{ marginTop: '16px', marginBottom: '40px' }}>Training Log</h1>
      
      {Object.keys(grouped).length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '80px 0' }}>
          <Activity size={72} style={{ opacity: 0.15, marginBottom: '20px' }} />
          <p style={{ fontSize: '20px', fontWeight: '700' }}>Your history is unwritten.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([dateLabel, dailySessions]) => (
          <div key={dateLabel} style={{ marginBottom: '40px' }}>
             <h2 className="subtitle" style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>{dateLabel}</h2>
             {dailySessions.map(session => (
               <div key={session.id} className="glass card interactive-card" style={{ padding: '0', overflow: 'hidden', marginBottom: '16px' }}>
                  <div 
                    style={{ padding: '24px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: expandedId === session.id ? 'rgba(255,255,255,0.03)' : 'transparent', transition: 'background 0.3s' }}
                    onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
                  >
                    <div>
                      <div style={{ color: 'var(--accent-hover)', fontSize: '12px', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>{session.split_type} Routine</div>
                      <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '800', letterSpacing: '-0.5px', color: 'white' }}>{session.split_day} Day</h3>
                    </div>
                    <div style={{ color: 'white', background: 'rgba(255,255,255,0.08)', borderRadius: '50%', padding: '10px' }}>
                      {expandedId === session.id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>
                  </div>

                  {expandedId === session.id && (
                    <div className="animate-fade-in" style={{ padding: '0 24px 32px 24px' }}>
                      <div style={{ height: '1px', background: 'var(--border-color)', marginBottom: '24px' }} />
                      
                      {session.session_exercises && session.session_exercises.length > 0 ? (
                        session.session_exercises.map((se, idx) => (
                          <div key={se.id} style={{ marginBottom: idx === session.session_exercises.length -1 ? 0 : '24px' }}>
                            <div style={{ fontWeight: '800', fontSize: '18px', marginBottom: '12px', color: '#fff' }}>
                              {se.exercises?.name}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {se.sets?.map((set, sIdx) => (
                                <div key={sIdx} style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '16px' }}>
                                  <span style={{ width: '40px', fontWeight: '700', fontSize: '14px' }}>S{sIdx+1}</span>
                                  <span style={{ color: 'white', fontWeight: '800', width: '70px', fontSize: '18px' }}>{set.weight_kg} kg</span>
                                  <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>× {set.reps} reps</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: '15px', color: 'var(--text-secondary)', fontWeight: '600' }}>No telemetry recorded.</div>
                      )}
                    </div>
                  )}
               </div>
             ))}
          </div>
        ))
      )}
    </div>
  );
}

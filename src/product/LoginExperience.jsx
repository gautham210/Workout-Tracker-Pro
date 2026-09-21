import { useState } from 'react';
import { ArrowLeft, Check, Mail, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ProductLogo from './ProductLogo';

export default function LoginExperience() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin');
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [verify, setVerify] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setState('working'); setError('');
    const request = mode === 'signin' ? supabase.auth.signInWithPassword({ email, password }) : supabase.auth.signUp({ email, password });
    const { error: authError } = await request;
    setState('idle');
    if (authError) { setError(authError.message); return; }
    if (mode === 'signup') setVerify(true);
  };
  const resend = async () => { setState('working'); setError(''); const { error: resendError } = await supabase.auth.resend({ type: 'signup', email }); setState('idle'); if (resendError) setError(resendError.message); };
  return <main className="entry-experience"><div className="entry-ambient" /><section className="entry-brand"><div className="entry-mark"><ProductLogo size={46} /></div><p className="eyebrow">Workout Tracker Pro</p><h1>Train with<br />intention.</h1><p>A private training space built around the work you actually do.</p></section>{verify ? <section className="entry-card verify-card"><div className="verify-icon"><Mail size={22} /></div><p className="eyebrow">One more step</p><h2>Check your email.</h2><p>We sent a verification link to <strong>{email}</strong>. Verify your account, then return to continue.</p>{error && <div className="entry-error">{error}</div>}<button className="primary-action" type="button" disabled={state === 'working'} onClick={resend}>{state === 'working' ? <RefreshCw className="spin" size={16} /> : 'Resend verification'}</button><button className="text-action" type="button" onClick={() => { setVerify(false); setMode('signin'); }}><ArrowLeft size={15} /> Back to sign in</button></section> : <section className="entry-card"><p className="eyebrow">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</p><h2>{mode === 'signin' ? 'Pick up where you left off.' : 'Start your training story.'}</h2><form onSubmit={submit}><label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label><label>Password<input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" minLength={6} required /></label>{error && <div className="entry-error">{error}</div>}<button className="primary-action" type="submit" disabled={state === 'working'}>{state === 'working' ? 'Securing your session…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button></form><button className="entry-toggle" type="button" onClick={() => { setMode((current) => current === 'signin' ? 'signup' : 'signin'); setError(''); }}>{mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button><p className="entry-privacy"><Check size={13} /> Your workouts remain scoped to your authenticated account.</p></section>}</main>;
}

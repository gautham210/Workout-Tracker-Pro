import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Dumbbell, Mail, ArrowLeft, RefreshCw } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [showVerify, setShowVerify] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (isLogin) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) setError(signInError.message);
    } else {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
      } else {
        setShowVerify(true);
      }
    }

    setLoading(false);
  };

  const handleResend = async () => {
    setResendLoading(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setResendLoading(false);
    if (error) setError(error.message);
  };

  if (showVerify) {
    return (
      <div className="container page-enter" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px' }}>
         <div className="glass card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '48px 32px' }}>
            <div style={{ background: 'rgba(0,122,255,0.1)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 0 40px rgba(0,122,255,0.3)' }}>
               <Mail size={40} color="var(--accent-color)" />
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '12px' }}>Check your email</h1>
            <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '32px' }}>
              We've sent a verification link to <strong style={{ color: 'white' }}>{email}</strong>. Please verify your account to continue building your identity.
            </p>
            
            {error && (
              <div style={{ backgroundColor: 'rgba(255, 59, 48, 0.1)', color: 'var(--error-color)', padding: '12px', borderRadius: '12px', marginBottom: '24px', fontSize: '14px', textAlign: 'left' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
               <button className="btn-primary" onClick={handleResend} disabled={resendLoading} style={{ padding: '16px', borderRadius: '16px' }}>
                 {resendLoading ? <RefreshCw className="animate-spin" size={20} /> : 'Resend Email'}
               </button>
               <button className="btn-secondary" onClick={() => { setShowVerify(false); setIsLogin(true); }} style={{ padding: '16px', borderRadius: '16px', background: 'transparent' }}>
                 <ArrowLeft size={18} style={{ marginRight: '8px' }} /> Back to Login
               </button>
            </div>
         </div>
      </div>
    );
  }

  return (
    <div className="container page-enter" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100vh', paddingBottom: '20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', display: 'inline-block', padding: '20px', borderRadius: '50%', marginBottom: '16px', boxShadow: '0 0 40px rgba(255,255,255,0.05)' }}>
          <Dumbbell size={48} color="white" />
        </div>
        <h1 className="title" style={{ margin: 0, fontSize: '42px', letterSpacing: '-1.5px', background: 'linear-gradient(135deg, #2563eb, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Workout Tracker Pro</h1>
        <p className="subtitle" style={{ marginTop: '12px', fontSize: '15px' }}>Build Something Strong.</p>
      </div>

      <div className="glass card" style={{ padding: '32px' }}>
        <h2 style={{ fontSize: '28px', marginBottom: '32px', fontWeight: '800' }}>{isLogin ? 'Welcome back.' : 'Join the elite.'}</h2>
        
        {error && (
          <div style={{ backgroundColor: 'rgba(255, 59, 48, 0.1)', color: 'var(--error-color)', padding: '14px', borderRadius: '16px', marginBottom: '24px', fontSize: '15px', fontWeight: '600' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleAuth}>
          <div className="input-group" style={{ marginBottom: '20px' }}>
            <label className="input-label" style={{ display: 'block', marginBottom: '8px', fontWeight: '700', fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Email</label>
            <input 
              type="email" 
              className="input-style" 
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ padding: '20px', fontSize: '18px', borderRadius: '16px' }}
            />
          </div>
          
          <div className="input-group" style={{ marginBottom: '32px' }}>
            <label className="input-label" style={{ display: 'block', marginBottom: '8px', fontWeight: '700', fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Password</label>
            <input 
              type="password" 
              className="input-style" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ padding: '20px', fontSize: '18px', borderRadius: '16px' }}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '20px', fontSize: '18px', borderRadius: '16px' }} disabled={loading}>
            {loading ? 'Authenticating...' : (isLogin ? 'Secure Sign In' : 'Create Identity')}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '32px' }}>
          <button 
            type="button"
            className="btn btn-ghost" 
            onClick={() => setIsLogin(!isLogin)}
            style={{ color: 'var(--text-secondary)', fontWeight: '600', fontSize: '15px' }}
          >
            {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
}

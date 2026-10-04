import { supabaseConfigErrors } from '../lib/supabase';

export default function ConfigError() {
  return (
    <main className="config-error" role="alert">
      <div>
        <h1>Configuration required</h1>
        <p>Workout Tracker Pro cannot start because its backend is not configured.</p>
        <ul>{supabaseConfigErrors.map((message) => <li key={message}>{message}</li>)}</ul>
        <p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code> (or your hosting environment variables) and rebuild.</p>
      </div>
    </main>
  )
}

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert } from '../components.jsx';

const DEMO = [
  { label: 'Patient', email: 'patient@demo.com' },
  { label: 'Doctor', email: 'doctor@demo.com' },
  { label: 'Admin', email: 'admin@demo.com' },
];

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function login(creds) {
    setBusy(true); setError('');
    try {
      const data = await api('/auth/login', { method: 'POST', body: creds });
      signIn(data);
      const home = data.profile.role === 'ADMIN' ? '/admin' : '/appointments';
      navigate(location.state?.from || home, { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <h1>Sign in</h1>
      <form className="form" onSubmit={(e) => { e.preventDefault(); login(form); }}>
        <label>Email<input type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        <Alert>{error}</Alert>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p>New here? <Link to="/register">Create an account</Link></p>
      <aside className="demo-box">
        <h2>Try a demo account</h2>
        <p className="muted">Open a patient and a doctor in two different browsers to test a video consultation.</p>
        <div className="demo-buttons">
          {DEMO.map((d) => (
            <button type="button" key={d.email} className="btn" disabled={busy} onClick={() => login({ email: d.email, password: 'Demo@1234' })}>
              Sign in as {d.label.toLowerCase()}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert } from '../components.jsx';

export default function Register() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('PATIENT');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [doc, setDoc] = useState({ specialty: '', city: '', feeInr: 300, experienceYears: 1, languages: 'English', bio: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const body = { ...form, role };
    if (role === 'PROVIDER') {
      body.provider = { ...doc, languages: doc.languages.split(',').map((s) => s.trim()).filter(Boolean) };
    }
    try {
      const data = await api('/auth/register', { method: 'POST', body });
      signIn(data);
      navigate(role === 'PROVIDER' ? '/profile' : '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const f = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });
  const d = (k) => ({ value: doc[k], onChange: (e) => setDoc({ ...doc, [k]: e.target.value }) });

  return (
    <div className="page narrow">
      <h1>Create an account</h1>
      <div className="segmented" role="radiogroup" aria-label="I am a">
        <button type="button" role="radio" aria-checked={role === 'PATIENT'} className={role === 'PATIENT' ? 'on' : ''} onClick={() => setRole('PATIENT')}>I need a doctor</button>
        <button type="button" role="radio" aria-checked={role === 'PROVIDER'} className={role === 'PROVIDER' ? 'on' : ''} onClick={() => setRole('PROVIDER')}>I am a doctor</button>
      </div>
      <form className="form" onSubmit={submit}>
        <label>Full name<input required autoComplete="name" {...f('name')} /></label>
        <label>Email<input type="email" required autoComplete="email" {...f('email')} /></label>
        <label>Password<input type="password" required minLength={8} autoComplete="new-password" {...f('password')} /><small>At least 8 characters</small></label>
        {role === 'PROVIDER' && (
          <fieldset>
            <legend>Practice details</legend>
            <label>Specialty<input required placeholder="e.g. Dermatologist" {...d('specialty')} /></label>
            <div className="row2">
              <label>City<input {...d('city')} /></label>
              <label>Fee (₹)<input type="number" min="0" {...d('feeInr')} /></label>
            </div>
            <div className="row2">
              <label>Years of experience<input type="number" min="0" {...d('experienceYears')} /></label>
              <label>Languages<input placeholder="English, Tamil" {...d('languages')} /></label>
            </div>
            <label>About you<textarea rows={3} {...d('bio')} /></label>
            <p className="muted">An admin verifies your registration before patients can find you.</p>
          </fieldset>
        )}
        <Alert>{error}</Alert>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p>Already registered? <Link to="/login">Sign in</Link></p>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatSlot } from '../api.js';
import { Alert } from '../components.jsx';

const ALL_SLOTS = [];
for (let h = 8; h < 21; h += 1) ['00', '30'].forEach((m) => ALL_SLOTS.push(`${String(h).padStart(2, '0')}:${m}`));

export default function Profile() {
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    api('/providers/me').then((d) => setP({ ...d, languages: d.languages.join(', ') })).catch((e) => setError(e.message));
  }, []);

  async function save(e) {
    e.preventDefault();
    setError(''); setSaved('');
    if (!p.slotTimes.length) { setError('Choose at least one consultation slot.'); return; }
    try {
      await api('/providers/me', {
        method: 'PATCH',
        body: {
          specialty: p.specialty, city: p.city || '', bio: p.bio || '', feeInr: Number(p.feeInr),
          experienceYears: Number(p.experienceYears), slotTimes: p.slotTimes,
          languages: p.languages.split(',').map((s) => s.trim()).filter(Boolean),
        },
      });
      setSaved('Profile saved.');
    } catch (err) { setError(err.message); }
  }

  if (!p) return <div className="page"><Alert>{error}</Alert>{!error && <p className="muted">Loading…</p>}</div>;
  const f = (k) => ({ value: p[k] ?? '', onChange: (e) => setP({ ...p, [k]: e.target.value }) });
  const toggleSlot = (s) => setP({ ...p, slotTimes: p.slotTimes.includes(s) ? p.slotTimes.filter((x) => x !== s) : [...p.slotTimes, s].sort() });

  return (
    <div className="page narrow wide-ish">
      <h1>My profile</h1>
      {p.verified
        ? <p className="muted">Patients can see your profile. <Link to={`/doctors/${p.id}`}>View public page</Link></p>
        : <p className="callout">Waiting for admin verification. You can complete your profile in the meantime.</p>}
      <form className="form" onSubmit={save}>
        <div className="row2">
          <label>Specialty<input required {...f('specialty')} /></label>
          <label>City<input {...f('city')} /></label>
        </div>
        <div className="row2">
          <label>Fee (₹)<input type="number" min="0" {...f('feeInr')} /></label>
          <label>Years of experience<input type="number" min="0" {...f('experienceYears')} /></label>
        </div>
        <label>Languages<input {...f('languages')} /><small>Separate with commas</small></label>
        <label>About you<textarea rows={3} {...f('bio')} /></label>
        <fieldset>
          <legend>Daily consultation slots (30 minutes each)</legend>
          <div className="slots">
            {ALL_SLOTS.map((s) => (
              <button type="button" key={s} aria-pressed={p.slotTimes.includes(s)} className={`slot ${p.slotTimes.includes(s) ? 'on' : ''}`} onClick={() => toggleSlot(s)}>{formatSlot(s)}</button>
            ))}
          </div>
        </fieldset>
        <Alert>{error}</Alert>
        <Alert kind="success">{saved}</Alert>
        <button className="btn btn-primary">Save profile</button>
      </form>
    </div>
  );
}

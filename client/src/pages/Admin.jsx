import { useEffect, useState } from 'react';
import { api, rupees } from '../api.js';
import { Alert } from '../components.jsx';

export default function Admin() {
  const [rows, setRows] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  const load = () => Promise.all([api('/admin/providers'), api('/admin/stats')])
    .then(([p, s]) => { setRows(p); setStats(s); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function setVerified(p, verified) {
    try {
      await api(`/admin/providers/${p.id}/verify`, { method: 'PATCH', body: { verified } });
      load();
    } catch (e) { setError(e.message); }
  }

  const pending = rows?.filter((r) => !r.verified) || [];
  const verified = rows?.filter((r) => r.verified) || [];

  const Table = ({ list, action }) => (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Doctor</th><th>Specialty</th><th>City</th><th>Experience</th><th>Fee</th><th><span className="sr-only">Action</span></th></tr></thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id}>
              <td><strong>{p.name}</strong><br /><span className="muted">{p.email}</span></td>
              <td>{p.specialty}</td><td>{p.city || '—'}</td><td>{p.experienceYears} yrs</td><td>{rupees(p.feeInr)}</td>
              <td>{action(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="page">
      <h1>Admin</h1>
      <Alert>{error}</Alert>
      {stats && (
        <dl className="stats">
          <div><dt>Patients</dt><dd>{stats.patients}</dd></div>
          <div><dt>Verified doctors</dt><dd>{stats.doctors}</dd></div>
          <div><dt>Awaiting verification</dt><dd>{stats.pendingDoctors}</dd></div>
          <div><dt>Upcoming appointments</dt><dd>{stats.bookings.BOOKED || 0}</dd></div>
          <div><dt>Completed consultations</dt><dd>{stats.bookings.COMPLETED || 0}</dd></div>
        </dl>
      )}
      <h2>Awaiting verification</h2>
      {rows && (pending.length === 0 ? <p className="muted">No doctors are waiting. New doctor registrations appear here.</p>
        : <Table list={pending} action={(p) => <button type="button" className="btn btn-primary" onClick={() => setVerified(p, true)}>Verify</button>} />)}
      <h2>Verified doctors</h2>
      {rows && <Table list={verified} action={(p) => <button type="button" className="btn btn-quiet" onClick={() => setVerified(p, false)}>Revoke</button>} />}
    </div>
  );
}

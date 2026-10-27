import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, formatDate, formatSlot, rupees, todayIST } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Stars } from '../components.jsx';

const STATUS_LABEL = { BOOKED: 'Upcoming', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };

function ReviewForm({ booking, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      await api('/reviews', { method: 'POST', body: { bookingId: booking.id, rating, comment: comment || undefined } });
      onDone('Thanks, your review was posted.');
    } catch (err) { setError(err.message); }
  }
  return (
    <form className="form inline-form" onSubmit={submit}>
      <fieldset className="star-input">
        <legend>Your rating</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={n <= rating ? 'on' : ''}>
            <input type="radio" name={`r-${booking.id}`} value={n} checked={rating === n} onChange={() => setRating(n)} className="sr-only" />
            <span aria-hidden="true">★</span><span className="sr-only">{n} star{n > 1 ? 's' : ''}</span>
          </label>
        ))}
      </fieldset>
      <label>Comment <span className="muted">(optional)</span><textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
      <Alert>{error}</Alert>
      <button className="btn btn-primary">Post review</button>
    </form>
  );
}

function CompleteForm({ booking, onDone }) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      await api(`/bookings/${booking.id}/complete`, { method: 'PATCH', body: { consultNotes: notes || undefined } });
      onDone('Consultation marked as completed.');
    } catch (err) { setError(err.message); }
  }
  return (
    <form className="form inline-form" onSubmit={submit}>
      <label>Consultation notes for the patient<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Diagnosis, advice, prescription, follow-up date" /></label>
      <Alert>{error}</Alert>
      <button className="btn btn-primary">Complete consultation</button>
    </form>
  );
}

export default function Appointments() {
  const { user } = useAuth();
  const location = useLocation();
  const [list, setList] = useState(null);
  const [tab, setTab] = useState('upcoming');
  const [open, setOpen] = useState(null);
  const [notice, setNotice] = useState(location.state?.booked || '');
  const [error, setError] = useState('');
  const isDoctor = user.role === 'PROVIDER';

  const load = () => api('/bookings/mine').then(setList).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const done = (msg) => { setOpen(null); setNotice(msg); load(); };
  async function cancel(b) {
    try {
      await api(`/bookings/${b.id}/cancel`, { method: 'PATCH' });
      done('Appointment cancelled. The slot is free for others now.');
    } catch (e) { setError(e.message); }
  }

  const today = todayIST();
  const upcoming = (list || []).filter((b) => b.status === 'BOOKED').sort((a, b) => (a.date + a.timeSlot).localeCompare(b.date + b.timeSlot));
  const past = (list || []).filter((b) => b.status !== 'BOOKED');
  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="page">
      <h1>{isDoctor ? 'Your consultations' : 'Your appointments'}</h1>
      {isDoctor && !user.provider?.verified && (
        <p className="callout">Your profile is waiting for admin verification. Patients can't find you until then.</p>
      )}
      <Alert kind="success">{notice}</Alert>
      <Alert>{error}</Alert>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'upcoming'} className={tab === 'upcoming' ? 'on' : ''} onClick={() => setTab('upcoming')}>Upcoming ({upcoming.length})</button>
        <button type="button" role="tab" aria-selected={tab === 'past'} className={tab === 'past' ? 'on' : ''} onClick={() => setTab('past')}>Past and cancelled ({past.length})</button>
      </div>
      {!list ? <p className="muted">Loading…</p> : shown.length === 0 ? (
        <div className="empty">
          {tab === 'upcoming'
            ? (isDoctor ? <p>No upcoming consultations. Booked appointments appear here.</p> : <p>No upcoming appointments. <Link to="/">Find a doctor</Link> to book one.</p>)
            : <p>Completed and cancelled appointments appear here.</p>}
        </div>
      ) : (
        <ul className="appt-list">
          {shown.map((b) => (
            <li key={b.id} className={`appt status-${b.status.toLowerCase()}`}>
              <div className="appt-when">
                <strong>{formatSlot(b.timeSlot)}</strong>
                <span>{b.date === today ? 'Today' : formatDate(b.date)}</span>
              </div>
              <div className="appt-body">
                <h2>{isDoctor ? b.patient.name : b.provider.name}</h2>
                <p className="muted">{isDoctor ? 'Patient' : `${b.provider.specialty}, ${rupees(b.provider.feeInr)}`} <span className={`badge badge-${b.status.toLowerCase()}`}>{STATUS_LABEL[b.status]}</span></p>
                {b.reason && <p><span className="muted">Reason:</span> {b.reason}</p>}
                {b.consultNotes && <div className="notes"><span className="muted">Doctor's notes</span><p>{b.consultNotes}</p></div>}
                {b.review && <p><span className="muted">{isDoctor ? 'Patient rated' : 'You rated'}</span> <Stars value={b.review.rating} /></p>}
                <div className="actions">
                  {b.status === 'BOOKED' && <Link className="btn btn-primary" to={`/consult/${b.id}`}>Join video call</Link>}
                  {b.status === 'BOOKED' && isDoctor && <button type="button" className="btn" onClick={() => setOpen(open === `c-${b.id}` ? null : `c-${b.id}`)}>Complete</button>}
                  {b.status === 'BOOKED' && <button type="button" className="btn btn-quiet" onClick={() => cancel(b)}>Cancel</button>}
                  {b.status === 'COMPLETED' && !isDoctor && !b.review && open !== `r-${b.id}` && <button type="button" className="btn" onClick={() => setOpen(open === `r-${b.id}` ? null : `r-${b.id}`)}>Rate this doctor</button>}
                </div>
                {open === `c-${b.id}` && <CompleteForm booking={b} onDone={done} />}
                {open === `r-${b.id}` && <ReviewForm booking={b} onDone={done} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

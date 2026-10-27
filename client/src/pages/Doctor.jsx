import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addDays, api, formatDate, formatSlot, rupees, todayIST } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Initials, Stars } from '../components.jsx';

const DAYS = 14;

export default function Doctor() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [date, setDate] = useState(todayIST());
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState('');
  const [reason, setReason] = useState('');
  const [bookError, setBookError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api(`/providers/${id}`).then(setData).catch((e) => setError(e.message)); }, [id]);

  const loadSlots = () => {
    setSlots(null); setSlot('');
    api(`/providers/${id}/slots?date=${date}`).then((r) => setSlots(r.slots)).catch((e) => setBookError(e.message));
  };
  useEffect(loadSlots, [id, date]); // eslint-disable-line react-hooks/exhaustive-deps

  async function book(e) {
    e.preventDefault();
    setBusy(true); setBookError('');
    try {
      await api('/bookings', { method: 'POST', body: { providerId: id, date, timeSlot: slot, reason: reason || undefined } });
      navigate('/appointments', { state: { booked: `Booked with ${data.provider.name} on ${formatDate(date)} at ${formatSlot(slot)}.` } });
    } catch (err) {
      setBookError(err.message);
      if (err.status === 409) loadSlots();
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="page"><Alert>{error}</Alert><Link to="/">Back to search</Link></div>;
  if (!data) return <div className="page"><p className="muted">Loading…</p></div>;
  const { provider: p, reviews } = data;
  const days = Array.from({ length: DAYS }, (_, i) => addDays(todayIST(), i));
  const open = slots?.filter((s) => s.available).length ?? 0;

  return (
    <div className="page doctor-page">
      <section className="profile">
        <div className="doctor-head big">
          <Initials name={p.name} />
          <div>
            <h1>{p.name}</h1>
            <p className="specialty">{p.specialty} in {p.city || 'online practice'}</p>
            <p className="rating-line">
              {p.reviewsCount ? <><Stars value={p.rating} /> {p.rating.toFixed(1)} from {p.reviewsCount} consultation{p.reviewsCount > 1 ? 's' : ''}</> : <span className="muted">No reviews yet</span>}
            </p>
          </div>
        </div>
        <p>{p.bio}</p>
        <dl className="facts">
          <div><dt>Consultation fee</dt><dd>{rupees(p.feeInr)}</dd></div>
          <div><dt>Experience</dt><dd>{p.experienceYears} years</dd></div>
          <div><dt>Languages</dt><dd>{p.languages.join(', ')}</dd></div>
        </dl>

        <h2>What patients said</h2>
        {reviews.length === 0 ? <p className="muted">Reviews appear here after completed consultations.</p> : (
          <ul className="reviews">
            {reviews.map((r) => (
              <li key={r.id}>
                <Stars value={r.rating} /> <strong>{r.patientName}</strong>
                <span className="muted"> on {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                {r.comment && <p>{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="booking-panel" aria-labelledby="book-h">
        <h2 id="book-h">Book a video consultation</h2>
        <div className="day-strip" role="listbox" aria-label="Choose a day">
          {days.map((d) => (
            <button type="button" role="option" aria-selected={d === date} key={d} className={d === date ? 'on' : ''} onClick={() => setDate(d)}>
              <span>{formatDate(d, { weekday: 'short' })}</span>
              <strong>{formatDate(d, { day: 'numeric' })}</strong>
              <span>{formatDate(d, { month: 'short' })}</span>
            </button>
          ))}
        </div>
        {!slots ? <p className="muted">Checking free slots…</p> : (
          <>
            <p className="muted">{open ? `${open} free slot${open > 1 ? 's' : ''} on ${formatDate(date)}` : `No free slots on ${formatDate(date)}. Try another day.`}</p>
            <div className="slots">
              {slots.map((s) => (
                <button type="button" key={s.time} disabled={!s.available} aria-pressed={slot === s.time} className={`slot ${slot === s.time ? 'on' : ''}`} onClick={() => setSlot(s.time)}>
                  {formatSlot(s.time)}
                </button>
              ))}
            </div>
          </>
        )}
        {!user && <p className="callout"><Link to="/login" state={{ from: `/doctors/${id}` }}>Sign in</Link> or <Link to="/register">create an account</Link> to book.</p>}
        {user && user.role !== 'PATIENT' && <p className="callout">Only patient accounts can book appointments.</p>}
        {user?.role === 'PATIENT' && (
          <form className="form" onSubmit={book}>
            <label>What would you like to discuss? <span className="muted">(optional)</span>
              <textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fever and cough for 3 days" />
            </label>
            <Alert>{bookError}</Alert>
            <button className="btn btn-primary" disabled={!slot || busy}>
              {slot ? `Book ${formatSlot(slot)} for ${rupees(p.feeInr)}` : 'Choose a time slot'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

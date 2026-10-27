import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, rupees } from '../api.js';
import { Alert, Initials, Stars } from '../components.jsx';

export default function Home() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({ specialties: [], cities: [] });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState(params.get('q') || '');
  const specialty = params.get('specialty') || '';
  const city = params.get('city') || '';
  const page = Number(params.get('page') || 1);

  useEffect(() => { api('/providers/filters').then(setFilters).catch(() => {}); }, []);

  useEffect(() => {
    const qs = new URLSearchParams({ page, limit: 9 });
    if (params.get('q')) qs.set('q', params.get('q'));
    if (specialty) qs.set('specialty', specialty);
    if (city) qs.set('city', city);
    setError('');
    api(`/providers?${qs}`).then(setResult).catch((e) => setError(e.message));
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };

  return (
    <div className="page">
      <section className="hero">
        <h1>See a verified doctor today, without the trip to the city.</h1>
        <p className="lede">Pick a specialist, book a 30-minute slot and consult over secure video from your phone.</p>
        <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: q.trim() }); }}>
          <label htmlFor="q" className="sr-only">Search doctors</label>
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Doctor name or specialty, e.g. skin, child, heart" />
          <select aria-label="City" value={city} onChange={(e) => update({ city: e.target.value })}>
            <option value="">All cities</option>
            {filters.cities.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button type="submit" className="btn btn-primary">Search</button>
        </form>
        <div className="chips" aria-label="Filter by specialty">
          <button type="button" className={`chip ${!specialty ? 'active' : ''}`} onClick={() => update({ specialty: '' })}>All specialties</button>
          {filters.specialties.map((s) => (
            <button type="button" key={s} className={`chip ${specialty === s ? 'active' : ''}`} aria-pressed={specialty === s} onClick={() => update({ specialty: s })}>{s}</button>
          ))}
        </div>
      </section>

      <Alert>{error}</Alert>
      {result && (
        <section aria-live="polite">
          <p className="muted result-count">
            {result.total === 0 ? 'No doctors match these filters. Try another specialty or clear the search.' : `${result.total} doctor${result.total === 1 ? '' : 's'} available`}
          </p>
          <ul className="doctor-grid">
            {result.items.map((d) => (
              <li key={d.id}>
                <Link to={`/doctors/${d.id}`} className="doctor-card">
                  <div className="doctor-head">
                    <Initials name={d.name} />
                    <div>
                      <h2>{d.name}</h2>
                      <p className="specialty">{d.specialty}</p>
                    </div>
                  </div>
                  <p className="bio">{d.bio}</p>
                  <dl className="facts">
                    <div><dt>Fee</dt><dd>{rupees(d.feeInr)}</dd></div>
                    <div><dt>Experience</dt><dd>{d.experienceYears} yrs</dd></div>
                    <div><dt>City</dt><dd>{d.city || 'Online'}</dd></div>
                  </dl>
                  <p className="rating-line">
                    {d.reviewsCount ? <><Stars value={d.rating} /> {d.rating.toFixed(1)} <span className="muted">({d.reviewsCount})</span></> : <span className="muted">New on the portal</span>}
                  </p>
                  <p className="langs">Speaks {d.languages.join(', ')}</p>
                </Link>
              </li>
            ))}
          </ul>
          {result.totalPages > 1 && (
            <nav className="pager" aria-label="Pages">
              <button type="button" className="btn" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>Previous</button>
              <span>Page {page} of {result.totalPages}</span>
              <button type="button" className="btn" disabled={page >= result.totalPages} onClick={() => update({ page: page + 1 })}>Next</button>
            </nav>
          )}
        </section>
      )}
    </div>
  );
}

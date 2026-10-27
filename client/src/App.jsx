import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Doctor from './pages/Doctor.jsx';
import Appointments from './pages/Appointments.jsx';
import Consult from './pages/Consult.jsx';
import Admin from './pages/Admin.jsx';
import Profile from './pages/Profile.jsx';

function RequireAuth({ roles, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="page"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function Header() {
  const { user, signOut } = useAuth();
  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="Integrated Healthcare Portal home">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor" /><path d="M13 7h6v6h6v6h-6v6h-6v-6H7v-6h6z" fill="var(--mint)" /></svg>
        <span>Integrated Healthcare Portal</span>
      </Link>
      <nav className="nav">
        <NavLink to="/" end>Find a doctor</NavLink>
        {user && user.role !== 'ADMIN' && <NavLink to="/appointments">Appointments</NavLink>}
        {user?.role === 'PROVIDER' && <NavLink to="/profile">My profile</NavLink>}
        {user?.role === 'ADMIN' && <NavLink to="/admin">Admin</NavLink>}
        {user ? (
          <button type="button" className="linklike" onClick={signOut}>Sign out</button>
        ) : (
          <NavLink to="/login" className="nav-cta">Sign in</NavLink>
        )}
      </nav>
    </header>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const inCall = pathname.startsWith('/consult/');
  return (
    <>
      {!inCall && <Header />}
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/doctors/:id" element={<Doctor />} />
          <Route path="/appointments" element={<RequireAuth roles={['PATIENT', 'PROVIDER']}><Appointments /></RequireAuth>} />
          <Route path="/consult/:bookingId" element={<RequireAuth roles={['PATIENT', 'PROVIDER']}><Consult /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth roles={['PROVIDER']}><Profile /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth roles={['ADMIN']}><Admin /></RequireAuth>} />
          <Route path="*" element={<div className="page"><h1>Page not found</h1><p><Link to="/">Go to doctor search</Link></p></div>} />
        </Routes>
      </main>
    </>
  );
}

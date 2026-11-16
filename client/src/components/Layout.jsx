// The frame around every logged-in page: top navigation, then the page itself.
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext';

const LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/workouts', label: 'Workouts' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/food', label: 'Food log' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            M
          </span>
          <span className="brand__name">Momentum</span>
        </div>
        <nav aria-label="Main">
          {LINKS.map((link) => (
            // NavLink adds class "active" to the link for the current page.
            <NavLink key={link.to} to={link.to} end={link.end} className="nav-link">
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar__user">
          <span className="muted">{user?.email}</span>
          <button type="button" className="btn btn--ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

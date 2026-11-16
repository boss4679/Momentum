// Wraps every page that needs a logged-in user. Anonymous visitors are redirected to
// /login, with the page they wanted saved in the navigation state so login can return them
// there afterwards.
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext';
import { LoadingState } from '../components/StatusViews';

export default function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <LoadingState label="Checking your session" />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  // Outlet renders whichever child route matched.
  return <Outlet />;
}

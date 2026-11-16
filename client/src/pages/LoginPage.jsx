import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import AuthForm from '../components/AuthForm';

export default function LoginPage() {
  const { login, status, notice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Where to go after logging in: the page that sent us here, or the dashboard.
  const from = location.state?.from ?? '/';

  if (status === 'authenticated') return <Navigate to={from} replace />;

  return (
    <AuthForm
      title="Log in to Momentum"
      submitLabel="Log in"
      notice={notice}
      onSubmit={async (email, password) => {
        await login(email, password);
        navigate(from, { replace: true });
      }}
      footer={
        <>
          No account yet? <Link to="/register">Create one</Link>
        </>
      }
    />
  );
}

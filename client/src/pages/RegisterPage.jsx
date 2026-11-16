import { Link, Navigate, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import AuthForm from '../components/AuthForm';

export default function RegisterPage() {
  const { register, status } = useAuth();
  const navigate = useNavigate();

  if (status === 'authenticated') return <Navigate to="/" replace />;

  return (
    <AuthForm
      title="Create your account"
      submitLabel="Create account"
      passwordHint="At least 8 characters"
      onSubmit={async (email, password) => {
        await register(email, password);
        navigate('/', { replace: true });
      }}
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    />
  );
}

import { Link } from 'react-router';
import { EmptyState } from '../components/StatusViews';

export default function NotFoundPage() {
  return (
    <EmptyState title="Page not found" hint="That address doesn't match any page.">
      <Link to="/" className="btn">
        Back to the dashboard
      </Link>
    </EmptyState>
  );
}

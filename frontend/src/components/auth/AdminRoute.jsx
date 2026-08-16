import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Wraps routes that only the Administrator/HR Manager role should reach.
// An Employee who navigates here directly (e.g. by typing the URL) gets sent
// back to their own dashboard instead of seeing admin-only content.
export default function AdminRoute({ children }) {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

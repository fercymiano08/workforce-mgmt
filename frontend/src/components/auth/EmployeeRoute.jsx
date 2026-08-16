import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Wraps routes that only the Employee role should reach (self-service pages
// like My Attendance / My Schedule / My Timesheet). An Administrator who
// navigates here directly (e.g. by typing the URL) gets sent back to their
// own dashboard instead of seeing employee-only content.
export default function EmployeeRoute({ children }) {
  const { isEmployee } = useAuth();

  if (!isEmployee) {
    return <Navigate to="/" replace />;
  }

  return children;
}

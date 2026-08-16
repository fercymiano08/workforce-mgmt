import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';
import MainLayout from '../layout/MainLayout';
import FocusLayout from '../layout/FocusLayout';

// `focused` swaps the sidebar/topbar chrome for a minimal header - for
// single-task flows (e.g. Employee Registration) that are reached via an
// action button rather than browsed to from the sidebar.
export default function PrivateLayout({ children, adminOnly = false, focused = false }) {
  const Layout = focused ? FocusLayout : MainLayout;
  const content = <Layout>{children}</Layout>;

  return (
    <ProtectedRoute>
      {adminOnly ? <AdminRoute>{content}</AdminRoute> : content}
    </ProtectedRoute>
  );
}

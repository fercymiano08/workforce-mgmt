import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const routeNames = {
  '/': 'Dashboard',
  '/employees': 'Employees',
  '/employee-registration': 'Employee Registration',
  '/attendance': 'Time & Attendance',
  '/my-attendance': 'My Attendance',
  '/my-schedule': 'My Schedule',
  '/shifts': 'Shift & Schedule',
  '/timesheets': 'Timesheet Management',
  '/leave': 'Leave Management',
  '/analytics': 'Workforce Analytics',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/kiosk-setup': 'Kiosk Setup',
};

export default function Breadcrumbs() {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter(x => x);

  if (location.pathname === '/') return null;

  return (
    <nav className="flex items-center gap-1.5 text-sm py-4" aria-label="Breadcrumb">
      <Link to="/" className="text-gray-400 hover:text-gray-600 transition-colors pointer-coarse:p-2 pointer-coarse:-m-2">
        <Home className="w-4 h-4" />
      </Link>
      {pathnames.map((name, index) => {
        const routeTo = `/${pathnames.slice(0, index + 1).join('/')}`;
        const isLast = index === pathnames.length - 1;
        const displayName = routeNames[routeTo] || name.charAt(0).toUpperCase() + name.slice(1);
        return (
          <span key={routeTo} className="flex items-center gap-1.5">
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            {isLast ? (
              <span className="text-gray-900 font-semibold">{displayName}</span>
            ) : (
              <Link to={routeTo} className="text-gray-400 hover:text-gray-600 transition-colors">{displayName}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

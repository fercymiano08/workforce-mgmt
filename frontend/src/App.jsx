import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RoleProvider } from './context/RoleContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationProvider } from './context/NotificationContext';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import PrivateLayout from './components/auth/PrivateLayout';
import EmployeeRoute from './components/auth/EmployeeRoute';
import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import AttendanceTerminal from './pages/KIOSK/AttendanceTerminal';
import KioskSetup from './pages/KIOSK/KioskSetup';
import Dashboard from './pages/HR_Manager/Dashboard';
import EmployeeDashboard from './pages/Employee/EmployeeDashboard';
import Employees from './pages/HR_Manager/Employees';
import EmployeeRegistration from './pages/HR_Manager/EmployeeRegistration';
import Attendance from './pages/HR_Manager/Attendance';
import Shifts from './pages/HR_Manager/Shifts';
import Timesheets from './pages/HR_Manager/Timesheets';
import Leave from './pages/Employee/Leave';
import LeaveManagement from './pages/HR_Manager/LeaveManagement';
import Analytics from './pages/HR_Manager/Analytics';
import Reports from './pages/HR_Manager/Reports';
import HRSettings from './pages/HR_Manager/Settings';
import EmployeeSettings from './pages/Employee/Settings';
import AIDecisionSupport from './pages/HR_Manager/AIDecisionSupport';
import MyAttendance from './pages/Employee/MyAttendance';
import MySchedule from './pages/Employee/MySchedule';
import MyTimesheet from './pages/Employee/MyTimesheet';


// Renders the right dashboard for whoever is logged in, without needing a
// separate route for each role.
function HomeRoute() {
  const { isAdmin } = useAuth();
  return isAdmin ? <Dashboard /> : <EmployeeDashboard />;
}

// Settings and Notifications are shared paths (both roles reach them from
// the same sidebar item), but the content is genuinely different per role -
// same pattern as HomeRoute above, picking the right POV's page.
function SettingsRoute() {
  const { isAdmin } = useAuth();
  return isAdmin ? <HRSettings /> : <EmployeeSettings />;
}

// Leave is a shared path too: HR gets the management/approval console,
// Employees get their own self-service request page. Never the reverse -
// each POV only ever renders its own module.
function LeaveRoute() {
  const { isAdmin } = useAuth();
  return isAdmin ? <LeaveManagement /> : <Leave />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/forgot-password" element={isAuthenticated ? <Navigate to="/" replace /> : <ForgotPassword />} />
      <Route path="/reset-password" element={isAuthenticated ? <Navigate to="/" replace /> : <ResetPassword />} />

      {/* Entrance clock-in device (KIOSK) - public, no login required */}
      <Route path="/kiosk" element={<AttendanceTerminal />} />
      {/* HR Manager module for configuring the kiosk (protected by admin guard) */}
      <Route path="/kiosk-setup" element={<PrivateLayout adminOnly><KioskSetup /></PrivateLayout>} />

      <Route path="/" element={<PrivateLayout><HomeRoute /></PrivateLayout>} />
      <Route path="/employees" element={<PrivateLayout adminOnly><Employees /></PrivateLayout>} />
      <Route path="/employee-registration" element={<PrivateLayout adminOnly focused><EmployeeRegistration /></PrivateLayout>} />
      <Route path="/attendance" element={<PrivateLayout adminOnly><Attendance /></PrivateLayout>} />
      <Route path="/shifts" element={<PrivateLayout adminOnly><Shifts /></PrivateLayout>} />
      <Route path="/timesheets" element={<PrivateLayout adminOnly><Timesheets /></PrivateLayout>} />
      <Route path="/my-timesheet" element={<PrivateLayout><EmployeeRoute><MyTimesheet /></EmployeeRoute></PrivateLayout>} />
      <Route path="/leave" element={<PrivateLayout><LeaveRoute /></PrivateLayout>} />
      <Route path="/my-attendance" element={<PrivateLayout><EmployeeRoute><MyAttendance /></EmployeeRoute></PrivateLayout>} />
      <Route path="/my-schedule" element={<PrivateLayout><EmployeeRoute><MySchedule /></EmployeeRoute></PrivateLayout>} />
      <Route path="/analytics" element={<PrivateLayout adminOnly><Analytics /></PrivateLayout>} />
      <Route path="/reports" element={<PrivateLayout adminOnly><Reports /></PrivateLayout>} />
      <Route path="/ai-decision-support" element={<PrivateLayout adminOnly><AIDecisionSupport /></PrivateLayout>} />
      <Route path="/settings" element={<PrivateLayout><SettingsRoute /></PrivateLayout>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <Router>
          <AuthProvider>
            <ToastProvider>
              <NotificationProvider>
                <RoleProvider>
                  <AppRoutes />
                </RoleProvider>
              </NotificationProvider>
            </ToastProvider>
          </AuthProvider>
        </Router>
      </ThemeProvider>
    </LanguageProvider>
  );
}

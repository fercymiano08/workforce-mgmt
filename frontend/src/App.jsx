import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RoleProvider } from './context/RoleContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationProvider } from './context/NotificationContext';
import IdleSessionGuard from './components/common/IdleSessionGuard';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { InsightsProvider } from './context/InsightsContext';
import PrivateLayout from './components/auth/PrivateLayout';
import EmployeeRoute from './components/auth/EmployeeRoute';
const Login = lazy(() => import('./pages/auth/Login'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const AttendanceTerminal = lazy(() => import('./pages/KIOSK/AttendanceTerminal'));
const KioskSetup = lazy(() => import('./pages/KIOSK/KioskSetup'));
const Dashboard = lazy(() => import('./pages/HR_Manager/Dashboard'));
const EmployeeDashboard = lazy(() => import('./pages/Employee/EmployeeDashboard'));
const Employees = lazy(() => import('./pages/HR_Manager/Employees'));
const EmployeeRegistration = lazy(() => import('./pages/HR_Manager/EmployeeRegistration'));
const Attendance = lazy(() => import('./pages/HR_Manager/Attendance'));
const Shifts = lazy(() => import('./pages/HR_Manager/Shifts'));
const Timesheets = lazy(() => import('./pages/HR_Manager/Timesheets'));
const Leave = lazy(() => import('./pages/Employee/Leave'));
const LeaveManagement = lazy(() => import('./pages/HR_Manager/LeaveManagement'));
const Analytics = lazy(() => import('./pages/HR_Manager/Analytics'));
const Reports = lazy(() => import('./pages/HR_Manager/Reports'));
const HRSettings = lazy(() => import('./pages/HR_Manager/Settings'));
const EmployeeSettings = lazy(() => import('./pages/Employee/Settings'));
const MyProfile = lazy(() => import('./pages/Employee/MyProfile'));
const AIDecisionSupport = lazy(() => import('./pages/HR_Manager/AIDecisionSupport'));
const MyAttendance = lazy(() => import('./pages/Employee/MyAttendance'));
const MySchedule = lazy(() => import('./pages/Employee/MySchedule'));
const MyTimesheet = lazy(() => import('./pages/Employee/MyTimesheet'));
const AuditLogs = lazy(() => import('./pages/HR_Manager/AuditLogs'));
const Notifications = lazy(() => import('./pages/Notifications'));


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

// Every screen is fetched only when it is opened, so the kiosk (which never needs the charts, the reports or the
// admin pages) starts from a small download instead of one bundle holding the whole system.
function PageFallback() {
  return <div className="min-h-screen bg-[#0B1F3A]/5" aria-busy="true" />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Suspense fallback={<PageFallback />}>
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/forgot-password" element={isAuthenticated ? <Navigate to="/" replace /> : <ForgotPassword />} />
      <Route path="/reset-password" element={isAuthenticated ? <Navigate to="/" replace /> : <ResetPassword />} />

      {/* Entrance clock-in device (KIOSK) - public, no login required */}
      <Route path="/kiosk" element={<AttendanceTerminal />} />
      {/* Workforce Admin module for configuring the kiosk (protected by admin guard) */}
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
      <Route path="/audit-logs" element={<PrivateLayout adminOnly><AuditLogs /></PrivateLayout>} />
      <Route path="/my-profile" element={<PrivateLayout><EmployeeRoute><MyProfile /></EmployeeRoute></PrivateLayout>} />
      <Route path="/notifications" element={<PrivateLayout><Notifications /></PrivateLayout>} />
      <Route path="/settings" element={<PrivateLayout><SettingsRoute /></PrivateLayout>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
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
                  <InsightsProvider>
                    <AppRoutes />
                    <IdleSessionGuard />
                  </InsightsProvider>
                </RoleProvider>
              </NotificationProvider>
            </ToastProvider>
          </AuthProvider>
        </Router>
      </ThemeProvider>
    </LanguageProvider>
  );
}

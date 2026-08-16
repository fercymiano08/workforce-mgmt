import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, ArrowLeft, ScanFace, CheckCircle2, RefreshCw, Camera, Eye, EyeOff, User, Phone, Briefcase, KeyRound } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input, { Select } from '../../components/ui/Input';
import FaceCaptureModal from '../../components/employees/FaceCaptureModal';
import { departmentService, employeeService, roleService } from '../../services/api';
import { EMPLOYMENT_TYPES } from '../../utils/constants';
import { useToast } from '../../context/ToastContext';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+\d][\d\s\-()]{6,}$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&._-]{8,}$/;

const TODAY = new Date().toISOString().split('T')[0];

const generateRandomEmployeeId = () => {
  const year = new Date().getFullYear();
  const digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `EMP${year}${digits}`;
};

const generateUniqueEmployeeId = (employees) => {
  const existing = new Set((employees || []).map((e) => e.id));
  let id = generateRandomEmployeeId();
  let attempts = 0;
  while (existing.has(id) && attempts < 20) {
    id = generateRandomEmployeeId();
    attempts += 1;
  }
  return id;
};

const createEmptyForm = (suggestedId = '') => ({
  employeeId: suggestedId,
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  department: '',
  role: '',
  employmentType: 'Full-time',
  dateHired: '',
  dateOfBirth: '',
  address: '',
  emergencyContact: '',
  emergencyPhone: '',
  password: '',
  confirmPassword: '',
  faceRegistered: false,
  faceImage: null,
  faceDescriptor: null,
});

const SECTION_ACCENTS = {
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  teal: 'bg-teal-50 text-teal-600',
  amber: 'bg-amber-50 text-amber-600',
  sky: 'bg-sky-50 text-sky-600',
};

const SectionHeader = ({ icon: Icon, accent = 'blue', title, subtitle, required }) => (
  <div className="flex items-center gap-3">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${SECTION_ACCENTS[accent]}`}>
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <h3 className="text-[15px] font-semibold text-gray-900">
        {title}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </h3>
      <p className="text-[13px] text-gray-500">{subtitle}</p>
    </div>
  </div>
);

export default function EmployeeRegistration() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [existingEmployees, setExistingEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [formData, setFormData] = useState(createEmptyForm());
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [isFaceModalOpen, setIsFaceModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [createdEmployee, setCreatedEmployee] = useState(null);

  const setField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  useEffect(() => {
    let active = true;
    Promise.all([employeeService.getAll(), departmentService.getAll(), roleService.getAll()]).then(([employees, deptData, roleData]) => {
      if (!active) return;
      setExistingEmployees(employees);
      setDepartments(deptData);
      setRoles(roleData);
      setFormData((prev) => ({
        ...prev,
        employeeId: prev.employeeId || generateUniqueEmployeeId(employees),
      }));
    });
    return () => { active = false; };
  }, []);

  const rolesForDepartment = (department) =>
    roles.filter((r) => r.departmentName === department);

  const existingEmails = useCallback(
    () => new Set(existingEmployees.map((e) => e.email.trim().toLowerCase())),
    [existingEmployees]
  );

  const validate = () => {
    const errs = {};
    const email = formData.email.trim();
    const phone = formData.phone.trim();

    if (!formData.firstName.trim()) errs.firstName = 'First name is required.';
    if (!formData.lastName.trim()) errs.lastName = 'Last name is required.';

    if (!email) {
      errs.email = 'Email is required.';
    } else if (!EMAIL_REGEX.test(email)) {
      errs.email = 'Please enter a valid email address.';
    } else if (existingEmails().has(email.toLowerCase())) {
      errs.email = 'An employee with this email already exists.';
    }

    if (!phone) {
      errs.phone = 'Phone number is required.';
    } else if (!PHONE_REGEX.test(phone)) {
      errs.phone = 'Please enter a valid phone number.';
    }

    const emergencyPhone = formData.emergencyPhone.trim();
    if (emergencyPhone && !PHONE_REGEX.test(emergencyPhone)) {
      errs.emergencyPhone = 'Please enter a valid contact number.';
    }

    if (!formData.department) errs.department = 'Department is required.';
    if (!formData.role) errs.role = 'Role is required.';
    if (!formData.employmentType) errs.employmentType = 'Employment type is required.';

    if (!formData.dateHired) {
      errs.dateHired = 'Date hired is required.';
    } else if (new Date(`${formData.dateHired}T00:00:00`) > new Date()) {
      errs.dateHired = 'Date hired cannot be in the future.';
    }

    if (formData.dateOfBirth && new Date(`${formData.dateOfBirth}T00:00:00`) > new Date()) {
      errs.dateOfBirth = 'Birthday cannot be in the future.';
    }

    if (!formData.password) {
      errs.password = 'Password is required.';
    } else if (!PASSWORD_REGEX.test(formData.password)) {
      errs.password = 'Password must be at least 8 characters and include a letter and a number.';
    }

    if (!formData.confirmPassword) {
      errs.confirmPassword = 'Please confirm your password.';
    } else if (formData.confirmPassword !== formData.password) {
      errs.confirmPassword = 'Passwords do not match.';
    }

    if (!formData.faceRegistered || !formData.faceImage) {
      errs.faceRegistered = 'Face registration is required before creating the account.';
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const resetForm = (list = existingEmployees) => {
    const nextId = generateUniqueEmployeeId(list);
    setFormData(createEmptyForm(nextId));
    setFormErrors({});
  };

  const handleDepartmentChange = (value) => {
    setFormData((prev) => ({ ...prev, department: value, role: '' }));
    setFormErrors((prev) => ({ ...prev, department: undefined, role: undefined }));
  };

  const handleFaceCapture = (dataUrl, descriptor) => {
    setFormData((prev) => ({ ...prev, faceImage: dataUrl, faceDescriptor: descriptor, faceRegistered: true }));
    setFormErrors((prev) => ({ ...prev, faceRegistered: undefined }));
    setIsFaceModalOpen(false);
    toast.success('Face Registered', 'Face captured and ready for kiosk matching.');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const newEmployee = {
        id: formData.employeeId.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        department: formData.department,
        position: formData.role,
        employmentType: formData.employmentType,
        status: 'Active',
        hireDate: formData.dateHired,
        salary: 0,
        manager: '',
        avatar: '',
        address: formData.address,
        dateOfBirth: formData.dateOfBirth,
        emergencyContact: formData.emergencyContact,
        emergencyPhone: formData.emergencyPhone,
        gender: '',
        assignedShift: '',
        skills: [],
        password: formData.password,
        faceRegistered: formData.faceRegistered,
        faceImage: formData.faceImage,
        faceDescriptor: formData.faceDescriptor,
      };
      const created = await employeeService.create(newEmployee);
      setExistingEmployees((prev) => [...prev, created]);
      setCreatedEmployee(created);

      toast.success('Employee Account Created', 'Employee account created successfully.');
    } catch {
      toast.error('Error', 'Failed to create employee account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterAnother = () => {
    resetForm([...existingEmployees, createdEmployee].filter(Boolean));
    setCreatedEmployee(null);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Registration</h1>
          <p className="text-[14px] text-gray-500 mt-1">Register a new employee account</p>
        </div>
        <Button variant="outline" icon={ArrowLeft} onClick={() => navigate('/employees')}>
          Back to Employees
        </Button>
      </div>

      {/* Form / Success */}
      {createdEmployee ? (
        <Card>
          <div className="py-8 px-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">Employee Account Created</h2>
            <p className="mt-1 text-sm text-gray-500">
              {`${createdEmployee.firstName} ${createdEmployee.lastName}`.trim()} · {createdEmployee.id}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Sign-in email: <span className="font-medium text-gray-500">{createdEmployee.email}</span>
            </p>

            <div className="mt-6 w-full max-w-md rounded-xl border border-gray-100 bg-gray-50 px-5 py-4 text-left">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Department</p>
                  <p className="mt-0.5 font-medium text-gray-700">{createdEmployee.department || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Role</p>
                  <p className="mt-0.5 font-medium text-gray-700">{createdEmployee.position || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Employment</p>
                  <p className="mt-0.5 font-medium text-gray-700">{createdEmployee.employmentType || '—'}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button icon={UserPlus} onClick={handleRegisterAnother}>
                Register Another Employee
              </Button>
            </div>

            <p className="mt-5 text-xs text-gray-400">
              The employee can sign in at the login page with their email and the password you set.
            </p>
          </div>
        </Card>
      ) : (
      <Card>
        <form onSubmit={handleSubmit} noValidate>
          <p className="text-xs text-gray-400 mb-6">
            Fields marked <span className="text-red-500">*</span> are required.
          </p>

          {/* Personal Information */}
          <section className="mb-8">
            <SectionHeader
              icon={User}
              accent="blue"
              title="Personal Information"
              subtitle="Basic details about the employee."
            />
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="First Name"
                required
                value={formData.firstName}
                onChange={(e) => setField('firstName', e.target.value)}
                error={formErrors.firstName}
                placeholder="Enter first name"
              />
              <Input
                label="Last Name"
                required
                value={formData.lastName}
                onChange={(e) => setField('lastName', e.target.value)}
                error={formErrors.lastName}
                placeholder="Enter last name"
              />
              <Input
                label="Birthday"
                type="date"
                max={TODAY}
                value={formData.dateOfBirth}
                onChange={(e) => setField('dateOfBirth', e.target.value)}
                error={formErrors.dateOfBirth}
              />
              <Input
                label="Phone Number"
                required
                value={formData.phone}
                onChange={(e) => setField('phone', e.target.value)}
                error={formErrors.phone}
                placeholder="+63 9XX XXX XXXX"
              />
              <Input
                label="Email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setField('email', e.target.value)}
                error={formErrors.email}
                placeholder="email@company.com"
              />
            </div>
          </section>

          <div className="h-px bg-gray-100 my-8" />

          {/* Contact Information */}
          <section className="mb-8">
            <SectionHeader
              icon={Phone}
              accent="violet"
              title="Contact Information"
              subtitle="Home address and emergency contact for quick reach during incidents."
            />
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Home Address"
                containerClass="md:col-span-2"
                value={formData.address}
                onChange={(e) => setField('address', e.target.value)}
                error={formErrors.address}
                placeholder="Street, Barangay, City"
              />
              <Input
                label="Emergency Contact Name"
                value={formData.emergencyContact}
                onChange={(e) => setField('emergencyContact', e.target.value)}
                error={formErrors.emergencyContact}
                placeholder="Name of the person to contact"
              />
              <Input
                label="Emergency Contact Number"
                value={formData.emergencyPhone}
                onChange={(e) => setField('emergencyPhone', e.target.value)}
                error={formErrors.emergencyPhone}
                placeholder="+63 9XX XXX XXXX"
              />
            </div>
          </section>

          <div className="h-px bg-gray-100 my-8" />

          {/* Employment Information */}
          <section className="mb-8">
            <SectionHeader
              icon={Briefcase}
              accent="teal"
              title="Employment Information"
              subtitle="Job assignment and organizational details."
            />
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Employee ID"
                required
                value={formData.employeeId}
                disabled
                className="bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <Select
                label="Department"
                required
                value={formData.department}
                onChange={(e) => handleDepartmentChange(e.target.value)}
                error={formErrors.department}
              >
                <option value="">Select Department</option>
                {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </Select>
              <Select
                label="Role"
                required
                value={formData.role}
                onChange={(e) => setField('role', e.target.value)}
                error={formErrors.role}
                disabled={!formData.department}
              >
                <option value="">
                  {formData.department ? 'Select Role' : 'Select a department first'}
                </option>
                {rolesForDepartment(formData.department).map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
              </Select>
              <Select
                label="Employment Type"
                required
                value={formData.employmentType}
                onChange={(e) => setField('employmentType', e.target.value)}
                error={formErrors.employmentType}
              >
                {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Input
                label="Date Hired"
                type="date"
                required
                max={TODAY}
                value={formData.dateHired}
                onChange={(e) => setField('dateHired', e.target.value)}
                error={formErrors.dateHired}
              />
            </div>
          </section>

          <div className="h-px bg-gray-100 my-8" />

          {/* Account Security */}
          <section className="mb-8">
            <SectionHeader
              icon={KeyRound}
              accent="amber"
              title="Account Security"
              subtitle="Credentials the employee will use to sign in."
            />
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Account Password"
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.password}
                onChange={(e) => setField('password', e.target.value)}
                error={formErrors.password}
                placeholder="At least 8 characters"
                rightElement={
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((s) => !s)}
                    className="p-1 pointer-coarse:p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
              <Input
                label="Confirm Password"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                value={formData.confirmPassword}
                onChange={(e) => setField('confirmPassword', e.target.value)}
                error={formErrors.confirmPassword}
                placeholder="Re-enter password"
                rightElement={
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowConfirmPassword((s) => !s)}
                    className="p-1 pointer-coarse:p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
              <p className="text-xs text-gray-500">
                Password must be at least 8 characters and include at least one letter and one number.
              </p>
            </div>
          </section>

          {/* Facial Recognition */}
          <section>
            <SectionHeader
              icon={ScanFace}
              accent="sky"
              title="Facial Recognition"
              required
              subtitle="Upload a photo to use as the employee's reference in the attendance kiosk."
            />
            <div className={`mt-5 flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border bg-gray-50 px-4 py-4 ${formErrors.faceRegistered ? 'border-red-300' : 'border-gray-100'}`}>
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-white border border-gray-200 flex items-center justify-center shrink-0">
                {formData.faceImage ? (
                  <img src={formData.faceImage} alt="Registered face preview" className="w-full h-full object-cover" />
                ) : (
                  <ScanFace className="w-6 h-6 text-gray-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {formData.faceRegistered ? (
                    <Badge variant="success" dot size="sm">
                      <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Registered</span>
                    </Badge>
                  ) : (
                    <Badge variant="default" dot size="sm">Not Registered</Badge>
                  )}
                  <span className="text-xs text-gray-400">Linked to {formData.employeeId || 'this employee ID'}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  Required before the account can be created. This prototype capture is for workflow purposes only and is not a secure biometric authentication system.
                </p>
                {formErrors.faceRegistered && (
                  <p className="text-xs text-red-500 mt-1.5">{formErrors.faceRegistered}</p>
                )}
              </div>
              <Button
                type="button"
                variant={formData.faceRegistered ? 'outline' : 'primary'}
                size="sm"
                icon={formData.faceRegistered ? RefreshCw : Camera}
                onClick={() => setIsFaceModalOpen(true)}
                className="shrink-0"
              >
                {formData.faceRegistered ? 'Retake Photo' : 'Register Face'}
              </Button>
            </div>
          </section>

          <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={() => navigate('/employees')}>
              Cancel
            </Button>
            <Button
              type="submit"
              icon={submitting ? null : UserPlus}
              loading={submitting}
              disabled={!formData.faceRegistered}
              title={!formData.faceRegistered ? 'Register the employee\'s face before creating the account' : undefined}
            >
              Create Employee Account
            </Button>
          </div>
        </form>
      </Card>
      )}

      <FaceCaptureModal
        isOpen={isFaceModalOpen}
        employeeId={formData.employeeId}
        employeeName={`${formData.firstName} ${formData.lastName}`.trim()}
        onCapture={handleFaceCapture}
        onClose={() => setIsFaceModalOpen(false)}
      />
    </div>
  );
}

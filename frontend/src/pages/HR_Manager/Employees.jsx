import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid3X3, List, Mail, Phone, MapPin, User,
  Building, Briefcase, Calendar, Clock, Eye, Edit,
  Upload, Plus, Users, RefreshCw, Camera, CheckCircle2,
  CheckCircle, CalendarOff, UserX, Loader2, ScanFace, Trash2, AlertTriangle
} from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import Input, { Select, Textarea } from '../../components/ui/Input';
import SearchBar from '../../components/ui/SearchBar';
import Modal from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import FaceCaptureModal from '../../components/employees/FaceCaptureModal';
import { departmentService, employeeService, roleService } from '../../services/api';
import { formatDate } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';

const statusVariant = { Active: 'success', 'On Leave': 'warning', Inactive: 'danger' };

const genders = ['Male', 'Female'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+\d][\d\s\-()]{6,}$/;
const DEFAULT_IMPORT_PASSWORD = 'Welcome@2026';
const TODAY = new Date().toISOString().split('T')[0];

const SECTION_ACCENTS = {
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  teal: 'bg-teal-50 text-teal-600',
  sky: 'bg-sky-50 text-sky-600',
};

const SectionHeader = ({ icon: Icon, accent = 'blue', title, subtitle }) => (
  <div className="flex items-center gap-3">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${SECTION_ACCENTS[accent]}`}>
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
      <p className="text-[13px] text-gray-500">{subtitle}</p>
    </div>
  </div>
);

const parseCSVLine = (line) => {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
};

const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, ''));
  return lines.slice(1).map((line) => {
    const cells = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    return row;
  });
};

const normalizeRecord = (rec) => {
  const get = (...keys) => {
    for (const k of keys) {
      if (rec[k] != null && rec[k] !== '') return rec[k];
    }
    return '';
  };
  const fullName = String(get('name', 'fullName', 'full_name') || '');
  const [first, ...rest] = fullName.split(/\s+/);
  const salary = get('salary', 'monthlyRate', 'monthly_rate');
  return {
    firstName: String(get('firstName', 'first_name', 'firstname') || first || ''),
    lastName: String(get('lastName', 'last_name', 'lastname') || rest.join(' ') || ''),
    email: String(get('email') || ''),
    phone: String(get('phone', 'contact', 'mobile', 'contactNumber', 'contact_number') || ''),
    department: String(get('department', 'dept', 'division') || ''),
    position: String(get('position', 'role', 'jobTitle', 'job_title') || ''),
    employmentType: String(get('employmentType', 'employment_type', 'employmenttype', 'type') || 'Full-time'),
    status: String(get('status', 'employmentStatus', 'employment_status') || 'Active'),
    hireDate: String(get('hireDate', 'hire_date', 'dateHired', 'date_hired', 'startDate', 'start_date') || ''),
    salary: salary != null && salary !== '' ? Number(salary) : undefined,
    address: String(get('address', 'addressLine', 'address_line') || ''),
  };
};

export default function Employees() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [employeesData, setEmployeesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [viewMode, setViewMode] = useState('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [formData, setFormData] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const fileInputRef = useRef(null);
  const [orgDepartments, setOrgDepartments] = useState([]);
  const [orgRoles, setOrgRoles] = useState([]);

  const fetchEmployees = useCallback(async () => {
    try {
      const data = await employeeService.getAll();
      setEmployeesData(data);
    } catch {
      toast.error('Error', 'Failed to load employees.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    let active = true;
    employeeService.getAll()
      .then((data) => { if (active) setEmployeesData(data); })
      .catch(() => { if (active) toast.error('Error', 'Failed to load employees.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [toast]);

  useEffect(() => {
    let active = true;
    Promise.all([departmentService.getAll(), roleService.getAll()])
      .then(([depts, roles]) => {
        if (!active) return;
        setOrgDepartments(depts);
        setOrgRoles(roles);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const departments = useMemo(() => ['All', ...new Set(employeesData.map(e => e.department))], [employeesData]);
  const types = ['All', 'Full-time', 'Part-time', 'Contract'];
  const statuses = ['All', 'Active', 'On Leave', 'Inactive'];

  const rolesForDepartment = useCallback(
    (name) => orgRoles.filter((r) => r.departmentName === name),
    [orgRoles]
  );

  const departmentOptions = useMemo(() => {
    const names = orgDepartments.map((d) => d.name);
    const current = formData.department;
    if (current && !names.includes(current)) return [...names, current];
    return names;
  }, [orgDepartments, formData.department]);

  const positionOptions = useMemo(() => {
    const names = rolesForDepartment(formData.department).map((r) => r.name);
    const current = formData.position;
    if (current && !names.includes(current)) return [...names, current];
    return names;
  }, [rolesForDepartment, formData.department, formData.position]);

  const stats = useMemo(() => ({
    total: employeesData.length,
    active: employeesData.filter(e => e.status === 'Active').length,
    onLeave: employeesData.filter(e => e.status === 'On Leave').length,
    inactive: employeesData.filter(e => e.status === 'Inactive').length,
  }), [employeesData]);

  const filtered = useMemo(() => {
    return employeesData.filter(e => {
      const matchSearch = !search ||
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
        e.email.toLowerCase().includes(search.toLowerCase()) ||
        e.position.toLowerCase().includes(search.toLowerCase());
      const matchDept = deptFilter === 'All' || e.department === deptFilter;
      const matchStatus = statusFilter === 'All' || e.status === statusFilter;
      const matchType = typeFilter === 'All' || e.employmentType === typeFilter;
      return matchSearch && matchDept && matchStatus && matchType;
    });
  }, [employeesData, search, deptFilter, statusFilter, typeFilter]);

  const totalPages = Math.ceil(filtered.length / 12);
  const paginated = filtered.slice((currentPage - 1) * 12, currentPage * 12);

  const openView = (emp) => { setSelectedEmployee(emp); setIsViewOpen(true); };
  const openEdit = (emp) => {
    setEditingEmployee(emp);
    setFormData({ ...emp });
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openDelete = (emp) => setDeleteTarget(emp);
  const closeDelete = () => setDeleteTarget(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await employeeService.delete(deleteTarget.id);
      toast.success('Employee Deleted', `${deleteTarget.firstName} ${deleteTarget.lastName} was removed.`);
      setDeleteTarget(null);
      fetchEmployees();
    } catch {
      toast.error('Delete Failed', 'Unable to delete this employee.');
    }
  };

  const handleEditDepartmentChange = (value) => {
    setFormData((prev) => ({ ...prev, department: value, position: '' }));
    setFormErrors((prev) => ({ ...prev, department: undefined, position: undefined }));
  };

  // Face re-registration saves immediately (via the same endpoint Employee
  // Registration's initial capture uses under the hood) rather than waiting
  // for "Save Changes", since it's a distinct action with its own feedback.
  const [isEditFaceModalOpen, setIsEditFaceModalOpen] = useState(false);

  const handleEditFaceCapture = async (dataUrl, descriptor) => {
    if (!editingEmployee) return;
    try {
      const updated = await employeeService.registerFace(editingEmployee.id, dataUrl, descriptor);
      setFormData((prev) => ({
        ...prev,
        faceImage: updated.faceImage,
        faceDescriptor: updated.faceDescriptor,
        faceRegistered: updated.faceRegistered,
      }));
      setEmployeesData((prev) => prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)));
      setIsEditFaceModalOpen(false);
      toast.success('Face Updated', "The employee's registered face has been updated.");
    } catch {
      toast.error('Error', 'Failed to update face registration. Please try again.');
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const raw = file.name.toLowerCase().endsWith('.json') ? JSON.parse(text) : parseCSV(text);
      const list = Array.isArray(raw) ? raw : raw?.employees;
      const records = Array.isArray(list) ? list.map(normalizeRecord) : [];
      if (records.length === 0) {
        toast.error('Import Failed', 'No employee records found in the file.');
        return;
      }
      let created = 0;
      let skipped = 0;
      for (const rec of records) {
        if (!rec.firstName || !rec.lastName) {
          skipped++;
          continue;
        }
        try {
          await employeeService.create({ ...rec, password: DEFAULT_IMPORT_PASSWORD });
          created++;
        } catch {
          skipped++;
        }
      }
      await fetchEmployees();
      if (created > 0) {
        toast.success(
          'Import Complete',
          `Imported ${created} employee${created === 1 ? '' : 's'}${skipped ? `, skipped ${skipped}` : ''}.`
        );
      } else {
        toast.error('Import Failed', 'No valid employee records could be imported.');
      }
    } catch {
      toast.error('Import Failed', 'Could not read the file. Use a CSV or JSON array of employees.');
    }
  };

  const validate = () => {
    const errs = {};

    if (!formData.firstName) errs.firstName = 'Required';
    if (!formData.lastName) errs.lastName = 'Required';
    if (!formData.email) {
      errs.email = 'Required';
    } else if (!EMAIL_REGEX.test(formData.email)) {
      errs.email = 'Please enter a valid email address.';
    }
    if (!formData.department) errs.department = 'Required';
    if (!formData.position) errs.position = 'Required';
    if (formData.phone && !PHONE_REGEX.test(formData.phone)) {
      errs.phone = 'Please enter a valid phone number.';
    }
    if (formData.emergencyPhone && !PHONE_REGEX.test(formData.emergencyPhone)) {
      errs.emergencyPhone = 'Please enter a valid contact number.';
    }
    if (formData.dateOfBirth && formData.dateOfBirth > TODAY) {
      errs.dateOfBirth = 'Birthday cannot be in the future.';
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    try {
      const { dateHired, ...rest } = formData;
      await employeeService.update(editingEmployee.id, { ...rest, hireDate: dateHired || formData.hireDate });
      toast.success('Employee Updated', `${formData.firstName} ${formData.lastName}'s details were saved.`);
      await fetchEmployees();
      setIsFormOpen(false);
    } catch {
      toast.error('Error', 'Operation failed. Please try again.');
    }
  };

  const statCards = [
    { label: 'Total Employees', value: stats.total, icon: Users, color: 'blue' },
    { label: 'Active', value: stats.active, icon: CheckCircle, color: 'emerald' },
    { label: 'On Leave', value: stats.onLeave, icon: CalendarOff, color: 'amber' },
    { label: 'Inactive', value: stats.inactive, icon: UserX, color: 'red' },
  ];

  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };
  const barMap = {
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Management</h1>
          <p className="text-[14px] text-gray-500 mt-1">Manage your workforce efficiently</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" icon={Upload} size="md" onClick={() => fileInputRef.current?.click()}>Import</Button>
          <input ref={fileInputRef} type="file" accept=".csv,.json" className="hidden" onChange={handleImportFile} />
          <Button icon={Plus} size="md" onClick={() => navigate('/employee-registration')}>Add Employee</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(s => (
          <Card key={s.label} className="overflow-hidden" hover>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorMap[s.color]}`}>
                <s.icon className="w-6 h-6" />
              </div>
            </div>
            <div className={`h-1 rounded-full mt-4 ${barMap[s.color]}`} />
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card padding={false}>
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3 flex-wrap">
            <SearchBar value={search} onChange={(v) => { setSearch(v); setCurrentPage(1); }} placeholder="Search by name, position, or email..." className="flex-1 min-w-[240px]" />
            <Select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setCurrentPage(1); }} containerClass="w-44">
              {departments.map(d => <option key={d} value={d}>{d === 'All' ? 'All Departments' : d}</option>)}
            </Select>
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} containerClass="w-36">
              {statuses.map(s => <option key={s} value={s}>{s === 'All' ? 'All Status' : s}</option>)}
            </Select>
            <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }} containerClass="w-36">
              {types.map(t => <option key={t} value={t}>{t === 'All' ? 'All Types' : t}</option>)}
            </Select>
            <div className="flex border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setViewMode('grid')} className={`p-2.5 transition-colors ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-50'}`}>
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('table')} className={`p-2.5 transition-colors ${viewMode === 'table' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-50'}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No employees found" description="Try adjusting your search or filters" />
        ) : viewMode === 'grid' ? (
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginated.map(emp => (
                <Card key={emp.id} hover className="group">
                  <div className="flex items-start justify-between mb-3">
                    <Avatar firstName={emp.firstName} lastName={emp.lastName} size="lg" src={emp.avatar} />
                    <Badge variant={statusVariant[emp.status]} dot size="xs">{emp.status}</Badge>
                  </div>
                  <h3 className="font-semibold text-gray-900">{emp.firstName} {emp.lastName}</h3>
                  <p className="text-xs text-gray-400">{emp.id}</p>
                  <p className="text-sm text-gray-500 mt-0.5 mb-2">{emp.position}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="primary" size="xs">{emp.department}</Badge>
                    <Badge variant={emp.faceRegistered ? 'success' : 'default'} size="xs">
                      <span className="flex items-center gap-1"><ScanFace className="w-3 h-3" /> {emp.faceRegistered ? 'Face Registered' : 'Face Not Registered'}</span>
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Mail className="w-3.5 h-3.5" /> {emp.email}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Phone className="w-3.5 h-3.5" /> {emp.phone}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock className="w-3.5 h-3.5" /> {emp.assignedShift || 'No shift assigned'}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Calendar className="w-3.5 h-3.5" /> {formatDate(emp.hireDate)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                    <Button size="xs" variant="ghost" icon={Eye} onClick={() => openView(emp)}>View</Button>
                    <Button size="xs" variant="ghost" icon={Edit} onClick={() => openEdit(emp)}>Edit</Button>
                    <Button size="xs" variant="ghost" icon={Trash2} className="text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => openDelete(emp)}>Delete</Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {['Employee ID', 'Employee', 'Department', 'Position', 'Employment Type', 'Assigned Shift', 'Account Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map(emp => (
                  <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3.5 text-sm font-medium text-gray-500">{emp.id}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar firstName={emp.firstName} lastName={emp.lastName} size="sm" src={emp.avatar} />
                        <div>
                          <p className="font-medium text-sm text-gray-900">{emp.firstName} {emp.lastName}</p>
                          <p className="text-xs text-gray-500">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{emp.department}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{emp.position}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{emp.employmentType}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{emp.assignedShift || '—'}</td>
                    <td className="px-4 py-3.5"><Badge variant={statusVariant[emp.status]} dot size="xs">{emp.status}</Badge></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openView(emp)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => openEdit(emp)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-amber-600 transition-colors"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => openDelete(emp)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && !loading && (
          <div className="px-4 border-t border-gray-100">
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </div>
        )}
      </Card>

      {/* Edit Employee Modal - mirrors Employee Registration's field set and
          layout so editing feels like the same form, not a different one. */}
      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title="Edit Employee" size="xl">
        <div className="space-y-8">
          <section>
            <SectionHeader icon={User} accent="blue" title="Personal Information" subtitle="Basic details about the employee." />
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="First Name" value={formData.firstName || ''} onChange={e => setFormData({ ...formData, firstName: e.target.value })} error={formErrors.firstName} placeholder="Enter first name" />
              <Input label="Last Name" value={formData.lastName || ''} onChange={e => setFormData({ ...formData, lastName: e.target.value })} error={formErrors.lastName} placeholder="Enter last name" />
              <Input label="Date of Birth" type="date" max={TODAY} value={formData.dateOfBirth || ''} onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })} error={formErrors.dateOfBirth} />
              <Select label="Gender" value={formData.gender || ''} onChange={e => setFormData({ ...formData, gender: e.target.value })}>
                <option value="">Select gender</option>
                {genders.map(g => <option key={g} value={g}>{g}</option>)}
              </Select>
              <Input label="Phone Number" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} error={formErrors.phone} placeholder="+63 9XX XXX XXXX" />
              <Input label="Email" type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} error={formErrors.email} placeholder="email@company.com" />
            </div>
          </section>

          <div className="h-px bg-gray-100" />

          <section>
            <SectionHeader icon={Phone} accent="violet" title="Contact Information" subtitle="Home address and emergency contact for quick reach during incidents." />
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Textarea label="Home Address" containerClass="md:col-span-2" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="Street, Barangay, City" rows={2} />
              <Input label="Emergency Contact Name" value={formData.emergencyContact || ''} onChange={e => setFormData({ ...formData, emergencyContact: e.target.value })} placeholder="Name of the person to contact" />
              <Input label="Emergency Contact Number" value={formData.emergencyPhone || ''} onChange={e => setFormData({ ...formData, emergencyPhone: e.target.value })} error={formErrors.emergencyPhone} placeholder="+63 9XX XXX XXXX" />
            </div>
          </section>

          <div className="h-px bg-gray-100" />

          <section>
            <SectionHeader icon={Briefcase} accent="teal" title="Employment Information" subtitle="Job assignment and organizational details." />
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Employee ID" value={formData.id || ''} disabled className="bg-gray-50 text-gray-500 cursor-not-allowed" />
              <Select label="Department" value={formData.department || ''} onChange={e => handleEditDepartmentChange(e.target.value)} error={formErrors.department}>
                <option value="">Select Department</option>
                {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
              </Select>
              <Select label="Position" value={formData.position || ''} onChange={e => setFormData({ ...formData, position: e.target.value })} error={formErrors.position} disabled={!formData.department}>
                <option value="">{formData.department ? 'Select position' : 'Select a department first'}</option>
                {positionOptions.map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
              <Select label="Employment Type" value={formData.employmentType || ''} onChange={e => setFormData({ ...formData, employmentType: e.target.value })}>
                {types.filter(t => t !== 'All').map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Input label="Date Hired" type="date" max={TODAY} value={formData.dateHired || formData.hireDate || ''} onChange={e => setFormData({ ...formData, dateHired: e.target.value })} error={formErrors.dateHired} />
              <Select label="Status" value={formData.status || ''} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Inactive">Inactive</option>
              </Select>
              <Input label="Salary" type="number" value={formData.salary || ''} onChange={e => setFormData({ ...formData, salary: e.target.value })} placeholder="Monthly salary (₱)" />
            </div>
          </section>

          <div className="h-px bg-gray-100" />

          <section>
            <SectionHeader icon={ScanFace} accent="sky" title="Facial Recognition" subtitle="The photo used as this employee's reference in the attendance kiosk." />
            <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
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
                  <span className="text-xs text-gray-400">Linked to {formData.id}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  Updating this replaces the face the kiosk matches against immediately.
                </p>
              </div>
              <Button
                type="button"
                variant={formData.faceRegistered ? 'outline' : 'primary'}
                size="sm"
                icon={formData.faceRegistered ? RefreshCw : Camera}
                onClick={() => setIsEditFaceModalOpen(true)}
                className="shrink-0"
              >
                {formData.faceRegistered ? 'Update Photo' : 'Register Face'}
              </Button>
            </div>
          </section>
        </div>
        <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
          <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      </Modal>

      <FaceCaptureModal
        isOpen={isEditFaceModalOpen}
        employeeId={formData.id}
        employeeName={`${formData.firstName || ''} ${formData.lastName || ''}`.trim()}
        onCapture={handleEditFaceCapture}
        onClose={() => setIsEditFaceModalOpen(false)}
      />

      {/* View Profile Modal */}
      <Modal isOpen={isViewOpen} onClose={() => setIsViewOpen(false)} title="Employee Profile" size="lg">
        {selectedEmployee && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar firstName={selectedEmployee.firstName} lastName={selectedEmployee.lastName} size="2xl" src={selectedEmployee.avatar} />
              <div>
                <h3 className="text-xl font-bold text-gray-900">{selectedEmployee.firstName} {selectedEmployee.lastName}</h3>
                <p className="text-xs text-gray-400">{selectedEmployee.id}</p>
                <p className="text-gray-500 mt-0.5">{selectedEmployee.position}</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <Badge variant={statusVariant[selectedEmployee.status]} dot>{selectedEmployee.status}</Badge>
                  <Badge variant="primary">{selectedEmployee.department}</Badge>
                  <Badge variant={selectedEmployee.faceRegistered ? 'success' : 'default'}>
                    <span className="flex items-center gap-1"><ScanFace className="w-3.5 h-3.5" /> {selectedEmployee.faceRegistered ? 'Face Registered' : 'Face Not Registered'}</span>
                  </Badge>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Contact Information</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600"><Mail className="w-4 h-4 text-gray-400" />{selectedEmployee.email}</div>
                  <div className="flex items-center gap-2 text-sm text-gray-600"><Phone className="w-4 h-4 text-gray-400" />{selectedEmployee.phone}</div>
                  <div className="flex items-center gap-2 text-sm text-gray-600"><MapPin className="w-4 h-4 text-gray-400" />{selectedEmployee.address}</div>
                  {selectedEmployee.emergencyContact && (
                    <div className="flex items-center gap-2 text-sm text-gray-600"><User className="w-4 h-4 text-gray-400" />{selectedEmployee.emergencyContact}{selectedEmployee.emergencyPhone ? ` · ${selectedEmployee.emergencyPhone}` : ''}</div>
                  )}
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Employment Details</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600"><Building className="w-4 h-4 text-gray-400" />{selectedEmployee.department}</div>
                  <div className="flex items-center gap-2 text-sm text-gray-600"><Briefcase className="w-4 h-4 text-gray-400" />{selectedEmployee.employmentType}</div>
                  <div className="flex items-center gap-2 text-sm text-gray-600"><Clock className="w-4 h-4 text-gray-400" />{selectedEmployee.assignedShift || 'No shift assigned'}</div>
                  <div className="flex items-center gap-2 text-sm text-gray-600"><Calendar className="w-4 h-4 text-gray-400" />Hired {formatDate(selectedEmployee.hireDate)}</div>
                </div>
              </div>
            </div>
            {selectedEmployee.skills && selectedEmployee.skills.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Skills</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedEmployee.skills.map((skill, i) => (
                    <Badge key={i} variant="info" size="sm">{skill}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={!!deleteTarget} onClose={closeDelete} title="Delete Employee" size="sm">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-gray-700">
                  Are you sure you want to delete{' '}
                  <span className="font-semibold text-gray-900">{deleteTarget.firstName} {deleteTarget.lastName}</span>{' '}
                  ({deleteTarget.id})?
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  This permanently removes the employee and their user account. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button variant="outline" onClick={closeDelete}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete}>Delete Employee</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

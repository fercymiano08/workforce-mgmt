import { useState, useMemo, useEffect, useCallback } from 'react';
import { Calendar, CheckCircle, Clock, FileText, Eye, Plus, XCircle, Palmtree, Heart, AlertTriangle, Star, Baby, Users, Flower2, Wallet } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import SearchBar from '../../components/ui/SearchBar';
import { Select, Textarea } from '../../components/ui/Input';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Table';
import { leaveService } from '../../services/api';
import { formatDate } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import useApiData from '../../hooks/useApiData';

const statusVariant = {
  Pending: 'warning',
  Approved: 'success',
  Rejected: 'danger',
  Cancelled: 'default',
};

const leaveTypeVariant = {
  Vacation: 'primary',
  Sick: 'danger',
  Emergency: 'warning',
  Special: 'purple',
  Maternity: 'pink',
  Paternity: 'info',
  Bereavement: 'default',
  Unpaid: 'default',
  'Half Day': 'default',
};

const leaveBalanceStyle = {
  Vacation: { text: 'text-blue-600', barBg: 'bg-blue-100', color: 'bg-blue-500', icon: Palmtree, iconBg: 'bg-blue-50' },
  Sick: { text: 'text-red-600', barBg: 'bg-red-100', color: 'bg-red-500', icon: Heart, iconBg: 'bg-red-50' },
  Emergency: { text: 'text-amber-600', barBg: 'bg-amber-100', color: 'bg-amber-500', icon: AlertTriangle, iconBg: 'bg-amber-50' },
  Special: { text: 'text-purple-600', barBg: 'bg-purple-100', color: 'bg-purple-500', icon: Star, iconBg: 'bg-purple-50' },
  Maternity: { text: 'text-pink-600', barBg: 'bg-pink-100', color: 'bg-pink-500', icon: Baby, iconBg: 'bg-pink-50' },
  Paternity: { text: 'text-sky-600', barBg: 'bg-sky-100', color: 'bg-sky-500', icon: Users, iconBg: 'bg-sky-50' },
  Bereavement: { text: 'text-gray-600', barBg: 'bg-gray-100', color: 'bg-gray-500', icon: Flower2, iconBg: 'bg-gray-50' },
  Unpaid: { text: 'text-slate-600', barBg: 'bg-slate-100', color: 'bg-slate-500', icon: Wallet, iconBg: 'bg-slate-50' },
};

const leaveTypes = ['Vacation', 'Sick', 'Emergency', 'Special', 'Maternity', 'Paternity', 'Bereavement', 'Unpaid'];

const ROWS_PER_PAGE = 8;

export default function Leave() {
  const { toast } = useToast();
  const { user: authUser } = useAuth();

  const currentUser = authUser || {};

  // Employees may only ever see and work with their own leave requests -
  // the page lives behind an Employee-only route, so it never renders for HR.
  const { data: leaves, setData: setLeaves } = useApiData(
    () => (currentUser.id ? leaveService.getByEmployeeId(currentUser.id) : Promise.resolve([])),
    [currentUser.id]
  );

  const [leaveBalances, setLeaveBalances] = useState([]);

  const loadBalances = useCallback(() => {
    if (!currentUser.id) {
      return;
    }
    leaveService.getBalances(currentUser.id)
      .then(setLeaveBalances)
      .catch(() => setLeaveBalances([]));
  }, [currentUser.id]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);

  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [applyForm, setApplyForm] = useState({ leaveType: 'Vacation', startDate: '', endDate: '', reason: '', proofFile: null });
  const [applyErrors, setApplyErrors] = useState({});
  const [proofError, setProofError] = useState('');

  const MAX_PROOF_SIZE = 5 * 1024 * 1024; // 5MB

  const handleProofSelect = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProofError('');
    if (file.size > MAX_PROOF_SIZE) {
      setProofError('File is too large. Maximum size is 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setApplyForm((f) => ({ ...f, proofFile: { name: file.name, dataUrl: reader.result } }));
    };
    reader.onerror = () => setProofError('Could not read that file. Please try again.');
    reader.readAsDataURL(file);
  };

  const statuses = ['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'];
  const types = ['All', ...leaveTypes];

  const filtered = useMemo(() => {
    return (leaves || []).filter((l) => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q
        || l.leaveType.toLowerCase().includes(q)
        || (l.reason || '').toLowerCase().includes(q);
      const matchStatus = statusFilter === 'All' || l.status === statusFilter;
      const matchType = typeFilter === 'All' || l.leaveType === typeFilter;
      return matchSearch && matchStatus && matchType;
    });
  }, [leaves, search, statusFilter, typeFilter]);

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  const handleCancel = async (leave) => {
    try {
      await leaveService.updateStatus(leave.id, 'Cancelled');
      setLeaves((prev) =>
        prev.map((l) => (l.id === leave.id ? { ...l, status: 'Cancelled' } : l))
      );
      toast.success('Leave Cancelled', 'Your leave request has been withdrawn.');
    } catch {
      toast.error('Error', 'Failed to cancel leave request.');
    }
    setIsDetailOpen(false);
  };

  const openDetail = (leave) => {
    setSelectedLeave(leave);
    setIsDetailOpen(true);
  };

  const validateApply = () => {
    const errs = {};
    if (!applyForm.startDate) errs.startDate = 'Start date is required';
    if (!applyForm.endDate) errs.endDate = 'End date is required';
    if (applyForm.startDate && applyForm.endDate && applyForm.startDate > applyForm.endDate) {
      errs.endDate = 'End date must be after start date';
    }
    if (!applyForm.reason.trim()) errs.reason = 'Reason is required';
    setApplyErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleApplyLeave = async () => {
    if (!validateApply()) return;
    try {
      const documents = applyForm.proofFile ? [applyForm.proofFile] : [];
      const created = await leaveService.create({
        employeeId: currentUser.id,
        employeeName: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
        leaveType: applyForm.leaveType,
        startDate: applyForm.startDate,
        endDate: applyForm.endDate,
        reason: applyForm.reason.trim(),
        status: 'Pending',
        appliedDate: new Date().toISOString().split('T')[0],
        documents,
      });
      setLeaves((prev) => [created, ...prev]);
      toast.success('Leave Applied', 'Your leave request has been submitted for approval.');
    } catch {
      toast.error('Error', 'Failed to submit leave request.');
    }
    setApplyForm({ leaveType: 'Vacation', startDate: '', endDate: '', reason: '', proofFile: null });
    setApplyErrors({});
    setProofError('');
    setIsApplyOpen(false);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Leave</h1>
          <p className="text-[14px] text-gray-500 mt-1">View your leave requests and remaining balances</p>
        </div>
        <Button icon={Plus} onClick={() => setIsApplyOpen(true)}>
          Apply Leave
        </Button>
      </div>

      {/* Leave Balance Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {leaveBalances.map((b) => {
          const style = leaveBalanceStyle[b.type] || { text: 'text-gray-600', barBg: 'bg-gray-100', color: 'bg-gray-500' };
          const pct = b.total > 0 ? Math.max((b.remaining / b.total) * 100, 0) : 0;
          return (
            <Card key={b.type} className="overflow-hidden" hover>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${style.iconBg}`}>
                {style.icon && <style.icon className={`w-5 h-5 ${style.text}`} />}
              </div>
              <p className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>{b.type} Leave</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {b.remaining} <span className="text-sm font-normal text-gray-400">/ {b.total}</span>
              </p>
              <div className={`w-full h-1.5 rounded-full mt-3 ${style.barBg}`}>
                <div className={`h-1.5 rounded-full transition-all duration-500 ${style.color}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1.5">{b.remaining === 0 ? 'All used' : `${b.remaining} days remaining`}</p>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchBar
          value={search}
          onChange={(v) => { setSearch(v); setCurrentPage(1); }}
          placeholder="Search leave type or reason..."
          className="flex-1 min-w-[240px]"
        />
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} containerClass="w-40">
          {statuses.map((s) => (
            <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
          ))}
        </Select>
        <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }} containerClass="w-44">
          {types.map((t) => (
            <option key={t} value={t}>{t === 'All' ? 'All Leave Types' : t}</option>
          ))}
        </Select>
      </div>

      {/* Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Leave Type', 'Duration', 'Reason', 'Status', 'Applied Date', 'Approved By', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    No leave requests found.
                  </td>
                </tr>
              ) : (
                paginated.map((leave) => (
                  <tr key={leave.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <Badge variant={leaveTypeVariant[leave.leaveType] || 'default'} size="xs">
                        {leave.leaveType}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-sm text-gray-700">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {formatDate(leave.startDate)} {leave.startDate !== leave.endDate && `– ${formatDate(leave.endDate)}`}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 max-w-[200px] truncate">{leave.reason}</td>
                    <td className="px-4 py-3.5">
                      <Badge variant={statusVariant[leave.status]} dot size="xs">{leave.status}</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-500">{formatDate(leave.appliedDate)}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-500">{leave.approvedBy || '-'}</td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => openDetail(leave)}
                        className="p-1.5 pointer-coarse:p-2.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 border-t border-gray-100">
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </div>
        )}
      </Card>

      {/* Leave Detail Modal */}
      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Leave Request Details" size="lg">
        {selectedLeave && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <div className="flex gap-2">
                  <Badge variant={leaveTypeVariant[selectedLeave.leaveType] || 'default'}>{selectedLeave.leaveType}</Badge>
                  <Badge variant={statusVariant[selectedLeave.status]} dot>{selectedLeave.status}</Badge>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-xl">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                {formatDate(selectedLeave.startDate)} {selectedLeave.startDate !== selectedLeave.endDate && `– ${formatDate(selectedLeave.endDate)}`}
              </span>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Reason</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-4">{selectedLeave.reason}</p>
            </div>

            {(selectedLeave.documents || []).length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Attached Proof</p>
                <div className="flex flex-wrap gap-2">
                  {selectedLeave.documents.map((doc, i) => {
                    const name = typeof doc === 'string' ? doc : doc.name;
                    const url = typeof doc === 'string' ? null : doc.dataUrl;
                    const content = (
                      <>
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="truncate max-w-[200px]">{name}</span>
                      </>
                    );
                    return url ? (
                      <a
                        key={name + i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        download={name}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 rounded-lg text-sm text-gray-700 transition-colors"
                      >
                        {content}
                      </a>
                    ) : (
                      <div key={name + i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700">
                        {content}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Approval Timeline</p>
              <div className="flex items-center gap-0">
                {[
                  { label: 'Applied', date: selectedLeave.appliedDate, done: true },
                  { label: 'Reviewed', date: selectedLeave.approvedBy ? selectedLeave.appliedDate : null, done: !!selectedLeave.approvedBy },
                  { label: selectedLeave.status === 'Rejected' ? 'Rejected' : 'Approved', date: selectedLeave.approvedBy ? selectedLeave.appliedDate : null, done: selectedLeave.status !== 'Pending' },
                ].map((step, i) => (
                  <div key={step.label} className="flex items-center flex-1">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        step.done ? 'bg-emerald-100' : 'bg-gray-100'
                      }`}>
                        {step.done ? (
                          selectedLeave.status === 'Rejected' && i === 2 ? (
                            <XCircle className="w-4 h-4 text-red-500" />
                          ) : (
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                          )
                        ) : (
                          <Clock className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                      <p className={`text-xs font-medium mt-1.5 ${step.done ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</p>
                      {step.date && <p className="text-xs text-gray-400">{formatDate(step.date)}</p>}
                    </div>
                    {i < 2 && (
                      <div className={`flex-1 h-0.5 mx-2 rounded-full ${step.done ? 'bg-emerald-300' : 'bg-gray-200'}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {selectedLeave.comments && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Comments</p>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-700">{selectedLeave.comments}</p>
                  {selectedLeave.approvedBy && (
                    <p className="text-xs text-gray-400 mt-2">— {selectedLeave.approvedBy}</p>
                  )}
                </div>
              </div>
            )}

            {/* Cancel - the employee who filed it may withdraw it while it's
                still awaiting a decision. */}
            {selectedLeave.status === 'Pending' && (
              <div className="flex justify-end pt-4 border-t border-gray-100">
                <Button variant="dangerOutline" icon={XCircle} onClick={() => handleCancel(selectedLeave)}>
                  Cancel Request
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Apply Leave Modal */}
      <Modal isOpen={isApplyOpen} onClose={() => { setIsApplyOpen(false); setApplyErrors({}); }} title="Apply for Leave" size="md">
        <div className="space-y-4">
          <Select
            label="Leave Type"
            value={applyForm.leaveType}
            onChange={(e) => setApplyForm((f) => ({ ...f, leaveType: e.target.value }))}
          >
            {leaveTypes.map((t) => (
              <option key={t} value={t}>{t} Leave</option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start Date"
              type="date"
              required
              value={applyForm.startDate}
              onChange={(e) => {
                const startDate = e.target.value;
                setApplyForm((f) => ({
                  ...f,
                  startDate,
                  // Clear a now-invalid end date rather than leave a
                  // silently-broken range sitting in the form.
                  endDate: f.endDate && f.endDate < startDate ? '' : f.endDate,
                }));
              }}
              error={applyErrors.startDate}
            />
            <Input
              label="End Date"
              type="date"
              required
              value={applyForm.endDate}
              min={applyForm.startDate || undefined}
              disabled={!applyForm.startDate}
              onChange={(e) => setApplyForm((f) => ({ ...f, endDate: e.target.value }))}
              error={applyErrors.endDate}
            />
          </div>
          <Textarea
            label="Reason"
            required
            placeholder="Reason for leave..."
            rows={3}
            value={applyForm.reason}
            onChange={(e) => setApplyForm((f) => ({ ...f, reason: e.target.value }))}
            error={applyErrors.reason}
          />
          <div>
            <label className="text-[13px] font-medium text-gray-700">
              Supporting Document <span className="text-gray-400 font-normal">(optional proof, e.g. medical certificate)</span>
            </label>
            {applyForm.proofFile ? (
              <div className="mt-1.5 flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50">
                <span className="flex items-center gap-2 text-sm text-gray-700 truncate">
                  <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="truncate">{applyForm.proofFile.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setApplyForm((f) => ({ ...f, proofFile: null }))}
                  className="text-xs font-medium text-gray-400 hover:text-red-600 shrink-0"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="mt-1.5 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-colors">
                <Plus className="w-4 h-4" />
                Attach a file
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleProofSelect} />
              </label>
            )}
            {proofError && <p className="text-xs text-red-500 font-medium mt-1.5">{proofError}</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => { setIsApplyOpen(false); setApplyErrors({}); }}>
              Cancel
            </Button>
            <Button icon={CheckCircle} onClick={handleApplyLeave}>
              Submit Request
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

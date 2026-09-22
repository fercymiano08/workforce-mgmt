import { useState, useMemo, useEffect, useCallback } from 'react';
import { Calendar, CheckCircle, Clock, FileText, Plus, XCircle, Palmtree, Heart, AlertTriangle, Star, Flower2, Wallet, Hourglass, ThumbsUp, ThumbsDown, ChevronRight } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import TodayBadge from '../../components/common/TodayBadge';
import { coversToday } from '../../utils/today';
import Badge from '../../components/ui/Badge';
import SearchBar from '../../components/ui/SearchBar';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonList } from '../../components/ui/LoadingSkeleton';
import Input, { Select, Textarea } from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Table';
import { leaveService } from '../../services/api';
import { toDateKey } from '../../services/attendanceService';
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
  Bereavement: 'indigo',
  Unpaid: 'teal',
  'Half Day': 'info',
};

const leaveBalanceStyle = {
  Vacation: { text: 'text-blue-600', barBg: 'bg-blue-100', color: 'bg-blue-500', icon: Palmtree, iconBg: 'bg-blue-50' },
  Sick: { text: 'text-red-600', barBg: 'bg-red-100', color: 'bg-red-500', icon: Heart, iconBg: 'bg-red-50' },
  Emergency: { text: 'text-amber-600', barBg: 'bg-amber-100', color: 'bg-amber-500', icon: AlertTriangle, iconBg: 'bg-amber-50' },
  Special: { text: 'text-purple-600', barBg: 'bg-purple-100', color: 'bg-purple-500', icon: Star, iconBg: 'bg-purple-50' },
  Bereavement: { text: 'text-indigo-600', barBg: 'bg-indigo-100', color: 'bg-indigo-500', icon: Flower2, iconBg: 'bg-indigo-50' },
  Unpaid: { text: 'text-teal-600', barBg: 'bg-teal-100', color: 'bg-teal-500', icon: Wallet, iconBg: 'bg-teal-50' },
};

const leaveTypes = ['Vacation', 'Sick', 'Emergency', 'Special', 'Bereavement', 'Unpaid'];

// Days a leave costs: the server's working-day count when it has one, else the inclusive calendar count.
const countDays = (start, end, counted) => {
  if (counted != null) return Number(counted);
  if (!start || !end || end < start) return 1;
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  return Math.round((new Date(ey, em - 1, ed) - new Date(sy, sm - 1, sd)) / 86400000) + 1;
};

const ROWS_PER_PAGE = 6;

// Today as YYYY-MM-DD in the browser's local time. Leave can start today at the
// earliest - a leave request for a day that has already begun is meaningless.
const todayKey = () => toDateKey(new Date());

export default function Leave() {
  const { toast } = useToast();
  const { user: authUser } = useAuth();

  const currentUser = authUser || {};

  // Employees may only ever see and work with their own leave requests -
  // the page lives behind an Employee-only route, so it never renders for HR.
  const { data: leaves, setData: setLeaves, loading: leavesLoading } = useApiData(
    () => (currentUser.id ? leaveService.getByEmployeeId(currentUser.id) : Promise.resolve([])),
    [currentUser.id]
  );

  const [leaveBalances, setLeaveBalances] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(true);

  const loadBalances = useCallback(() => {
    if (!currentUser.id) {
      setBalancesLoading(false);
      return;
    }
    leaveService.getBalances(currentUser.id)
      .then((data) => {
        setLeaveBalances(data);
        setBalancesLoading(false);
      })
      .catch(() => {
        // Keep whatever we already had on screen instead of flashing the
        // cards to empty on a transient failure - only a real "no data yet"
        // case (nothing loaded before) falls through to the empty state.
        setBalancesLoading(false);
      });
  }, [currentUser.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadBalances synchronously resets the loading flag when there's no employee id to fetch for; the actual data fetch itself is properly async
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
  // Live cost of the chosen dates (working days only), asked from the server as the person picks them
  const [preview, setPreview] = useState(null);
  const { startDate: previewStart, endDate: previewEnd } = applyForm;
  useEffect(() => {
    let cancelled = false;
    const startDate = previewStart;
    const endDate = previewEnd;
    if (!currentUser.id || !startDate || !endDate || endDate < startDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing a stale answer when the dates are incomplete
      setPreview(null);
      return undefined;
    }
    leaveService.workingDays(currentUser.id, startDate, endDate)
      .then((r) => { if (!cancelled) setPreview(r); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [previewStart, previewEnd, currentUser.id]);

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

  const summary = useMemo(() => {
    const all = leaves || [];
    return {
      total: all.length,
      pending: all.filter((l) => l.status === 'Pending').length,
      approved: all.filter((l) => l.status === 'Approved').length,
      rejected: all.filter((l) => l.status === 'Rejected').length,
    };
  }, [leaves]);

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
    else if (applyForm.startDate < todayKey()) errs.startDate = 'Leave cannot start in the past. Choose today or a later date.';
    if (!applyForm.endDate) errs.endDate = 'End date is required';
    if (applyForm.startDate && applyForm.endDate && applyForm.startDate > applyForm.endDate) {
      errs.endDate = 'End date must be after start date';
    }
    if (!applyForm.reason.trim()) errs.reason = 'Reason is required';
    setApplyErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Async on purpose: the shared Button locks itself (spinner) until this promise
  // settles, so a slow server can't turn extra clicks into duplicate requests.
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
    } catch (error) {
      // Keep the form open with everything typed in, and say WHY it failed
      // (e.g. an overlapping request) instead of a generic error.
      const data = error?.response?.data;
      const firstFieldError = data?.errors ? Object.values(data.errors).flat()[0] : null;
      toast.error('Could not submit leave', firstFieldError || data?.message || 'The server did not respond. Please try again.');
      return;
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Requests', value: summary.total, icon: FileText, accent: 'text-blue-600 bg-blue-50' },
          { label: 'Pending', value: summary.pending, icon: Hourglass, accent: 'text-amber-600 bg-amber-50' },
          { label: 'Approved', value: summary.approved, icon: ThumbsUp, accent: 'text-emerald-600 bg-emerald-50' },
          { label: 'Rejected', value: summary.rejected, icon: ThumbsDown, accent: 'text-red-600 bg-red-50' },
        ].map((s) => (
          <Card key={s.label} className="overflow-hidden" hover>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.accent}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Leave Balances */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Leave Balances</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {balancesLoading && leaveBalances.length === 0 ? (
            // Loading placeholders instead of rendering nothing - an empty
            // grid here is what made the section look like it was
            // disappearing and reappearing on every visit to this page.
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <div className="skeleton w-10 h-10 rounded-xl mb-3" />
                <div className="skeleton h-3 w-20 rounded" />
                <div className="skeleton h-7 w-16 rounded mt-2" />
                <div className="skeleton h-1.5 w-full rounded-full mt-3" />
                <div className="skeleton h-3 w-24 rounded mt-1.5" />
              </Card>
            ))
          ) : leaveBalances.map((b) => {
            const style = leaveBalanceStyle[b.type] || { text: 'text-indigo-600', barBg: 'bg-indigo-100', color: 'bg-indigo-500', icon: Calendar, iconBg: 'bg-indigo-50' };
            const pct = b.total > 0 ? Math.max((b.remaining / b.total) * 100, 0) : 0;
            return (
              <Card key={b.type} className="overflow-hidden" hover>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${style.iconBg || 'bg-gray-50'}`}>
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
      </div>

      {/* My Requests */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">My Requests</h2>

        <div className="flex items-center gap-3 flex-wrap mb-4">
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

        {leavesLoading ? (
          <Card className="p-4">
            <SkeletonList rows={4} />
          </Card>
        ) : paginated.length === 0 ? (
          <Card>
            {(leaves || []).length === 0 ? (
              <EmptyState
                icon={Palmtree}
                title="No leave requests yet"
                description="You have not filed any leave request. When you need time off, submit a request and HR will review it."
                action={
                  <Button icon={Plus} onClick={() => setIsApplyOpen(true)}>
                    Apply for Leave
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No requests match your filters"
                description="Try a different status, leave type, or search term to find what you are looking for."
              />
            )}
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {paginated.map((leave) => {
                const style = leaveBalanceStyle[leave.leaveType] || {};
                const TypeIcon = style.icon || Calendar;
                const days = countDays(leave.startDate, leave.endDate, leave.days);
                return (
                  <button
                    key={leave.id}
                    onClick={() => openDetail(leave)}
                    className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 group"
                  >
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${style.iconBg || 'bg-gray-50'}`}>
                      <TypeIcon className={`w-5 h-5 ${style.text || 'text-gray-500'}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{leave.leaveType} Leave</p>
                        <Badge variant={statusVariant[leave.status]} dot size="xs">{leave.status}</Badge>
                        {leave.status === 'Approved' && coversToday(leave.startDate, leave.endDate) && <TodayBadge>On leave today</TodayBadge>}
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-600 mt-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        {formatDate(leave.startDate)}
                        {leave.startDate !== leave.endDate && ` – ${formatDate(leave.endDate)}`}
                        <span className="text-gray-400">· {days} {days === 1 ? 'day' : 'days'}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 truncate">Applied {formatDate(leave.appliedDate)} · {leave.reason}</p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <span className="text-xs font-medium text-gray-500 hidden sm:inline group-hover:text-blue-600 transition-colors">View details</span>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </button>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
              </div>
            )}
          </>
        )}
      </div>

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
              min={todayKey()}
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
              min={applyForm.startDate || todayKey()}
              disabled={!applyForm.startDate}
              onChange={(e) => setApplyForm((f) => ({ ...f, endDate: e.target.value }))}
              error={applyErrors.endDate}
            />
          </div>
          {preview && (
            <div className={`rounded-lg border px-3 py-2 text-[13px] ${preview.days < 1 ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
              {preview.days < 1
                ? 'These dates have no working days (weekend, holiday or day off). Pick different dates.'
                : <>This will use <strong>{preview.days} working {preview.days === 1 ? 'day' : 'days'}</strong> of your balance
                  {preview.calendarDays > preview.days && ` (${preview.calendarDays} calendar days; weekends, holidays and days off are not counted)`}.</>}
              {Object.keys(preview.holidays || {}).length > 0 && (
                <div className="text-xs mt-0.5">Holiday: {Object.entries(preview.holidays).map(([d, n]) => `${n} (${formatDate(d)})`).join(', ')}</div>
              )}
            </div>
          )}
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

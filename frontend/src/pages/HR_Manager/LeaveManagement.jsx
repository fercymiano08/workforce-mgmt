import { useState, useMemo } from 'react';
import {
  Calendar, CheckCircle, XCircle, Clock, FileText, Eye,
  Users, Hourglass, ThumbsUp, ThumbsDown,
} from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import SearchBar from '../../components/ui/SearchBar';
import { Select, Textarea } from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Table';
import { SkeletonTable } from '../../components/ui/LoadingSkeleton';
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

const allTabs = ['All Requests', 'Pending Approvals'];
const statuses = ['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'];
const leaveTypes = ['All', 'Vacation', 'Sick', 'Emergency', 'Special', 'Maternity', 'Paternity', 'Bereavement', 'Unpaid', 'Half Day'];

const ROWS_PER_PAGE = 8;

const countDays = (start, end) => {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
};

export default function LeaveManagement() {
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: leaves, setData: setLeaves, loading } = useApiData(() => leaveService.getAll(), []);

  const [activeTab, setActiveTab] = useState('All Requests');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [actionComment, setActionComment] = useState('');

  const pendingCount = useMemo(() => (leaves || []).filter((l) => l.status === 'Pending').length, [leaves]);

  const summary = useMemo(() => {
    const list = leaves || [];
    return {
      total: list.length,
      pending: pendingCount,
      approved: list.filter((l) => l.status === 'Approved').length,
      rejected: list.filter((l) => l.status === 'Rejected').length,
    };
  }, [leaves, pendingCount]);

  const filtered = useMemo(() => {
    return (leaves || []).filter((l) => {
      if (activeTab === 'Pending Approvals' && l.status !== 'Pending') return false;
      const matchSearch = !search || (l.employeeName || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || l.status === statusFilter;
      const matchType = typeFilter === 'All' || l.leaveType === typeFilter;
      return matchSearch && matchStatus && matchType;
    });
  }, [leaves, activeTab, search, statusFilter, typeFilter]);

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  const tabCounts = {
    'All Requests': (leaves || []).length,
    'Pending Approvals': pendingCount,
  };

  const openDetail = (leave) => {
    setSelectedLeave(leave);
    setActionComment('');
    setIsDetailOpen(true);
  };

  const handleDecision = async (leave, status) => {
    const approvedBy = user ? `${user.firstName} ${user.lastName}`.trim() : 'HR Admin';
    try {
      await leaveService.updateStatus(leave.id, status, approvedBy);
      setLeaves((prev) =>
        prev.map((l) =>
          l.id === leave.id
            ? { ...l, status, approvedBy, comments: actionComment.trim() || (status === 'Approved' ? 'Approved.' : 'Rejected.') }
            : l
        )
      );
      if (status === 'Approved') {
        toast.success('Leave Approved', `Leave request for ${leave.employeeName} has been approved.`);
      } else {
        toast.error('Leave Rejected', `Leave request for ${leave.employeeName} has been rejected.`);
      }
    } catch {
      toast.error('Error', `Failed to ${status === 'Approved' ? 'approve' : 'reject'} leave request.`);
    }
    setIsDetailOpen(false);
  };

  const summaryCards = [
    { label: 'Total Requests', value: summary.total, icon: Users, accent: 'text-blue-600 bg-blue-50' },
    { label: 'Pending', value: summary.pending, icon: Hourglass, accent: 'text-amber-600 bg-amber-50' },
    { label: 'Approved', value: summary.approved, icon: ThumbsUp, accent: 'text-emerald-600 bg-emerald-50' },
    { label: 'Rejected', value: summary.rejected, icon: ThumbsDown, accent: 'text-red-600 bg-red-50' },
  ];

  if (loading) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <SkeletonTable rows={8} cols={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
          <p className="text-[14px] text-gray-500 mt-1">Review and decide on employee leave requests</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {summaryCards.map((s) => (
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

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          {allTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setCurrentPage(1); setSearch(''); setStatusFilter('All'); setTypeFilter('All'); }}
              className={`px-5 py-3 text-sm font-medium transition-colors relative ${
                activeTab === tab ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
              {tabCounts[tab] > 0 && (
                <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
                  activeTab === tab ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                }`}>
                  {tabCounts[tab]}
                </span>
              )}
              {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchBar
          value={search}
          onChange={(v) => { setSearch(v); setCurrentPage(1); }}
          placeholder="Search by employee name..."
          className="flex-1 min-w-[240px]"
        />
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} containerClass="w-40">
          {statuses.map((s) => (
            <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
          ))}
        </Select>
        <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }} containerClass="w-44">
          {leaveTypes.map((t) => (
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
                {['Employee', 'Leave Type', 'Duration', 'Reason', 'Status', 'Applied Date', 'Approved By', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                    No leave requests found matching your filters.
                  </td>
                </tr>
              ) : (
                paginated.map((leave) => (
                  <tr key={leave.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar
                          firstName={(leave.employeeName || '').split(' ')[0]}
                          lastName={(leave.employeeName || '').split(' ').slice(1).join(' ')}
                          size="sm"
                        />
                        <div>
                          <p className="font-medium text-sm text-gray-900">{leave.employeeName}</p>
                          <p className="text-xs text-gray-500">{leave.employeeId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant={leaveTypeVariant[leave.leaveType] || 'default'} size="xs">
                        {leave.leaveType}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-sm text-gray-700">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {formatDate(leave.startDate)} {leave.startDate !== leave.endDate && `– ${formatDate(leave.endDate)}`}
                        <span className="text-xs text-gray-400">({countDays(leave.startDate, leave.endDate)}d)</span>
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
              <Avatar
                firstName={(selectedLeave.employeeName || '').split(' ')[0]}
                lastName={(selectedLeave.employeeName || '').split(' ').slice(1).join(' ')}
                size="xl"
              />
              <div>
                <h3 className="text-xl font-bold text-gray-900">{selectedLeave.employeeName}</h3>
                <p className="text-gray-500">{selectedLeave.employeeId}</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant={leaveTypeVariant[selectedLeave.leaveType] || 'default'}>{selectedLeave.leaveType}</Badge>
                  <Badge variant={statusVariant[selectedLeave.status]} dot>{selectedLeave.status}</Badge>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-xl">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                {formatDate(selectedLeave.startDate)} {selectedLeave.startDate !== selectedLeave.endDate && `– ${formatDate(selectedLeave.endDate)}`}
                <span className="text-gray-400 ml-1.5">({countDays(selectedLeave.startDate, selectedLeave.endDate)} day(s))</span>
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

            {selectedLeave.status === 'Pending' && (
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <Textarea
                  label="Comments (optional)"
                  placeholder="Add a comment for this action..."
                  rows={2}
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                />
                <div className="flex justify-end gap-3">
                  <Button
                    variant="danger"
                    icon={XCircle}
                    onClick={() => handleDecision(selectedLeave, 'Rejected')}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="success"
                    icon={CheckCircle}
                    onClick={() => handleDecision(selectedLeave, 'Approved')}
                  >
                    Approve
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

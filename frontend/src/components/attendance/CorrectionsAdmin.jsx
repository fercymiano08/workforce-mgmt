import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Clock, ClipboardEdit, Hourglass, ImageIcon, MonitorX, Repeat, XCircle } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import SearchBar from '../ui/SearchBar';
import Input, { Select, Textarea } from '../ui/Input';
import { SkeletonTable } from '../ui/LoadingSkeleton';
import ProofGallery from './ProofGallery';
import { useToast } from '../../context/ToastContext';
import useApiData from '../../hooks/useApiData';
import { ADJUSTMENT_TYPES, ADJUSTMENT_TYPE_SHORT, adjustmentService } from '../../services/api';
import { formatHours } from '../../services/attendanceService';
import { formatDate, formatTime } from '../../utils/helpers';

const statusVariant = { Pending: 'warning', Approved: 'success', Rejected: 'danger', Cancelled: 'default' };
const hm = (t) => (t ? t.slice(0, 5) : '');
const clock = (t) => (t ? formatTime(hm(t)) : '—');
const typeIcon = { worked_past_shift: Clock, kiosk_clock_in: MonitorX, kiosk_clock_out: MonitorX };

// What the admin is entering, in the words of the button they will press
const ENTRY = {
  worked_past_shift: { title: 'Edit the shift: set the clock-out', label: 'Clock-out time', does: 'The clock-out becomes this time and the extra time past the shift end is counted as approved overtime.' },
  kiosk_clock_in: { title: 'Manual clock-in', label: 'Clock-in time', does: 'The employee is clocked in at this time, counted Present or Late by the kiosk\'s own rule.' },
  kiosk_clock_out: { title: 'Manual clock-out', label: 'Clock-out time', does: 'The employee is clocked out at this time and the day\'s hours are counted.' },
};

/**
 * What the machines recorded about this claim, measured when it was filed.
 *
 * A photo cannot show when it was taken, so it says nothing about a time - these are the records that
 * can. Shown beside the claim rather than buried, so the decision is made with the evidence in view.
 * Anything the claim contradicts never reaches this screen: the server refuses it at filing.
 */
function ConsistencyChecks({ checks }) {
  if (!checks?.length) return null;

  const tone = {
    pass: { Icon: CheckCircle2, wrap: 'border-emerald-200 bg-emerald-50/60', text: 'text-emerald-700' },
    warn: { Icon: AlertTriangle, wrap: 'border-amber-200 bg-amber-50/60', text: 'text-amber-700' },
    fail: { Icon: XCircle, wrap: 'border-red-200 bg-red-50/60', text: 'text-red-700' },
  };

  return (
    <section className={clsx('rounded-xl border p-4', checks.some((c) => c.state === 'warn') ? tone.warn.wrap : tone.pass.wrap)}>
      <h4 className="text-[13px] font-semibold text-gray-900">Checked against the record</h4>
      <p className="mt-1 text-xs text-gray-500">
        From the kiosk's own punches at the time this was filed. Photos cannot show when they were taken.
      </p>
      <ul className="mt-3 space-y-2.5">
        {checks.map((c, i) => {
          const t = tone[c.state] || tone.pass;
          const { Icon } = t;
          return (
            <li key={i} className="flex gap-2.5">
              <Icon className={clsx('w-4 h-4 mt-0.5 shrink-0', t.text)} />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-gray-900">{c.label}</p>
                <p className="text-xs text-gray-600 leading-relaxed">{c.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Time & Attendance > Corrections, the Workforce Admin's side. The list of requests, and for each one a review screen:
 * the photos and the employee's account, the day as it stands, and the manual entry - approving records the time the
 * admin confirms (or corrects), rejecting needs a reason the employee will read.
 */
export default function CorrectionsAdmin({ onChanged }) {
  const { data, loading, refresh } = useApiData(() => adjustmentService.getAll(), []);
  const [status, setStatus] = useState('Pending');
  const [type, setType] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const rows = useMemo(() => data || [], [data]);
  const stats = useMemo(() => ({
    pending: rows.filter((r) => r.status === 'Pending').length,
    past: rows.filter((r) => r.status === 'Pending' && r.type === 'worked_past_shift').length,
    kiosk: rows.filter((r) => r.status === 'Pending' && r.type !== 'worked_past_shift').length,
    approved: rows.filter((r) => r.status === 'Approved').length,
  }), [rows]);

  const visible = useMemo(() => rows.filter((r) => (
    (status === 'All' || r.status === status)
    && (type === 'All' || r.type === type)
    && (!search || `${r.employeeName} ${r.employeeId}`.toLowerCase().includes(search.toLowerCase()))
  )), [rows, status, type, search]);

  const done = async () => { setSelectedId(null); await refresh(); onChanged?.(); };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Waiting for a decision', value: stats.pending, icon: Hourglass, tone: 'amber' },
          { label: 'Worked past shift', value: stats.past, icon: Clock, tone: 'blue' },
          { label: 'Kiosk failures', value: stats.kiosk, icon: MonitorX, tone: 'purple' },
          { label: 'Approved so far', value: stats.approved, icon: CheckCircle2, tone: 'emerald' },
        ].map((s) => {
          const colors = { amber: 'bg-amber-50 text-amber-600', blue: 'bg-blue-50 text-blue-600', purple: 'bg-purple-50 text-purple-600', emerald: 'bg-emerald-50 text-emerald-600' };
          return (
            <Card key={s.label}>
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-gray-500">{s.label}</p><p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p></div>
                <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center', colors[s.tone])}><s.icon className="w-6 h-6" /></div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card padding={false}>
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-gray-900">Correction Requests</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Employees send these when they worked past their shift or the kiosk failed. Review the photos, then make the manual entry.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SearchBar value={search} onChange={setSearch} placeholder="Search employee..." className="w-full sm:w-56" />
              <Select value={type} onChange={(e) => setType(e.target.value)} containerClass="w-full sm:w-52">
                <option value="All">All problems</option>
                {ADJUSTMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.short}</option>)}
              </Select>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} containerClass="w-full sm:w-40">
                <option value="All">All statuses</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Not approved</option>
                <option value="Cancelled">Withdrawn</option>
              </Select>
            </div>
          </div>
        </div>

        {loading && !data ? (
          <div className="p-4"><SkeletonTable rows={4} cols={6} /></div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <ClipboardEdit className="w-8 h-8 text-gray-300 mx-auto" />
            <p className="mt-2 text-sm font-medium text-gray-700">{rows.length === 0 ? 'No correction requests yet' : 'Nothing matches these filters'}</p>
            <p className="text-xs text-gray-400 mt-0.5">{rows.length === 0 ? 'When an employee reports a problem with their time record, it will appear here.' : 'Try a different status or problem.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 font-semibold">Day</th>
                  <th className="px-4 py-3 font-semibold">Problem</th>
                  <th className="px-4 py-3 font-semibold">Says</th>
                  <th className="px-4 py-3 font-semibold">Proof</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.map((r) => {
                  const Icon = typeIcon[r.type] || Clock;
                  return (
                    <tr key={r.id} className={clsx('hover:bg-gray-50/60', r.status === 'Pending' && 'bg-amber-50/30')}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{r.employeeName}</p>
                        <p className="text-xs text-gray-400">{r.employeeId}{r.isPattern && <span className="ml-1.5 inline-flex items-center gap-0.5 text-amber-600 font-medium"><Repeat className="w-3 h-3" />{r.recentClaimCount} in 30 days</span>}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(r.date)}</td>
                      <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-gray-700"><Icon className="w-4 h-4 text-gray-400" />{ADJUSTMENT_TYPE_SHORT[r.type] || r.type}</span></td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{clock(r.claimedTime)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.proofCount > 0
                          ? <span className="inline-flex items-center gap-1 text-gray-600"><ImageIcon className="w-4 h-4 text-gray-400" />{r.proofCount}</span>
                          : <span className="text-xs font-medium text-amber-600">None</span>}
                      </td>
                      <td className="px-4 py-3"><Badge variant={statusVariant[r.status] || 'default'}>{r.status === 'Rejected' ? 'Not approved' : r.status === 'Cancelled' ? 'Withdrawn' : r.status}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant={r.status === 'Pending' ? 'primary' : 'outline'} onClick={() => setSelectedId(r.id)}>{r.status === 'Pending' ? 'Review' : 'View'}</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedId && <ReviewModal key={selectedId} id={selectedId} onClose={() => setSelectedId(null)} onDone={done} />}
    </div>
  );
}

function ReviewModal({ id, onClose, onDone }) {
  const { toast } = useToast();
  const { data: request, loading } = useApiData(() => adjustmentService.getById(id), [id]);
  const [time, setTime] = useState(null);           // null until the admin types; the claim is the starting point
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(null);
  const [errors, setErrors] = useState({});

  const entryTime = time ?? hm(request?.claimedTime);
  const pending = request?.status === 'Pending';
  const entry = ENTRY[request?.type] || ENTRY.worked_past_shift;

  // What the entry would do, updated a moment after the admin stops typing
  useEffect(() => {
    if (!pending || !entryTime) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      adjustmentService.preview(id, entryTime).then((res) => alive && setPreview(res)).catch(() => alive && setPreview(null));
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [id, entryTime, pending]);

  const decide = async (decision) => {
    if (decision === 'Rejected' && note.trim().length < 3) { setErrors({ note: 'Tell the employee why it is not approved.' }); return; }
    setSaving(decision);
    try {
      await adjustmentService.decide(id, { decision, note: note.trim() || undefined, time: decision === 'Approved' ? entryTime : undefined });
      toast.success(decision === 'Approved' ? 'Recorded' : 'Request declined', decision === 'Approved' ? `${request.employeeName}'s attendance was updated and they were notified.` : 'The employee was told why.');
      onDone();
    } catch (err) {
      const server = err?.response?.data?.errors || {};
      setErrors({ time: server.time?.[0], note: server.note?.[0] });
      toast.error('Not saved', server.time?.[0] || server.decision?.[0] || server.note?.[0] || 'Please try again.');
    } finally {
      setSaving(null);
    }
  };

  const day = request?.currentAttendance;

  return (
    <Modal isOpen onClose={() => !saving && onClose()} title={request ? `Correction ${request.id} · ${request.employeeName}` : 'Correction'} size="wide">
      {loading || !request ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading the request…</div>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
          <div className="space-y-5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant[request.status] || 'default'}>{request.status === 'Rejected' ? 'Not approved' : request.status}</Badge>
              <span className="text-sm font-semibold text-gray-900">{ADJUSTMENT_TYPE_SHORT[request.type]}</span>
              <span className="text-sm text-gray-500">· {formatDate(request.date)}</span>
              {request.isPattern && <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 rounded-full px-2 py-0.5"><Repeat className="w-3 h-3" />{request.recentClaimCount} requests in the last 30 days</span>}
            </div>

            <section className="rounded-xl border border-gray-200 p-4">
              <h4 className="text-[13px] font-semibold text-gray-900">What the employee reports</h4>
              <dl className="mt-3 grid sm:grid-cols-3 gap-3 text-sm">
                <div><dt className="text-xs text-gray-400">Their time</dt><dd className="font-semibold text-gray-900">{clock(request.claimedTime)}</dd></div>
                <div><dt className="text-xs text-gray-400">Scheduled shift</dt><dd className="font-semibold text-gray-900">{clock(request.shiftStart)} – {clock(request.shiftEnd)}</dd></div>
                <div><dt className="text-xs text-gray-400">Filed</dt><dd className="font-semibold text-gray-900">{formatDate(request.requestedDate)}</dd></div>
              </dl>
              <p className="mt-3 text-sm text-gray-700 leading-relaxed rounded-lg bg-gray-50 px-3 py-2.5">“{request.reason}”</p>
            </section>

            <ConsistencyChecks checks={request.checks} />

            <section className="rounded-xl border border-gray-200 p-4">
              <h4 className="text-[13px] font-semibold text-gray-900">The day as it stands now</h4>
              {day ? (
                <dl className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                  <div><dt className="text-xs text-gray-400">Status</dt><dd className="font-semibold text-gray-900">{day.status}</dd></div>
                  <div><dt className="text-xs text-gray-400">Clock-in</dt><dd className="font-semibold text-gray-900">{clock(day.clockIn)}</dd></div>
                  <div><dt className="text-xs text-gray-400">Counted out</dt><dd className="font-semibold text-gray-900">{clock(day.clockOut)}</dd></div>
                  <div><dt className="text-xs text-gray-400">Kiosk saw them leave</dt><dd className="font-semibold text-gray-900">{clock(day.actualClockOut)}</dd></div>
                  <div><dt className="text-xs text-gray-400">Paid hours</dt><dd className="font-semibold text-gray-900">{formatHours(day.totalHours)} h</dd></div>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No attendance record exists for this day yet.</p>
              )}
            </section>

            <section>
              <h4 className="text-[13px] font-semibold text-gray-900 mb-2">Photo proof <span className="font-normal text-gray-400">({request.proof?.length || 0})</span></h4>
              <ProofGallery photos={request.proof || []} />
            </section>
          </div>

          <aside className="space-y-4">
            {pending ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-4">
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><ClipboardEdit className="w-4 h-4 text-blue-600" />{entry.title}</h4>
                  <p className="text-xs text-gray-500 mt-1">{entry.does}</p>
                </div>
                <Input label={entry.label} type="time" value={entryTime} onChange={(e) => { setTime(e.target.value); setPreview(null); setErrors((x) => ({ ...x, time: undefined })); }} error={errors.time} />
                <p className="-mt-2 text-[11px] text-gray-400">The employee said {clock(request.claimedTime)}. Change it if the photos show a different time.</p>

                <div className={clsx('rounded-lg border px-3 py-2.5 text-sm', preview && !preview.ok ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-700')}>
                  {!preview ? <span className="text-gray-400">Checking that time…</span>
                    : !preview.ok ? <span className="flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{preview.error}</span>
                      : (
                        <div>
                          {preview.open
                            ? (
                              <>
                                <p className="text-xs text-gray-400">If you approve</p>
                                <p className="text-sm font-semibold text-gray-900">The clock-in is recorded, and the day stays open</p>
                                <p className="text-xs text-gray-500 mt-1">Their shift has not ended yet, so no hours are counted until they clock out.</p>
                              </>
                            )
                            : (
                              <>
                                <p className="text-xs text-gray-400">If you approve, this day is worth</p>
                                <p className="text-lg font-bold text-gray-900">{formatHours(preview.hours)} hours paid</p>
                                {preview.overtime > 0 && <p className="text-xs text-blue-700 font-medium">including {formatHours(preview.overtime)} hours of overtime past the shift</p>}
                              </>
                            )}
                        </div>
                      )}
                </div>

                <Textarea label="Note to the employee" rows={2} value={note} onChange={(e) => { setNote(e.target.value); setErrors((x) => ({ ...x, note: undefined })); }} error={errors.note}
                  placeholder="Optional when approving. Required when you decline." />

                <div className="flex gap-2">
                  <Button variant="success" className="flex-1" icon={CheckCircle2} loading={saving === 'Approved'} disabled={!!saving || !preview || !preview.ok} onClick={() => decide('Approved')}>Approve &amp; record</Button>
                  <Button variant="dangerOutline" icon={XCircle} loading={saving === 'Rejected'} disabled={!!saving} onClick={() => decide('Rejected')}>Decline</Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                <h4 className="text-sm font-semibold text-gray-900">Outcome</h4>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-gray-400">Decided by</dt><dd className="font-semibold text-gray-900">{request.decidedBy || '—'}</dd></div>
                  <div><dt className="text-xs text-gray-400">Decided on</dt><dd className="font-semibold text-gray-900">{request.decidedAt ? formatDate(request.decidedAt.slice(0, 10)) : '—'}</dd></div>
                  {request.status === 'Approved' && (
                    <>
                      <div><dt className="text-xs text-gray-400">Time recorded</dt><dd className="font-semibold text-gray-900">{clock(request.finalTime)}</dd></div>
                      <div><dt className="text-xs text-gray-400">Paid hours</dt><dd className="font-semibold text-gray-900">{formatHours(request.recordedHours)} h</dd></div>
                    </>
                  )}
                </dl>
                {request.decisionNote && <p className="text-sm text-gray-700 rounded-lg bg-gray-50 px-3 py-2"><span className="font-semibold">Note:</span> {request.decisionNote}</p>}
              </div>
            )}
          </aside>
        </div>
      )}
    </Modal>
  );
}

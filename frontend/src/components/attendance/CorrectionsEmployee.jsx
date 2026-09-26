import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, FileWarning, Hourglass, ImageIcon, MonitorX, Send, ShieldCheck, XCircle } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Input, { Select, Textarea } from '../ui/Input';
import { SkeletonTable } from '../ui/LoadingSkeleton';
import ProofPicker from './ProofPicker';
import ProofGallery from './ProofGallery';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useApiData from '../../hooks/useApiData';
import { ADJUSTMENT_TYPES, ADJUSTMENT_TYPE_SHORT, adjustmentService } from '../../services/api';
import { formatHours } from '../../services/attendanceService';
import { kioskService } from '../../services/kioskService';
import { formatDate, formatTime } from '../../utils/helpers';

const BACKDATE_DAYS = 7;
const statusVariant = { Pending: 'warning', Approved: 'success', Rejected: 'danger', Cancelled: 'default' };
const statusIcon = { Pending: Hourglass, Approved: CheckCircle2, Rejected: XCircle, Cancelled: XCircle };
const statusLabel = { Pending: 'Pending', Approved: 'Approved', Rejected: 'Not approved', Cancelled: 'Withdrawn' };
const statusEdge = { Pending: 'border-l-amber-400', Approved: 'border-l-emerald-500', Rejected: 'border-l-red-400', Cancelled: 'border-l-gray-300' };
const statusBanner = {
  Pending: { wrap: 'border-amber-200 bg-amber-50', text: 'text-amber-800', title: 'Waiting for HR', body: 'HR has your photos and explanation. Your attendance record does not change until they decide.' },
  Approved: { wrap: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-800', title: 'Approved', body: 'HR accepted your correction and entered it in your attendance record.' },
  Rejected: { wrap: 'border-red-200 bg-red-50', text: 'text-red-800', title: 'Not approved', body: 'HR did not accept this correction. Your attendance record was left as it was.' },
  Cancelled: { wrap: 'border-gray-200 bg-gray-50', text: 'text-gray-700', title: 'Withdrawn', body: 'You took this request back before HR decided.' },
};

const shortDate = (iso) => (iso ? formatDate(String(iso).slice(0, 10)) : '');

// The last 8 days (today and the 7 before it) on the company's calendar: the only days a correction can be filed for.
function recentDays() {
  const [y, m, d] = kioskService.today().split('-').map(Number);
  return Array.from({ length: BACKDATE_DAYS + 1 }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1, d - i));
    const key = date.toISOString().slice(0, 10);
    return { key, label: `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}${i === 0 ? ' (today)' : i === 1 ? ' (yesterday)' : ''}` };
  });
}

const blankForm = () => ({ group: 'past', kioskSide: 'kiosk_clock_in', date: kioskService.today(), claimedTime: '', reason: '' });

/** Sent -> HR review -> decision, so the employee can see how far a request has got. */
function Timeline({ request }) {
  const decided = request.status !== 'Pending';
  const withdrawn = request.status === 'Cancelled';
  const steps = [
    { done: true, title: 'You sent the request', note: shortDate(request.requestedDate) },
    {
      done: decided,
      title: !decided ? 'HR is reviewing it' : withdrawn ? 'You withdrew it' : `HR ${request.status === 'Approved' ? 'approved' : 'did not approve'} it`,
      note: decided
        ? [request.decidedBy && !withdrawn ? `by ${request.decidedBy}` : '', shortDate(request.decidedAt)].filter(Boolean).join(' · ')
        : 'Waiting for a decision',
    },
  ];
  const tone = { Approved: 'bg-emerald-500', Rejected: 'bg-red-400', Cancelled: 'bg-gray-400' }[request.status];

  return (
    <ol>
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={clsx('w-3 h-3 rounded-full mt-1 shrink-0', step.done ? (i === 0 ? 'bg-blue-500' : tone) : 'bg-white border-2 border-amber-400 animate-pulse')} />
            {i < steps.length - 1 && <span className="w-px flex-1 bg-gray-200 my-1" />}
          </div>
          <div className="pb-4">
            <p className="text-sm font-semibold text-gray-900">{step.title}</p>
            {step.note && <p className="text-xs text-gray-500 mt-0.5">{step.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** One of the employee's own requests, opened: where it stands, what they said, the photos, and what HR did. */
function MyRequestModal({ id, onClose, onWithdraw, withdrawing }) {
  const { data: request, loading } = useApiData(() => adjustmentService.mineOne(id), [id]);
  const banner = statusBanner[request?.status] || statusBanner.Pending;
  const Icon = statusIcon[request?.status] || Hourglass;
  const said = request?.claimedTime ? formatTime(request.claimedTime.slice(0, 5)) : '—';
  const recorded = request?.finalTime ? formatTime(request.finalTime.slice(0, 5)) : null;

  return (
    <Modal isOpen onClose={onClose} title={request ? `${ADJUSTMENT_TYPE_SHORT[request.type] || request.type} · ${request.id}` : 'Correction request'} size="lg">
      {loading && !request ? (
        <div className="py-10 text-center text-sm text-gray-400">Loading your request…</div>
      ) : !request ? (
        <div className="py-10 text-center text-sm text-gray-500">This request could not be found.</div>
      ) : (
        <div className="space-y-5">
          <div className={clsx('flex items-start gap-3 rounded-xl border px-4 py-3.5', banner.wrap)}>
            <Icon className={clsx('w-5 h-5 mt-0.5 shrink-0', banner.text)} />
            <div>
              <p className={clsx('text-sm font-semibold', banner.text)}>{banner.title}</p>
              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{banner.body}</p>
            </div>
          </div>

          {request.status === 'Rejected' && (
            <div className="rounded-xl border border-red-100 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-gray-500">Why HR did not approve it</p>
              <p className="text-sm text-gray-800 mt-1 leading-relaxed">{request.decisionNote || 'HR did not leave a reason.'}</p>
            </div>
          )}

          {request.status === 'Approved' && (
            <div className="rounded-xl border border-emerald-100 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-gray-500">What HR recorded</p>
              <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-gray-400">Time entered</dt><dd className="font-semibold text-gray-900">{recorded || said}</dd></div>
                <div><dt className="text-xs text-gray-400">Paid hours that day</dt><dd className="font-semibold text-gray-900">{formatHours(request.recordedHours)} h</dd></div>
              </dl>
              {request.decisionNote && <p className="text-xs mt-3 text-gray-600"><span className="font-semibold">Note from HR:</span> {request.decisionNote}</p>}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-5">
            <section>
              <h4 className="text-[13px] font-semibold text-gray-900 mb-3">Progress</h4>
              <Timeline request={request} />
            </section>
            <section>
              <h4 className="text-[13px] font-semibold text-gray-900 mb-3">What you sent</h4>
              <dl className="space-y-2 text-sm">
                <div><dt className="text-xs text-gray-400">Day</dt><dd className="font-semibold text-gray-900">{formatDate(request.date)}</dd></div>
                <div><dt className="text-xs text-gray-400">Your shift</dt><dd className="font-semibold text-gray-900">{request.shiftStart ? `${formatTime(request.shiftStart.slice(0, 5))} – ${formatTime(request.shiftEnd.slice(0, 5))}` : '—'}</dd></div>
                <div><dt className="text-xs text-gray-400">Time you gave</dt><dd className="font-semibold text-gray-900">{said}</dd></div>
              </dl>
            </section>
          </div>

          <section>
            <h4 className="text-[13px] font-semibold text-gray-900 mb-2">Your explanation</h4>
            <p className="text-sm text-gray-700 leading-relaxed rounded-lg bg-gray-50 px-3 py-2.5">“{request.reason}”</p>
          </section>

          {request.proof?.length > 0 && (
            <section>
              <h4 className="text-[13px] font-semibold text-gray-900 mb-2">Your photos ({request.proof.length})</h4>
              <ProofGallery photos={request.proof} />
            </section>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            {request.status === 'Pending' && <Button variant="outline" loading={withdrawing} onClick={() => onWithdraw(request)}>Withdraw request</Button>}
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Time & Attendance > Corrections, the employee's side. Two kinds of problem: worked past the shift, or the kiosk
 * failed (to clock in or out). The employee says what happened, gives the time, and attaches photo proof; they never
 * state hours - HR decides and enters the final time.
 */
export default function CorrectionsEmployee({ onChanged }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const employeeId = user?.id;

  const { data, loading, refresh } = useApiData(() => adjustmentService.mine(), [employeeId]);
  const requests = useMemo(() => [...(data || [])].sort((a, b) => (b.requestedDate || b.date || '').localeCompare(a.requestedDate || a.date || '') || b.id.localeCompare(a.id)), [data]);
  const counts = useMemo(() => ({
    Pending: requests.filter((r) => r.status === 'Pending').length,
    Approved: requests.filter((r) => r.status === 'Approved').length,
    Rejected: requests.filter((r) => r.status === 'Rejected').length,
  }), [requests]);

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [filter, setFilter] = useState('all');
  const [viewing, setViewing] = useState(null);

  const shown = useMemo(() => (filter === 'all' ? requests : requests.filter((r) => r.status === filter)), [requests, filter]);
  const type = form.group === 'past' ? 'worked_past_shift' : form.kioskSide;
  const meta = ADJUSTMENT_TYPES.find((t) => t.value === type);
  const days = useMemo(() => recentDays(), []);

  const open = () => { setForm(blankForm()); setPhotos([]); setErrors({}); setIsOpen(true); };
  const set = (key, value) => { setForm((f) => ({ ...f, [key]: value })); setErrors((e) => ({ ...e, [key]: undefined, claimedTime: key === 'claimedTime' ? undefined : e.claimedTime })); };

  // A filed or withdrawn request is the employee acting on their own record, so the page they are looking at has to
  // catch up with it - the same way the admin's list does after a decision.
  const done = async () => { await refresh(); onChanged?.(); };

  const submit = async () => {
    const errs = {};
    if (!form.claimedTime) errs.claimedTime = 'Tell us the time it happened.';
    if (form.reason.trim().length < 5) errs.reason = 'A sentence or two in your own words is enough.';
    if (photos.length === 0) errs.proof = 'Attach at least one photo as proof.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      await adjustmentService.create({
        employeeId, date: form.date, type, claimedTime: form.claimedTime, reason: form.reason.trim(),
        proof: photos.map((p) => ({ name: p.name, dataUrl: p.dataUrl, caption: p.caption })),
      });
      await done();
      setIsOpen(false);
      toast.success('Request sent', 'HR will review your photos and explanation. Your attendance record changes only if it is approved.');
    } catch (error) {
      // The refusals are the point of this feature, so they are shown as written rather than as a generic failure.
      const server = error?.response?.data?.errors || {};
      const proofMessage = server.proof?.[0] || Object.entries(server).find(([k]) => k.startsWith('proof.'))?.[1]?.[0];
      setErrors({ claimedTime: server.claimedTime?.[0], date: server.date?.[0], type: server.type?.[0], reason: server.reason?.[0], proof: proofMessage });
      const first = server.claimedTime?.[0] || server.date?.[0] || server.type?.[0] || proofMessage || server.reason?.[0];
      toast.error(first ? 'That request cannot be sent' : 'Could not send', first || 'Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async (request) => {
    setCancelling(request.id);
    try {
      await adjustmentService.cancel(request.id);
      await done();
      setViewing(null);
      toast.success('Withdrawn', 'Your request has been taken back.');
    } catch {
      toast.error('Could not withdraw', 'This request has already been decided.');
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-5">
        <Card className="flex-1">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><ShieldCheck className="w-5 h-5 text-blue-600" /></div>
            <div>
              <h2 className="text-[15px] font-semibold text-gray-900">Something went wrong with your time record?</h2>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                If you worked past your shift, or the kiosk failed to clock you in or out, send a correction with photos as proof.
                HR reviews it and, if it is approved, enters your time in your attendance record. Nothing changes until then.
              </p>
              <Button className="mt-4" icon={Send} onClick={open}>Request a correction</Button>
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-3 gap-3 lg:w-[420px]">
          {[['Pending', 'text-amber-600', 'ring-amber-400'], ['Approved', 'text-emerald-600', 'ring-emerald-500'], ['Rejected', 'text-red-600', 'ring-red-400']].map(([status, text, ring]) => (
            <button key={status} type="button" aria-pressed={filter === status} onClick={() => setFilter((f) => (f === status ? 'all' : status))}
              className={clsx('rounded-2xl bg-white border border-gray-100 shadow-sm p-4 text-center flex flex-col items-center justify-center transition hover:shadow-md', filter === status && `ring-2 ${ring}`)}>
              <p className={clsx('text-2xl font-bold', text)}>{counts[status]}</p>
              <p className="text-xs text-gray-500 mt-0.5">{statusLabel[status]}</p>
            </button>
          ))}
        </div>
      </div>

      <Card padding={false}>
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">My correction requests</h3>
            <p className="text-xs text-gray-500 mt-0.5">Click a request to see where it stands, your photos and what HR decided.</p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
            {[['all', 'All'], ['Pending', 'Pending'], ['Approved', 'Approved'], ['Rejected', 'Not approved']].map(([key, label]) => (
              <button key={key} type="button" onClick={() => setFilter(key)}
                className={clsx('px-3 py-1 text-xs font-semibold rounded-lg transition', filter === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>{label}</button>
            ))}
          </div>
        </div>
        {loading && !data ? (
          <div className="p-4"><SkeletonTable rows={3} cols={5} /></div>
        ) : shown.length === 0 ? (
          <div className="py-14 text-center">
            <FileWarning className="w-8 h-8 text-gray-300 mx-auto" />
            <p className="mt-2 text-sm font-medium text-gray-700">{requests.length === 0 ? 'No corrections yet' : 'Nothing under this filter'}</p>
            <p className="text-xs text-gray-400 mt-0.5">{requests.length === 0 ? 'When something goes wrong with your time record, you can send one from here.' : 'Choose All to see every request.'}</p>
          </div>
        ) : (
          <ul className="p-3 space-y-2.5">
            {shown.map((r) => {
              const Icon = statusIcon[r.status] || Hourglass;
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => setViewing(r.id)}
                    className={clsx('w-full text-left flex items-center gap-3 rounded-xl border border-gray-100 border-l-4 bg-white p-3.5 hover:bg-gray-50 hover:shadow-sm transition', statusEdge[r.status])}>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900 text-sm">{ADJUSTMENT_TYPE_SHORT[r.type] || r.type}</span>
                        <Badge variant={statusVariant[r.status] || 'default'}><Icon className="w-3 h-3 mr-1 inline" />{statusLabel[r.status] || r.status}</Badge>
                        <span className="text-[11px] text-gray-400">{r.id}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDate(r.date)} · you said <span className="font-medium text-gray-700">{r.claimedTime ? formatTime(r.claimedTime.slice(0, 5)) : '—'}</span>
                        {r.status === 'Approved' && r.finalTime && r.finalTime.slice(0, 5) !== (r.claimedTime || '').slice(0, 5) && <> · HR recorded <span className="font-medium text-gray-700">{formatTime(r.finalTime.slice(0, 5))}</span></>}
                        {' · '}<ImageIcon className="w-3 h-3 inline -mt-0.5" /> {r.proofCount} photo{r.proofCount === 1 ? '' : 's'}
                      </p>
                      <p className="text-sm text-gray-600 mt-1 truncate">“{r.reason}”</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {viewing && <MyRequestModal id={viewing} onClose={() => setViewing(null)} onWithdraw={withdraw} withdrawing={cancelling === viewing} />}

      <Modal isOpen={isOpen} onClose={() => !submitting && setIsOpen(false)} title="Request a correction" size="lg">
        <div className="space-y-5">
          <div>
            <label className="text-[13px] font-medium text-gray-700">What happened?</label>
            <div className="mt-2 grid sm:grid-cols-2 gap-3">
              {[
                { group: 'past', icon: Clock, title: 'I worked past my shift', text: 'You stayed after your scheduled end and it was not counted.' },
                { group: 'kiosk', icon: MonitorX, title: 'The kiosk failed', text: 'It would not clock you in or out.' },
              ].map((o) => (
                <button key={o.group} type="button" onClick={() => set('group', o.group)}
                  className={clsx('text-left rounded-xl border p-3.5 transition', form.group === o.group ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300')}>
                  <o.icon className={clsx('w-5 h-5', form.group === o.group ? 'text-blue-600' : 'text-gray-400')} />
                  <p className="mt-2 text-sm font-semibold text-gray-900">{o.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{o.text}</p>
                </button>
              ))}
            </div>
            {form.group === 'kiosk' && (
              <div className="mt-3 inline-flex rounded-xl border border-gray-200 p-1 bg-gray-50">
                {[['kiosk_clock_in', 'Failed to clock me in'], ['kiosk_clock_out', 'Failed to clock me out']].map(([value, label]) => (
                  <button key={value} type="button" onClick={() => set('kioskSide', value)}
                    className={clsx('px-3.5 py-1.5 text-[13px] font-semibold rounded-lg transition', form.kioskSide === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-gray-500">{meta?.help}</p>
            {errors.type && <p className="mt-1 text-xs text-red-600">{errors.type}</p>}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Select label="Which day?" value={form.date} onChange={(e) => set('date', e.target.value)} error={errors.date}>
              {days.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </Select>
            <Input label={meta?.timeLabel || 'What time?'} type="time" value={form.claimedTime} onChange={(e) => set('claimedTime', e.target.value)} error={errors.claimedTime} required />
          </div>

          <Textarea label="Tell HR what happened" rows={3} value={form.reason} onChange={(e) => set('reason', e.target.value)} error={errors.reason}
            placeholder="In your own words, for example: the kiosk showed an error and would not accept my face." required />

          <ProofPicker value={photos} onChange={(p) => { setPhotos(p); setErrors((e) => ({ ...e, proof: undefined })); }} hint={meta?.photoHint} error={errors.proof} />

          <div className="flex items-start gap-2.5 rounded-xl bg-blue-50/70 border border-blue-100 px-3.5 py-3 text-xs text-blue-900/80">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
            <span>You give the time and the proof, not the hours. The system works out what your day is worth from your schedule, and HR makes the final entry. Requests can be made for the last {BACKDATE_DAYS} days.</span>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={submitting}>Cancel</Button>
            <Button icon={Send} loading={submitting} onClick={submit}>Send request</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Clock, FileWarning, Hourglass, ImageIcon, MonitorX, Send, ShieldCheck, XCircle } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Input, { Select, Textarea } from '../ui/Input';
import { SkeletonTable } from '../ui/LoadingSkeleton';
import ProofPicker from './ProofPicker';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useApiData from '../../hooks/useApiData';
import { ADJUSTMENT_TYPES, ADJUSTMENT_TYPE_SHORT, adjustmentService } from '../../services/api';
import { kioskService } from '../../services/kioskService';
import { formatDate, formatTime } from '../../utils/helpers';

const BACKDATE_DAYS = 7;
const statusVariant = { Pending: 'warning', Approved: 'success', Rejected: 'danger', Cancelled: 'default' };
const statusIcon = { Pending: Hourglass, Approved: CheckCircle2, Rejected: XCircle, Cancelled: XCircle };

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

/**
 * Time & Attendance > Corrections, the employee's side. Two kinds of problem: worked past the shift, or the kiosk
 * failed (to clock in or out). The employee says what happened, gives the time, and attaches photo proof; they never
 * state hours - HR decides and enters the final time.
 */
export default function CorrectionsEmployee() {
  const { user } = useAuth();
  const { toast } = useToast();
  const employeeId = user?.id;

  const { data, loading, refresh } = useApiData(() => adjustmentService.mine(), [employeeId]);
  const requests = useMemo(() => [...(data || [])].sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || '')), [data]);
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

  const type = form.group === 'past' ? 'worked_past_shift' : form.kioskSide;
  const meta = ADJUSTMENT_TYPES.find((t) => t.value === type);
  const days = useMemo(() => recentDays(), []);

  const open = () => { setForm(blankForm()); setPhotos([]); setErrors({}); setIsOpen(true); };
  const set = (key, value) => { setForm((f) => ({ ...f, [key]: value })); setErrors((e) => ({ ...e, [key]: undefined, claimedTime: key === 'claimedTime' ? undefined : e.claimedTime })); };

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
      await refresh();
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
      await refresh();
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
          {[['Pending', counts.Pending, 'amber'], ['Approved', counts.Approved, 'emerald'], ['Not approved', counts.Rejected, 'red']].map(([label, value, tone]) => (
            <Card key={label} className="!p-4 text-center flex flex-col items-center justify-center">
              <p className={clsx('text-2xl font-bold', { amber: 'text-amber-600', emerald: 'text-emerald-600', red: 'text-red-600' }[tone])}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </Card>
          ))}
        </div>
      </div>

      <Card padding={false}>
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">My correction requests</h3>
          <p className="text-xs text-gray-500 mt-0.5">A request can be withdrawn while it is still pending. Once HR decides, it stays on your record.</p>
        </div>
        {loading && !data ? (
          <div className="p-4"><SkeletonTable rows={3} cols={5} /></div>
        ) : requests.length === 0 ? (
          <div className="py-14 text-center">
            <FileWarning className="w-8 h-8 text-gray-300 mx-auto" />
            <p className="mt-2 text-sm font-medium text-gray-700">No corrections yet</p>
            <p className="text-xs text-gray-400 mt-0.5">When something goes wrong with your time record, you can send one from here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {requests.map((r) => {
              const Icon = statusIcon[r.status] || Hourglass;
              return (
                <li key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{ADJUSTMENT_TYPE_SHORT[r.type] || r.type}</span>
                      <Badge variant={statusVariant[r.status] || 'default'}><Icon className="w-3 h-3 mr-1 inline" />{r.status === 'Rejected' ? 'Not approved' : r.status}</Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDate(r.date)} · you said <span className="font-medium text-gray-700">{r.claimedTime ? formatTime(r.claimedTime.slice(0, 5)) : '—'}</span>
                      {r.status === 'Approved' && r.finalTime && r.finalTime.slice(0, 5) !== (r.claimedTime || '').slice(0, 5) && <> · HR recorded <span className="font-medium text-gray-700">{formatTime(r.finalTime.slice(0, 5))}</span></>}
                      {' · '}<ImageIcon className="w-3 h-3 inline -mt-0.5" /> {r.proofCount} photo{r.proofCount === 1 ? '' : 's'}
                    </p>
                    <p className="text-sm text-gray-600 mt-1 truncate">“{r.reason}”</p>
                    {r.decisionNote && <p className="text-xs mt-1.5 rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-1.5 text-gray-600"><span className="font-semibold">Note from HR:</span> {r.decisionNote}</p>}
                  </div>
                  {r.status === 'Pending' && (
                    <Button variant="outline" size="sm" loading={cancelling === r.id} onClick={() => withdraw(r)}>Withdraw</Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

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

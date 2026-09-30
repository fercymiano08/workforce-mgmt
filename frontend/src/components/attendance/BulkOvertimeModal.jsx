import { useCallback, useMemo, useState } from 'react';
import { Check, Search, X, Plus } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input, { Textarea } from '../ui/Input';
import Avatar from '../ui/Avatar';
import { overtimeService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { kioskService } from '../../services/kioskService';

/**
 * HR raising overtime for several people in one go.
 *
 * A list of names with tick boxes, rather than a dropdown holding ninety options: a <select> hides
 * everyone except the one you can see, so picking a sixth person means scrolling a popup blind. The
 * search box and the department grouping are there so a long roster stays findable, and the selected
 * names stay on screen as a summary, because the whole point of the screen is knowing who is in it.
 *
 * Everyone shares one date, one number of hours and one reason, because that is the normal case - a
 * late evening, a stocktake, a month-end close. Anything genuinely per-person is still raised by the
 * employee themselves from their own attendance screen.
 */
export default function BulkOvertimeModal({ isOpen, onClose, employees, onCreated }) {
  // The form lives in its own component so that opening the modal gives it fresh state for free,
  // rather than resetting every field in an effect the first time someone opens it.
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Raise overtime" size="lg">
      {isOpen && <BulkOvertimeForm employees={employees} onClose={onClose} onCreated={onCreated} />}
    </Modal>
  );
}

function BulkOvertimeForm({ employees, onClose, onCreated }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [form, setForm] = useState({ date: kioskService.today(), hours: '', reason: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [skipped, setSkipped] = useState([]);

  const roster = useMemo(
    () => (employees || []).filter((e) => e.status !== 'Terminated' && e.status !== 'On Leave'),
    [employees]
  );

  // The employee list arrives from more than one place and not all of them carry an id under the same
  // key. Ticking a row that has no id would send "null" to the server and come back as a silent skip,
  // so anything unusable is left out here rather than discovered after submitting.
  const usable = useMemo(() => roster.filter((e) => typeof e.id === 'string' && e.id.trim() !== ''), [roster]);
  const missingId = roster.length - usable.length;

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return usable;
    return usable.filter((e) =>
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q)
      || e.id.toLowerCase().includes(q)
      || (e.department || '').toLowerCase().includes(q)
      || (e.position || '').toLowerCase().includes(q)
    );
  }, [usable, search]);

  // Grouped so a big roster is scannable, and so the tick boxes mean something ("everyone in
  // Customer Service") rather than being ninety anonymous rows.
  const groups = useMemo(() => {
    const byDept = new Map();
    matches.forEach((e) => {
      const key = e.department || 'Unassigned';
      if (!byDept.has(key)) byDept.set(key, []);
      byDept.get(key).push(e);
    });
    return [...byDept.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [matches]);

  const toggle = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((rows) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = rows.every((e) => next.has(e.id));
      rows.forEach((e) => (allIn ? next.delete(e.id) : next.add(e.id)));
      return next;
    });
  }, []);

  const selectedPeople = useMemo(
    () => usable.filter((e) => selected.has(e.id)),
    [usable, selected]
  );

  const validate = () => {
    const next = {};
    if (selected.size === 0) next.people = 'Choose at least one person.';
    if (!form.date) next.date = 'Pick a date.';
    if (form.hours !== '') {
      const h = Number(form.hours);
      if (Number.isNaN(h) || h < 0 || h > 24) next.hours = 'Hours must be between 0 and 24.';
    }
    if (!form.reason.trim()) next.reason = 'Say why the overtime was worked.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (submitting || !validate()) return;
    setSubmitting(true);
    setSkipped([]);
    try {
      const result = await overtimeService.bulkCreate({
        employeeIds: [...selected],
        date: form.date,
        expectedHours: form.hours === '' ? undefined : Number(form.hours),
        reason: form.reason.trim(),
        status: 'Pending',
      });

      // The service helper already unwraps `data`, so the body is the payload itself. Read it as
      // either shape: an interceptor change should not silently turn a successful save into "nothing
      // happened", which is exactly the bug that hides a half-finished group.
      const body = result?.data !== undefined && result?.skipped === undefined ? result.data : result;
      const made = Array.isArray(body?.data) ? body.data.length : 0;
      const missed = Array.isArray(body?.skipped) ? body.skipped : [];
      setSkipped(missed);

      if (made > 0) {
        onCreated?.();
        toast.success(
          `${made} request${made === 1 ? '' : 's'} raised`,
          missed.length
            ? `${made} created, ${missed.length} skipped because they already had one that day.`
            : 'Waiting for review.'
        );
        // Close only once the whole group went in. A partial save stays open showing exactly who was
        // left out, rather than vanishing and leaving the administrator to guess.
        if (missed.length === 0) onClose();
      } else {
        toast.error(
          'Nothing was created',
          missed[0]?.message || 'Everyone ticked already has a request for that day.'
        );
      }
    } catch (error) {
      const fields = error?.response?.data?.errors;
      if (fields) setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v?.[0]])));
      toast.error('Could not raise overtime', error?.response?.data?.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const today = kioskService.today();
  const dateLabel = form.date === today ? 'Today' : form.date;

  return (
    <>
      <div className="space-y-5">
        {/* Who */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="text-[13px] font-medium text-gray-700">Who worked the overtime</label>
            <span className="text-xs text-gray-400">
              {selected.size === 0 ? 'Nobody picked yet' : `${selected.size} picked`}
            </span>
          </div>

          <div className="relative mb-2">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, ID, department or position..."
              className="w-full pl-10 pr-3 py-2.5 pointer-coarse:py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500"
            />
          </div>

          {selectedPeople.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedPeople.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => toggle(e.id)}
                  className="inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 pointer-coarse:py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium"
                >
                  {e.firstName} {e.lastName}
                  <X className="w-3.5 h-3.5" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="px-2 py-1 pointer-coarse:py-1.5 rounded-full text-xs font-medium text-gray-500 hover:bg-gray-100"
              >
                Clear
              </button>
            </div>
          )}

          <div className="max-h-[38vh] overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
            {groups.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">
                {usable.length === 0 ? 'Nobody is available to pick right now.' : 'Nobody matches that search.'}
              </p>
            ) : groups.map(([dept, rows]) => {
              const allIn = rows.every((e) => selected.has(e.id));
              return (
                <div key={dept}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(rows)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-50 text-left hover:bg-gray-100 sticky top-0 z-10"
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${allIn ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                      {allIn && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </span>
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{dept}</span>
                    <span className="text-xs text-gray-400">({rows.length})</span>
                  </button>
                  {rows.map((e) => {
                    const on = selected.has(e.id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => toggle(e.id)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${on ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
                      >
                        <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${on ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                          {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </span>
                        <Avatar firstName={e.firstName} lastName={e.lastName} size="sm" src={e.avatar} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-900 truncate">{e.firstName} {e.lastName}</span>
                          <span className="block text-xs text-gray-400 truncate">{e.position || e.id}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {missingId > 0 && (
            <p className="text-xs text-gray-400 mt-1.5">
              {missingId} row{missingId === 1 ? '' : 's'} hidden: no employee number, so a request could not be filed for {missingId === 1 ? 'them' : 'them'}.
            </p>
          )}
          {errors.people && <p className="text-xs text-red-500 font-medium mt-1.5">{errors.people}</p>}
        </div>

        {/* What */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Date"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            error={errors.date}
          />
          <Input
            label="Hours each (optional)"
            type="number"
            min="0"
            max="24"
            step="0.5"
            value={form.hours}
            onChange={(e) => setForm({ ...form, hours: e.target.value })}
            placeholder="e.g. 2"
            error={errors.hours}
          />
        </div>

        <Textarea
          label="Reason"
          rows={2}
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          placeholder="Why was the overtime worked? Everyone picked will see this."
          error={errors.reason}
        />

        {skipped.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-semibold text-amber-800">
              {skipped.length} skipped
            </p>
            <ul className="mt-1 space-y-0.5">
              {skipped.map((s) => (
                <li key={s.employeeId} className="text-xs text-amber-700">
                  {s.message || `${s.employeeId} is not on the roster.`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          {selected.size > 0
            ? `${selected.size} request${selected.size === 1 ? '' : 's'} for ${dateLabel}, waiting for review`
            : 'Pick the people first'}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button icon={Plus} loading={submitting} onClick={submit} disabled={selected.size === 0}>
            Raise for {selected.size || 0}
          </Button>
        </div>
      </div>
    </>
  );
}

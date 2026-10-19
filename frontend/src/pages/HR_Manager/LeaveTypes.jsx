/*
 * The leave rules engine. It used to be its own page (/leave-types) with its own sidebar entry;
 * it now renders as the "Leave Rules" section of Settings > Company Configuration, right below
 * Time Manager. The placement follows one rule: policy that defines what is allowed for the whole
 * company lives in Settings (grace periods, lunch, leave rules), while a module page holds the
 * daily work done against that policy - so Leave Management stays purely the approval queue.
 * The old route redirects to /settings?section=leaveRules.
 */
import { useState } from 'react';
import { Plus, Edit, Ban, RotateCcw, Sliders } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Input, { Select } from '../../components/ui/Input';
import TableShell from '../../components/ui/TableShell';
import { InfoNote } from '../../components/settings/SharedSections';
import { leaveTypeService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import useApiData from '../../hooks/useApiData';
import { SkeletonCard, SkeletonTable } from '../../components/ui/LoadingSkeleton';

const payTypeVariant = { PaidWithBalance: 'primary', PaidWithoutBalance: 'info', Unpaid: 'teal' };

const emptyForm = {
  code: '', name: '', applicableGender: 'Any', minTenureMonths: 0, payType: 'PaidWithBalance',
  requiresBalance: true, accrualPolicy: 'None', accrualRate: 0, maxCarryoverDays: '',
  advanceNoticeDays: 0, retroactiveAllowed: false, retroactiveWindowDays: 0,
  maxConsecutiveDays: '', requiresProof: false, proofThresholdDays: 0,
};

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-[13px] font-medium text-gray-700 cursor-pointer">
      <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export default function LeaveTypes() {
  const { toast } = useToast();
  const { data: types, refresh, loading } = useApiData(() => leaveTypeService.getAll(), []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toggleTarget, setToggleTarget] = useState(null); // { type, nextActive }
  const [toggling, setToggling] = useState(false);

  const openAdd = () => {
    setEditingType(null);
    setFormData(emptyForm);
    setFormErrors({});
    setIsModalOpen(true);
  };

  const openEdit = (type) => {
    setEditingType(type);
    setFormData({
      code: type.code, name: type.name, applicableGender: type.applicableGender,
      minTenureMonths: type.minTenureMonths, payType: type.payType, requiresBalance: type.requiresBalance,
      accrualPolicy: type.accrualPolicy, accrualRate: type.accrualRate, maxCarryoverDays: type.maxCarryoverDays ?? '',
      advanceNoticeDays: type.advanceNoticeDays, retroactiveAllowed: type.retroactiveAllowed,
      retroactiveWindowDays: type.retroactiveWindowDays, maxConsecutiveDays: type.maxConsecutiveDays ?? '',
      requiresProof: type.requiresProof, proofThresholdDays: type.proofThresholdDays,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const validate = () => {
    const errs = {};
    if (!formData.code.trim()) errs.code = 'Code is required (e.g. "Vacation")';
    if (!formData.name.trim()) errs.name = 'Name is required';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      ...formData,
      maxCarryoverDays: formData.maxCarryoverDays === '' ? null : Number(formData.maxCarryoverDays),
      maxConsecutiveDays: formData.maxConsecutiveDays === '' ? null : Number(formData.maxConsecutiveDays),
      minTenureMonths: Number(formData.minTenureMonths) || 0,
      accrualRate: Number(formData.accrualRate) || 0,
      advanceNoticeDays: Number(formData.advanceNoticeDays) || 0,
      retroactiveWindowDays: Number(formData.retroactiveWindowDays) || 0,
      proofThresholdDays: Number(formData.proofThresholdDays) || 0,
    };
    try {
      if (editingType) {
        await leaveTypeService.update(editingType.id, payload);
        toast.success('Leave Type Updated', `${payload.name} was updated.`);
      } else {
        await leaveTypeService.create(payload);
        toast.success('Leave Type Created', `${payload.name} is now available to employees.`);
      }
      await refresh();
    } catch (err) {
      const data = err?.response?.data;
      const firstFieldError = data?.errors ? Object.values(data.errors).flat()[0] : null;
      toast.error('Could not save leave type', firstFieldError || data?.message || 'The server did not respond. Please try again.');
      setSaving(false);
      return;
    }
    setSaving(false);
    setIsModalOpen(false);
  };

  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    setToggling(true);
    try {
      if (toggleTarget.nextActive) {
        await leaveTypeService.update(toggleTarget.type.id, { active: true });
        toast.success('Leave Type Reactivated', `${toggleTarget.type.name} is visible to employees again.`);
      } else {
        await leaveTypeService.deactivate(toggleTarget.type.id);
        toast.success('Leave Type Deactivated', `${toggleTarget.type.name} is hidden from employees. Past requests are unaffected.`);
      }
      await refresh();
      setToggleTarget(null);
    } catch (err) {
      toast.error('Action failed', err?.response?.data?.message || 'The server did not respond. Please try again.');
    }
    setToggling(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonCard lines={2} />
        <SkeletonTable rows={5} cols={7} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader action={<Button icon={Plus} onClick={openAdd}>Add Leave Type</Button>}>
          <div>
            <CardTitle>Leave Rules</CardTitle>
            <CardDescription>Every rule behind a leave type - who can file it, how it's paid, and what it requires</CardDescription>
          </div>
        </CardHeader>
        <InfoNote>
          Deactivating a rule only hides that type from the employee's apply screen - nothing is deleted,
          and past requests keep resolving against the rules they were filed under.
        </InfoNote>
      </Card>

      <Card padding={false}>
        <TableShell minWidth="min-w-[900px]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Type', 'Pay Type', 'Eligibility', 'Balance', 'Notice / Proof', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(types || []).map((type) => (
                <tr key={type.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-sm text-gray-900">{type.name}</p>
                    <p className="text-xs text-gray-400">{type.code}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge variant={payTypeVariant[type.payType] || 'default'} size="xs">{type.payType}</Badge>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-600">
                    {type.applicableGender !== 'Any' && <div>{type.applicableGender} only</div>}
                    {type.minTenureMonths > 0 && <div>{type.minTenureMonths}+ mo. tenure</div>}
                    {type.applicableGender === 'Any' && type.minTenureMonths === 0 && <span className="text-gray-400">No restriction</span>}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-600">
                    {type.requiresBalance ? (
                      <div>Ledger · {type.accrualPolicy === 'Monthly' ? `${type.accrualRate}/mo` : 'no accrual'}</div>
                    ) : (
                      <span className="text-gray-400">{type.maxConsecutiveDays ? `Capped at ${type.maxConsecutiveDays}d` : 'Not tracked'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-600">
                    {type.advanceNoticeDays > 0 && <div>{type.advanceNoticeDays}d notice</div>}
                    {type.retroactiveAllowed && <div>Backdate {type.retroactiveWindowDays}d</div>}
                    {type.requiresProof && <div>Proof &gt; {type.proofThresholdDays}d</div>}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge variant={type.active ? 'success' : 'default'} dot size="xs">{type.active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(type)} className="p-1.5 pointer-coarse:p-2.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors" title="Edit">
                        <Edit className="w-4 h-4" />
                      </button>
                      {type.active ? (
                        <button onClick={() => setToggleTarget({ type, nextActive: false })} className="p-1.5 pointer-coarse:p-2.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-colors" title="Deactivate">
                          <Ban className="w-4 h-4" />
                        </button>
                      ) : (
                        <button onClick={() => setToggleTarget({ type, nextActive: true })} className="p-1.5 pointer-coarse:p-2.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-emerald-600 transition-colors" title="Reactivate">
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </Card>

      {/* Create / Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingType ? `Edit ${editingType.name}` : 'Add Leave Type'} size="lg">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Code" required placeholder="e.g. Vacation" value={formData.code}
              onChange={(e) => setFormData((f) => ({ ...f, code: e.target.value }))} error={formErrors.code} disabled={!!editingType} />
            <Input label="Name" required placeholder="e.g. Vacation Leave" value={formData.name}
              onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} error={formErrors.name} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Select label="Applicable Gender" value={formData.applicableGender} onChange={(e) => setFormData((f) => ({ ...f, applicableGender: e.target.value }))}>
              <option value="Any">Any</option>
              <option value="Male">Male only</option>
              <option value="Female">Female only</option>
            </Select>
            <Input label="Min. Tenure (months)" type="number" min={0} value={formData.minTenureMonths}
              onChange={(e) => setFormData((f) => ({ ...f, minTenureMonths: e.target.value }))} />
            <Select label="Pay Type" value={formData.payType} onChange={(e) => setFormData((f) => ({ ...f, payType: e.target.value }))}>
              <option value="PaidWithBalance">Paid, from balance</option>
              <option value="PaidWithoutBalance">Paid, no balance</option>
              <option value="Unpaid">Unpaid</option>
            </Select>
          </div>

          <div className="rounded-xl border border-gray-100 p-4 space-y-3">
            <Checkbox label="Requires a balance (deducted from the ledger when approved)" checked={formData.requiresBalance}
              onChange={(v) => setFormData((f) => ({ ...f, requiresBalance: v }))} />
            {formData.requiresBalance && (
              <div className="grid grid-cols-3 gap-4">
                <Select label="Accrual Policy" value={formData.accrualPolicy} onChange={(e) => setFormData((f) => ({ ...f, accrualPolicy: e.target.value }))}>
                  <option value="None">None</option>
                  <option value="Monthly">Monthly</option>
                </Select>
                <Input label="Accrual Rate (days/mo)" type="number" step="0.01" min={0} value={formData.accrualRate}
                  onChange={(e) => setFormData((f) => ({ ...f, accrualRate: e.target.value }))} />
                <Input label="Max Carryover (days)" type="number" min={0} placeholder="No cap" value={formData.maxCarryoverDays}
                  onChange={(e) => setFormData((f) => ({ ...f, maxCarryoverDays: e.target.value }))} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input label="Advance Notice (days)" type="number" min={0} value={formData.advanceNoticeDays}
              onChange={(e) => setFormData((f) => ({ ...f, advanceNoticeDays: e.target.value }))} />
            <Input label="Max Consecutive (days)" type="number" min={0} placeholder="No cap" value={formData.maxConsecutiveDays}
              onChange={(e) => setFormData((f) => ({ ...f, maxConsecutiveDays: e.target.value }))} />
            <Input label="Proof Threshold (days)" type="number" min={0} disabled={!formData.requiresProof} value={formData.proofThresholdDays}
              onChange={(e) => setFormData((f) => ({ ...f, proofThresholdDays: e.target.value }))} />
          </div>

          <div className="flex flex-wrap gap-5">
            <Checkbox label="Can be filed retroactively" checked={formData.retroactiveAllowed}
              onChange={(v) => setFormData((f) => ({ ...f, retroactiveAllowed: v }))} />
            {formData.retroactiveAllowed && (
              <Input label="Retroactive window (days)" type="number" min={0} value={formData.retroactiveWindowDays}
                onChange={(e) => setFormData((f) => ({ ...f, retroactiveWindowDays: e.target.value }))} containerClass="w-40" />
            )}
            <Checkbox label="Requires supporting proof" checked={formData.requiresProof}
              onChange={(v) => setFormData((f) => ({ ...f, requiresProof: v }))} />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editingType ? 'Save Changes' : 'Create Leave Type'}</Button>
          </div>
        </div>
      </Modal>

      {/* Activate/Deactivate confirmation */}
      <Modal isOpen={!!toggleTarget} onClose={() => setToggleTarget(null)} title={toggleTarget?.nextActive ? 'Reactivate Leave Type' : 'Deactivate Leave Type'} size="sm">
        {toggleTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${toggleTarget.nextActive ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                <Sliders className="w-5 h-5" />
              </div>
              <p className="text-sm text-gray-700">
                {toggleTarget.nextActive
                  ? `${toggleTarget.type.name} will become visible and filable by employees again.`
                  : `${toggleTarget.type.name} will be hidden from the employee dropdown. Existing and historical requests of this type are not affected.`}
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setToggleTarget(null)}>Cancel</Button>
              <Button variant={toggleTarget.nextActive ? 'primary' : 'danger'} onClick={handleToggleActive} loading={toggling}>
                {toggleTarget.nextActive ? 'Reactivate' : 'Deactivate'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

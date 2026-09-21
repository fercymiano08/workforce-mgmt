import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Search, Check, Users } from 'lucide-react';
import Avatar from '../ui/Avatar';
import { Select } from '../ui/Input';

// Choose employees in order, each step narrowing the next:
//   1. Department   2. Role (only the roles in that department)   3. the employees appear
//
//   mode "single": value = an employee id        onChange(id)
//   mode "multi" : value = an array of ids       onChange(ids)   (ticks are kept while you move between departments)
const ALL = '__all__';

export default function EmployeePicker({ employees, mode = 'multi', value, onChange, error, listHeight = 'max-h-64' }) {
  const multi = mode === 'multi';
  const selected = useMemo(() => new Set(multi ? value || [] : value ? [value] : []), [multi, value]);

  // Editing an existing assignment: open on the department of the person already chosen.
  const [dept, setDept] = useState(() => employees.find((e) => e.id === value)?.department || '');
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');

  const people = useMemo(() => employees.filter((e) => e.status === 'Active' || selected.has(e.id)), [employees, selected]);
  const deptOf = (e) => e.department || 'No department';

  const departments = useMemo(() => {
    const m = new Map();
    people.forEach((e) => m.set(deptOf(e), (m.get(deptOf(e)) || 0) + 1));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [people]);

  const inDept = useMemo(() => (dept === ALL ? people : dept ? people.filter((e) => deptOf(e) === dept) : []), [people, dept]);

  const roles = useMemo(() => {
    const m = new Map();
    inDept.forEach((e) => { if (e.position) m.set(e.position, (m.get(e.position) || 0) + 1); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [inDept]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inDept
      .filter((e) => !role || e.position === role)
      .filter((e) => !q || `${e.firstName} ${e.lastName} ${e.id}`.toLowerCase().includes(q))
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }, [inDept, role, search]);

  const emit = (ids) => onChange(multi ? ids : ids[0] || '');
  const toggle = (id) => {
    if (!multi) { emit([id]); return; }
    emit(selected.has(id) ? [...selected].filter((x) => x !== id) : [...selected, id]);
  };
  const allShown = list.length > 0 && list.every((e) => selected.has(e.id));
  const setShown = (on) => {
    const next = new Set(selected);
    list.forEach((e) => (on ? next.add(e.id) : next.delete(e.id)));
    emit([...next]);
  };

  const step = (n, text) => (
    <p className="flex items-center gap-2 text-[13px] font-semibold text-gray-700 mb-1.5">
      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] flex items-center justify-center">{n}</span>{text}
    </p>
  );

  return (
    <div className={clsx('space-y-4 rounded-xl', error && 'ring-1 ring-red-300 p-3')}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          {step(1, 'Department')}
          <Select value={dept} onChange={(e) => { setDept(e.target.value); setRole(''); setSearch(''); }}>
            <option value="">Choose a department...</option>
            {multi && <option value={ALL}>All departments ({people.length})</option>}
            {departments.map(([d, n]) => <option key={d} value={d}>{d} ({n})</option>)}
          </Select>
        </div>
        <div>
          {step(2, 'Role')}
          <Select value={role} onChange={(e) => { setRole(e.target.value); setSearch(''); }} disabled={!dept}>
            <option value="">{dept ? `All roles (${inDept.length})` : 'Choose a department first'}</option>
            {roles.map(([r, n]) => <option key={r} value={r}>{r} ({n})</option>)}
          </Select>
        </div>
      </div>

      <div>
        {step(3, multi ? 'Employees' : 'Employee')}
        {!dept ? (
          <p className="px-4 py-8 text-sm text-gray-400 text-center border border-dashed border-gray-200 rounded-xl">Choose a department to see its employees.</p>
        ) : (
          <div className="border border-gray-200 rounded-xl bg-white">
            <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 bg-gray-50/70">
              {inDept.length > 8 ? (
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name..." className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
              ) : (
                <span className="flex-1 flex items-center gap-1.5 text-xs text-gray-500"><Users className="w-3.5 h-3.5" /> {list.length} employee{list.length === 1 ? '' : 's'}</span>
              )}
              {multi && list.length > 0 && (
                <button type="button" onClick={() => setShown(!allShown)} className="text-xs font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap">
                  {allShown ? 'Unselect all' : `Select all ${list.length}`}
                </button>
              )}
            </div>
            <div className={clsx('overflow-y-auto', listHeight)}>
              {list.length === 0 && <p className="px-4 py-6 text-sm text-gray-400 text-center">No employees match.</p>}
              {list.map((e) => {
                const on = selected.has(e.id);
                return (
                  <button key={e.id} type="button" onClick={() => toggle(e.id)} className={clsx('w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-gray-50 last:border-0 transition-colors', on ? 'bg-blue-50' : 'hover:bg-gray-50')}>
                    <span className={clsx('w-4 h-4 shrink-0 flex items-center justify-center border', multi ? 'rounded' : 'rounded-full', on ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 bg-white')}>
                      {on && <Check className="w-3 h-3" />}
                    </span>
                    <Avatar firstName={e.firstName} lastName={e.lastName} size="sm" src={e.avatar} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 truncate">{e.firstName} {e.lastName}</span>
                      <span className="block text-xs text-gray-400 truncate">{e.position || 'No role'}{dept === ALL ? ` · ${deptOf(e)}` : ''}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {multi && <p className="mt-2 text-xs text-gray-500"><strong className="text-gray-800">{selected.size}</strong> employee{selected.size === 1 ? '' : 's'} selected in total. Your ticks stay when you switch department.</p>}
      </div>
    </div>
  );
}

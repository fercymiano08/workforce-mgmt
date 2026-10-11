import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Info, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../ui/Card';
import Badge from '../ui/Badge';
import Avatar from '../ui/Avatar';
import TableShell from '../ui/TableShell';
import EmptyState from '../ui/EmptyState';
import useApiData from '../../hooks/useApiData';
import { analyticsService } from '../../services/api';
import { SkeletonTable } from '../ui/LoadingSkeleton';

const PERIODS = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
];

const MEDAL_TONE = ['bg-amber-50 text-amber-600', 'bg-gray-100 text-gray-500', 'bg-orange-50 text-orange-600'];

const COLUMNS = [
  { key: 'rank', label: '#', numeric: true },
  { key: 'name', label: 'Employee' },
  { key: 'department', label: 'Department' },
  { key: 'attendanceRate', label: 'Attendance', numeric: true },
  { key: 'punctualityRate', label: 'Punctuality', numeric: true },
  { key: 'score', label: 'Score', numeric: true },
];

/**
 * The "Top Performer" view a panel review named directly as missing: Workforce Analytics only ever
 * showed company-wide charts ("puro graph"), never who actually stands out. Every active employee,
 * ranked by the same punctuality-based read the By Employee tab gives one person at a time - a real
 * sortable table (click a header to resort), not another chart, and a row opens that person's own
 * By Employee tab.
 */
export default function TopPerformers() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('month');
  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' });

  const { data, loading } = useApiData(() => analyticsService.getTopPerformers(period), [period]);
  const ranked = data?.ranked || [];

  const sorted = useMemo(() => {
    const list = [...ranked];
    list.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [ranked, sort]);

  const top3 = useMemo(() => [...ranked].sort((a, b) => a.rank - b.rank).slice(0, 3), [ranked]);

  const toggleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: ['name', 'department', 'rank'].includes(key) ? 'asc' : 'desc' }));
  };

  const sortIcon = (key) => {
    if (sort.key !== key) return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
    return sort.dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
  };

  const openEmployee = (employeeId) => navigate(`/analytics?tab=employee&employeeId=${employeeId}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <Trophy className="w-4.5 h-4.5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Top Performer</h2>
            <p className="text-[13px] text-gray-500 mt-0.5">Ranked by attendance and punctuality · {data?.period?.label || ''}</p>
          </div>
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1">
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={`px-3 sm:px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${period === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : ranked.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Nothing to rank yet"
          description={data?.meta?.notEnoughDataCount ? `${data.meta.notEnoughDataCount} employee(s) have too few attendance records this period to rank fairly.` : 'Fills in once attendance is recorded for this period.'}
        />
      ) : (
        <>
          {/* The headline answer to "who stands out" - three cards, not a row in a table, so it
              reads immediately rather than requiring a scan down a column. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {top3.map((p, i) => (
              <button
                key={p.employeeId}
                type="button"
                onClick={() => openEmployee(p.employeeId)}
                className="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-gray-200 hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${MEDAL_TONE[i]}`}>#{p.rank}</span>
                  <Badge variant={p.tone} size="xs">{p.label}</Badge>
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <Avatar firstName={p.name.split(' ')[0]} lastName={p.name.split(' ')[1]} src={p.avatar} size="lg" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-500 truncate">{[p.position, p.department].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Attendance</p>
                    <p className="text-sm font-bold text-gray-900">{p.attendanceRate}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Punctuality</p>
                    <p className="text-sm font-bold text-gray-900">{p.punctualityRate}%</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* The full ranking - every column sorts, so this is a real data grid, not another chart. */}
          <Card padding={false}>
            <TableShell minWidth="min-w-[720px]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    {COLUMNS.map((col) => (
                      <th key={col.key} className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${col.numeric ? 'text-right' : 'text-left'}`}>
                        <button type="button" onClick={() => toggleSort(col.key)} className={`inline-flex items-center gap-1 hover:text-gray-700 ${col.numeric ? 'flex-row-reverse' : ''}`}>
                          {col.label} {sortIcon(col.key)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sorted.map((p) => (
                    <tr key={p.employeeId} onClick={() => openEmployee(p.employeeId)} className="hover:bg-gray-50/50 transition-colors cursor-pointer">
                      <td className="px-4 py-3.5 text-sm font-semibold text-gray-500 text-right">#{p.rank}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar firstName={p.name.split(' ')[0]} lastName={p.name.split(' ')[1]} src={p.avatar} size="sm" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-gray-900 truncate flex items-center gap-1.5">
                              {p.name}
                              {p.probationary && <Badge variant="warning" size="xs">Probationary</Badge>}
                            </p>
                            <Badge variant={p.tone} size="xs">{p.label}</Badge>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{p.department || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-700 text-right tabular-nums">{p.attendanceRate}%</td>
                      <td className="px-4 py-3.5 text-sm text-gray-700 text-right tabular-nums">{p.punctualityRate}%</td>
                      <td className="px-4 py-3.5 text-sm font-bold text-gray-900 text-right tabular-nums">{p.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          </Card>

          <p className="flex items-start gap-1.5 text-xs text-gray-400">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {data?.meta?.note}
            {data?.meta?.notEnoughDataCount > 0 && ` ${data.meta.notEnoughDataCount} employee(s) left off this list for that reason.`}
          </p>
        </>
      )}
    </div>
  );
}

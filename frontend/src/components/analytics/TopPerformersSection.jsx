import { useMemo, useState } from 'react';
import { Trophy, Info, Search, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Avatar from '../ui/Avatar';
import TableShell from '../ui/TableShell';
import EmptyState from '../ui/EmptyState';
import { SkeletonTable } from '../ui/LoadingSkeleton';

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
 * The "Top Performer" view a panel review named directly as missing - folded into Overview itself
 * (not its own tab) per a later review: every active employee ranked by attendance + punctuality,
 * the top 3 highlighted, the rest a real sortable table (click a header to resort). A row opens
 * that person in a popup instead of a separate page, so comparing people never means navigating
 * away from the charts.
 */
export default function TopPerformersSection({ data, loading, periodLabel, onSelectEmployee, onLookup }) {
  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' });
  const ranked = useMemo(() => data?.ranked || [], [data]);

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

  // Split the sorted list down the middle - first half left, second half right - so a roster of
  // ~20 people reads as two short columns instead of one long scroll. Whatever column it is
  // currently sorted by, the split is just "first half of the list / second half", which is still
  // top-to-bottom reading order either way. A short roster (10 or fewer) stays a single table -
  // splitting it would just leave two mostly-empty columns.
  const isSplit = sorted.length > 10;
  const splitAt = Math.ceil(sorted.length / 2);
  const leftRows = isSplit ? sorted.slice(0, splitAt) : sorted;
  const rightRows = isSplit ? sorted.slice(splitAt) : [];

  const toggleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: ['name', 'department', 'rank'].includes(key) ? 'asc' : 'desc' }));
  };

  const sortIcon = (key) => {
    if (sort.key !== key) return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
    return sort.dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
  };

  return (
    <div className="space-y-4 print:hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <Trophy className="w-4.5 h-4.5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Top Performer</h2>
            <p className="text-[13px] text-gray-500 mt-0.5">Ranked by attendance and punctuality · {periodLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLookup}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <Search className="w-3.5 h-3.5" /> Look up an employee
        </button>
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={6} />
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
                onClick={() => onSelectEmployee(p.employeeId)}
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

          {/* The full ranking - every column sorts, so this is a real data grid, not another chart.
              Past 10 people it splits into two side-by-side halves (left: first half of the sorted
              list, right: second half) so the roster reads as two short columns instead of one long
              scroll - each half keeps its own header so either side can still be resorted. */}
          <div className={isSplit ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : ''}>
            {[leftRows, ...(isSplit ? [rightRows] : [])].map((rows, half) => (
              <Card key={half} padding={false}>
                <TableShell minWidth="min-w-[560px]">
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
                      {rows.map((p) => (
                        <tr key={p.employeeId} onClick={() => onSelectEmployee(p.employeeId)} className="hover:bg-gray-50/50 transition-colors cursor-pointer">
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
            ))}
          </div>

          <p className="flex items-start gap-1.5 text-xs text-gray-400">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {data?.meta?.note}
            {data?.meta?.notEnoughDataCount > 0 && ` ${data.meta.notEnoughDataCount} employee(s) left off this list for that reason.`}
          </p>
        </>
      )}
    </div>
  );
}

<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The topbar's universal search. One question - "what matches this?" - answered per signed-in role, on the
 * SERVER, so the rule about who may see what lives in exactly one place instead of in whichever endpoints
 * the browser happened to call:
 *
 *   Administrator  employees, attendance, leave, overtime, early clock-outs, corrections, timesheets,
 *                  shifts, audit trail, notifications - everyone's records
 *   Employee       the same kinds of record, but only their OWN rows (employee_id = theirs), and never
 *                  the employee directory or the audit trail
 *
 * Matching: the query is split on spaces and EVERY word has to match at least one searchable column of a
 * row ("late sep" = a row that is late AND is in September). A month name matches that month's dates, so
 * "sep 24" works as well as "2026-09-24". One letter is enough; each group is capped so a short query
 * stays fast.
 */
class GlobalSearch
{
    public const PER_GROUP = 5;

    private const MONTHS = [
        '01' => 'january', '02' => 'february', '03' => 'march', '04' => 'april', '05' => 'may', '06' => 'june',
        '07' => 'july', '08' => 'august', '09' => 'september', '10' => 'october', '11' => 'november', '12' => 'december',
    ];

    /** @return array<int, array<string, mixed>> flat list of results, each tagged with its group */
    public function run(User $user, string $query): array
    {
        $tokens = $this->tokens($query);
        if ($tokens === []) {
            return [];
        }

        $admin = $user->role === 'Administrator';
        $employeeId = $admin ? null : $this->employeeIdFor($user);
        if (! $admin && ! $employeeId) {
            return [];
        }

        $results = [];
        foreach ($this->groups($admin) as $group) {
            $rows = $this->query($group, $tokens, $employeeId);
            foreach ($rows as $row) {
                $results[] = ['group' => $group['label'], 'type' => $group['type']] + $group['shape']($row, $admin);
            }
        }

        return $results;
    }

    /** @return list<string> lower-cased, de-duplicated words of the query */
    private function tokens(string $query): array
    {
        $words = preg_split('/\s+/', mb_strtolower(trim($query)), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return array_values(array_unique(array_slice($words, 0, 5)));
    }

    private function employeeIdFor(User $user): ?string
    {
        return $user->employee_id
            ?? Employee::where('email', $user->email)->value('id')
            ?? (string) $user->id;
    }

    /** One entry per searchable kind of record. 'cols' are matched as text; 'dates' also match month names. */
    private function groups(bool $admin): array
    {
        $day = fn (?string $d) => $d ? Carbon::parse($d)->format('D, M j, Y') : '';
        $who = fn ($r) => trim(($r->first_name ?? '').' '.($r->last_name ?? '')) ?: ($r->employee_name ?? '');
        $enc = fn (string $s) => rawurlencode($s);

        $groups = [];

        if ($admin) {
            $groups[] = [
                'type' => 'employee', 'label' => 'People', 'table' => 'employees', 'alias' => 'x', 'join' => false,
                'cols' => ['x.id', 'x.first_name', 'x.last_name', 'x.email', 'x.department', 'x.position', 'x.status', 'x.employment_type', 'x.phone'],
                'dates' => [], 'order' => 'x.first_name', 'dir' => 'asc', 'scope' => null,
                'select' => ['x.id', 'x.first_name', 'x.last_name', 'x.position', 'x.department', 'x.email', 'x.status'],
                'shape' => fn ($r) => [
                    'id' => 'emp:'.$r->id, 'title' => trim($r->first_name.' '.$r->last_name),
                    'subtitle' => implode(' · ', array_filter([$r->position, $r->department, $r->email])),
                    'badge' => $r->status, 'to' => '/employees?search='.$enc(trim($r->first_name.' '.$r->last_name)),
                ],
            ];
        }

        $groups[] = [
            'type' => 'attendance', 'label' => $admin ? 'Attendance' : 'My attendance', 'table' => 'attendance', 'alias' => 'x',
            'cols' => ['x.status', 'x.date', 'x.clock_in', 'x.clock_out', 'x.location', 'x.notes', 'x.overtime'],
            'dates' => ['x.date'], 'order' => 'x.date', 'dir' => 'desc', 'scope' => 'x.employee_id',
            'select' => ['x.id', 'x.date', 'x.status', 'x.clock_in', 'x.clock_out', 'x.overtime'],
            'shape' => fn ($r, $a) => [
                'id' => 'att:'.$r->id, 'title' => ($a ? $who($r).' - ' : '').$day($r->date),
                'subtitle' => implode(' · ', array_filter([$r->clock_in ? substr($r->clock_in, 0, 5).' - '.substr((string) $r->clock_out, 0, 5) : null, $r->overtime > 0 ? $r->overtime.'h overtime' : null])),
                'badge' => $r->status, 'to' => $a ? '/attendance?search='.$enc($who($r)) : '/my-attendance?search='.$r->date,
            ],
        ];

        $groups[] = [
            'type' => 'leave', 'label' => $admin ? 'Leave' : 'My leave', 'table' => 'leaves', 'alias' => 'x',
            'cols' => ['x.leave_type', 'x.status', 'x.reason', 'x.comments', 'x.start_date', 'x.end_date', 'x.approved_by'],
            'dates' => ['x.start_date', 'x.end_date'], 'order' => 'x.start_date', 'dir' => 'desc', 'scope' => 'x.employee_id',
            'select' => ['x.id', 'x.leave_type', 'x.status', 'x.start_date', 'x.end_date', 'x.days'],
            'shape' => fn ($r, $a) => [
                'id' => 'lv:'.$r->id, 'title' => ($a ? $who($r).' - ' : '').$r->leave_type.' leave',
                'subtitle' => $day($r->start_date).' - '.$day($r->end_date).($r->days ? ' · '.$r->days.' day(s)' : ''),
                'badge' => $r->status, 'to' => $a ? '/leave?search='.$enc($who($r)) : '/leave?search='.$enc((string) $r->leave_type),
            ],
        ];

        $groups[] = [
            'type' => 'overtime', 'label' => $admin ? 'Overtime' : 'My overtime', 'table' => 'overtime_requests', 'alias' => 'x',
            'cols' => ['x.status', 'x.reason', 'x.date', 'x.expected_hours', 'x.approved_hours', 'x.comments'],
            'dates' => ['x.date'], 'order' => 'x.date', 'dir' => 'desc', 'scope' => 'x.employee_id',
            'select' => ['x.id', 'x.date', 'x.status', 'x.expected_hours', 'x.approved_hours'],
            'shape' => fn ($r, $a) => [
                'id' => 'ot:'.$r->id, 'title' => ($a ? $who($r).' - ' : '').'Overtime '.$day($r->date),
                'subtitle' => ($r->approved_hours ?? $r->expected_hours).'h',
                'badge' => $r->status, 'to' => $a ? '/attendance?tab=overtime&search='.$enc($who($r)) : '/my-attendance?tab=overtime',
            ],
        ];

        $groups[] = [
            'type' => 'early', 'label' => $admin ? 'Early clock-outs' : 'My early clock-outs', 'table' => 'early_clock_outs', 'alias' => 'x',
            'cols' => ['x.reason_code', 'x.reason_note', 'x.reason_status', 'x.classification', 'x.date'],
            'dates' => ['x.date'], 'order' => 'x.date', 'dir' => 'desc', 'scope' => 'x.employee_id',
            'select' => ['x.id', 'x.date', 'x.reason_code', 'x.classification', 'x.minutes_early'],
            'shape' => fn ($r, $a) => [
                'id' => 'eco:'.$r->id, 'title' => ($a ? $who($r).' - ' : '').'Left early '.$day($r->date),
                'subtitle' => str_replace('_', ' ', (string) $r->reason_code).($r->minutes_early ? ' · '.$r->minutes_early.' min early' : ''),
                'badge' => str_replace('_', ' ', (string) $r->classification), 'to' => $a ? '/attendance?view=early&search='.$enc($who($r)) : '/my-attendance?tab=early',
            ],
        ];

        $groups[] = [
            'type' => 'correction', 'label' => $admin ? 'Corrections' : 'My corrections', 'table' => 'attendance_adjustments', 'alias' => 'x',
            'cols' => ['x.type', 'x.status', 'x.reason', 'x.date', 'x.decision_note'],
            'dates' => ['x.date'], 'order' => 'x.date', 'dir' => 'desc', 'scope' => 'x.employee_id',
            'select' => ['x.id', 'x.date', 'x.type', 'x.status'],
            'shape' => fn ($r, $a) => [
                'id' => 'adj:'.$r->id, 'title' => ($a ? $who($r).' - ' : '').str_replace('_', ' ', (string) $r->type),
                'subtitle' => $day($r->date), 'badge' => $r->status,
                'to' => $a ? '/attendance?tab=corrections' : '/my-attendance?tab=corrections',
            ],
        ];

        $groups[] = [
            'type' => 'timesheet', 'label' => $admin ? 'Timesheets' : 'My timesheets', 'table' => 'timesheets', 'alias' => 'x',
            'cols' => ['x.status', 'x.week_start', 'x.week_end', 'x.department', 'x.total_hours', 'x.approved_by'],
            'dates' => ['x.week_start', 'x.week_end'], 'order' => 'x.week_start', 'dir' => 'desc', 'scope' => 'x.employee_id',
            'select' => ['x.id', 'x.week_start', 'x.week_end', 'x.status', 'x.total_hours'],
            'shape' => fn ($r, $a) => [
                'id' => 'ts:'.$r->id, 'title' => ($a ? $who($r).' - ' : '').'Week of '.$day($r->week_start),
                'subtitle' => $r->total_hours.'h total', 'badge' => $r->status,
                'to' => $a ? '/timesheets?search='.$enc($who($r)) : '/my-timesheet',
            ],
        ];

        $groups[] = [
            'type' => 'shift', 'label' => $admin ? 'Shifts' : 'My shifts', 'table' => 'shift_schedules', 'alias' => 'x',
            'extraJoin' => ['shift_definitions as d', 'd.id', '=', 'x.shift_id'],
            'cols' => ['x.date', 'x.status', 'd.name', 'd.start_time', 'd.end_time'],
            'dates' => ['x.date'], 'order' => 'x.date', 'dir' => 'desc', 'scope' => 'x.employee_id',
            'select' => ['x.id', 'x.date', 'x.status', DB::raw('d.name as shift_name'), DB::raw('d.start_time as start_time'), DB::raw('d.end_time as end_time')],
            'shape' => fn ($r, $a) => [
                'id' => 'sh:'.$r->id, 'title' => ($a ? $who($r).' - ' : '').($r->shift_name ?: 'Shift').' '.$day($r->date),
                'subtitle' => $r->start_time ? substr($r->start_time, 0, 5).' - '.substr((string) $r->end_time, 0, 5) : '',
                'badge' => $r->status, 'to' => $a ? '/shifts?search='.$enc($who($r)) : '/my-schedule',
            ],
        ];

        $groups[] = [
            'type' => 'notification', 'label' => 'Notifications', 'table' => 'notifications', 'alias' => 'x', 'join' => false,
            'cols' => ['x.title', 'x.message', 'x.type', 'x.priority'],
            'dates' => [], 'order' => 'x.timestamp', 'dir' => 'desc', 'scope' => 'x.employee_id', 'adminScopeNull' => true,
            'select' => ['x.id', 'x.title', 'x.message', 'x.priority'],
            'shape' => fn ($r) => [
                'id' => 'nt:'.$r->id, 'title' => $r->title, 'subtitle' => mb_strimwidth((string) $r->message, 0, 90, '…'),
                'badge' => $r->priority, 'to' => '/notifications?search='.$enc((string) $r->title),
            ],
        ];

        if ($admin) {
            $groups[] = [
                'type' => 'audit', 'label' => 'Audit trail', 'table' => 'audit_events', 'alias' => 'x', 'join' => false,
                'cols' => ['x.event', 'x.actor', 'x.entity_type', 'x.entity_id', 'x.service'],
                'dates' => [], 'order' => 'x.id', 'dir' => 'desc', 'scope' => null,
                'select' => ['x.id', 'x.event', 'x.actor', 'x.entity_type', 'x.entity_id'],
                'shape' => fn ($r) => [
                    'id' => 'au:'.$r->id, 'title' => (string) $r->event, 'subtitle' => implode(' · ', array_filter([$r->actor, $r->entity_type, $r->entity_id])),
                    'badge' => null, 'to' => '/audit-logs?search='.$enc((string) $r->event),
                ],
            ];
        }

        return $groups;
    }

    /** Runs one group: every word must hit a column, and an employee only ever gets their own rows. */
    private function query(array $g, array $tokens, ?string $employeeId)
    {
        $q = DB::table($g['table'].' as '.$g['alias']);

        // Rows that carry an employee id also borrow the person's name, so "juan" finds Juan's attendance.
        $cols = $g['cols'];
        $joinsEmployees = ($g['join'] ?? true) && $g['table'] !== 'employees';
        if ($joinsEmployees) {
            $q->leftJoin('employees as e', 'e.id', '=', $g['alias'].'.employee_id');
            $cols = array_merge($cols, ['e.first_name', 'e.last_name', 'e.department']);
        }
        if (isset($g['extraJoin'])) {
            $q->leftJoin(...$g['extraJoin']);
        }

        if ($employeeId !== null && $g['scope']) {
            $q->where($g['scope'], $employeeId);
        } elseif ($employeeId === null && ! empty($g['adminScopeNull'])) {
            $q->whereNull($g['scope']);
        }

        foreach ($tokens as $token) {
            $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $token).'%';
            // A month name (or its first three+ letters) also matches that month's dates.
            $month = null;
            if (strlen($token) >= 3) {
                foreach (self::MONTHS as $num => $name) {
                    if (str_starts_with($name, $token)) {
                        $month = $num;
                    }
                }
            }
            $q->where(function ($w) use ($cols, $like, $month, $g) {
                foreach ($cols as $col) {
                    $w->orWhereRaw("LOWER(CAST({$col} AS TEXT)) LIKE ? ESCAPE '\\'", [$like]);
                }
                if ($month !== null) {
                    foreach ($g['dates'] as $dateCol) {
                        $w->orWhereRaw("CAST({$dateCol} AS TEXT) LIKE ?", ['%-'.$month.'-%']);
                    }
                }
            });
        }

        $select = $g['select'];
        if ($joinsEmployees) {
            $select = array_merge($select, ['e.first_name', 'e.last_name']);
        }

        return $q->select($select)->orderBy($g['order'], $g['dir'])->limit(self::PER_GROUP)->get();
    }
}

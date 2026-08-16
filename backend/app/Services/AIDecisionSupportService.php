<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\OvertimeRequest;
use App\Models\SecurityEvent;
use App\Models\Setting;
use App\Models\ShiftSchedule;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

/**
 * AI decision support for HR.
 *
 * The primary path calls Google Gemini (Flash family) with a live snapshot of
 * the workforce data and asks it to return a structured, decision-support
 * briefing. When no API key is configured, the request fails, or the response
 * is unusable, it transparently falls back to a deterministic rules engine so
 * the module always works (including offline). The `source` field on the
 * payload tells the UI which path produced the result.
 */
class AIDecisionSupportService
{
    private const WINDOW_DAYS = 30;
    private const LATE_THRESHOLD = 3;
    private const ABSENT_THRESHOLD = 2;
    private const LOW_ATTENDANCE_RATE = 90.0;
    private const LOW_PUNCTUALITY = 80.0;
    private const HIGH_AVG_OVERTIME = 1.0;

    private const SEVERITY_ORDER = ['critical' => 0, 'warning' => 1, 'info' => 2, 'success' => 3];
    private const SEVERITIES = ['critical', 'warning', 'info', 'success'];

    public function insights(): array
    {
        return $this->aiInsights() ?? $this->ruleBasedInsights();
    }

    public function approvalQueue(): array
    {
        $openSecurity = SecurityEvent::where('status', 'Open')
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function (SecurityEvent $s) {
                $employee = $s->employee;

                return [
                    'id' => $s->id,
                    'type' => $s->type,
                    'label' => $s->type === 'face_mismatch' ? 'Face mismatch' : 'Failed PIN attempt',
                    'message' => $s->message,
                    'employee' => $employee ? trim($employee->first_name.' '.$employee->last_name) : null,
                    'time' => $s->created_at?->toISOString(),
                ];
            })
            ->values();

        return [
            'leave' => Leave::where('status', 'Pending')->get()->map(
                fn (Leave $l) => [
                    'id' => $l->id,
                    'employee' => $l->employee_name,
                    'type' => $l->leave_type,
                    'start' => $l->start_date->format('Y-m-d'),
                    'end' => $l->end_date->format('Y-m-d'),
                    'days' => $l->start_date->diffInDays($l->end_date) + 1,
                    'applied' => $l->applied_date?->format('Y-m-d'),
                    'reason' => $l->reason,
                ]
            )->values(),
            'overtime' => OvertimeRequest::where('status', 'Pending')->get()->map(
                fn (OvertimeRequest $o) => [
                    'id' => $o->id,
                    'employee' => $o->employee_name,
                    'date' => $o->date->format('Y-m-d'),
                    'hours' => $o->expected_hours,
                    'applied' => $o->requested_date?->format('Y-m-d'),
                    'reason' => $o->reason,
                ]
            )->values(),
            'security' => $openSecurity,
        ];
    }

    public function contextPayload(): array
    {
        $since = Carbon::now()->subDays(self::WINDOW_DAYS - 1)->startOfDay();
        $today = now()->toDateString();

        $rows = Attendance::join('employees', 'employees.id', '=', 'attendance.employee_id')
            ->where('attendance.date', '>=', $since->toDateString())
            ->get([
                'attendance.employee_id',
                'attendance.status',
                'attendance.overtime',
                'employees.first_name',
                'employees.last_name',
                'employees.department',
            ]);

        $perEmployee = [];
        $totals = ['total' => 0, 'present' => 0, 'late' => 0, 'absent' => 0, 'overtimeSum' => 0.0];

        foreach ($rows as $row) {
            $id = $row->employee_id;
            if (! isset($perEmployee[$id])) {
                $perEmployee[$id] = [
                    'name' => trim($row->first_name.' '.$row->last_name),
                    'department' => $row->department,
                    'present' => 0,
                    'late' => 0,
                    'absent' => 0,
                    'records' => 0,
                    'overtime_hours' => 0.0,
                ];
            }

            $perEmployee[$id]['records']++;
            $perEmployee[$id]['overtime_hours'] += (float) $row->overtime;
            $totals['total']++;
            $totals['overtimeSum'] += (float) $row->overtime;

            match ($row->status) {
                'Present' => [$perEmployee[$id]['present']++, $totals['present']++],
                'Late' => [$perEmployee[$id]['late']++, $totals['late']++],
                'Absent' => [$perEmployee[$id]['absent']++, $totals['absent']++],
                default => null,
            };
        }

        $employeeSummary = array_values(array_map(static function (array $e) {
            return [
                'name' => $e['name'],
                'department' => $e['department'],
                'present' => $e['present'],
                'late' => $e['late'],
                'absent' => $e['absent'],
                'records' => $e['records'],
                'avg_overtime_hours' => round($e['records'] > 0 ? $e['overtime_hours'] / $e['records'] : 0, 1),
            ];
        }, $perEmployee));

        $scheduledToday = ShiftSchedule::where('date', $today)->pluck('employee_id');
        $clockedToday = Attendance::where('date', $today)->pluck('employee_id');

        return [
            'generated_at' => now()->toISOString(),
            'organization' => [
                'active_employees' => Employee::where('status', 'Active')->count(),
                'departments' => Employee::query()->whereNotNull('department')->distinct()->pluck('department')->values(),
            ],
            'attendance_last_30_days' => [
                'total_records' => $totals['total'],
                'present' => $totals['present'],
                'late' => $totals['late'],
                'absent' => $totals['absent'],
                'on_time_rate_pct' => $totals['total'] > 0 ? round((($totals['present'] + $totals['late']) / $totals['total']) * 100, 1) : null,
                'punctuality_pct' => ($totals['present'] + $totals['late']) > 0 ? round(($totals['present'] / ($totals['present'] + $totals['late'])) * 100, 1) : null,
                'total_overtime_hours' => round($totals['overtimeSum'], 1),
            ],
            'per_employee' => $employeeSummary,
            'today' => [
                'date' => $today,
                'scheduled' => $scheduledToday->count(),
                'clocked_in' => $clockedToday->count(),
                'potential_no_shows' => $scheduledToday->diff($clockedToday)->count(),
            ],
            'pending' => [
                'leave' => Leave::where('status', 'Pending')->get(['employee_id', 'employee_name', 'leave_type', 'start_date', 'end_date'])
                    ->map(fn ($l) => [
                        'id' => $l->id,
                        'employee' => $l->employee_name,
                        'type' => $l->leave_type,
                        'start' => $l->start_date->format('Y-m-d'),
                        'end' => $l->end_date->format('Y-m-d'),
                    ])->values(),
                'overtime' => OvertimeRequest::where('status', 'Pending')->get(['employee_id', 'employee_name', 'date', 'expected_hours'])
                    ->map(fn ($o) => [
                        'id' => $o->id,
                        'employee' => $o->employee_name,
                        'date' => $o->date->format('Y-m-d'),
                        'hours' => $o->expected_hours,
                    ])->values(),
            ],
            'leave_trend' => [
                'last_month_approved' => $this->approvedLeaveCount('last'),
                'this_month_approved' => $this->approvedLeaveCount('this'),
            ],
            'security' => [
                'open_events' => SecurityEvent::where('status', 'Open')->count(),
                'face_mismatch_7d' => SecurityEvent::where('type', 'face_mismatch')
                    ->where('created_at', '>=', now()->subDays(7))->count(),
                'pin_failed_7d' => SecurityEvent::where('type', 'pin_failed')
                    ->where('created_at', '>=', now()->subDays(7))->count(),
                'unresolved' => SecurityEvent::where('status', 'Open')
                    ->orderBy('created_at', 'desc')
                    ->get(['id', 'type', 'message', 'employee_id', 'created_at'])
                    ->map(fn (SecurityEvent $s) => [
                        'id' => $s->id,
                        'type' => $s->type,
                        'message' => $s->message,
                        'employee' => $s->employee ? trim($s->employee->first_name.' '.$s->employee->last_name) : null,
                        'time' => $s->created_at?->toISOString(),
                    ])->values(),
            ],
        ];
    }

    private function aiInsights(): ?array
    {
        $key = config('services.gemini.key');
        if (! $key) {
            return null;
        }

        $payload = [
            'contents' => [
                ['parts' => [['text' => json_encode($this->contextPayload(), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]]],
            ],
            'systemInstruction' => [
                'parts' => [['text' => $this->systemPrompt()]],
            ],
            'generationConfig' => [
                'responseMimeType' => 'application/json',
                'temperature' => 0.3,
            ],
        ];

        try {
            $response = Http::timeout((int) config('services.gemini.timeout', 30))
                ->asJson()
                ->withQueryParameters(['key' => $key])
                ->post(
                    'https://generativelanguage.googleapis.com/v1beta/models/'
                        .config('services.gemini.model', 'gemini-2.5-flash')
                        .':generateContent',
                    $payload
                );

            if ($response->failed()) {
                return null;
            }

            $text = data_get($response->json(), 'candidates.0.content.parts.0.text');
            if (! is_string($text) || trim($text) === '') {
                return null;
            }

            $decoded = json_decode(trim($text), true);
            if (! is_array($decoded)) {
                return null;
            }

            return $this->normalize($decoded);
        } catch (\Throwable) {
            return null;
        }
    }

    private function systemPrompt(): string
    {
        return <<<'PROMPT'
You are an AI workforce advisor for an e-commerce company. You receive a live JSON snapshot of HR data (attendance, punctuality, leave, overtime, schedules, and kiosk security events).

Produce a decision-support briefing. Respond with ONLY a JSON object matching this exact schema:
{
  "summary": "string - one or two sentence plain-language verdict on workforce health",
  "healthScore": "integer 0-100",
  "insights": [
    {
      "severity": "critical | warning | info | success",
      "category": "Attendance | Punctuality | Leave | Overtime | Scheduling | Workforce | Security",
      "title": "string - short headline",
      "message": "string - 1-2 sentences citing the real numbers from the data",
      "recommendation": "string - one concrete, actionable next step for the HR manager",
      "metric": "string | null - the key number behind this insight, e.g. '78%'"
    }
  ]
}

Rules:
- Use ONLY numbers that exist in the snapshot. Never invent employees, records, or statistics.
- Return 3 to 8 insights, most urgent first (critical insights first in the array).
- If there is almost no data, say so honestly in the summary, set healthScore around 40-60, and include one info insight about sparse data. Do not fabricate recommendations.
- If security.unresolved is non-empty, always include at least one Security insight; face mismatches are critical, failed PIN attempts are warnings.
- healthScore meaning: 90+ healthy, 75-89 solid with minor flags, 50-74 needs attention, below 50 critical.
- Keep every recommendation concrete and actionable by a busy HR manager.
PROMPT;
    }

    private function normalize(array $decoded): array
    {
        $summary = is_string($decoded['summary'] ?? null) ? $decoded['summary'] : 'The AI briefed your workforce health from the current data.';
        $healthScore = is_numeric($decoded['healthScore'] ?? null)
            ? max(0, min(100, (int) round((float) $decoded['healthScore'])))
            : 50;

        $raw = is_array($decoded['insights'] ?? null) ? $decoded['insights'] : [];
        $insights = [];
        foreach ($raw as $i => $insight) {
            if (! is_array($insight)) {
                continue;
            }

            $severity = in_array($insight['severity'] ?? null, self::SEVERITIES, true) ? $insight['severity'] : 'info';

            $category = is_string($insight['category'] ?? null) ? $insight['category'] : 'Workforce';
            $title = (string) ($insight['title'] ?? 'Insight');

            $insights[] = [
                'id' => is_string($insight['id'] ?? null) && $insight['id'] !== '' ? $insight['id'] : 'ai-'.($i + 1),
                'severity' => $severity,
                'category' => $category,
                'title' => $title,
                'message' => (string) ($insight['message'] ?? ''),
                'recommendation' => (string) ($insight['recommendation'] ?? ''),
                'metric' => isset($insight['metric']) && $insight['metric'] !== null && $insight['metric'] !== ''
                    ? (string) $insight['metric']
                    : null,
                'resolveKey' => 'ai:'.$category.':'.$title,
            ];
        }

        usort($insights, fn ($a, $b) => self::SEVERITY_ORDER[$a['severity']] <=> self::SEVERITY_ORDER[$b['severity']]);

        return [
            'source' => 'ai',
            'generatedAt' => now()->toISOString(),
            'healthScore' => $healthScore,
            'summary' => $summary,
            'insights' => $this->withResolution(array_values($insights)),
            'queue' => $this->approvalQueue(),
        ];
    }

    public function ruleBasedInsights(): array
    {
        $since = Carbon::now()->subDays(self::WINDOW_DAYS - 1)->startOfDay();

        $rows = Attendance::join('employees', 'employees.id', '=', 'attendance.employee_id')
            ->where('attendance.date', '>=', $since->toDateString())
            ->get([
                'attendance.employee_id',
                'attendance.status',
                'attendance.overtime',
                'employees.first_name',
                'employees.last_name',
                'employees.department',
            ]);

        $stats = [];
        foreach ($rows as $row) {
            $id = $row->employee_id;
            $stats[$id] ??= [
                'name' => trim($row->first_name.' '.$row->last_name),
                'department' => $row->department,
                'present' => 0,
                'late' => 0,
                'absent' => 0,
                'total' => 0,
                'overtimeSum' => 0.0,
            ];
            $stats[$id]['total']++;
            $stats[$id]['overtimeSum'] += (float) $row->overtime;
            match ($row->status) {
                'Present' => $stats[$id]['present']++,
                'Late' => $stats[$id]['late']++,
                'Absent' => $stats[$id]['absent']++,
                default => null,
            };
        }

        $insights = [];
        $penalties = 0.0;

        $totalRecords = array_sum(array_column($stats, 'total'));
        $workedRecords = array_sum(array_column($stats, 'present')) + array_sum(array_column($stats, 'late'));

        if ($totalRecords === 0) {
            $insights[] = $this->make(
                'not-enough-data',
                'info',
                'Workforce',
                'Not enough data yet',
                'No attendance has been recorded in the last '.self::WINDOW_DAYS.' days, so reliable insights cannot be generated yet.',
                'Log a few days of attendance first, then come back here for recommendations.',
                '0 records'
            );
        } else {
            $rate = round(($workedRecords / $totalRecords) * 100, 1);
            if ($rate < self::LOW_ATTENDANCE_RATE) {
                $penalties += (self::LOW_ATTENDANCE_RATE - $rate) * 0.4;
                $insights[] = $this->make(
                    'low-attendance',
                    'critical',
                    'Attendance',
                    "Attendance rate is {$rate}%",
                    "Only {$rate}% of the last ".self::WINDOW_DAYS.' days of records are present or late entries. Absences are dragging the team\'s reliability down.',
                    'Review the employees flagged below and follow up on their absences promptly.',
                    "{$rate}% · last ".self::WINDOW_DAYS.' days'
                );
            } else {
                $insights[] = $this->make(
                    'healthy-attendance',
                    'success',
                    'Attendance',
                    'Attendance is strong',
                    "The overall attendance rate is {$rate}% - above the ".self::LOW_ATTENDANCE_RATE."% target.",
                    'Keep the current pattern going; no action needed right now.',
                    "{$rate}% · last ".self::WINDOW_DAYS.' days'
                );
            }
        }

        foreach ($stats as $id => $stat) {
            if ($stat['late'] >= self::LATE_THRESHOLD) {
                $penalties += 3;
                $insights[] = $this->make(
                    "late-{$id}",
                    'warning',
                    'Punctuality',
                    "Repeated late arrivals - {$stat['name']}",
                    "{$stat['name']} clocked in late {$stat['late']} time".($stat['late'] === 1 ? '' : 's').' in the last '.self::WINDOW_DAYS.' days.',
                    "Have a brief one-on-one with {$stat['name']} to understand the cause and reinforce the attendance policy.",
                    "{$stat['late']} late · last ".self::WINDOW_DAYS.' days'
                );
            }

            if ($stat['absent'] >= self::ABSENT_THRESHOLD) {
                $penalties += 3;
                $insights[] = $this->make(
                    "absent-{$id}",
                    'warning',
                    'Attendance',
                    "Repeated absences - {$stat['name']}",
                    "{$stat['name']} has {$stat['absent']} absence".($stat['absent'] === 1 ? '' : 's').' in the last '.self::WINDOW_DAYS.' days.',
                    "Check in on {$stat['name']} - repeated absences may signal burnout, illness, or personal issues that need support.",
                    "{$stat['absent']} absent · last ".self::WINDOW_DAYS.' days'
                );
            }

            $punctuality = ($stat['present'] + $stat['late']) > 0
                ? round(($stat['present'] / ($stat['present'] + $stat['late'])) * 100, 1)
                : null;
            if ($punctuality !== null && $punctuality < self::LOW_PUNCTUALITY && $stat['late'] < self::LATE_THRESHOLD) {
                $penalties += 2;
                $insights[] = $this->make(
                    "punctuality-{$id}",
                    'info',
                    'Punctuality',
                    "Punctuality below target - {$stat['name']}",
                    "{$stat['name']}'s punctuality score is {$punctuality}%, below the ".self::LOW_PUNCTUALITY.'% target.',
                    'Reinforce start-time expectations with the team and monitor next week.',
                    "{$punctuality}% · {$stat['late']} late"
                );
            }

            if ($stat['total'] > 0) {
                $avgOvertime = round($stat['overtimeSum'] / $stat['total'], 1);
                if ($avgOvertime > self::HIGH_AVG_OVERTIME) {
                    $penalties += 3;
                    $insights[] = $this->make(
                        "overtime-{$id}",
                        'warning',
                        'Overtime',
                        "Heavy overtime load - {$stat['name']}",
                        "{$stat['name']} averages {$avgOvertime}h of overtime per logged day - above the 1h/day comfort line.",
                        "Review {$stat['name']}'s workload. Sustained overtime risks burnout and raises labor costs.",
                        "{$avgOvertime}h/day avg"
                    );
                }
            }
        }

        $this->addTodayCoverageInsights($insights);
        $this->addApprovalQueueInsight($insights, $penalties);
        $this->addLeaveTrendInsight($insights);
        $this->addWorkforceInsight($insights);
        $this->addSecurityInsight($insights, $penalties);

        usort($insights, fn ($a, $b) => self::SEVERITY_ORDER[$a['severity']] <=> self::SEVERITY_ORDER[$b['severity']]);

        $healthScore = max(0, min(100, (int) round(100 - $penalties)));

        return [
            'source' => 'rule-based',
            'generatedAt' => now()->toISOString(),
            'healthScore' => $healthScore,
            'summary' => $this->summary($healthScore, $totalRecords),
            'insights' => $this->withResolution(array_values($insights)),
            'queue' => $this->approvalQueue(),
        ];
    }

    private function addSecurityInsight(array &$insights, float &$penalties): void
    {
        $faceMismatch = SecurityEvent::where('type', 'face_mismatch')->where('status', 'Open')->count();
        $pinFailed = SecurityEvent::where('type', 'pin_failed')->where('status', 'Open')->count();

        if ($faceMismatch + $pinFailed === 0) {
            return;
        }

        $penalties += ($faceMismatch > 0 ? 8 : 0) + ($pinFailed > 0 ? 3 : 0);

        if ($faceMismatch > 0 && $pinFailed > 0) {
            $message = "{$faceMismatch} unrecognized face attempt".($faceMismatch === 1 ? '' : 's').' and '.$pinFailed.' failed PIN attempt'.($pinFailed === 1 ? '' : 's').' at the entrance kiosk are still open.';
            $recommendation = 'Review the flagged events in the Decision Queue, escalate anything you cannot explain, and remind the team of the attendance policy.';
        } elseif ($faceMismatch > 0) {
            $message = "{$faceMismatch} unrecognized face attempt".($faceMismatch === 1 ? '' : 's').' at the entrance kiosk is still open.';
            $recommendation = 'Review the flagged events in the Decision Queue and escalate anything you cannot explain.';
        } else {
            $message = "{$pinFailed} failed PIN attempt".($pinFailed === 1 ? '' : 's').' at the entrance kiosk is still open.';
            $recommendation = 'Review the failed attempts in the Decision Queue and reset the kiosk PIN if you suspect unauthorized access.';
        }

        $insights[] = $this->make(
            'security-intruder-alert',
            $faceMismatch > 0 ? 'critical' : 'warning',
            'Security',
            $faceMismatch > 0 ? 'Unrecognized faces at the entrance kiosk' : 'Failed kiosk access attempts',
            $message,
            $recommendation,
            ($faceMismatch + $pinFailed).' open'
        );
    }

    private function addTodayCoverageInsights(array &$insights): void
    {
        $today = now()->toDateString();
        $scheduledToday = ShiftSchedule::where('date', $today)->pluck('employee_id');
        if ($scheduledToday->isEmpty()) {
            return;
        }

        $clockedToday = Attendance::where('date', $today)->pluck('employee_id');
        $noShows = $scheduledToday->diff($clockedToday)->values();

        if ($noShows->count() > 0) {
            $insights[] = $this->make(
                'no-show-today',
                'info',
                'Scheduling',
                'Potential no-shows today',
                $noShows->count().' scheduled employee'.($noShows->count() === 1 ? '' : 's').' ha'.($noShows->count() === 1 ? 's' : 've').' not clocked in yet today.',
                'Reach out to them now to confirm whether they will report for their shift.',
                $noShows->count().' scheduled · today'
            );
        }
    }

    private function addApprovalQueueInsight(array &$insights, float &$penalties): void
    {
        $pendingLeave = Leave::where('status', 'Pending')->count();
        $pendingOvertime = OvertimeRequest::where('status', 'Pending')->count();

        if ($pendingLeave + $pendingOvertime > 0) {
            $penalties += 2;
            $insights[] = $this->make(
                'pending-approvals',
                'warning',
                'Workforce',
                'Approval queue needs attention',
                "{$pendingLeave} leave request".($pendingLeave === 1 ? '' : 's').' and '.$pendingOvertime.' overtime request'.($pendingOvertime === 1 ? '' : 's').' are waiting for approval.',
                'Clearing the queue quickly keeps the team informed and planning accurate.',
                ($pendingLeave + $pendingOvertime).' pending'
            );
        } else {
            $insights[] = $this->make(
                'queue-clear',
                'success',
                'Workforce',
                'Approval queue is clear',
                'There are no pending leave or overtime requests right now.',
                'No action needed - everything is up to date.',
                '0 pending'
            );
        }
    }

    private function addLeaveTrendInsight(array &$insights): void
    {
        $thisMonth = $this->approvedLeaveCount('this');
        $lastMonth = $this->approvedLeaveCount('last');

        if ($lastMonth > 0 && $thisMonth >= $lastMonth * 1.5 && $thisMonth - $lastMonth >= 2) {
            $insights[] = $this->make(
                'leave-spike',
                'info',
                'Leave',
                'Leave requests are trending up',
                "Approved leave jumped from {$lastMonth} last month to {$thisMonth} this month.",
                'Confirm staffing coverage for the coming weeks if the trend continues.',
                "{$lastMonth} → {$thisMonth} approved"
            );
        }
    }

    private function addWorkforceInsight(array &$insights): void
    {
        $active = Employee::where('status', 'Active')->count();
        if ($active <= 0) {
            return;
        }

        $insights[] = $this->make(
            'workforce-size',
            'success',
            'Workforce',
            "{$active} active employee".($active === 1 ? '' : 's'),
            'The workforce is '.$active.' active employee'.($active === 1 ? '' : 's').' across your teams.',
            'Use the Analytics dashboard for a deeper breakdown by department.',
            $active.' active'
        );
    }

    private function approvedLeaveCount(string $month): int
    {
        $range = $month === 'last'
            ? [now()->subMonthNoOverflow()->startOfMonth()->toDateString(), now()->subMonthNoOverflow()->endOfMonth()->toDateString()]
            : [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()];

        return Leave::where('status', 'Approved')->whereBetween('start_date', $range)->count();
    }

    private function make(
        string $id,
        string $severity,
        string $category,
        string $title,
        string $message,
        string $recommendation,
        ?string $metric
    ): array {
        return [
            'id' => $id,
            'severity' => $severity,
            'category' => $category,
            'title' => $title,
            'message' => $message,
            'recommendation' => $recommendation,
            'metric' => $metric,
            'resolveKey' => $id,
        ];
    }

    private function withResolution(array $insights): array
    {
        $resolved = $this->resolvedInsightKeys();

        foreach ($insights as &$insight) {
            $key = is_string($insight['resolveKey'] ?? null) ? $insight['resolveKey'] : (string) ($insight['id'] ?? '');
            $insight['resolved'] = $key !== '' && in_array($key, $resolved, true);
        }

        return $insights;
    }

    public function setInsightResolved(string $key, bool $resolved): void
    {
        $keys = $this->resolvedInsightKeys();

        if ($resolved) {
            if (! in_array($key, $keys, true)) {
                $keys[] = $key;
            }
        } else {
            $keys = array_values(array_diff($keys, [$key]));
        }

        $setting = Setting::query()->firstOrCreate([]);
        $setting->update(['ai_resolved_insights' => array_values(array_unique($keys))]);
    }

    private function resolvedInsightKeys(): array
    {
        $setting = Setting::query()->firstOrCreate([]);
        $stored = $setting->ai_resolved_insights ?? [];

        return is_array($stored) ? array_values(array_filter($stored, 'is_string')) : [];
    }

    private function summary(int $score, int $totalRecords): string
    {
        if ($totalRecords === 0) {
            return 'Not enough data yet - log attendance to unlock reliable recommendations.';
        }
        if ($score >= 90) {
            return 'Your workforce is in great shape. Attendance and approvals look healthy.';
        }
        if ($score >= 75) {
            return 'Overall things look solid, but a few employees need attention.';
        }
        return 'There are issues to address - review the flagged insights below.';
    }
}

<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A notification sent TO an employee must reach that employee's bell, whatever its type. (An old
 * allow-list of eight types used to hide everything newer: shift changes, certificate deadlines,
 * clock-in/out confirmations, timesheet reminders...)
 */
class NotificationDeliveryTest extends TestCase
{
    use RefreshDatabase;

    private const EMPLOYEE_TYPES = [
        'shift_assigned', 'schedule_change', 'clock_out_reminder', 'attendance_clock_in', 'attendance_clock_out',
        'early_leave_auto_unpaid', 'early_leave_certificate_required', 'timesheet_submitted', 'timesheet_reminder',
        'timesheet_approved', 'timesheet_rejected', 'leave_approved', 'leave_rejected', 'overtime_approved',
    ];

    private function push(string $type, ?string $employeeId): void
    {
        if ($employeeId === null) {
            NotificationService::notifyAdmins($type, 'Title '.$type, 'Message', 'low', '/x');

            return;
        }

        NotificationService::notifyEmployee($employeeId, $type, 'Title '.$type, 'Message', 'low', '/x');
    }

    public function test_the_employee_receives_every_kind_of_notification_sent_to_them(): void
    {
        $employee = $this->otpEmployeeUser();
        foreach (self::EMPLOYEE_TYPES as $type) {
            $this->push($type, 'EMP-OTP');
        }

        $listed = $this->actingAs($employee)->getJson('/api/notifications/employee/EMP-OTP')->assertOk()->json('data');
        $this->assertEqualsCanonicalizing(self::EMPLOYEE_TYPES, array_column($listed, 'type'));

        $this->actingAs($employee)->getJson('/api/notifications/unread-count')->assertOk()->assertJsonPath('count', count(self::EMPLOYEE_TYPES));
    }

    public function test_an_employee_never_sees_admin_notifications_or_someone_elses(): void
    {
        $employee = $this->otpEmployeeUser();
        $this->push('leave_request', null);                 // meant for the admins
        $this->push('attendance_late', null);
        $this->push('attendance_clock_out', 'EMP-OTHER');   // meant for another employee
        $this->push('attendance_clock_in', 'EMP-OTP');

        $listed = $this->actingAs($employee)->getJson('/api/notifications/employee/EMP-OTP')->assertOk()->json('data');
        $this->assertSame(['attendance_clock_in'], array_column($listed, 'type'));
        $this->actingAs($employee)->getJson('/api/notifications/unread-count')->assertJsonPath('count', 1);
    }

    public function test_marking_all_as_read_clears_only_the_callers_notifications(): void
    {
        $employee = $this->otpEmployeeUser();
        $this->push('attendance_clock_in', 'EMP-OTP');
        $this->push('shift_assigned', 'EMP-OTP');
        $this->push('attendance_clock_in', 'EMP-OTHER');

        $this->actingAs($employee)->postJson('/api/notifications/read-all')->assertOk();

        $this->actingAs($employee)->getJson('/api/notifications/unread-count')->assertJsonPath('count', 0);
        $this->assertSame(1, Notification::where('employee_id', 'EMP-OTHER')->where('read', false)->count());
    }

    public function test_the_admin_bell_holds_the_admin_notifications_and_not_the_employees(): void
    {
        $admin = $this->adminUser();
        $this->push('attendance_late', null);
        $this->push('attendance_clock_in', 'EMP-OTP');

        $listed = $this->actingAs($admin)->getJson('/api/notifications')->assertOk()->json('data');
        $this->assertSame(['attendance_late'], array_column($listed, 'type'));
    }
}

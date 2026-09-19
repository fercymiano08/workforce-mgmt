<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\EarlyClockOut;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EarlyClockOutTest extends TestCase
{
    use RefreshDatabase;

    private function employee(string $id = 'EMP20260001'): Employee
    {
        return Employee::create([
            'id' => $id,
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'email' => $id.'@workforcepro.com',
            'department' => 'IT & Systems',
        ]);
    }

    private function scheduleToday(string $employeeId): void
    {
        ShiftDefinition::create([
            'id' => 'SHIFT004',
            'name' => 'Flexible Shift',
            'start_time' => '08:00:00',
            'end_time' => '17:00:00',
            'color' => '#3B82F6',
        ]);

        ShiftSchedule::create([
            'id' => 'SCH001',
            'employee_id' => $employeeId,
            'employee_name' => 'Juan Dela Cruz',
            'shift_id' => 'SHIFT004',
            'date' => now()->toDateString(),
            'status' => 'Scheduled',
        ]);
    }

    private function clockIn(string $employeeId): Attendance
    {
        $this->postJson('/api/kiosk/attendance', [
            'employeeId' => $employeeId,
            'date' => now()->toDateString(),
            'clockIn' => '08:00:00',
            'status' => 'Present',
            'location' => 'Main Entrance',
        ])->assertCreated();

        return Attendance::where('employee_id', $employeeId)->first();
    }

    public function test_early_clock_out_is_allowed_with_reason(): void
    {
        $this->employee();
        $record = $this->clockIn('EMP20260001');
        $this->scheduleToday('EMP20260001');

        $this->putJson('/api/kiosk/attendance/'.$record->id, [
            'clockOut' => '12:00:00',
            'regularHours' => 4,
            'overtime' => 0,
            'totalHours' => 4,
            'breakHours' => 0,
            'reasonCode' => 'SICK',
            'reasonNote' => 'Fever',
        ])->assertOk()
            ->assertJsonPath('data.status', 'Early Leave');

        $early = EarlyClockOut::where('attendance_id', $record->id)->first();
        $this->assertNotNull($early);
        $this->assertSame('SICK', $early->reason_code);
        $this->assertSame('PROVIDED', $early->reason_status);
        $this->assertSame('PENDING_REVIEW', $early->classification);
        $this->assertGreaterThan(0, $early->minutes_early);
        $this->assertSame('17:00', (string) $early->scheduled_end_time);
    }

    public function test_early_clock_out_without_reason_stays_pending(): void
    {
        $this->employee();
        $record = $this->clockIn('EMP20260001');
        $this->scheduleToday('EMP20260001');

        $this->putJson('/api/kiosk/attendance/'.$record->id, [
            'clockOut' => '12:00:00',
            'regularHours' => 4,
            'overtime' => 0,
            'totalHours' => 4,
            'breakHours' => 0,
        ])->assertOk();

        $early = EarlyClockOut::where('attendance_id', $record->id)->first();
        $this->assertNotNull($early);
        $this->assertSame('PENDING', $early->reason_status);
        $this->assertNull($early->reason_code);
    }

    public function test_reason_can_be_added_after_the_punch(): void
    {
        $this->employee();
        $record = $this->clockIn('EMP20260001');
        $this->scheduleToday('EMP20260001');

        $this->putJson('/api/kiosk/attendance/'.$record->id, [
            'clockOut' => '12:00:00',
            'regularHours' => 4,
            'overtime' => 0,
            'totalHours' => 4,
            'breakHours' => 0,
        ])->assertOk();

        $early = EarlyClockOut::where('attendance_id', $record->id)->first();

        $employeeUser = User::factory()->create([
            'employee_id' => 'EMP20260001',
            'name' => 'Juan Dela Cruz',
            'email' => 'juan@workforcepro.com',
            'role' => 'Employee',
            'role_label' => 'Employee',
            'avatar_seed' => 'Juan',
        ]);

        $this->actingAs($employeeUser)
            ->putJson('/api/attendance/early-outs/'.$early->id.'/reason', [
                'reasonCode' => 'FAMILY_EMERGENCY',
                'reasonNote' => 'Went to the hospital.',
            ])->assertOk()
            ->assertJsonPath('data.reasonCode', 'FAMILY_EMERGENCY')
            ->assertJsonPath('data.reasonStatus', 'PROVIDED');
    }

    public function test_admin_can_classify_an_early_clock_out(): void
    {
        $this->employee();
        $record = $this->clockIn('EMP20260001');
        $this->scheduleToday('EMP20260001');

        $this->putJson('/api/kiosk/attendance/'.$record->id, [
            'clockOut' => '12:00:00',
            'reasonCode' => 'PERSONAL_EMERGENCY',
        ])->assertOk();

        $early = EarlyClockOut::where('attendance_id', $record->id)->first();

        $this->actingAs($this->adminUser())
            ->postJson('/api/attendance/early-outs/'.$early->id.'/classify', [
                'classification' => 'EXCUSED_SICK',
            ])->assertOk()
            ->assertJsonPath('data.classification', 'EXCUSED_SICK');

        $this->assertDatabaseHas('early_clock_outs', [
            'id' => $early->id,
            'classification' => 'EXCUSED_SICK',
        ]);
    }

    public function test_admin_can_list_early_clock_outs(): void
    {
        $this->employee();
        $record = $this->clockIn('EMP20260001');
        $this->scheduleToday('EMP20260001');

        $this->putJson('/api/kiosk/attendance/'.$record->id, [
            'clockOut' => '12:00:00',
            'reasonCode' => 'OTHER',
        ])->assertOk();

        $this->actingAs($this->adminUser())
            ->getJson('/api/attendance/early-outs')
            ->assertOk()
            ->assertJsonStructure(['data'])
            ->assertJsonCount(1, 'data');
    }
}
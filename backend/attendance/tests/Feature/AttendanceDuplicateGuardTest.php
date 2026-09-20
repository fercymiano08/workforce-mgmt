<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** One attendance record per person per day - by application check AND by database constraint. */
class AttendanceDuplicateGuardTest extends TestCase
{
    use RefreshDatabase;

    private function employee(): Employee
    {
        return Employee::create([
            'id' => 'EMP20260001', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz',
            'email' => 'juan@workforcepro.com', 'department' => 'IT & Systems',
        ]);
    }

    private function payload(): array
    {
        return [
            'employeeId' => 'EMP20260001', 'date' => '2026-09-21',
            'clockIn' => '08:00:00', 'clockOut' => '17:00:00', 'status' => 'Present',
        ];
    }

    public function test_the_admin_cannot_add_a_second_record_for_the_same_day(): void
    {
        $this->employee();
        $admin = $this->adminUser();

        $this->actingAs($admin)->postJson('/api/attendance', $this->payload())->assertCreated();
        $this->actingAs($admin)->postJson('/api/attendance', $this->payload())
            ->assertStatus(422)
            ->assertJsonValidationErrors('date');

        $this->assertSame(1, Attendance::count());
    }

    public function test_the_database_itself_refuses_a_duplicate(): void
    {
        $this->employee();
        Attendance::create(['id' => 'ATT001', 'employee_id' => 'EMP20260001', 'date' => '2026-09-21', 'status' => 'Present']);

        $this->expectException(UniqueConstraintViolationException::class);
        Attendance::create(['id' => 'ATT002', 'employee_id' => 'EMP20260001', 'date' => '2026-09-21', 'status' => 'Present']);
    }

    public function test_a_different_day_is_fine(): void
    {
        $this->employee();
        Attendance::create(['id' => 'ATT001', 'employee_id' => 'EMP20260001', 'date' => '2026-09-21', 'status' => 'Present']);
        Attendance::create(['id' => 'ATT002', 'employee_id' => 'EMP20260001', 'date' => '2026-09-22', 'status' => 'Present']);

        $this->assertSame(2, Attendance::count());
    }
}

<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The standard shift templates must always exist (nothing can be scheduled
 * without them), and a second shift on the same day for the same person is a
 * duplicate that the server refuses.
 */
class ShiftTemplatesAndDuplicatesTest extends TestCase
{
    use RefreshDatabase;

    private ?\App\Models\User $admin = null;

    /** One admin per test (the factory email is unique). */
    private function admin(): \App\Models\User
    {
        return $this->admin ??= $this->adminUser();
    }

    private function employee(): Employee
    {
        return Employee::create([
            'id' => 'EMP20260001',
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'email' => 'juan@workforcepro.com',
        ]);
    }

    private function assign(string $shiftId = 'SHIFT004', string $date = '2030-01-15')
    {
        return $this->actingAs($this->admin())->postJson('/api/shifts/schedules', [
            'employeeId' => 'EMP20260001',
            'employeeName' => 'Juan Dela Cruz',
            'shiftId' => $shiftId,
            'date' => $date,
            'status' => 'Scheduled',
        ]);
    }

    public function test_standard_is_the_only_shift_template_on_a_fresh_database(): void
    {
        $standard = ShiftDefinition::find('SHIFT004');

        $this->assertNotNull($standard, 'the Standard Shift template must be present');
        $this->assertSame('Standard Shift', $standard->name);
        $this->assertSame('08:00', substr((string) $standard->start_time, 0, 5));
        $this->assertSame('17:00', substr((string) $standard->end_time, 0, 5));
        // Standard is the ONLY template: overtime is an extension of it, not a shift.
        $this->assertSame(1, ShiftDefinition::count());
        $this->assertNull(ShiftDefinition::find('SHIFT005'));
    }

    public function test_the_admin_can_list_the_default_templates(): void
    {
        $this->actingAs($this->admin())->getJson('/api/shifts')
            ->assertOk()
            ->assertJsonFragment(['id' => 'SHIFT004'])
            ->assertJsonFragment(['name' => 'Standard Shift']);
    }

    public function test_assigning_the_standard_shift_works(): void
    {
        $this->employee();

        $this->assign()->assertCreated();

        $this->assertSame(1, ShiftSchedule::count());
    }

    public function test_a_second_shift_on_the_same_day_is_refused(): void
    {
        $this->employee();

        $this->assign()->assertCreated();
        $this->assign('SHIFT004')->assertStatus(422)->assertJsonValidationErrors('date');

        $this->assertSame(1, ShiftSchedule::count());
    }

    public function test_the_same_person_can_work_on_different_days(): void
    {
        $this->employee();

        $this->assign('SHIFT004', '2030-01-15')->assertCreated();
        $this->assign('SHIFT004', '2030-01-16')->assertCreated();
    }

    public function test_an_unknown_shift_is_refused(): void
    {
        $this->employee();

        $this->assign('SHIFT999')->assertStatus(422)->assertJsonValidationErrors('shiftId');
    }

    public function test_automated_generation_uses_the_standard_shift(): void
    {
        $this->employee();

        $this->actingAs($this->admin())->postJson('/api/shifts/schedules/generate', [
            'shiftId' => 'SHIFT004',
            'startDate' => '2030-01-14',  // Monday
            'endDate' => '2030-01-18',    // Friday
            'skipWeekends' => true,
        ])->assertOk()
            ->assertJsonPath('data.created', 5);

        $this->assertSame(5, ShiftSchedule::where('shift_id', 'SHIFT004')->count());
    }

    public function test_running_generation_twice_does_not_duplicate(): void
    {
        $this->employee();
        $payload = ['shiftId' => 'SHIFT004', 'startDate' => '2030-01-14', 'endDate' => '2030-01-18'];

        $this->actingAs($this->admin())->postJson('/api/shifts/schedules/generate', $payload)->assertOk();
        $this->actingAs($this->admin())->postJson('/api/shifts/schedules/generate', $payload)
            ->assertOk()
            ->assertJsonPath('data.created', 0)
            ->assertJsonPath('data.skippedExisting', 5);

        $this->assertSame(5, ShiftSchedule::count());
    }

    public function test_the_database_itself_refuses_two_shifts_on_one_day(): void
    {
        $this->employee();
        \App\Models\ShiftSchedule::create(['id' => 'SCH001', 'employee_id' => 'EMP20260001', 'employee_name' => 'Juan', 'shift_id' => 'SHIFT004', 'date' => '2030-01-15', 'status' => 'Scheduled']);

        $this->expectException(\Illuminate\Database\UniqueConstraintViolationException::class);
        \App\Models\ShiftSchedule::create(['id' => 'SCH002', 'employee_id' => 'EMP20260001', 'employee_name' => 'Juan', 'shift_id' => 'SHIFT004', 'date' => '2030-01-15', 'status' => 'Scheduled']);
    }

    private function leave(string $status, string $start, string $end): void
    {
        \App\Models\Leave::create([
            'id' => 'LVE-'.$status.'-'.$start, 'employee_id' => 'EMP20260001', 'employee_name' => 'Juan Dela Cruz',
            'leave_type' => 'Vacation', 'start_date' => $start, 'end_date' => $end, 'reason' => 'Trip',
            'status' => $status, 'applied_date' => '2030-01-01',
        ]);
    }

    public function test_a_shift_cannot_be_assigned_on_a_day_of_approved_leave(): void
    {
        $this->employee();
        $this->leave('Approved', '2030-01-15', '2030-01-16');

        $this->assign('SHIFT004', '2030-01-15')->assertStatus(422)->assertJsonValidationErrors('date');
        $this->assign('SHIFT004', '2030-01-16')->assertStatus(422);   // last day of the leave counts too

        $this->assertSame(0, ShiftSchedule::count());
    }

    public function test_the_day_after_the_leave_is_fine(): void
    {
        $this->employee();
        $this->leave('Approved', '2030-01-15', '2030-01-16');

        $this->assign('SHIFT004', '2030-01-17')->assertCreated();
    }

    public function test_pending_or_rejected_leave_does_not_block_a_shift(): void
    {
        $this->employee();
        $this->leave('Pending', '2030-01-15', '2030-01-15');
        $this->leave('Rejected', '2030-01-16', '2030-01-16');

        $this->assign('SHIFT004', '2030-01-15')->assertCreated();
        $this->assign('SHIFT004', '2030-01-16')->assertCreated();
    }

    public function test_moving_a_shift_onto_a_leave_day_is_refused(): void
    {
        $this->employee();
        $this->leave('Approved', '2030-01-20', '2030-01-20');
        $id = $this->assign('SHIFT004', '2030-01-15')->assertCreated()->json('data.id');

        $this->actingAs($this->admin())->putJson('/api/shifts/schedules/'.$id, ['date' => '2030-01-20'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('date');

        $this->assertSame('2030-01-15', ShiftSchedule::find($id)->date->toDateString());
    }

    public function test_generation_skips_the_leave_days(): void
    {
        $this->employee();
        $this->leave('Approved', '2030-01-16', '2030-01-16');   // Wednesday

        $this->actingAs($this->admin())->postJson('/api/shifts/schedules/generate', [
            'shiftId' => 'SHIFT004', 'startDate' => '2030-01-14', 'endDate' => '2030-01-18',
        ])->assertOk()
            ->assertJsonPath('data.created', 4)
            ->assertJsonPath('data.skippedOnLeave', 1);
    }
}
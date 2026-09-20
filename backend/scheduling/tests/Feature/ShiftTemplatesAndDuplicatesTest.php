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

    public function test_the_flexible_shift_exists_on_a_fresh_database(): void
    {
        $flexible = ShiftDefinition::find('SHIFT004');

        $this->assertNotNull($flexible, 'the Flexible Shift template must be present');
        $this->assertSame('Flexible Shift', $flexible->name);
        $this->assertSame('08:00', substr((string) $flexible->start_time, 0, 5));
        $this->assertSame('17:00', substr((string) $flexible->end_time, 0, 5));
        $this->assertNotNull(ShiftDefinition::find('SHIFT005'));
    }

    public function test_the_admin_can_list_the_default_templates(): void
    {
        $this->actingAs($this->admin())->getJson('/api/shifts')
            ->assertOk()
            ->assertJsonFragment(['id' => 'SHIFT004'])
            ->assertJsonFragment(['name' => 'Flexible Shift']);
    }

    public function test_assigning_the_flexible_shift_works(): void
    {
        $this->employee();

        $this->assign()->assertCreated();

        $this->assertSame(1, ShiftSchedule::count());
    }

    public function test_a_second_shift_on_the_same_day_is_refused(): void
    {
        $this->employee();

        $this->assign()->assertCreated();
        $this->assign('SHIFT005')->assertStatus(422)->assertJsonValidationErrors('date');

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

    public function test_automated_generation_uses_the_flexible_shift(): void
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
}

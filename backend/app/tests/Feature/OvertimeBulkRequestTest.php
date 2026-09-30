<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\OvertimeRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * HR raising overtime for several people in one go.
 *
 * The group has to respect the per-person rules, but a rule tripping must not throw away the people
 * who were fine: one person who already has a request for that day cannot stop the other five from
 * being saved, or the administrator is left guessing which ones went through.
 */
class OvertimeBulkRequestTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2030-03-11 10:00:00', 'Asia/Manila'));   // Tuesday
        foreach ([['EMP900', 'Ana', 'Reyes'], ['EMP901', 'Ben', 'Cruz'], ['EMP902', 'Cara', 'Dalis']] as [$id, $fn, $ln]) {
            Employee::create(['id' => $id, 'first_name' => $fn, 'last_name' => $ln, 'email' => strtolower($id).'@x.com', 'department' => 'Ops', 'status' => 'Active']);
        }
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function admin(): User
    {
        return User::create(['email' => 'a@x.com', 'name' => 'HR', 'password' => bcrypt('Passw0rd!x'), 'role' => 'Administrator', 'role_label' => 'Admin']);
    }

    private function staff(): User
    {
        return User::create(['email' => 'e@x.com', 'name' => 'Ana', 'password' => bcrypt('Passw0rd!x'), 'role' => 'Employee', 'role_label' => 'Staff', 'employee_id' => 'EMP900']);
    }

    public function test_it_creates_one_request_per_person_selected(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/overtime/bulk', [
                'employeeIds' => ['EMP900', 'EMP901', 'EMP902'],
                'date' => '2030-03-11',
                'expectedHours' => 2,
                'reason' => 'Month-end close',
                'status' => 'Approved',
            ])
            ->assertCreated()
            ->assertJsonPath('message', '3 request(s) created.');

        $this->assertSame(3, OvertimeRequest::count());
        $this->assertSame(
            ['Ana Reyes', 'Ben Cruz', 'Cara Dalis'],
            OvertimeRequest::orderBy('employee_name')->pluck('employee_name')->all()
        );
        // HR decided it while raising it, so it is recorded as decided rather than left waiting.
        $this->assertSame(['Approved'], OvertimeRequest::distinct()->pluck('status')->all());
    }

    public function test_one_person_already_having_a_request_does_not_block_the_others(): void
    {
        OvertimeRequest::create([
            'id' => 'OT001', 'employee_id' => 'EMP901', 'employee_name' => 'Ben Cruz',
            'date' => '2030-03-11', 'reason' => 'earlier', 'status' => 'Pending', 'requested_date' => '2030-03-10',
        ]);

        $response = $this->actingAs($this->admin())
            ->postJson('/api/overtime/bulk', [
                'employeeIds' => ['EMP900', 'EMP901', 'EMP902'],
                'date' => '2030-03-11',
                'reason' => 'Month-end close',
                'status' => 'Pending',
            ])
            ->assertCreated();

        $this->assertCount(2, $response->json('data'));
        $this->assertSame([['employeeId' => 'EMP901', 'reason' => 'duplicate']], array_map(
            fn ($s) => ['employeeId' => $s['employeeId'], 'reason' => $s['reason']],
            $response->json('skipped')
        ));
        // The pre-existing one is untouched, and the two new ones exist.
        $this->assertSame(3, OvertimeRequest::count());
        $this->assertSame('earlier', OvertimeRequest::find('OT001')->reason);
    }

    public function test_somebody_no_longer_on_the_roster_is_reported_rather_than_silently_saved(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/overtime/bulk', [
                'employeeIds' => ['EMP900', 'EMP999'],
                'date' => '2030-03-11',
                'reason' => 'x',
                'status' => 'Pending',
            ])
            ->assertCreated()
            ->assertJsonPath('skipped.0.reason', 'not_found');

        $this->assertSame(1, OvertimeRequest::count());
    }

    public function test_an_employee_cannot_raise_overtime_for_other_people(): void
    {
        $this->actingAs($this->staff())
            ->postJson('/api/overtime/bulk', [
                'employeeIds' => ['EMP901'],
                'date' => '2030-03-11',
                'reason' => 'x',
                'status' => 'Approved',
            ])
            ->assertForbidden();

        $this->assertSame(0, OvertimeRequest::count());
    }

    public function test_nobody_selected_is_refused(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/overtime/bulk', [
                'employeeIds' => [],
                'date' => '2030-03-11',
                'reason' => 'x',
                'status' => 'Pending',
            ])
            ->assertStatus(422)->assertJsonValidationErrors('employeeIds');
    }

    public function test_hours_outside_a_day_are_refused(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/overtime/bulk', [
                'employeeIds' => ['EMP900'],
                'date' => '2030-03-11',
                'expectedHours' => 30,
                'reason' => 'x',
                'status' => 'Pending',
            ])
            ->assertStatus(422)->assertJsonValidationErrors('expectedHours');
    }

    public function test_the_same_person_cannot_be_ticked_twice(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/overtime/bulk', [
                'employeeIds' => ['EMP900', 'EMP900'],
                'date' => '2030-03-11',
                'reason' => 'x',
                'status' => 'Pending',
            ])
            ->assertStatus(422)->assertJsonValidationErrors('employeeIds.1');
    }
}

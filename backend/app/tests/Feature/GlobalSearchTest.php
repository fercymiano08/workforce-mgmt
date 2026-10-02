<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\AuditEvent;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Timesheet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The topbar's universal search. The rule under test is the whole point of it: the SAME box finds
 * everything for an administrator and only the signed-in employee's own records for an employee,
 * and that rule is enforced by the server, not by which endpoints the browser calls.
 */
class GlobalSearchTest extends TestCase
{
    use RefreshDatabase;

    private function person(string $id, string $first, string $last): Employee
    {
        return Employee::create(['id' => $id, 'first_name' => $first, 'last_name' => $last,
            'email' => strtolower($first).'@example.com', 'department' => 'Ops', 'position' => 'Analyst', 'status' => 'Active']);
    }

    private function account(Employee $e, string $role = 'Employee'): User
    {
        return User::factory()->create(['employee_id' => $e->id, 'name' => $e->first_name, 'email' => $e->email, 'role' => $role]);
    }

    private function records(Employee $e, string $suffix): void
    {
        Attendance::create(['id' => 'ATT'.$suffix, 'employee_id' => $e->id, 'date' => '2026-09-24', 'clock_in' => '08:05:00', 'clock_out' => '17:00:00', 'status' => 'Late']);
        Leave::create(['id' => 'LV'.$suffix, 'employee_id' => $e->id, 'employee_name' => $e->first_name, 'leave_type' => 'Sick', 'start_date' => '2026-09-25', 'end_date' => '2026-09-25', 'days' => 1, 'reason' => 'flu '.$suffix, 'status' => 'Approved', 'applied_date' => '2026-09-24']);
        Timesheet::create(['id' => 'TS'.$suffix, 'employee_id' => $e->id, 'employee_name' => $e->first_name, 'department' => 'Ops', 'date' => '2026-09-21', 'week_start' => '2026-09-21', 'week_end' => '2026-09-27', 'regular_hours' => 40, 'overtime_hours' => 0, 'total_hours' => 40, 'status' => 'Approved']);
    }

    private function search(User $as, string $q): array
    {
        return $this->actingAs($as)->getJson('/api/search?q='.urlencode($q))->assertOk()->json('data');
    }

    public function test_an_administrator_finds_any_kind_of_record_not_just_names(): void
    {
        $juan = $this->person('EMP1', 'Juan', 'Dela Cruz');
        $this->records($juan, 'J');
        $admin = User::factory()->create(['role' => 'Administrator']);

        $types = collect($this->search($admin, 'juan'))->pluck('type')->unique()->all();
        foreach (['employee', 'attendance', 'leave', 'timesheet'] as $expected) {
            $this->assertContains($expected, $types, "an admin searching a name should find their {$expected}");
        }

        // By status, by leave reason and by date rather than by name.
        $this->assertContains('attendance', collect($this->search($admin, 'late'))->pluck('type')->all());
        $this->assertContains('leave', collect($this->search($admin, 'flu'))->pluck('type')->all());
        $this->assertContains('attendance', collect($this->search($admin, '2026-09-24'))->pluck('type')->all());
    }

    public function test_one_letter_is_enough_and_every_word_has_to_match(): void
    {
        $this->person('EMP1', 'Juan', 'Dela Cruz');
        $admin = User::factory()->create(['role' => 'Administrator']);

        $this->assertNotEmpty($this->search($admin, 'j'));
        $this->assertSame([], $this->search($admin, 'juan zzzz'), 'a word that matches nothing rules the row out');
        $this->assertSame([], $this->search($admin, '   '));
    }

    public function test_a_month_name_matches_that_months_dates(): void
    {
        $juan = $this->person('EMP1', 'Juan', 'Dela Cruz');
        $this->records($juan, 'J');
        $admin = User::factory()->create(['role' => 'Administrator']);

        $this->assertContains('attendance', collect($this->search($admin, 'sep 24'))->pluck('type')->all());
        $this->assertSame([], collect($this->search($admin, 'march late'))->where('type', 'attendance')->all());
    }

    public function test_an_employee_only_ever_gets_their_own_records_and_never_the_directory_or_audit_trail(): void
    {
        $juan = $this->person('EMP1', 'Juan', 'Dela Cruz');
        $pedro = $this->person('EMP2', 'Pedro', 'Reyes');
        $this->records($juan, 'J');
        $this->records($pedro, 'P');
        AuditEvent::create(['service' => 'auth', 'event' => 'auth.login', 'entity_type' => 'User', 'entity_id' => '1', 'actor' => 'late night']);

        $juanAccount = $this->account($juan);
        $results = $this->search($juanAccount, 'late');
        $ids = collect($results)->pluck('id')->all();

        $this->assertContains('att:ATTJ', $ids, 'their own late record is found');
        $this->assertNotContains('att:ATTP', $ids, "someone else's record must never appear");
        $this->assertSame([], collect($results)->whereIn('type', ['employee', 'audit'])->all(), 'no directory, no audit trail');

        // Searching another person by name finds nothing of theirs.
        $this->assertSame([], collect($this->search($juanAccount, 'pedro'))->all());
        // Their own timesheets are searchable too.
        $this->assertContains('timesheet', collect($this->search($juanAccount, 'approved'))->pluck('type')->all());
    }

    public function test_search_requires_signing_in(): void
    {
        $this->getJson('/api/search?q=juan')->assertUnauthorized();
    }
}

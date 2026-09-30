<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\OvertimeRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The bulk endpoint the modal posts to. The feature test covers the rules; this one pins the exact
 * shape the frontend reads back, because a renamed key is a modal that saves rows and then reports
 * nothing happened.
 */
class OvertimeBulkShapeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2030-03-11 10:00:00', 'Asia/Manila'));
        Employee::create(['id' => 'EMP900', 'first_name' => 'Ana', 'last_name' => 'Reyes', 'email' => 'a@x.com', 'department' => 'Ops', 'status' => 'Active']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_the_response_gives_the_modal_the_data_and_skipped_arrays_it_expects(): void
    {
        $admin = User::create(['email' => 'h@x.com', 'name' => 'HR', 'password' => bcrypt('Passw0rd!x'), 'role' => 'Administrator', 'role_label' => 'Admin']);

        $response = $this->actingAs($admin)->postJson('/api/overtime/bulk', [
            'employeeIds' => ['EMP900'],
            'date' => '2030-03-11',
            'expectedHours' => 1.5,
            'reason' => 'Late close',
            'status' => 'Pending',
        ])->assertCreated();

        // The modal reads data.length, and skipped[].message / skipped[].employeeId.
        $this->assertIsArray($response->json('data'));
        $this->assertIsArray($response->json('skipped'));
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Pending', $response->json('data.0.status'));
        $this->assertSame('Ana Reyes', $response->json('data.0.employeeName'));
        $this->assertSame('1 request(s) created.', $response->json('message'));
        $this->assertSame(1, OvertimeRequest::count());
    }

    public function test_a_skipped_person_carries_a_message_the_modal_can_show(): void
    {
        $admin = User::create(['email' => 'h@x.com', 'name' => 'HR', 'password' => bcrypt('Passw0rd!x'), 'role' => 'Administrator', 'role_label' => 'Admin']);
        OvertimeRequest::create(['id' => 'OT900', 'employee_id' => 'EMP900', 'employee_name' => 'Ana Reyes', 'date' => '2030-03-11', 'reason' => 'x', 'status' => 'Pending', 'requested_date' => '2030-03-10']);

        $response = $this->actingAs($admin)->postJson('/api/overtime/bulk', [
            'employeeIds' => ['EMP900'],
            'date' => '2030-03-11',
            'reason' => 'Late close',
            'status' => 'Pending',
        ]);

        $this->assertSame('duplicate', $response->json('skipped.0.reason'));
        $this->assertStringContainsString('already has', $response->json('skipped.0.message'));
        // Nothing was created, so the modal has something to complain about rather than a false success.
        $this->assertCount(0, $response->json('data'));
        $this->assertSame(1, OvertimeRequest::count());
    }
}

<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrgStructureTest extends TestCase
{
    use RefreshDatabase;

    public function test_departments_require_authentication(): void
    {
        $this->getJson('/api/departments')->assertUnauthorized();
    }

    public function test_departments_are_listed_with_camel_case_shape(): void
    {
        $this->seedOrgStructure();
        $user = $this->adminUser();

        $this->actingAs($user)
            ->getJson('/api/departments')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', 'DEPT001')
            ->assertJsonPath('data.0.name', 'IT & Systems')
            ->assertJsonPath('data.0.employeeCount', 0)
            ->assertJsonStructure(['data' => [['id', 'name', 'employeeCount', 'location']]]);
    }

    public function test_roles_require_authentication(): void
    {
        $this->getJson('/api/roles')->assertUnauthorized();
    }

    public function test_roles_are_listed_with_department_metadata(): void
    {
        $this->seedOrgStructure();
        $user = $this->adminUser();

        $this->actingAs($user)
            ->getJson('/api/roles')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', 'ROLE001')
            ->assertJsonPath('data.0.departmentId', 'DEPT001')
            ->assertJsonPath('data.0.departmentName', 'IT & Systems')
            ->assertJsonPath('data.0.name', 'Software Developer');
    }

    public function test_roles_can_be_filtered_by_department(): void
    {
        $this->seedOrgStructure();
        $user = $this->adminUser();

        $this->actingAs($user)
            ->getJson('/api/roles?department_id=DEPT002')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Cashier');
    }
}

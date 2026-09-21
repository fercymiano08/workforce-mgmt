<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * This service keeps a read-only copy of the attendance table. When the attendance service gains a column
 * the copy must gain it too, or the once-a-minute sync fails and timesheets stop updating.
 */
class ReplicaSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_attendance_copy_has_every_column_the_attendance_service_sends(): void
    {
        foreach (['id', 'employee_id', 'date', 'clock_in', 'clock_out', 'actual_clock_out', 'status', 'overtime', 'regular_hours', 'total_hours', 'break_hours', 'location', 'notes'] as $column) {
            $this->assertTrue(Schema::hasColumn('attendance', $column), "attendance copy is missing `{$column}`");
        }
    }
}

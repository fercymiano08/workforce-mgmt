<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What automatic scheduling needs to remember, all owned by the scheduling service:
 *  - schedule_settings   one row: is automatic scheduling on, when it runs, how far ahead, the usual work days
 *  - work_patterns       who works which days (per department or per employee) - overrides the usual days
 *  - holidays            days nobody is scheduled
 *  - coverage_rules      the minimum number of scheduled people per department per day
 *  - schedule_batches    every generation (manual or automatic) so it can be reviewed and undone
 *  - schedule_batch_items which schedules each batch created
 * (Batch membership lives in its own table on purpose: shift_schedules is copied to other services, and
 *  adding a column there would break their copies.)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schedule_settings', function (Blueprint $table) {
            $table->unsignedSmallInteger('id')->primary();
            $table->boolean('auto_enabled')->default(false);
            $table->unsignedTinyInteger('run_day')->default(5);        // ISO weekday the job runs on: 1 = Monday ... 7 = Sunday
            $table->unsignedTinyInteger('run_hour')->default(17);      // Manila hour, 0-23
            $table->unsignedTinyInteger('weeks_ahead')->default(1);
            $table->json('default_work_days')->nullable();             // [1,2,3,4,5]
            $table->string('shift_id', 20)->nullable();                // null = the standard shift
            $table->timestamps();
        });

        Schema::create('work_patterns', function (Blueprint $table) {
            $table->id();
            $table->string('scope', 20);                               // department | employee
            $table->string('scope_key', 100);                          // the department name, or the employee id
            $table->json('work_days');                                 // ISO weekdays, e.g. [1,2,3,4,5,6]
            $table->timestamps();
            $table->unique(['scope', 'scope_key']);
        });

        Schema::create('holidays', function (Blueprint $table) {
            $table->id();
            $table->date('date')->unique();
            $table->string('name', 120);
            $table->timestamps();
        });

        Schema::create('coverage_rules', function (Blueprint $table) {
            $table->id();
            $table->string('department', 100)->unique();
            $table->unsignedInteger('min_staff');
            $table->timestamps();
        });

        Schema::create('schedule_batches', function (Blueprint $table) {
            $table->string('id', 20)->primary();
            $table->string('source', 20);                              // manual | automatic
            $table->string('created_by', 150)->nullable();
            $table->date('start_date');
            $table->date('end_date');
            $table->string('shift_id', 20)->nullable();
            $table->unsignedInteger('created_count')->default(0);
            $table->json('summary')->nullable();
            $table->string('status', 20)->default('Published');        // Published | Undone
            $table->timestamp('undone_at')->nullable();
            $table->string('undone_by', 150)->nullable();
            $table->timestamps();
        });

        Schema::create('schedule_batch_items', function (Blueprint $table) {
            $table->id();
            $table->string('batch_id', 20)->index();
            $table->string('schedule_id', 20)->unique();
        });

        DB::table('schedule_settings')->insert([
            'id' => 1, 'auto_enabled' => false, 'run_day' => 5, 'run_hour' => 17, 'weeks_ahead' => 1,
            'default_work_days' => json_encode([1, 2, 3, 4, 5]), 'shift_id' => null, 'created_at' => now(), 'updated_at' => now(),
        ]);

        // Philippine holidays with a fixed date (regular and special non-working), plus 2026's moving ones.
        // HR can add, rename and remove holidays on the Shifts page - this is only a starting point.
        $holidays = [
            ['2026-01-01', "New Year's Day"], ['2026-04-02', 'Maundy Thursday'], ['2026-04-03', 'Good Friday'],
            ['2026-04-09', 'Araw ng Kagitingan'], ['2026-05-01', 'Labor Day'], ['2026-06-12', 'Independence Day'],
            ['2026-08-21', 'Ninoy Aquino Day'], ['2026-08-31', 'National Heroes Day'], ['2026-11-01', "All Saints' Day"],
            ['2026-11-30', 'Bonifacio Day'], ['2026-12-08', 'Feast of the Immaculate Conception'], ['2026-12-25', 'Christmas Day'],
            ['2026-12-30', 'Rizal Day'], ['2026-12-31', "New Year's Eve"],
            ['2027-01-01', "New Year's Day"], ['2027-04-09', 'Araw ng Kagitingan'], ['2027-05-01', 'Labor Day'],
            ['2027-06-12', 'Independence Day'], ['2027-11-30', 'Bonifacio Day'], ['2027-12-25', 'Christmas Day'], ['2027-12-30', 'Rizal Day'],
        ];
        foreach ($holidays as [$date, $name]) {
            DB::table('holidays')->insertOrIgnore(['date' => $date, 'name' => $name, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        foreach (['schedule_batch_items', 'schedule_batches', 'coverage_rules', 'holidays', 'work_patterns', 'schedule_settings'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};

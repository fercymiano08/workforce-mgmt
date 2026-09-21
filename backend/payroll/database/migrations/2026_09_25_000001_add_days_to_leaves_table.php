<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A leave request now stores how many WORKING days it costs (weekends, holidays and days off excluded).
 * The time-off service owns the table; the other services keep a read-only copy of it, and their copy must
 * have the same columns or the once-a-minute sync from time-off fails.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('leaves', 'days')) {
            Schema::table('leaves', function (Blueprint $table) {
                $table->decimal('days', 5, 1)->nullable()->after('end_date');
            });
        }

    }

    public function down(): void
    {
        Schema::table('leaves', function (Blueprint $table) {
            $table->dropColumn('days');
        });
    }
};

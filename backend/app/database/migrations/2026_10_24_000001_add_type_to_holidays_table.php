<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Philippine holidays are not all paid the same when worked: a regular holiday pays 200%, a
 * special (non-working) day pays 130% (DOLE Labor Advisory on holiday pay). The holidays table
 * never distinguished the two, so every row seeded so far is backfilled here by name - the names
 * are fixed government-declared holidays, not demo data, so matching on them is reliable.
 */
return new class extends Migration
{
    private const SPECIAL_NON_WORKING = [
        'Ninoy Aquino Day',
        "All Saints' Day",
        'Feast of the Immaculate Conception',
        "New Year's Eve",
    ];

    public function up(): void
    {
        Schema::table('holidays', function (Blueprint $table) {
            $table->string('type', 20)->default('regular')->after('name');
        });

        DB::table('holidays')->whereIn('name', self::SPECIAL_NON_WORKING)->update(['type' => 'special_non_working']);
    }

    public function down(): void
    {
        Schema::table('holidays', function (Blueprint $table) {
            $table->dropColumn('type');
        });
    }
};

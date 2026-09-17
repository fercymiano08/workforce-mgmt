<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            // 128-value face-api.js descriptor captured at registration, used
            // for real client-computed face matching at the kiosk (Euclidean
            // distance comparison happens server-side in KioskController).
            $table->json('face_descriptor')->nullable()->after('face_image');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn('face_descriptor');
        });
    }
};

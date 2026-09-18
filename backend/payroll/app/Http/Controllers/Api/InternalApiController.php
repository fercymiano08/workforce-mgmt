<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\TimesheetGenerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Machine-to-machine endpoints for the Payroll service. Only peers presenting
 * the shared SERVICE_TOKEN (X-Service-Token header) may call these.
 * syncForEmployee / rebuildTimesheets let the Attendance service trigger
 * timesheet generation over HTTP instead of writing the payroll DB directly.
 */
class InternalApiController extends Controller
{
    /** @var list<string> Tables this service owns (served to peers on request). */
    protected array $ownedTables = ['timesheets'];

    public function snapshot(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $snapshot = [];
        foreach ($this->ownedTables as $table) {
            $snapshot[$table] = DB::table($table)->orderBy('id')->get();
        }

        return response()->json(['data' => $snapshot]);
    }

    public function syncForEmployee(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $data = $request->validate([
            'employeeId' => 'required|string|max:20',
        ]);

        $timesheet = app(TimesheetGenerationService::class)
            ->syncForEmployee($data['employeeId'], ($data['date'] ?? now()->toDateString()));

        return response()->json(['data' => $timesheet?->toApiArray()]);
    }

    public function rebuildTimesheets(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $count = app(TimesheetGenerationService::class)->regenerateAll();

        return response()->json(['data' => ['regenerated' => $count]]);
    }

    public function syncEmployee(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $data = $request->all();
        if (empty($data['id'])) {
            abort(422, 'Missing employee id');
        }

        DB::table('employees')->updateOrInsert(['id' => $data['id']], $data);

        return response()->json(['data' => ['synced' => true]]);
    }

    protected function authorizeService(Request $request): void
    {
        $token = (string) $request->header('X-Service-Token', '');
        $expected = (string) config('svc.token', '');

        if ($expected === '' || ! hash_equals($expected, $token)) {
            abort(403, 'Unauthorized');
        }
    }
}
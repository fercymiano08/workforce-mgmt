<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Controller;
use App\Services\PayRecordService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PayRecordController extends Controller
{
    use AuthorizesEmployeeScope;

    /**
     * Self-service pay record. An employee may only pull their own record;
     * administrators may pull any employee's record.
     */
    public function byEmployee(Request $request, string $employeeId): JsonResponse
    {
        $this->assertSelfOrAdmin($request, $employeeId);

        $record = (new PayRecordService)->payRecordFor($employeeId);

        return response()->json(['data' => $record]);
    }
}
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use Illuminate\Http\JsonResponse;

class DepartmentController extends Controller
{
    public function index(): JsonResponse
    {
        $records = Department::orderBy('id')->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }
}

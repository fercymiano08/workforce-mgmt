<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Role::with('department');

        if ($request->filled('department_id')) {
            $query->where('department_id', $request->input('department_id'));
        }

        $records = $query->orderBy('id')->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }
}

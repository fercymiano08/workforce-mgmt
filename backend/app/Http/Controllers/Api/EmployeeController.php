<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Role;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Validator;

class EmployeeController extends Controller
{
    public function index(): JsonResponse
    {
        $employees = Employee::orderBy('id')->get();

        return response()->json(['data' => $employees->map->toApiArray()->values()]);
    }

    public function show(string $id): JsonResponse
    {
        $employee = Employee::find($id);
        if (! $employee) {
            return response()->json(['message' => 'Employee not found'], 404);
        }

        return response()->json(['data' => $employee->toApiArray()]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validateData($request);

        $password = (string) $request->input('password');
        if ($password === '') {
            throw ValidationException::withMessages(['password' => ['Password is required.']]);
        }

        $nextId = $this->nextId();

        $employee = DB::transaction(function () use ($validated, $nextId, $request, $password): Employee {
            $employee = Employee::create([
                ...$validated,
                'id' => $nextId,
                'face_registered' => $request->input('faceRegistered', false),
                'face_image' => $request->input('faceImage'),
                'face_descriptor' => $request->input('faceDescriptor'),
                'face_registered_at' => $request->input('faceRegisteredAt'),
            ]);

            User::create([
                'employee_id' => $employee->id,
                'name' => trim($request->input('firstName', '').' '.$request->input('lastName', '')),
                'email' => $employee->email,
                'password' => $password,
                'role' => 'Employee',
                'role_label' => 'Employee',
                'avatar_seed' => $request->input('firstName'),
            ]);

            return $employee;
        });

        NotificationService::notifyAdmins(
            'employee_added',
            'New Employee Added',
            "{$employee->first_name} {$employee->last_name} ({$employee->id}) was added to the workforce.",
            'low',
            '/employees'
        );

        return response()->json(['data' => $employee->toApiArray()], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $employee = Employee::find($id);
        if (! $employee) {
            return response()->json(['message' => 'Employee not found'], 404);
        }

        $validated = $this->validateData($request, $id);

        DB::transaction(function () use ($employee, $validated, $request): void {
            $employee->update($validated);

            $user = User::where('employee_id', $employee->id)->first();
            if ($user) {
                $user->update([
                    'name' => trim($request->input('firstName', '').' '.$request->input('lastName', '')),
                    'email' => $employee->email,
                ]);
            }
        });

        return response()->json(['data' => $employee->fresh()->toApiArray()]);
    }

    public function destroy(string $id): JsonResponse
    {
        $employee = Employee::find($id);
        if (! $employee) {
            return response()->json(['message' => 'Employee not found'], 404);
        }

        DB::transaction(function () use ($employee): void {
            User::where('employee_id', $employee->id)->delete();
            $employee->delete();
        });

        return response()->json(['success' => true]);
    }

    public function registerFace(Request $request, string $id): JsonResponse
    {
        $employee = Employee::find($id);
        if (! $employee) {
            return response()->json(['message' => 'Employee not found'], 404);
        }

        $faceImage = $request->input('faceImage');
        if (! $faceImage) {
            return response()->json(['message' => 'Face image is required'], 422);
        }

        $request->validate([
            'faceDescriptor' => 'nullable|array|size:128',
            'faceDescriptor.*' => 'numeric',
        ]);

        $employee->update([
            'face_registered' => true,
            'face_image' => $faceImage,
            'face_descriptor' => $request->input('faceDescriptor'),
            'face_registered_at' => now(),
        ]);

        return response()->json(['data' => $employee->fresh()->toApiArray()]);
    }

    /**
     * The logged-in user's own employee profile (self-service). Administrator
     * accounts have no employee_id / Employee record in this data model, so
     * this 404s for them rather than pretending there's a profile to show.
     */
    public function myProfile(Request $request): JsonResponse
    {
        $employee = $this->resolveOwnEmployee($request);
        if (! $employee) {
            return response()->json(['message' => 'No employee profile is associated with this account.'], 404);
        }

        return response()->json(['data' => $employee->toApiArray()]);
    }

    /**
     * Self-service update, deliberately limited to personal-contact fields
     * and the profile photo. Name, email, department, position, salary, and
     * status stay HR-controlled via the admin-only update() above.
     */
    public function updateMyProfile(Request $request): JsonResponse
    {
        $employee = $this->resolveOwnEmployee($request);
        if (! $employee) {
            return response()->json(['message' => 'No employee profile is associated with this account.'], 404);
        }

        $validated = $request->validate([
            'phone' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'emergencyContact' => 'nullable|string|max:100',
            'emergencyPhone' => 'nullable|string|max:50',
            'avatar' => 'nullable|string',
        ]);

        $employee->update(Employee::apiFillable($validated));

        return response()->json(['data' => $employee->fresh()->toApiArray()]);
    }

    private function resolveOwnEmployee(Request $request): ?Employee
    {
        $employeeId = $request->user()?->employee_id;
        if (! $employeeId) {
            return null;
        }

        return Employee::find($employeeId);
    }

    private function validateData(Request $request, ?string $id = null): array
    {
        $rules = [
            'firstName' => 'required|string|max:100',
            'lastName' => 'required|string|max:100',
            'email' => [
                'required', 'email',
                Rule::unique('employees', 'email')->ignore($id, 'id'),
            ],
            'phone' => 'nullable|string|max:50',
            'department' => 'nullable|string|max:100',
            'position' => 'nullable|string|max:100',
            'employmentType' => 'nullable|string|max:50',
            'status' => 'nullable|string|max:50',
            'hireDate' => 'nullable|date|before_or_equal:today',
            'salary' => 'nullable|numeric',
            'manager' => 'nullable|string|max:20',
            'avatar' => 'nullable|string',
            'address' => 'nullable|string',
            'dateOfBirth' => 'nullable|date',
            'gender' => 'nullable|string|max:20',
            'bloodGroup' => 'nullable|string|max:10',
            'emergencyContact' => 'nullable|string|max:100',
            'emergencyPhone' => 'nullable|string|max:50',
            'skills' => 'nullable|array',
            'education' => 'nullable|array',
            'leaveBalances' => 'nullable|array',
            'password' => 'nullable|string|min:8',
        ];

        $validator = Validator::make($request->all(), $rules);

        $validator->after(function ($validator) use ($request, $id): void {
            $department = $request->input('department');
            $position = $request->input('position');
            if ($department && $position && Role::where('name', $position)->exists()
                && ! Role::where('name', $position)
                    ->whereHas('department', fn ($q) => $q->where('name', $department))
                    ->exists()) {
                $validator->errors()->add('position', 'The position does not belong to the selected department.');
            }

            $email = $request->input('email');
            if ($email) {
                $query = User::where('email', $email);
                if ($id) {
                    $query->where(function ($q) use ($id) {
                        $q->whereNull('employee_id')->orWhere('employee_id', '!=', $id);
                    });
                }
                if ($query->exists()) {
                    $validator->errors()->add('email', 'This email is already in use by an account.');
                }
            }
        });

        if ($validator->fails()) {
            throw new ValidationException($validator);
        }

        return Employee::apiFillable($validator->validated());
    }

    private function nextId(): string
    {
        for ($attempt = 0; $attempt < 20; $attempt++) {
            $id = 'EMP'.now()->format('Y').str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
            if (! Employee::where('id', $id)->exists()) {
                return $id;
            }
        }

        return 'EMP'.now()->format('Y').str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

class EmployeeController extends Controller
{
    public function index(): JsonResponse
    {
        // The list stays light: the ~40 KB face photo and the 128-number descriptor
        // of every employee would otherwise ride along on each page load. They are
        // returned by show() when a single record is opened.
        $employees = Employee::orderBy('id')->get()->each->makeHidden(['face_image', 'face_descriptor']);

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


        AuditLogger::record(
            'core',
            'employee.created',
            'Employee',
            $employee->id,
            actor: $request->user()?->name,
            actorId: $request->user()?->email ?: null,
            after: $employee->fresh()->toApiArray(),
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

        $before = $employee->toApiArray();

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


        $user = $request->user();
        AuditLogger::record(
            'core',
            'employee.updated',
            'Employee',
            $employee->id,
            actor: $user?->name,
            actorId: $user?->email ?: null,
            before: $before,
            after: $employee->fresh()->toApiArray(),
            meta: ['id' => $employee->id],
        );

        return response()->json(['data' => $employee->fresh()->toApiArray()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $employee = Employee::find($id);
        if (! $employee) {
            return response()->json(['message' => 'Employee not found'], 404);
        }

        AuditLogger::record(
            'core',
            'employee.deleted',
            'Employee',
            $employee->id,
            actor: $request->user()?->name,
            actorId: $request->user()?->email ?: null,
            before: $employee->toApiArray(),
        );

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


        $user = $request->user();
        AuditLogger::record(
            'core',
            'employee.face_registered',
            'Employee',
            $employee->id,
            actor: $user?->name,
            actorId: $user?->email ?: null,
            after: $employee->fresh()->toApiArray(),
        );

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

        // What the person needs to see on their own profile - NOT their salary (that is a payroll matter)
        // and NOT their face photo / face template (large, and the template is a biometric)
        $employee->makeHidden(['salary', 'face_image', 'face_descriptor']);

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

        // A phone number is digits with an optional +, spaces, dashes or brackets (7-20 characters).
        $phoneRule = ['nullable', 'string', 'regex:/^[0-9+()\-\s]{7,20}$/'];
        $validated = $request->validate([
            'phone' => $phoneRule,
            'address' => 'nullable|string|max:255',
            'emergencyContact' => 'nullable|string|max:100',
            'emergencyPhone' => $phoneRule,
            // A small picture only (the page shrinks it to 256px first): an image data URL under ~500 KB.
            'avatar' => 'nullable|string|max:700000|starts_with:data:image/',
        ], [
            'phone.regex' => 'Enter a valid phone number, for example +63 917 555 1234.',
            'emergencyPhone.regex' => 'Enter a valid emergency contact number, for example +63 917 555 1234.',
            'avatar.starts_with' => 'The profile photo must be an image.',
            'avatar.max' => 'That photo is too large. Please choose a smaller picture.',
        ]);

        $employee->update(Employee::apiFillable($validated));

        return response()->json(['data' => $employee->fresh()->makeHidden(['salary', 'face_image', 'face_descriptor'])->toApiArray()]);
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
            'password' => ['nullable', Password::min(8)->mixedCase()->numbers()],
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

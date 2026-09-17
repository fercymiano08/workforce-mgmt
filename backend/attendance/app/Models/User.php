<?php

namespace App\Models;

use App\Notifications\ResetPasswordNotification;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'employee_id', 'name', 'email', 'password', 'role', 'role_label', 'avatar_seed',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    /**
     * Shape the user exactly like the frontend AuthContext demo account:
     * { id, firstName, lastName, email, role, roleLabel, avatarSeed }.
     */
    public function toApiArray(): array
    {
        $parts = explode(' ', trim($this->name), 2);

        return [
            'id' => $this->employee_id ?? 'ADMIN',
            'firstName' => $parts[0] ?? '',
            'lastName' => $parts[1] ?? '',
            'email' => $this->email,
            'role' => $this->role,
            'roleLabel' => $this->role_label,
            'avatarSeed' => $this->avatar_seed,
            'permissions' => $this->permissions(),
        ];
    }

    /**
     * Permission list derived from the account role. Served by the API so the
     * frontend never ships a hard-coded permission table.
     *
     * @return list<string>
     */
    public function permissions(): array
    {
        if ($this->role === 'Administrator') {
            return [
                'employees.view', 'employees.create', 'employees.edit', 'employees.delete',
                'attendance.view', 'attendance.edit', 'attendance.approve',
                'leaves.view', 'leaves.approve', 'leaves.reject',
                'timesheets.view', 'timesheets.approve', 'timesheets.reject',
                'shifts.view', 'shifts.create', 'shifts.edit', 'shifts.delete',
                'reports.view', 'reports.generate', 'reports.export',
                'departments.view', 'departments.edit',
                'settings.view', 'settings.edit',
                'roles.view', 'roles.manage',
                'notifications.manage',
                'analytics.view', 'analytics.export',
                'payroll.view', 'payroll.process',
            ];
        }

        return [
            'employees.view_own',
            'attendance.view_own', 'attendance.clock_in', 'attendance.clock_out',
            'leaves.view_own', 'leaves.create',
            'timesheets.view_own', 'timesheets.submit',
            'shifts.view_own',
            'reports.view_own',
            'notifications.view_own',
        ];
    }

    /**
     * Point the reset link at the frontend SPA (which has its own
     * /reset-password page) instead of Laravel's default backend route.
     */
    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new ResetPasswordNotification($token));
    }
}

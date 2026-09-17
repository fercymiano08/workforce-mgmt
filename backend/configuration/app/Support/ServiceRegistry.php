<?php

namespace App\Support;

/*
|--------------------------------------------------------------------------
| Service Registry (microservice catalog)
|--------------------------------------------------------------------------
| The single source of truth describing every service in the system:
| its domain, the tables it owns, the endpoints it exposes, and which
| other services it depends on at runtime.
|
| The API gateway (routes/api.php) mounts each service's route file. This
| catalog documents the boundaries so each service can later become its own
| deployable process (Strangler Fig migration) without changing the frontend.
*/
class ServiceRegistry
{
    /**
     * @return array<int, array{
     *     key: string,
     *     name: string,
     *     domain: string,
     *     route_file: string,
     *     owns: array<int, string>,
     *     base_paths: array<int, string>,
     *     depends_on: array<int, string>
     * }>
     */
    public static function all(): array
    {
        return [
            [
                'key' => 'auth',
                'name' => 'Auth Service',
                'domain' => 'Identity & access control',
                'route_file' => 'routes/services/auth.php',
                'owns' => ['users', 'personal_access_tokens', 'password_reset_tokens', 'sessions'],
                'base_paths' => ['/api/auth/*'],
                'depends_on' => [],
            ],
            [
                'key' => 'identity',
                'name' => 'Identity Service',
                'domain' => 'People & organization',
                'route_file' => 'routes/services/identity.php',
                'owns' => ['employees', 'departments', 'roles'],
                'base_paths' => ['/api/employees/*', '/api/departments', '/api/roles', '/api/profile'],
                'depends_on' => ['auth'],
            ],
            [
                'key' => 'attendance',
                'name' => 'Attendance Service',
                'domain' => 'Time & attendance capture (+ Kiosk terminal)',
                'route_file' => 'routes/services/attendance.php',
                'owns' => ['attendance', 'security_events'],
                'base_paths' => ['/api/attendance/*', '/api/kiosk/*'],
                'depends_on' => ['auth', 'identity', 'scheduling'],
            ],
            [
                'key' => 'scheduling',
                'name' => 'Scheduling Service',
                'domain' => 'Shifts & schedules',
                'route_file' => 'routes/services/scheduling.php',
                'owns' => ['shift_definitions', 'shift_schedules'],
                'base_paths' => ['/api/shifts/*'],
                'depends_on' => ['auth', 'identity'],
            ],
            [
                'key' => 'timeoff',
                'name' => 'Time-Off Service',
                'domain' => 'Leaves & overtime',
                'route_file' => 'routes/services/timeoff.php',
                'owns' => ['leaves', 'overtime_requests'],
                'base_paths' => ['/api/leaves/*', '/api/overtime/*'],
                'depends_on' => ['auth', 'identity', 'attendance'],
            ],
            [
                'key' => 'payroll',
                'name' => 'Payroll Service',
                'domain' => 'Timesheets & hour reconciliation',
                'route_file' => 'routes/services/payroll.php',
                'owns' => ['timesheets'],
                'base_paths' => ['/api/timesheets/*'],
                'depends_on' => ['auth', 'identity', 'attendance', 'timeoff'],
            ],
            [
                'key' => 'intelligence',
                'name' => 'Intelligence Service',
                'domain' => 'Analytics & AI decision support',
                'route_file' => 'routes/services/intelligence.php',
                'owns' => ['analytics'],
                'base_paths' => ['/api/analytics/*'],
                'depends_on' => ['auth', 'attendance', 'timeoff'],
            ],
            [
                'key' => 'communications',
                'name' => 'Communications Service',
                'domain' => 'Notifications / bell inbox',
                'route_file' => 'routes/services/communications.php',
                'owns' => ['notifications'],
                'base_paths' => ['/api/notifications/*'],
                'depends_on' => ['auth', 'identity'],
            ],
            [
                'key' => 'configuration',
                'name' => 'Configuration Service',
                'domain' => 'App-wide settings',
                'route_file' => 'routes/services/configuration.php',
                'owns' => ['settings'],
                'base_paths' => ['/api/settings/*'],
                'depends_on' => ['auth'],
            ],
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function keys(): array
    {
        return array_map(static fn (array $service) => $service['key'], self::all());
    }
}
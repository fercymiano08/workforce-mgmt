<?php

namespace Database\Seeders;

use App\Models\AuditEvent;
use App\Models\Employee;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Loads backend/core/database/demo/core.json into the core database as real
 * rows: the 10 demo employees plus their audit trail. Dates are anchored to
 * the Monday of the current week in Manila. Not a single User (admin) row is
 * touched - John Delgado remains the only workforce admin.
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $demo = $this->demo('core');

        $this->seedEmployees($demo['employees'] ?? []);
        $this->seedAudit($demo['audit'] ?? []);
    }

    private function seedEmployees(array $rows): void
    {
        foreach ($rows as $row) {
            Employee::firstOrCreate(['id' => $row['id']], $this->employeeAttrs($row));
        }
    }

    private function seedAudit(array $rows): void
    {
        foreach ($rows as $row) {
            $createdAt = $this->dateTimeFor((int) $row['at']['w'], (int) $row['at']['d'], (string) $row['at']['t']);

            $exists = AuditEvent::where('service', $row['service'])
                ->where('event', $row['event'])
                ->where('entity_type', $row['entity_type'])
                ->where('entity_id', $row['entity_id'])
                ->where('created_at', $createdAt)
                ->exists();

            if ($exists) {
                continue;
            }

            $event = new AuditEvent([
                'service' => $row['service'],
                'event' => $row['event'],
                'entity_type' => $row['entity_type'],
                'entity_id' => $row['entity_id'],
                'actor' => $row['actor'],
                'actor_id' => $row['actor_id'] ?? null,
                'before' => $row['before'] ?? null,
                'after' => $row['after'] ?? null,
                'meta' => $row['meta'] ?? null,
            ]);
            $event->created_at = $createdAt;
            $event->save();
        }
    }

    private function demo(string $file): array
    {
        $path = database_path('demo/'.$file.'.json');
        if (! file_exists($path)) {
            return [];
        }

        return json_decode(file_get_contents($path), true);
    }

    private function employeeAttrs(array $row): array
    {
        return [
            'first_name' => $row['first_name'],
            'last_name' => $row['last_name'],
            'email' => $row['email'],
            'phone' => $row['phone'] ?? null,
            'department' => $row['department'] ?? null,
            'position' => $row['position'] ?? null,
            'employment_type' => $row['employment_type'] ?? 'Full-time',
            'status' => $row['status'] ?? 'Active',
            'hire_date' => $row['hire_date'] ?? null,
            'avatar' => $row['avatar'] ?? 'https://api.dicebear.com/7.x/avataaars/svg?seed='.urlencode($row['first_name']),
            'address' => $row['address'] ?? null,
            'date_of_birth' => $row['date_of_birth'] ?? null,
            'gender' => $row['gender'] ?? null,
            'emergency_contact' => $row['emergency_contact'] ?? null,
            'emergency_phone' => $row['emergency_phone'] ?? null,
            'skills' => $row['skills'] ?? [],
            'education' => $row['education'] ?? null,
        ];
    }

    private function monday(): Carbon
    {
        return Carbon::now('Asia/Manila')->startOfWeek(Carbon::MONDAY);
    }

    private function dateFor(int $w, int $d): string
    {
        return $this->monday()->addDays($w * 7 + $d)->format('Y-m-d');
    }

    private function dateTimeFor(int $w, int $d, string $t): string
    {
        return $this->dateFor($w, $d).' '.$t.':00';
    }
}
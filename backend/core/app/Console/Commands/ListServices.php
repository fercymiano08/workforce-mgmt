<?php

namespace App\Console\Commands;

use App\Support\ServiceRegistry;
use Illuminate\Console\Command;

class ListServices extends Command
{
    protected $signature = 'services:list';

    protected $description = 'List every microservice in the system, what it owns, and what it depends on';

    public function handle(): int
    {
        $services = ServiceRegistry::all();

        $this->info('WorkForce Pro - Service Catalog ('.count($services).' services)');
        $this->newLine();

        $this->table(
            ['Key', 'Service', 'Domain', 'Owns (tables)', 'Depends on'],
            array_map(static fn (array $service) => [
                $service['key'],
                $service['name'],
                $service['domain'],
                implode(', ', $service['owns']),
                $service['depends_on'] === [] ? '-' : implode(', ', $service['depends_on']),
            ], $services),
        );

        $this->newLine();
        $this->line('Gateway: routes/api.php mounts each service route file.');
        $this->line('Route files: routes/services/*.php');

        return self::SUCCESS;
    }
}
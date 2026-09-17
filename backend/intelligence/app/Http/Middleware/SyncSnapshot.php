<?php

namespace App\Http\Middleware;

use App\Services\SnapshotSyncService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refreshes this service's local workforce replica from the core before each
 * analytics/AI request so every answer is computed from current data.
 */
class SyncSnapshot
{
    public function handle(Request $request, Closure $next): Response
    {
        app(SnapshotSyncService::class)->sync();

        return $next($request);
    }
}
<?php

namespace App\Http\Middleware;

use App\Services\SnapshotSyncService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refreshes this service's local replica tables from its owner services over
 * HTTP before the request continues. Registration is optional per service.
 */
class SyncSnapshot
{
    public function handle(Request $request, Closure $next): Response
    {
        app(SnapshotSyncService::class)->sync();

        return $next($request);
    }
}
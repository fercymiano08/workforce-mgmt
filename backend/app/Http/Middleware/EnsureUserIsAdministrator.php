<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserIsAdministrator
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->role !== 'Administrator') {
            abort(403, 'Administrator access required.');
        }

        return $next($request);
    }
}

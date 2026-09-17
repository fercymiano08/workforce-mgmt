<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates a request by asking the Auth service (system of record) who
 * owns the presented bearer token, then hydrates a transient User so the
 * existing controllers work with $request->user() / Auth::user() unchanged.
 *
 * In 'local' mode (used by the service's own test suite) the currently
 * authenticated guard user is trusted instead of making a network call.
 */
class EnsureServiceAuthenticated
{
    public function handle(Request $request, Closure $next): Response
    {
        if (config('svc.auth_mode', 'remote') === 'local') {
            if (! Auth::guard('web')->user() && ! $request->bearerToken()) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }

            return $next($request);
        }

        $token = $request->bearerToken();

        if (! $token) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $user = $this->remoteUser($token);

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $request->setUserResolver(fn () => $user);
        Auth::guard('web')->setUser($user);

        return $next($request);
    }

    private function remoteUser(string $token): ?User
    {
        try {
            $response = Http::timeout(10)
                ->withToken($token)
                ->get(rtrim(config('svc.auth.url'), '/').'/api/auth/me');
        } catch (\Throwable) {
            return null;
        }

        $data = $response->ok() ? $response->json('user') : null;

        if (! is_array($data) || ! isset($data['role'], $data['email'])) {
            return null;
        }

        $user = new User([
            'email' => $data['email'],
            'name' => trim(($data['firstName'] ?? '').' '.($data['lastName'] ?? '')),
            'password' => '',
        ]);
        $user->employee_id = (($data['id'] ?? null) === 'ADMIN' || ($data['id'] ?? null) === null)
            ? null
            : $data['id'];
        $user->role = $data['role'];
        $user->role_label = $data['roleLabel'] ?? null;
        $user->avatar_seed = $data['avatarSeed'] ?? null;

        return $user;
    }
}
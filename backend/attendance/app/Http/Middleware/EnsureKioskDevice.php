<?php

namespace App\Http\Middleware;

use App\Services\KioskDeviceToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Guards the entrance-device endpoints: only a device that has passed the
 * kiosk PIN (and so holds a valid, unexpired X-Kiosk-Token) may use them.
 */
class EnsureKioskDevice
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! KioskDeviceToken::valid($request->header('X-Kiosk-Token'))) {
            return response()->json([
                'message' => 'This kiosk device is locked. Enter the kiosk PIN to unlock it.',
                'code' => 'kiosk_locked',
            ], 401);
        }

        return $next($request);
    }
}

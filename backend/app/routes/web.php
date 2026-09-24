<?php

use Illuminate\Support\Facades\Route;

// The backend is API-only (the React frontend is a separate app), so the root just reports that it is up.
Route::get('/', fn () => response()->json(['name' => config('app.name'), 'status' => 'ok']));

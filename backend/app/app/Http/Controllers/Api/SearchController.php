<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\GlobalSearch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    /**
     * The topbar's universal search. What comes back depends on who is signed in - see GlobalSearch - and
     * the filtering happens here on the server, so an employee can never be sent a row that is not theirs.
     */
    public function index(Request $request, GlobalSearch $search): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));

        return response()->json(['data' => $q === '' ? [] : $search->run($request->user(), mb_substr($q, 0, 80))]);
    }
}

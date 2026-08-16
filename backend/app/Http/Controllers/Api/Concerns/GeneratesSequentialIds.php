<?php

namespace App\Http\Controllers\Api\Concerns;

use Illuminate\Database\Eloquent\Model;

trait GeneratesSequentialIds
{
    /**
     * Produce the next sequential ID for a string PK table, e.g. ATT237 -> ATT238.
     *
     * Only IDs whose numeric suffix is pure digits count, so sibling prefixes
     * like OTR001 never collide with OT001 (both match `OT%`).
     *
     * @param  class-string<Model>  $model
     */
    protected function nextIdFor(string $model, string $prefix, int $pad = 3): string
    {
        $ids = $model::query()->where('id', 'like', $prefix.'%')->pluck('id');

        $max = 0;
        foreach ($ids as $id) {
            $suffix = substr((string) $id, strlen($prefix));
            if (ctype_digit($suffix) && (int) $suffix > $max) {
                $max = (int) $suffix;
            }
        }

        return $prefix.str_pad((string) ($max + 1), $pad, '0', STR_PAD_LEFT);
    }
}

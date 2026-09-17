<?php

namespace App\Models\Concerns;

use Illuminate\Support\Str;

trait ApiSerializable
{
    /**
     * JSON columns (camelCase) that should default to an empty array
     * instead of null when the stored value is empty.
     *
     * @return list<string>
     */
    protected function apiNullToEmpty(): array
    {
        return [];
    }

    /**
     * Convert this model's attributes to the camelCase JSON shape the
     * frontend services/api.js contract expects.
     */
    public function toApiArray(): array
    {
        $out = $this->camelizeKeys($this->attributesToArray());
        foreach ($this->apiNullToEmpty() as $key) {
            $out[$key] = $out[$key] ?? [];
        }
        return $out;
    }

    /**
     * Convert a camelCase payload (as sent by the frontend) into snake_case
     * attribute keys ready for mass assignment.
     */
    public static function apiFillable(array $data): array
    {
        $out = [];
        foreach ($data as $key => $value) {
            $out[Str::snake($key)] = $value;
        }
        return $out;
    }

    protected function camelizeKeys(array $attrs): array
    {
        $out = [];
        foreach ($attrs as $key => $value) {
            if (in_array($key, ['created_at', 'updated_at'], true)) {
                continue;
            }
            $out[Str::camel($key)] = $value;
        }
        return $out;
    }
}

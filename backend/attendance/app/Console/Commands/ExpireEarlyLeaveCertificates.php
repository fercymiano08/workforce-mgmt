<?php

namespace App\Console\Commands;

use App\Services\EarlyLeaveEnforcer;
use Illuminate\Console\Command;

/**
 * SICK early clock-outs need a medical certificate within the configured number of
 * hours (default 48). Any whose deadline has passed with nothing attached becomes
 * unexcused automatically - nobody has to remember to chase it.
 */
class ExpireEarlyLeaveCertificates extends Command
{
    protected $signature = 'early-outs:expire-certificates';

    protected $description = 'Mark SICK early clock-outs unexcused when no medical certificate arrived in time';

    public function handle(EarlyLeaveEnforcer $enforcer): int
    {
        $count = $enforcer->expireOverdueCertificates();
        $this->info("Marked {$count} early clock-out(s) unexcused (no certificate in time).");

        return self::SUCCESS;
    }
}

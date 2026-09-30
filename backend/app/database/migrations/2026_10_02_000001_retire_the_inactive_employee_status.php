<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/*
  "Inactive" is gone as a word in this product.

  It meant three different things and none of them were the one a reader assumed: a person who had
  left the company, a card that is not currently highlighted, and a signed-in session that has gone
  quiet for three minutes. The session timeout is a security control and stays (see IdleSessionGuard).
  The visual sense never existed as a status. That left one real meaning - somebody who no longer
  works here - and it was being called "Inactive", which is the same word Android and every browser
  use for a UI that is merely not selected.

  The value becomes "Terminated", which says what actually happened to the person and cannot be
  misread as a UI state. Nothing is lost: these rows are updated in place, not deleted, so headcount
  history and the attendance attached to it stay intact.

  Every existing "Inactive" row is converted. Any other value the column has ever held is folded into
  "Active" rather than left as something the new validation would reject - a row that cannot be saved
  is worse than a row with the ordinary status.
*/
return new class extends Migration
{
    public function up(): void
    {
        DB::table('employees')->where('status', 'Inactive')->update(['status' => 'Terminated']);

        // Anything else that is not one of the three real states becomes Active. Leaving a stray value
        // in place would mean the record can no longer be updated without tripping the status rule.
        DB::table('employees')
            ->whereNotIn('status', ['Active', 'On Leave', 'Terminated'])
            ->update(['status' => 'Active']);
    }

    public function down(): void
    {
        DB::table('employees')->where('status', 'Terminated')->update(['status' => 'Inactive']);
    }
};

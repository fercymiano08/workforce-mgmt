<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two-factor sign-in by emailed code, switched on per account.
 *
 * The flag lives on the user so turning it on and off is a single write, and so the login handler can
 * decide in one query. It is off by default: an account only gets a second step once its owner asks
 * for one, and an administrator can never be locked out of the system by a mailbox that is down.
 *
 * Challenges are their own table rather than a column on the user. A challenge is short-lived,
 * single-use, belongs to one sign-in attempt, and has to be garbage-collected; keeping those rows out
 * of `users` means a stale challenge can never be confused with the account's own settings, and
 * `user_id` is indexed so "is this person mid-sign-in?" is one cheap lookup.
 *
 * The code is stored hashed, exactly like a password-reset code: if this table is ever read by
 * something it should not be, a six digit code in plain text is a complete bypass of the second
 * factor. `attempts` caps guessing on a single challenge, so a leaked challenge id is not enough -
 * the brute-force protection has to be here as well, not only on the login route's rate limiter.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('two_factor_enabled')->default(false)->after('password');
        });

        Schema::create('two_factor_challenges', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('code');
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('expires_at');
            $table->timestamps();

            // At most one live challenge per account: signing in again supersedes the old code, so a
            // mail that arrives late cannot be used after a newer attempt has already replaced it.
            $table->unique('user_id');
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('two_factor_challenges');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('two_factor_enabled');
        });
    }
};

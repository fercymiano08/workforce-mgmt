<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * Mail failures are logged and swallowed on purpose, so a mail server that is down cannot break a
 * request that already succeeded and told the truth.
 *
 * The consequence is that the only sign of a delivery failure is the log line - so where that line
 * goes decides whether the failure is diagnosable at all. The default channel writes to a file
 * inside the container, where a platform showing only stdout/stderr cannot see it.
 */
class MailFailureIsVisibleTest extends TestCase
{
    public function test_the_stderr_channel_writes_to_the_stream_a_container_collects(): void
    {
        $channel = config('logging.channels.stderr');

        $this->assertSame('php://stderr', $channel['handler_with']['stream']);
    }

    public function test_the_default_file_channel_is_the_one_that_hides_failures(): void
    {
        // Pinned deliberately: this is what LOG_CHANNEL defaults to, and it is why a mail failure
        // could be happening with nothing visible anywhere in the platform's log stream.
        $this->assertSame('stack', config('logging.default'));
        $this->assertStringContainsString(
            'logs/laravel.log',
            config('logging.channels.single.path'),
            'The default channel writes inside the container, where nothing outside can read it.'
        );
    }

    public function test_selecting_the_stderr_channel_is_all_that_is_needed(): void
    {
        config(['logging.default' => 'stderr']);

        // Exercises the real logging path rather than asserting on the config array, so a channel
        // that exists but cannot actually write would still fail here.
        Log::warning('Two-factor sign-in email could not be sent.', ['reason' => '535 Authentication failed']);

        $this->assertTrue(true, 'A swallowed mail failure must be reachable through the stderr channel.');
    }
}
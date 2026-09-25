<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\SecurityEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The kiosk's face gate, with the real checks switched on. Faces are 128-value descriptors like the ones
 * face-api.js produces; "a face at distance d" is built by moving a descriptor exactly d away, so each test
 * states precisely how alike two people are (same person ~0.3, sibling ~0.5, identical twin ~0.35).
 */
class KioskFaceVerificationTest extends TestCase
{
    use RefreshDatabase;

    private const EMP = 'EMP20260001';

    private const OTHER = 'EMP20260002';

    protected function setUp(): void
    {
        parent::setUp();
        Employee::create(['id' => self::EMP, 'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'email' => 'juan@x.com', 'department' => 'Ops', 'status' => 'Active']);
        Employee::create(['id' => self::OTHER, 'first_name' => 'Pedro', 'last_name' => 'Dela Cruz', 'email' => 'pedro@x.com', 'department' => 'Ops', 'status' => 'Active']);
        $this->scheduleShift(self::EMP);
        $this->scheduleShift(self::OTHER);
        $this->freezeKioskClock('08:00:00');
        $this->withHeaders($this->kioskDeviceHeaders());
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // --- Faces ----------------------------------------------------------------

    /** A reproducible "face": 128 values with unit length, like face-api's descriptors. */
    private function face(int $seed): array
    {
        mt_srand($seed);
        $v = array_map(fn () => mt_rand(-1000, 1000) / 1000, range(1, 128));
        $norm = sqrt(array_sum(array_map(fn ($x) => $x * $x, $v)));

        return array_map(fn ($x) => $x / $norm, $v);
    }

    /** The same face moved exactly $distance away in a random direction ($seed picks the direction). */
    private function near(array $face, float $distance, int $seed): array
    {
        $dir = $this->face($seed);

        return array_map(fn ($a, $b) => $a + $b * $distance, $face, $dir);
    }

    private function enroll(string $id, array $descriptor): void
    {
        Employee::find($id)->update(['face_registered' => true, 'face_descriptor' => $descriptor]);
    }

    /** A live scan of three camera frames, each a little different, as a real camera gives. */
    private function scan(array $face, float $noise = 0.12): array
    {
        return [$this->near($face, $noise, 901), $this->near($face, $noise, 902), $this->near($face, $noise, 903)];
    }

    private function verify(string $id, array $frames)
    {
        return $this->postJson('/api/kiosk/verify-face', ['employeeId' => $id, 'descriptors' => $frames]);
    }

    private function clockIn(string $id, ?string $ticket)
    {
        return $this->postJson('/api/kiosk/attendance', array_filter([
            'employeeId' => $id, 'date' => self::KIOSK_TEST_DATE, 'clockIn' => '08:00:00', 'status' => 'Present',
            'faceTicket' => $ticket,
        ]));
    }

    // --- No face, no punch ---------------------------------------------------------

    public function test_an_employee_with_no_registered_face_cannot_be_verified_or_clocked_in(): void
    {
        $this->verify(self::EMP, $this->scan($this->face(1)))->assertStatus(422);
        $this->clockIn(self::EMP, null)->assertStatus(403)->assertJsonPath('code', 'face_required');

        $this->assertSame(0, Attendance::count());
    }

    public function test_skipping_the_scan_is_refused_and_reported_even_from_the_real_kiosk_device(): void
    {
        $this->enroll(self::EMP, $this->face(1));

        $this->clockIn(self::EMP, null)->assertStatus(403);
        $this->clockIn(self::EMP, 'made-up-ticket')->assertStatus(403);

        $this->assertSame(0, Attendance::count());
        $this->assertSame(2, SecurityEvent::where('type', 'face_mismatch')->where('employee_id', self::EMP)->count());
    }

    public function test_a_matching_face_clocks_in_and_its_ticket_cannot_be_reused_or_lent(): void
    {
        $juan = $this->face(1);
        $this->enroll(self::EMP, $juan);
        $this->enroll(self::OTHER, $this->face(2));

        $ticket = $this->verify(self::EMP, $this->scan($juan))->assertOk()->json('data.faceTicket');
        $this->assertNotEmpty($ticket);

        // Juan's ticket does not clock in Pedro
        $this->clockIn(self::OTHER, $ticket)->assertStatus(403);

        $id = $this->clockIn(self::EMP, $ticket)->assertCreated()->json('data.id');

        // One scan = one punch: the same ticket cannot also clock him out later
        Carbon::setTestNow(Carbon::parse(self::KIOSK_TEST_DATE.' 17:00:00', 'Asia/Manila'));
        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '17:00:00', 'faceTicket' => $ticket])->assertStatus(403);
        $this->assertNull(Attendance::find($id)->clock_out);

        // A fresh scan does
        $out = $this->verify(self::EMP, $this->scan($juan))->assertOk()->json('data.faceTicket');
        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '17:00:00', 'faceTicket' => $out])->assertOk();
    }

    public function test_a_scan_cannot_be_saved_for_later(): void
    {
        $juan = $this->face(1);
        $this->enroll(self::EMP, $juan);
        $ticket = $this->verify(self::EMP, $this->scan($juan))->json('data.faceTicket');

        $this->travel(6)->minutes();

        $this->clockIn(self::EMP, $ticket)->assertStatus(403);
    }

    // --- Other people using someone's ID ------------------------------------------------

    public function test_a_stranger_is_refused(): void
    {
        $this->enroll(self::EMP, $this->face(1));

        $this->verify(self::EMP, $this->scan($this->face(3)))->assertStatus(401);
        $this->assertSame(1, SecurityEvent::where('type', 'face_mismatch')->count());   // logged by the server itself
    }

    public function test_a_sibling_who_the_old_loose_threshold_would_have_let_through_is_refused(): void
    {
        $juan = $this->face(1);
        $this->enroll(self::EMP, $juan);
        // A brother: clearly related (0.52 from Juan), under face-api's default 0.6, not enrolled himself
        $brother = $this->near($juan, 0.52, 77);

        $this->verify(self::EMP, $this->scan($brother, 0.05))->assertStatus(401);
    }

    public function test_an_enrolled_twin_using_the_other_twins_id_is_refused(): void
    {
        $juan = $this->face(1);
        $pedro = $this->near($juan, 0.35, 55);   // identical twins: very close, each enrolled on his own ID
        $this->enroll(self::EMP, $juan);
        $this->enroll(self::OTHER, $pedro);

        // Pedro scans at Juan's ID: his own enrolled face is closer than Juan's, so it is him, not Juan
        $this->verify(self::EMP, $this->scan($pedro, 0.1))->assertStatus(401);
        $this->assertStringContainsString('Closest enrolled face: Pedro Dela Cruz', collect($this->kioskLogs())->first()['detail']);
    }

    public function test_when_two_enrolled_faces_are_too_close_to_tell_apart_the_kiosk_refuses_instead_of_guessing(): void
    {
        $juan = $this->face(1);
        $this->enroll(self::EMP, $juan);
        $this->enroll(self::OTHER, $this->near($juan, 0.3, 55));
        // A scan halfway between the two twins' enrolled faces
        $between = $this->near($juan, 0.15, 55);

        $this->verify(self::EMP, [$between, $between, $between])->assertStatus(409)->assertJsonPath('code', 'ambiguous');
        $this->assertSame(0, Attendance::count());
    }

    public function test_one_good_frame_among_bad_ones_does_not_pass(): void
    {
        $juan = $this->face(1);
        $this->enroll(self::EMP, $juan);
        $brother = $this->near($juan, 0.58, 77);

        // Two frames of the brother around one lucky frame of Juan (or a photo held up for a moment)
        $this->verify(self::EMP, [$this->near($brother, 0.05, 1), $this->near($juan, 0.05, 2), $this->near($brother, 0.05, 3)])
            ->assertStatus(401);
    }

    public function test_two_different_people_in_one_scan_are_refused(): void
    {
        $juan = $this->face(1);
        $this->enroll(self::EMP, $juan);

        $this->verify(self::EMP, [$this->near($juan, 0.1, 1), $this->face(3), $this->near($juan, 0.1, 2)])->assertStatus(422);
    }

    public function test_five_wrong_faces_pause_the_reader_for_a_minute(): void
    {
        $juan = $this->face(1);
        $this->enroll(self::EMP, $juan);
        $stranger = $this->scan($this->face(3));

        // Four refusals, each still an ordinary "that is not you" with tries remaining.
        for ($attempt = 1; $attempt <= 4; $attempt++) {
            $this->verify(self::EMP, $stranger)
                ->assertStatus(401)
                ->assertJsonPath('code', 'mismatch')
                ->assertJsonPath('data.attemptsRemaining', 5 - $attempt);
        }

        // The fifth trips the lock: same 401 shape replaced by a 429 the terminal can count down.
        $this->verify(self::EMP, $stranger)
            ->assertStatus(429)
            ->assertJsonPath('code', 'face_locked')
            ->assertJsonPath('data.retryAfter', 60);

        // While locked, even the real employee is refused - the pause is on the reader, not the person.
        $this->verify(self::EMP, $this->scan($juan))
            ->assertStatus(429)
            ->assertJsonPath('code', 'face_locked');

        Carbon::setTestNow(now()->addSeconds(61));

        $this->verify(self::EMP, $this->scan($juan))->assertOk();
    }

    public function test_a_good_scan_clears_the_strike_count(): void
    {
        $juan = $this->face(1);
        $this->enroll(self::EMP, $juan);
        $stranger = $this->scan($this->face(3));

        for ($attempt = 1; $attempt <= 4; $attempt++) {
            $this->verify(self::EMP, $stranger)->assertStatus(401);
        }

        $this->verify(self::EMP, $this->scan($juan))->assertOk();

        // Four more wrong guesses must still be allowed: passing resets the count, so an honest
        // employee who fumbled a few frames is not one mistake from a lockout.
        for ($attempt = 1; $attempt <= 4; $attempt++) {
            $this->verify(self::EMP, $stranger)
                ->assertStatus(401)
                ->assertJsonPath('data.attemptsRemaining', 5 - $attempt);
        }
    }

    public function test_the_lockout_survives_the_terminal_being_reloaded(): void
    {
        $juan = $this->face(1);
        $this->enroll(self::EMP, $juan);
        $stranger = $this->scan($this->face(3));

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->verify(self::EMP, $stranger);
        }

        // The count used to live in the browser, so a refresh handed out five more guesses.
        // It is kept server-side now, and nothing in this request resets it.
        $this->verify(self::EMP, $this->scan($juan))->assertStatus(429);
    }

    private function kioskLogs(): array
    {
        return \App\Models\Setting::first()->kiosk['logs'] ?? [];
    }
}

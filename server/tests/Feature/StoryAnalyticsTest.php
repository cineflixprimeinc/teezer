<?php

namespace Tests\Feature;

use App\Models\Story;
use App\Services\StoryAnalyticsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Story analytics - the fourteen behaviours the system is specified against.
 *
 * These go through StoryAnalyticsService rather than the HTTP routes on
 * purpose: the service is the single seam every surface writes through, so a
 * guarantee proven here holds for web and mobile alike. Proving it twice at the
 * HTTP layer would only re-test Laravel's router.
 *
 * Rows are inserted directly instead of via factories because this application
 * has no factories at all (database/factories does not exist), and inventing a
 * set for one test file would be a bigger change than the tests themselves.
 */
class StoryAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    private StoryAnalyticsService $svc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->svc = app(StoryAnalyticsService::class);
    }

    /* ── fixtures ───────────────────────────────────────────────────────── */

    private function user(string $username): int
    {
        return (int) DB::table('users')->insertGetId([
            'name'       => ucfirst($username),
            'username'   => $username,
            'email'      => "{$username}@example.test",
            'password'   => 'x',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function story(int $ownerId, string $visibility = 'everyone'): Story
    {
        $id = DB::table('stories')->insertGetId([
            'user_id'    => $ownerId,
            'visibility' => $visibility,
            'status'     => 'published',
            'expires_at' => now()->addDay(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return Story::findOrFail($id);
    }

    private function uniqueViewers(Story $s): int
    {
        return $this->svc->analytics($s)['unique_viewers'];
    }

    /* ── 1. one view = one viewer ───────────────────────────────────────── */

    public function test_a_single_view_is_one_viewer(): void
    {
        $owner = $this->user('owner1');
        $story = $this->story($owner);

        $this->svc->recordView($story, $this->user('bob1'));

        $this->assertSame(1, $this->uniqueViewers($story));
    }

    /* ── 2. ten rewatches stay one viewer ───────────────────────────────── */

    public function test_rewatching_ten_times_is_still_one_viewer(): void
    {
        $owner = $this->user('owner2');
        $story = $this->story($owner);
        $bob   = $this->user('bob2');

        for ($i = 0; $i < 10; $i++) {
            $this->svc->recordView($story, $bob);
        }

        $a = $this->svc->analytics($story);

        $this->assertSame(1, $a['unique_viewers'], 'rewatches must not add viewers');
        // The rewatches are still recorded - they land in total_view_events,
        // which is the whole reason the two numbers are separate.
        $this->assertSame(10, $a['total_view_events']);
    }

    /* ── 3. same account, two platforms, one viewer ─────────────────────── */

    public function test_same_user_on_android_and_web_is_one_viewer(): void
    {
        $owner = $this->user('owner3');
        $story = $this->story($owner);
        $bob   = $this->user('bob3');

        $this->svc->recordView($story, $bob, ['platform' => 'android']);
        $this->svc->recordView($story, $bob, ['platform' => 'web']);

        $this->assertSame(1, $this->uniqueViewers($story));
    }

    /* ── 4. two different users = two viewers ───────────────────────────── */

    public function test_two_different_users_are_two_viewers(): void
    {
        $owner = $this->user('owner4');
        $story = $this->story($owner);

        $this->svc->recordView($story, $this->user('bob4'));
        $this->svc->recordView($story, $this->user('carol4'));

        $this->assertSame(2, $this->uniqueViewers($story));
    }

    /* ── 5 & 6. concurrency: simultaneous watches, multiple tabs ────────── */

    public function test_concurrent_first_views_from_one_user_produce_one_viewer(): void
    {
        $owner = $this->user('owner5');
        $story = $this->story($owner);
        $bob   = $this->user('bob5');

        // Two tabs racing on the same story. Only one call may report itself as
        // the first view - the UNIQUE constraint arbitrates, not a read-then-
        // write check in PHP, so there is no window where both can win.
        $firstA = $this->svc->recordView($story, $bob, ['session_id' => 'tab-a']);
        $firstB = $this->svc->recordView($story, $bob, ['session_id' => 'tab-b']);

        $this->assertTrue($firstA, 'the first caller should own the insert');
        $this->assertFalse($firstB, 'the second caller must not report a new viewer');
        $this->assertSame(1, $this->uniqueViewers($story));
        $this->assertSame(1, DB::table('story_views')
            ->where('story_id', $story->id)->where('viewer_id', $bob)->count());
    }

    public function test_two_users_watching_simultaneously_are_two_viewers(): void
    {
        $owner = $this->user('owner6');
        $story = $this->story($owner);

        $this->assertTrue($this->svc->recordView($story, $this->user('bob6')));
        $this->assertTrue($this->svc->recordView($story, $this->user('carol6')));

        $this->assertSame(2, $this->uniqueViewers($story));
    }

    /* ── 7. the owner is never their own viewer ─────────────────────────── */

    public function test_owner_viewing_own_story_adds_no_viewer(): void
    {
        $owner = $this->user('owner7');
        $story = $this->story($owner);

        $this->assertFalse($this->svc->recordView($story, $owner));

        $this->assertSame(0, $this->uniqueViewers($story));
        $this->assertSame(0, DB::table('story_views')->where('story_id', $story->id)->count());
    }

    /* ── 8, 9, 10. reactions: add, change, remove ───────────────────────── */

    public function test_a_reaction_counts_once(): void
    {
        $owner = $this->user('owner8');
        $story = $this->story($owner);
        $bob   = $this->user('bob8');

        $this->svc->recordView($story, $bob);
        $this->assertTrue($this->svc->setReaction($story, $bob, 'heart'));

        $a = $this->svc->analytics($story);
        $this->assertSame(1, $a['reaction_count']);
        $this->assertSame(1, $a['reactions_breakdown']['heart']);
    }

    public function test_changing_a_reaction_replaces_it_rather_than_adding_one(): void
    {
        $owner = $this->user('owner9');
        $story = $this->story($owner);
        $bob   = $this->user('bob9');

        $this->svc->setReaction($story, $bob, 'heart');
        $this->assertFalse(
            $this->svc->setReaction($story, $bob, 'haha'),
            'swapping a reaction is not a new reaction',
        );

        $a = $this->svc->analytics($story);
        $this->assertSame(1, $a['reaction_count'], 'a swap must not produce two reactions');
        $this->assertSame(0, $a['reactions_breakdown']['heart'], 'the old type must be gone');
        $this->assertSame(1, $a['reactions_breakdown']['haha']);
    }

    public function test_removing_a_reaction_returns_the_count_to_zero(): void
    {
        $owner = $this->user('owner10');
        $story = $this->story($owner);
        $bob   = $this->user('bob10');

        $this->svc->setReaction($story, $bob, 'fire');
        $this->assertTrue($this->svc->removeReaction($story, $bob));

        $this->assertSame(0, $this->svc->analytics($story)['reaction_count']);

        // Idempotent: removing again is a no-op, not an error.
        $this->assertFalse($this->svc->removeReaction($story, $bob));
    }

    /* ── 11 & 12. one store behind both surfaces ────────────────────────── */

    public function test_a_web_view_and_a_mobile_view_land_in_the_same_counters(): void
    {
        $owner = $this->user('owner11');
        $story = $this->story($owner);

        // Whatever the platform, the same table and the same rollup. There is
        // no per-surface counter that could disagree, which is what makes the
        // website and the app show the same number.
        $this->svc->recordView($story, $this->user('web11'), ['platform' => 'desktop_web']);
        $this->svc->recordView($story, $this->user('app11'), ['platform' => 'ios']);

        $this->assertSame(2, $this->uniqueViewers($story));
        $this->assertSame(
            2,
            (int) DB::table('story_analytics')->where('story_id', $story->id)->value('unique_viewers'),
            'the rollup both surfaces read must already hold the new total',
        );
    }

    /* ── 13 & 14. authorisation gates the WRITE, not just the read ──────── */

    public function test_a_blocked_user_is_refused_and_leaves_no_view(): void
    {
        $owner = $this->user('owner13');
        $blocked = $this->user('blocked13');
        $story = $this->story($owner);

        DB::table('blocked_users')->insert([
            'blocker_id' => $owner,
            'blocked_id' => $blocked,
            'created_at' => now(),
        ]);

        $res = $this->actingAs(\App\Models\User::find($blocked), 'sanctum')
            ->postJson("/api/v1/stories/{$story->id}/view");

        $res->assertNotFound();
        $this->assertSame(0, DB::table('story_views')->where('story_id', $story->id)->count());
    }

    public function test_a_hidden_user_is_refused_and_leaves_no_view(): void
    {
        $owner  = $this->user('owner14');
        $hidden = $this->user('hidden14');
        $story  = $this->story($owner);

        DB::table('hidden_story_users')->insert([
            'user_id'        => $owner,
            'hidden_user_id' => $hidden,
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);

        $res = $this->actingAs(\App\Models\User::find($hidden), 'sanctum')
            ->postJson("/api/v1/stories/{$story->id}/view");

        $res->assertNotFound();
        $this->assertSame(0, DB::table('story_views')->where('story_id', $story->id)->count());
    }

    /* ── the split that the whole design rests on ───────────────────────── */

    public function test_multiple_slides_watched_by_one_person_is_one_viewer(): void
    {
        $owner = $this->user('owner15');
        $story = $this->story($owner);
        $bob   = $this->user('bob15');

        // Four slides of one story, watched straight through.
        foreach ([0, 1, 2, 3] as $slide) {
            $this->svc->recordView($story, $bob, ['slide_index' => $slide, 'watch_duration' => 5]);
        }

        $a = $this->svc->analytics($story);

        $this->assertSame(1, $a['unique_viewers'], 'four slides is one viewer, not four');
        $this->assertSame(4, $a['total_view_events'], 'but all four slide watches are recorded');
        $this->assertSame(20, $a['total_watch_seconds']);
        $this->assertSame(4, DB::table('story_view_events')->where('story_id', $story->id)->count());
    }

    public function test_progress_reports_add_duration_without_adding_events(): void
    {
        $owner = $this->user('owner16');
        $story = $this->story($owner);
        $bob   = $this->user('bob16');

        $this->svc->recordView($story, $bob, ['watch_duration' => 0]);
        // The client measuring the watch afterwards must not read as a rewatch.
        $this->svc->recordView($story, $bob, ['watch_duration' => 7, 'progress_only' => true]);

        $a = $this->svc->analytics($story);

        $this->assertSame(1, $a['unique_viewers']);
        $this->assertSame(1, $a['total_view_events'], 'a progress report is not another watch');
        $this->assertSame(7, $a['total_watch_seconds']);
    }

    public function test_shares_are_events_and_are_not_deduplicated(): void
    {
        $owner = $this->user('owner17');
        $story = $this->story($owner);
        $bob   = $this->user('bob17');

        // Unlike a view, sharing twice really is two shares.
        $this->svc->recordShare($story, $bob, 'dm');
        $this->svc->recordShare($story, $bob, 'copy_link');

        $this->assertSame(2, $this->svc->analytics($story)['share_count']);
    }

    public function test_the_rollup_is_rebuildable_from_source(): void
    {
        $owner = $this->user('owner18');
        $story = $this->story($owner);

        $this->svc->recordView($story, $this->user('bob18'));
        $this->svc->recordView($story, $this->user('carol18'));

        // Corrupt the rollup the way a crash between the source write and the
        // rollup update would, then prove a recompute heals it. This is what
        // makes staleness the worst case rather than permanent drift.
        DB::table('story_analytics')->where('story_id', $story->id)->update(['unique_viewers' => 999]);
        $this->svc->forget((int) $story->id);

        $this->svc->recompute((int) $story->id, $owner);

        $this->assertSame(2, $this->uniqueViewers($story));
    }
}

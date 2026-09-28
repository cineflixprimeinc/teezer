<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * One-time reconciliation for accounts that were split BEFORE the social
 * account-linking fix. Two Reelsoo users are the same person when their
 * social_accounts rows share the same (provider, provider_id) - e.g. the same
 * Google/Apple identity signed in twice and, because matching was email-only,
 * created a second account (common with Apple Hide-My-Email relay).
 *
 * DRY-RUN by default: prints the clusters and what would move. Pass --apply to
 * perform the merge. Designed to be reviewed before running on production.
 *
 * Safety model: NEVER deletes user content. The oldest / verified account wins;
 * the loser's rows are re-pointed to the winner. Wallet balances are summed.
 * Any table with a unique constraint that would collide is REPORTED for manual
 * review rather than force-deleted, so nothing is lost. The loser is then
 * deactivated + soft-deleted and its email/username freed.
 */
class MergeDuplicateAccounts extends Command
{
    protected $signature = 'reelsoo:merge-duplicate-accounts
        {--apply : Perform the merge (default is a dry run)}
        {--provider= : Limit to one provider (google|apple|facebook|tiktok)}';

    protected $description = 'Merge duplicate user accounts that share the same social provider identity';

    /** Tables handled explicitly; excluded from the generic re-point pass. */
    private const SPECIAL = ['users', 'wallets', 'profiles', 'social_accounts'];

    private const PLACEHOLDER_EMAIL = '%@social.reelsoo.invalid';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $this->info($apply ? 'APPLY mode — changes WILL be written.' : 'DRY RUN — no changes. Pass --apply to merge.');

        $clusters = $this->findClusters($this->option('provider'));
        if (empty($clusters)) {
            $this->info('No duplicate accounts found. Nothing to do.');
            return self::SUCCESS;
        }

        $userIdTables = $this->userIdTables();
        $this->line('Found ' . count($clusters) . ' duplicate cluster(s).');
        $merged = 0;

        foreach ($clusters as $c) {
            $userIds = $c['user_ids'];
            $users   = User::withTrashed()->whereIn('id', $userIds)->get()->keyBy('id');
            if ($users->count() < 2) {
                continue;
            }

            $winner = $this->pickWinner($users);
            $losers = $users->keys()->reject(fn ($id) => $id === $winner->id)->values();

            $this->newLine();
            $this->line("── {$c['provider']}:{$c['provider_id']} ──");
            $this->line("   winner : #{$winner->id} @{$winner->username} <{$this->emailLabel($winner)}>");
            foreach ($losers as $lid) {
                $l = $users[$lid];
                $this->line("   loser  : #{$l->id} @{$l->username} <{$this->emailLabel($l)}>  ("
                    . $this->loserSummary($lid, $userIdTables) . ')');
            }

            if (! $apply) {
                continue;
            }

            foreach ($losers as $lid) {
                try {
                    $this->mergeLoser((int) $winner->id, (int) $lid, $userIdTables);
                    $merged++;
                    $this->info("   ✓ merged #{$lid} → #{$winner->id}");
                } catch (\Throwable $e) {
                    $this->error("   ✗ #{$lid}: " . $e->getMessage());
                }
            }
        }

        $this->newLine();
        $this->info($apply ? "Done. Merged {$merged} account(s)." : 'Dry run complete. Re-run with --apply to merge.');
        return self::SUCCESS;
    }

    /** Clusters = same (provider, provider_id) owned by >1 distinct user. */
    private function findClusters(?string $provider): array
    {
        $q = DB::table('social_accounts')
            ->select('provider', 'provider_id', DB::raw('array_agg(DISTINCT user_id) as user_ids'))
            ->whereNotNull('provider_id')
            ->where('provider_id', '!=', '')
            ->groupBy('provider', 'provider_id')
            ->havingRaw('COUNT(DISTINCT user_id) > 1');
        if ($provider) {
            $q->where('provider', $provider);
        }

        return $q->get()->map(function ($r) {
            // Postgres array literal "{1,2,3}" → int[]
            $ids = array_map('intval', array_filter(explode(',', trim((string) $r->user_ids, '{}'))));
            return ['provider' => $r->provider, 'provider_id' => $r->provider_id, 'user_ids' => $ids];
        })->all();
    }

    /** Winner: a real verified email wins, then the oldest account. */
    private function pickWinner(\Illuminate\Support\Collection $users): User
    {
        return $users->sortBy([
            fn (User $u) => $this->isRealVerified($u) ? 0 : 1, // verified real email first
            fn (User $u) => $u->id,                             // then oldest
        ])->first();
    }

    private function isRealVerified(User $u): bool
    {
        return $u->email_verified_at !== null
            && ! str_ends_with((string) $u->email, '@social.reelsoo.invalid');
    }

    private function emailLabel(User $u): string
    {
        return str_ends_with((string) $u->email, '@social.reelsoo.invalid')
            ? '(no email)'
            : ((string) $u->email . ($u->email_verified_at ? ' ✓' : ''));
    }

    /** Every public table with a user_id column, minus the special-cased ones. */
    private function userIdTables(): array
    {
        $rows = DB::select(
            "SELECT table_name FROM information_schema.columns
             WHERE table_schema = 'public' AND column_name = 'user_id'"
        );
        return array_values(array_diff(array_map(fn ($r) => $r->table_name, $rows), self::SPECIAL));
    }

    private function loserSummary(int $loserId, array $tables): string
    {
        $parts = [];
        $videos = in_array('videos', $tables, true)
            ? DB::table('videos')->where('user_id', $loserId)->count() : 0;
        $wallet = DB::table('wallets')->where('user_id', $loserId)->first();
        $parts[] = "{$videos} videos";
        if ($wallet) {
            $parts[] = ((int) ($wallet->coins_balance ?? 0)) . ' coins';
        }
        return implode(', ', $parts);
    }

    /**
     * Re-point one loser into the winner inside a single transaction. Wallet is
     * summed; unique-collision tables are collected and reported (not deleted).
     */
    private function mergeLoser(int $winnerId, int $loserId, array $tables): void
    {
        DB::transaction(function () use ($winnerId, $loserId, $tables) {
            $needsReview = [];

            // 1) Wallet: sum every numeric column into the winner, drop loser wallet.
            $this->mergeWallet($winnerId, $loserId);

            // 2) Profile: winner keeps theirs; drop loser profile (counters are
            //    re-derivable). Only delete if winner already has a profile.
            $winnerHasProfile = DB::table('profiles')->where('user_id', $winnerId)->exists();
            if ($winnerHasProfile) {
                DB::table('profiles')->where('user_id', $loserId)->delete();
            } else {
                DB::table('profiles')->where('user_id', $loserId)->update(['user_id' => $winnerId]);
            }

            // 3) social_accounts: move loser's provider links to the winner,
            //    skipping providers the winner already has linked.
            $winnerProviders = DB::table('social_accounts')->where('user_id', $winnerId)->pluck('provider')->all();
            DB::table('social_accounts')->where('user_id', $loserId)
                ->whereIn('provider', $winnerProviders)->delete();
            DB::table('social_accounts')->where('user_id', $loserId)->update(['user_id' => $winnerId]);

            // 4) Generic re-point for every other user_id table. A unique
            //    collision is reported for manual review, never force-deleted.
            foreach ($tables as $t) {
                try {
                    DB::transaction(function () use ($t, $winnerId, $loserId) {
                        DB::table($t)->where('user_id', $loserId)->update(['user_id' => $winnerId]);
                    });
                } catch (QueryException $e) {
                    $needsReview[] = $t;
                }
            }

            // 5) Free the loser's unique fields and retire the account. Raw
            //    update bypasses the model's privileged-field guard.
            DB::table('users')->where('id', $loserId)->update([
                'email'      => 'merged+' . $loserId . '@social.reelsoo.invalid',
                'username'   => 'merged_' . $loserId,
                'is_active'  => false,
                'deleted_at' => now(),
                'updated_at' => now(),
            ]);

            if ($needsReview) {
                $this->warn('     tables needing manual review (unique collisions left on loser #'
                    . $loserId . '): ' . implode(', ', array_unique($needsReview)));
            }
        });
    }

    private function mergeWallet(int $winnerId, int $loserId): void
    {
        $loser = DB::table('wallets')->where('user_id', $loserId)->first();
        if (! $loser) {
            return;
        }
        $winner = DB::table('wallets')->where('user_id', $winnerId)->first();
        if (! $winner) {
            // Winner has no wallet — just hand over the loser's.
            DB::table('wallets')->where('user_id', $loserId)->update(['user_id' => $winnerId]);
            return;
        }

        $sumCols = [
            'balance', 'coins_balance', 'gift_earnings', 'subscription_earnings', 'ad_earnings',
            'total_withdrawn', 'bonus_coin_balance', 'earned_coin_balance', 'wallet_balance_usd',
            'pending_balance_usd', 'total_received_coins', 'total_commission_coins',
            'total_net_earned_coins', 'total_spent_coins', 'total_purchased_coins',
        ];
        $updates = [];
        foreach ($sumCols as $col) {
            if (property_exists($winner, $col) && property_exists($loser, $col)) {
                $updates[$col] = DB::raw($col . ' + ' . (float) $loser->$col);
            }
        }
        if ($updates) {
            DB::table('wallets')->where('user_id', $winnerId)->update($updates);
        }
        // wallet_transactions reference wallet_id, so re-point them, then drop
        // the loser wallet.
        DB::table('wallet_transactions')->where('wallet_id', $loser->id)->update(['wallet_id' => $winner->id]);
        DB::table('wallets')->where('id', $loser->id)->delete();
    }
}

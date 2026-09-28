<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Put gifts AND coin packages on one coin ladder: 80 -> 100 coins per $1.
 *
 * WHERE THE MARGIN COMES FROM
 *
 * Every coin sold is a liability. A gifted coin leaves the creator 70% after commission,
 * and those coins withdraw at 100 RC = $1 - so a coin costs the platform $0.007 when it
 * is eventually cashed out. Margin on a sale is therefore:
 *
 *     margin = 1 - (coins_per_dollar * 0.007)
 *
 * Selling a flat 100 coins/$ yields 30%. Selling FEWER coins per dollar yields more. This
 * ladder ramps the rate from 80 coins/$ on the cheapest items up to 100 on the largest, so
 * the small, high-volume purchases carry the fattest margin (~45%) while whales still get
 * the best rate - blended ~32.4%, versus 9% under the original pre-design ladder.
 *
 * THE CEILING, WHICH THIS MUST NEVER CROSS
 *
 * At 1 / (0.01 * (1 - 0.30)) = 142.86 coins/$, a gifted coin withdraws for exactly what it
 * cost. Above that, buying coins and gifting them to a second account mints cash without
 * limit. This ladder tops out at 100 coins/$, leaving a wide margin of safety - and the
 * up() below refuses to write any row that would cross it.
 *
 * GIFTS AND PACKS MOVE TOGETHER, ON PURPOSE
 *
 * gifts.coin_value uses the same ladder as coin_packages.coins, so package N always funds
 * exactly gift N. Repricing only the packs would have left a buyer of the $0.19 pack (15 RC)
 * four coins short of the $0.19 gift (19 RC) they bought it for.
 *
 * USD prices are untouched: the design sheet's $0.19 .. $2,000 remains exactly what the
 * user pays. What changes is how far a dollar goes in coins - i.e. the platform's real cut.
 */
return new class extends Migration
{
    private const LO = 80.0;   // coins per $1 at the cheapest item
    private const HI = 100.0;  // coins per $1 at the most expensive
    private const MIN_USD = 0.19;
    private const MAX_USD = 2000.0;

    /** Hard stop: 1 / (coin_usd_rate * (1 - commission)) with the shipped 100 RC/$1 and 30%. */
    private const CLIFF = 142.85;

    private function coinsFor(float $price): int
    {
        $t = (log10($price) - log10(self::MIN_USD)) / (log10(self::MAX_USD) - log10(self::MIN_USD));
        $t = max(0.0, min(1.0, $t));
        $rate = self::LO + (self::HI - self::LO) * $t;

        $coins = (int) max(1, round($price * $rate));

        // Never sell coins so cheaply that gifting them to an alt withdraws for more.
        if ($price > 0 && $coins / $price > self::CLIFF) {
            throw new RuntimeException("coin ladder crosses the cash-out cliff at \${$price}");
        }

        return $coins;
    }

    public function up(): void
    {
        DB::transaction(function () {
            foreach (DB::table('gifts')->whereNotNull('slug')->get(['slug', 'cash_value']) as $g) {
                $coins = $this->coinsFor((float) $g->cash_value);

                DB::table('gifts')->where('slug', $g->slug)->update(['coin_value' => $coins]);

                // The package illustrated by this gift funds exactly this gift.
                DB::table('coin_packages')->where('icon', $g->slug)
                    ->update(['coins' => $coins, 'updated_at' => now()]);
            }
        });
    }

    public function down(): void
    {
        // Back to the flat base rate (100 RC = $1) that 000002/000005 established.
        DB::transaction(function () {
            foreach (DB::table('gifts')->whereNotNull('slug')->get(['slug', 'cash_value']) as $g) {
                $coins = (int) max(1, round(((float) $g->cash_value) * 100));
                DB::table('gifts')->where('slug', $g->slug)->update(['coin_value' => $coins]);
                DB::table('coin_packages')->where('icon', $g->slug)
                    ->update(['coins' => $coins, 'updated_at' => now()]);
            }
        });
    }
};

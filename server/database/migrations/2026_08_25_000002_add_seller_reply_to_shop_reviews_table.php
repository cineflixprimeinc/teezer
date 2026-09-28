<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets a seller reply to a review left on their shop (Shop Settings >
 * Products > Product Reviews). shop_reviews is shop-wide, not per-product
 * (see 2026_08_18_000004's own docblock) - a reply therefore answers the
 * whole review, same scope as the review itself. One reply per review, not
 * a thread: a seller replacing their own reply is an update, not a new row.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shop_reviews', function (Blueprint $table) {
            $table->text('seller_reply')->nullable()->after('comment');
            $table->timestamp('seller_reply_at')->nullable()->after('seller_reply');
        });
    }

    public function down(): void
    {
        Schema::table('shop_reviews', function (Blueprint $table) {
            $table->dropColumn(['seller_reply', 'seller_reply_at']);
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Add link" → Reelsoo Product - up to 3 of the creator's OWN shop products
 * featured on a post. A normalized pivot, not columns on `videos`: a post
 * can carry several products, and this is the same shape `comment_mentions`
 * already uses for tag/collab (a join table, not JSON on the parent row),
 * so the app's existing "relationship, not embedded data" convention holds
 * here too. Product name/price/image are never copied in - always read live
 * from `products` through this relationship, so an edited price or a
 * removed listing is reflected everywhere the post shows it.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('video_products')) {
            return;
        }

        Schema::create('video_products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('video_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            // Preserves the creator's own selection order (spec: "Product A,
            // then C, then B" displays A, C, B) - re-derived on every save
            // rather than reordered in place, see VideoService::syncFeaturedProducts.
            $table->unsignedTinyInteger('position')->default(0);
            $table->timestamps();

            // A product can only be featured once per post - the sync
            // method already de-dupes before insert, this is the backend
            // guarantee behind that, not just a UI convenience.
            $table->unique(['video_id', 'product_id']);
            $table->index('video_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_products');
    }
};

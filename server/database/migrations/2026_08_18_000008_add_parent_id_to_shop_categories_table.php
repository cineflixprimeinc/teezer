<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Self-referencing parent, for the "Add New Product" form's optional
 * Subcategory field - a category with parent_id null is top-level (shown in
 * the Category dropdown); one with a parent is only offered once its parent
 * is selected.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shop_categories', function (Blueprint $table) {
            $table->foreignId('parent_id')->nullable()->after('id')
                ->constrained('shop_categories')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('shop_categories', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_id');
        });
    }
};

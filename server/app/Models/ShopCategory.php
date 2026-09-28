<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A platform-wide product category (Fashion, Beauty...), managed from the
 * admin panel's "Reelsoo Shop" section - see Admin\ShopCategoryController.
 * Every shop's product grid filters against this same global list.
 *
 * `parent_id` null = a top-level category (shown in the Add Product form's
 * "Category" field); non-null = a subcategory, only offered once its parent
 * is picked ("Subcategory (Optional)").
 */
class ShopCategory extends Model
{
    protected $fillable = [
        'parent_id', 'name', 'slug', 'is_active', 'sort_order',
        // Curation for the Shop marketplace home's category grid - see the
        // migration that added these. Independent of is_active: a category
        // can exist app-wide without being one of the ones featured there.
        'is_featured_home', 'home_sort_order',
    ];

    protected function casts(): array
    {
        return [
            'is_active'        => 'boolean',
            'sort_order'       => 'integer',
            'is_featured_home' => 'boolean',
            'home_sort_order'  => 'integer',
        ];
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class, 'category_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(ShopCategory::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(ShopCategory::class, 'parent_id');
    }

    public function toClientArray(): array
    {
        return [
            'id'                => $this->id,
            'parent_id'         => $this->parent_id,
            'name'              => $this->name,
            'slug'              => $this->slug,
            // Not sensitive (same as sort_order already being public) - the
            // Shop home grid filters/sorts on these client-side rather than
            // needing a second endpoint.
            'is_featured_home'  => (bool) $this->is_featured_home,
            'home_sort_order'   => (int) $this->home_sort_order,
        ];
    }
}

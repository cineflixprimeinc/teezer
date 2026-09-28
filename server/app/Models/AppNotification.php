<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AppNotification extends Model
{
    protected $table = 'notifications';
    // Timestamps are managed explicitly by NotificationService (created_at is
    // DB-defaulted; latest_activity_at / updated_at are set on every aggregation
    // bump) so Eloquent's auto-timestamping stays out of the way.
    public $timestamps = false;

    protected $fillable = [
        'user_id', 'actor_id', 'actor_count', 'type', 'entity_type', 'entity_id',
        'comment_id', 'message', 'is_read', 'action_status',
        'latest_activity_at', 'created_at', 'updated_at',
    ];

    protected function casts(): array
    {
        return [
            'is_read'            => 'boolean',
            'actor_count'        => 'integer',
            'created_at'         => 'datetime',
            'updated_at'         => 'datetime',
            'latest_activity_at' => 'datetime',
        ];
    }

    public function user()  { return $this->belongsTo(User::class); }
    public function actor() { return $this->belongsTo(User::class, 'actor_id'); }

    /** Full history of users who triggered this (aggregated) notification. */
    public function actors(): HasMany
    {
        return $this->hasMany(NotificationActor::class, 'notification_id');
    }

    public function scopeUnread($query)
    {
        return $query->where('is_read', false);
    }
}

@extends('layouts.creator')

@section('title', 'Creator Studio – Teezer')
@section('page_title', 'Creator Studio')

@section('content')
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        @foreach([
            ['label' => 'Total Views',      'value' => number_format($stats['total_views']),      'icon' => '👁️'],
            ['label' => 'Watch Time (hrs)',  'value' => number_format($stats['watch_time_hours']), 'icon' => '⏱️'],
            ['label' => 'New Followers',     'value' => number_format($stats['new_followers']),    'icon' => '👥'],
            ['label' => 'Earnings ($)',      'value' => '$' . $stats['earnings'],                  'icon' => '💰'],
            ['label' => 'Engagement Rate',  'value' => $stats['engagement_rate'] . '%',           'icon' => '📈'],
        ] as $card)
        <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
            <div class="text-2xl mb-2">{{ $card['icon'] }}</div>
            <div class="text-2xl font-bold">{{ $card['value'] }}</div>
            <div class="text-sm text-white/40 mt-1">{{ $card['label'] }}</div>
        </div>
        @endforeach
    </div>

    <div class="bg-white/5 border border-white/10 rounded-2xl p-6">
        <p class="text-sm text-white/40 text-center py-6">
            Full analytics and video management coming in Phase 3.
        </p>
    </div>
@endsection

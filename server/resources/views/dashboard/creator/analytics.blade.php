@extends('layouts.creator')

@section('title', 'Analytics – Creator Studio')
@section('page_title', 'Analytics')

@section('content')
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <x-stat-card label="Total Views"    value="-" icon="👁" />
        <x-stat-card label="Total Likes"    value="-" icon="❤️" color="pink" />
        <x-stat-card label="Followers"      value="-" icon="👥" color="blue" />
        <x-stat-card label="XP Points"      value="-" icon="⚡" color="amber" />
    </div>

    <div class="bg-[#111111] rounded-xl border border-white/5 p-6">
        <p class="text-gray-400 text-sm">Detailed analytics charts will be implemented in Phase 5.</p>
    </div>
@endsection

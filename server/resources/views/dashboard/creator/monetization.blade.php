@extends('layouts.creator')

@section('title', 'Monetization – Creator Studio')
@section('page_title', 'Monetization')

@section('content')
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <x-stat-card label="Coins Balance"  value="0" icon="🪙" color="amber" />
        <x-stat-card label="Total Earned"   value="0" icon="💰" color="green" />
        <x-stat-card label="Gifts Received" value="0" icon="🎁" color="pink" />
    </div>

    <div class="bg-[#111111] rounded-xl border border-white/5 p-6">
        <h2 class="text-white font-semibold mb-2">Wallet</h2>
        <p class="text-gray-400 text-sm">Wallet and withdrawal features will be enabled in Phase 6.</p>
    </div>
@endsection

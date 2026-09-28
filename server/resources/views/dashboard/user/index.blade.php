@extends('layouts.user')

@section('title', 'Home – Teezer')

@section('content')
    <div class="max-w-lg mx-auto text-center py-20">
        <div class="text-5xl mb-6">🎬</div>
        <h2 class="text-2xl font-bold mb-3">Welcome, {{ $user->name }}!</h2>
        <p class="text-white/40 mb-8">
            Your personalised feed is coming in Phase 2. Download the Teezer app to start watching and creating reels.
        </p>
        <a href="{{ route('home') }}"
           class="inline-block px-6 py-2.5 rounded-full font-bold bg-[#fe2c55] hover:bg-[#e0243d] transition-colors text-sm">
            Back to home
        </a>
    </div>
@endsection

@extends('layouts.website')

@section('title', 'Teezer - Coming Soon')

@section('content')
<section class="relative flex flex-col items-center justify-center text-center min-h-screen px-6 overflow-hidden">

    {{-- Background glow --}}
    <div class="absolute inset-0 bg-gradient-to-b from-[#fe2c55]/10 via-transparent to-transparent pointer-events-none"></div>

    {{-- Logo / wordmark --}}
    <div class="mb-10 select-none">
        <img src="{{ asset('reelsoo-mark.svg') }}" alt="Teezer" class="h-14 w-auto">
    </div>

    {{-- Headline --}}
    <h1 class="text-5xl sm:text-7xl font-extrabold tracking-tight mb-6 leading-none">
        Coming<br>
        <span style="color:#fe2c55;">Soon.</span>
    </h1>

    <p class="max-w-md text-lg text-white/50 mb-12">
        We're putting the finishing touches on something exciting.
        Short videos. Real creators. Global audience.
    </p>

    {{-- CTA buttons --}}
    <div class="flex gap-4 flex-wrap justify-center mb-16">
        <a href="{{ route('login') }}"
           class="px-8 py-3 rounded-full font-bold text-base bg-[#fe2c55] hover:bg-[#e0243d] transition-colors shadow-lg shadow-[#fe2c55]/25">
            Log In
        </a>
    </div>

    {{-- API status --}}
    <p class="text-xs text-white/25">
        API status:
        <a href="https://api.teezer.live/api/v1/health"
           target="_blank"
           rel="noopener noreferrer"
           class="text-white/40 hover:text-white/70 underline underline-offset-2 transition-colors">
            api.teezer.live/api/v1/health
        </a>
    </p>

</section>
@endsection

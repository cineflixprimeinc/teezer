@extends('layouts.base')

@section('body')
    <div class="min-h-screen flex flex-col items-center justify-center bg-black px-4">
        <a href="{{ route('home') }}" class="mb-8">
            <img src="{{ asset('teezer-mark.svg') }}" alt="Teezer" class="h-10 w-auto">
        </a>

        <div class="w-full max-w-sm bg-[#111] border border-white/10 rounded-2xl p-8 shadow-2xl">
            @if(session('error'))
                <div class="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    {{ session('error') }}
                </div>
            @endif

            @if(session('status'))
                <div class="mb-4 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                    {{ session('status') }}
                </div>
            @endif

            @yield('content')
        </div>

        <p class="mt-6 text-sm text-white/40">
            @yield('footer_link')
        </p>
    </div>
@endsection

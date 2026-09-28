@extends('layouts.base')

@section('body')
    {{-- Website Navigation --}}
    <nav class="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 py-3 bg-black/80 backdrop-blur-sm border-b border-white/10">
        <a href="{{ route('home') }}" class="flex items-center gap-2">
            <img src="{{ asset('reelsoo-mark.svg') }}" alt="Teezer" class="h-8 w-auto">
        </a>
        <div class="flex items-center gap-4">
            @auth
                <a href="{{ route('dashboard') }}"
                   class="px-4 py-1.5 rounded-full text-sm font-semibold bg-[#fd4605] hover:bg-[#e03e04] transition-colors">
                    Dashboard
                </a>
            @else
                <a href="{{ route('login') }}" class="text-sm text-white/80 hover:text-white transition-colors">Log in</a>
                <a href="{{ route('register') }}"
                   class="px-4 py-1.5 rounded-full text-sm font-semibold bg-[#fd4605] hover:bg-[#e03e04] transition-colors">
                    Sign up
                </a>
            @endauth
        </div>
    </nav>

    <main class="pt-14">
        @yield('content')
    </main>

    <footer class="border-t border-white/10 py-8 text-center text-sm text-white/40">
        &copy; {{ date('Y') }} Teezer. All rights reserved.
    </footer>
@endsection

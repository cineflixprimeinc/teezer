@extends('layouts.base')

@section('body')
    <div class="min-h-screen flex flex-col bg-[#0a0a0a]">
        <header class="h-14 border-b border-white/10 flex items-center justify-between px-6">
            <a href="{{ route('home') }}" class="flex items-center gap-2">
                <img src="{{ asset('reelsoo-icon.svg') }}" alt="" class="w-8 h-8 rounded-lg">
                <span class="text-xl font-extrabold tracking-tight text-white">Teezer</span>
            </a>
            <div class="flex items-center gap-4">
                <span class="text-sm text-white/60">{{ auth()->user()->name }}</span>
                <form action="{{ route('logout') }}" method="POST">
                    @csrf
                    <button type="submit" class="text-sm text-white/50 hover:text-white transition-colors">
                        Sign out
                    </button>
                </form>
            </div>
        </header>
        <main class="flex-1 overflow-y-auto p-6">
            @yield('content')
        </main>
    </div>
@endsection

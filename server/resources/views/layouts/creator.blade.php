@extends('layouts.base')

@section('body')
    <div class="min-h-screen flex bg-[#0a0a0a]">
        {{-- Sidebar --}}
        <aside class="w-64 shrink-0 border-r border-white/10 flex flex-col">
            <div class="h-16 flex items-center px-6 border-b border-white/10">
                <img src="{{ asset('reelsoo-icon.svg') }}" alt="" class="w-8 h-8 rounded-lg mr-3">
                <span class="text-xl font-extrabold tracking-tight text-white">Teezer</span>
                <span class="ml-2 text-xs font-semibold text-white/40 uppercase tracking-widest">Studio</span>
            </div>
            <nav class="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                <a href="{{ route('creator.index') }}" @class(['flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors', 'bg-[#fd4605]/10 text-[#fd4605]' => request()->routeIs('creator.index'), 'text-white/70 hover:text-white hover:bg-white/5' => !request()->routeIs('creator.index')])>
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                    Analytics
                </a>
            </nav>
            <div class="border-t border-white/10 p-4">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-8 h-8 rounded-full bg-[#fd4605]/20 flex items-center justify-center text-xs font-bold text-[#fd4605]">
                        {{ strtoupper(substr(auth()->user()->name, 0, 1)) }}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium truncate">{{ auth()->user()->name }}</p>
                        <p class="text-xs text-white/40 truncate">@{{ auth()->user()->username }}</p>
                    </div>
                </div>
                <form action="{{ route('logout') }}" method="POST">
                    @csrf
                    <button type="submit" class="w-full text-left text-sm text-white/50 hover:text-white transition-colors">
                        Sign out
                    </button>
                </form>
            </div>
        </aside>

        <div class="flex-1 flex flex-col min-w-0">
            <header class="h-16 border-b border-white/10 flex items-center px-6">
                <h1 class="text-base font-semibold">@yield('page_title', 'Creator Studio')</h1>
            </header>
            <main class="flex-1 overflow-y-auto p-6">
                @yield('content')
            </main>
        </div>
    </div>
@endsection

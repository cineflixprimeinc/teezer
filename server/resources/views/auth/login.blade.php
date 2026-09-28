@extends('layouts.auth')

@section('title', 'Log in – Teezer')

@section('content')
    <h2 class="text-xl font-bold text-center mb-6">Log in to Teezer</h2>

    <form action="{{ route('login.post') }}" method="POST" class="space-y-4">
        @csrf

        <div>
            <label for="email" class="block text-sm text-white/60 mb-1">Email or username</label>
            <input
                id="email"
                name="email"
                type="text"
                autocomplete="username"
                value="{{ old('email') }}"
                placeholder="you@example.com"
                class="w-full px-4 py-2.5 rounded-xl bg-white/5 border @error('email') border-red-500 @else border-white/10 @enderror text-sm focus:outline-none focus:border-[#fd4605] transition-colors"
            >
            @error('email')
                <p class="mt-1 text-xs text-red-400">{{ $message }}</p>
            @enderror
        </div>

        <div>
            <label for="password" class="block text-sm text-white/60 mb-1">Password</label>
            <input
                id="password"
                name="password"
                type="password"
                autocomplete="current-password"
                placeholder="••••••••"
                class="w-full px-4 py-2.5 rounded-xl bg-white/5 border @error('password') border-red-500 @else border-white/10 @enderror text-sm focus:outline-none focus:border-[#fd4605] transition-colors"
            >
            @error('password')
                <p class="mt-1 text-xs text-red-400">{{ $message }}</p>
            @enderror
        </div>

        <div class="flex items-center justify-between">
            <label class="flex items-center gap-2 text-sm text-white/50 cursor-pointer">
                <input type="checkbox" name="remember" class="accent-[#fd4605]"> Remember me
            </label>
            <a href="{{ route('password.request') }}" class="text-sm text-[#fd4605] hover:underline">Forgot password?</a>
        </div>

        <button type="submit"
                class="w-full py-2.5 rounded-xl font-bold bg-[#fd4605] hover:bg-[#e03e04] transition-colors text-sm mt-2">
            Log in
        </button>
    </form>
@endsection

@section('footer_link')
    Don't have an account?
    <a href="{{ route('register') }}" class="text-[#fd4605] hover:underline ml-1">Sign up</a>
@endsection

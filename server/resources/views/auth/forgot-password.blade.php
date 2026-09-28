@extends('layouts.auth')

@section('title', 'Reset password – Teezer')

@section('content')
    <h2 class="text-xl font-bold text-center mb-2">Forgot your password?</h2>
    <p class="text-sm text-center text-white/40 mb-6">Enter your email and we'll send a reset link.</p>

    <form action="{{ route('password.email') }}" method="POST" class="space-y-4">
        @csrf
        <div>
            <label for="email" class="block text-sm text-white/60 mb-1">Email</label>
            <input id="email" name="email" type="email" value="{{ old('email') }}" placeholder="you@example.com"
                class="w-full px-4 py-2.5 rounded-xl bg-white/5 border @error('email') border-red-500 @else border-white/10 @enderror text-sm focus:outline-none focus:border-[#fe2c55] transition-colors">
            @error('email')<p class="mt-1 text-xs text-red-400">{{ $message }}</p>@enderror
        </div>
        <button type="submit"
                class="w-full py-2.5 rounded-xl font-bold bg-[#fe2c55] hover:bg-[#e0243d] transition-colors text-sm">
            Send reset link
        </button>
    </form>
@endsection

@section('footer_link')
    <a href="{{ route('login') }}" class="text-[#fe2c55] hover:underline">Back to log in</a>
@endsection

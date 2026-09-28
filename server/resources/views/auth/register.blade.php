@extends('layouts.auth')

@section('title', 'Create account – Teezer')

@section('content')
    <h2 class="text-xl font-bold text-center mb-6">Create your account</h2>

    <form action="{{ route('register.post') }}" method="POST" class="space-y-4">
        @csrf

        <div>
            <label for="name" class="block text-sm text-white/60 mb-1">Full name</label>
            <input id="name" name="name" type="text" value="{{ old('name') }}" placeholder="Your name"
                class="w-full px-4 py-2.5 rounded-xl bg-white/5 border @error('name') border-red-500 @else border-white/10 @enderror text-sm focus:outline-none focus:border-[#fd4605] transition-colors">
            @error('name')<p class="mt-1 text-xs text-red-400">{{ $message }}</p>@enderror
        </div>

        <div>
            <label for="username" class="block text-sm text-white/60 mb-1">Username</label>
            <input id="username" name="username" type="text" value="{{ old('username') }}" placeholder="coolcreator"
                class="w-full px-4 py-2.5 rounded-xl bg-white/5 border @error('username') border-red-500 @else border-white/10 @enderror text-sm focus:outline-none focus:border-[#fd4605] transition-colors">
            @error('username')<p class="mt-1 text-xs text-red-400">{{ $message }}</p>@enderror
        </div>

        <div>
            <label for="email" class="block text-sm text-white/60 mb-1">Email</label>
            <input id="email" name="email" type="email" value="{{ old('email') }}" placeholder="you@example.com"
                class="w-full px-4 py-2.5 rounded-xl bg-white/5 border @error('email') border-red-500 @else border-white/10 @enderror text-sm focus:outline-none focus:border-[#fd4605] transition-colors">
            @error('email')<p class="mt-1 text-xs text-red-400">{{ $message }}</p>@enderror
        </div>

        <div>
            <label for="password" class="block text-sm text-white/60 mb-1">Password</label>
            <input id="password" name="password" type="password" placeholder="Min. 8 characters"
                class="w-full px-4 py-2.5 rounded-xl bg-white/5 border @error('password') border-red-500 @else border-white/10 @enderror text-sm focus:outline-none focus:border-[#fd4605] transition-colors">
            @error('password')<p class="mt-1 text-xs text-red-400">{{ $message }}</p>@enderror
        </div>

        <div>
            <label for="password_confirmation" class="block text-sm text-white/60 mb-1">Confirm password</label>
            <input id="password_confirmation" name="password_confirmation" type="password" placeholder="Repeat password"
                class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-[#fd4605] transition-colors">
        </div>

        <button type="submit"
                class="w-full py-2.5 rounded-xl font-bold bg-[#fd4605] hover:bg-[#e03e04] transition-colors text-sm mt-2">
            Create account
        </button>

        <p class="text-xs text-center text-white/30">
            By signing up you agree to our Terms of Service and Privacy Policy.
        </p>
    </form>
@endsection

@section('footer_link')
    Already have an account?
    <a href="{{ route('login') }}" class="text-[#fd4605] hover:underline ml-1">Log in</a>
@endsection

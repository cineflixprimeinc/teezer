@extends('layouts.user')

@section('title', 'Settings')
@section('page_title', 'Account Settings')

@section('content')
    @if(session('success'))
        <x-alert type="success" :message="session('success')" class="mb-4" />
    @endif

    <form action="{{ route('user.settings.update') }}" method="POST" class="max-w-2xl space-y-6">
        @csrf
        <div class="bg-[#111111] rounded-xl border border-white/5 p-6 space-y-5">
            <h2 class="text-white font-semibold">Account</h2>
            <div>
                <label class="block text-xs text-gray-400 mb-1">Display Name</label>
                <input type="text" name="name" value="{{ auth()->user()->name }}"
                    class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[#fd4605]">
            </div>
            <div>
                <label class="block text-xs text-gray-400 mb-1">Email</label>
                <input type="email" name="email" value="{{ auth()->user()->email }}" disabled
                    class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-500 cursor-not-allowed">
                <p class="text-xs text-gray-600 mt-1">Email cannot be changed here.</p>
            </div>
        </div>
        <x-action-btn type="submit" size="md">Save Settings</x-action-btn>
    </form>
@endsection

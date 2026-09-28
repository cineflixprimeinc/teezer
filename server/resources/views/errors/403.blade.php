@extends('layouts.base')

@section('title', '403 – Forbidden')

@section('body')
    <div class="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <div class="text-7xl font-extrabold" style="color:#fe2c55;">403</div>
        <h1 class="text-2xl font-bold mt-4 mb-2">Access Denied</h1>
        <p class="text-white/40 mb-8">You don't have permission to access this area.</p>
        <a href="{{ url()->previous() !== url()->current() ? url()->previous() : route('dashboard') }}"
           class="px-6 py-2.5 rounded-full bg-[#fe2c55] hover:bg-[#e0243d] transition-colors font-semibold text-sm">
            Go back
        </a>
    </div>
@endsection

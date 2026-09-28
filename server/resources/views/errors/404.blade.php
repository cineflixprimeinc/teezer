@extends('layouts.base')

@section('title', '404 – Not Found')

@section('body')
    <div class="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <div class="text-7xl font-extrabold" style="color:#fd4605;">404</div>
        <h1 class="text-2xl font-bold mt-4 mb-2">Page Not Found</h1>
        <p class="text-white/40 mb-8">The page you're looking for doesn't exist or has been moved.</p>
        <a href="{{ route('home') }}"
           class="px-6 py-2.5 rounded-full bg-[#fd4605] hover:bg-[#e03e04] transition-colors font-semibold text-sm">
            Go home
        </a>
    </div>
@endsection

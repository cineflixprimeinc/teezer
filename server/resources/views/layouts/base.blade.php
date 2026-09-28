<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="h-full">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', config('app.name'))</title>
    <meta name="description" content="@yield('meta_description', 'Teezer – Share your world, one reel at a time.')">
    <link rel="icon" type="image/svg+xml" href="{{ asset('reelsoo-icon.svg') }}">
    <link rel="apple-touch-icon" href="{{ asset('reelsoo-icon.svg') }}">
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @stack('head')
</head>
<body class="h-full bg-black text-white antialiased">
    @yield('body')
    @stack('scripts')
</body>
</html>

{{--
    Shown when the local licence check refuses a web request on a customer
    installation. Deliberately self-contained: no layout, no CSS file, no font,
    no script, no image. This page has to render on an installation that has
    just failed its licence check, which is precisely the moment when nothing
    else can be assumed to work.

    CLIENT-SIDE - ships in the marketplace package.
--}}
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Licence required</title>
<style>
    :root { color-scheme: light dark; }
    body {
        margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
        background: #0a0a0a; color: #ededed; padding: 24px;
        font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .card { max-width: 520px; width: 100%; background: #141414; border: 1px solid #262626; border-radius: 14px; padding: 32px; }
    h1 { margin: 0 0 12px; font-size: 20px; font-weight: 650; letter-spacing: -0.01em; }
    p { margin: 0 0 16px; color: #a3a3a3; }
    .status { display: inline-block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
              color: #fca5a5; background: rgba(220,38,38,0.12); border: 1px solid rgba(220,38,38,0.3);
              border-radius: 999px; padding: 4px 10px; margin-bottom: 16px; }
    a.btn { display: inline-block; background: #ededed; color: #0a0a0a; text-decoration: none;
            font-weight: 600; border-radius: 8px; padding: 10px 18px; }
    .foot { margin: 20px 0 0; font-size: 13px; color: #737373; }
</style>
</head>
<body>
    <div class="card">
        <span class="status">{{ $status }}</span>
        <h1>This installation needs a valid licence</h1>
        <p>{{ $message }}</p>

        @if ($setupUrl)
            <p><a class="btn" href="{{ $setupUrl }}">Run setup</a></p>
        @endif

        <p class="foot">
            Your data has not been changed or removed. Once the licence is valid,
            the site resumes exactly as it was.
        </p>
    </div>
</body>
</html>

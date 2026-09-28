<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#121014;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f7;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.8px;color:#8a8592;text-transform:uppercase;">Teezer monetization</p>
          <h1 style="margin:0 0 14px;font-size:23px;line-height:1.25;font-weight:800;">{{ $label }} is now available</h1>

          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3d3946;">
            Hi {{ $name }}, you asked to be told when this opened — it has.
          </p>

          @if ($description)
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3d3946;">{{ $description }}</p>
          @endif

          <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#3d3946;">
            Your account meets the requirements, so you can start using it now. Open
            your monetization page to see what it unlocks and finish any setup it asks for.
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:12px;background:#fd4605;">
              <a href="{{ $url }}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">{{ $cta }}</a>
            </td>
          </tr></table>

          <p style="margin:24px 0 0;font-size:12.5px;line-height:1.6;color:#8a8592;">
            You're getting this once, because you tapped “Notify when available”. Nothing else changes on your account.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>

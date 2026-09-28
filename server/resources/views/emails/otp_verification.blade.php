<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login Verification – Teezer</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
<tr><td align="center">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">

  <!-- ── Logo ── -->
  <tr>
    <td style="padding:22px 32px;border-bottom:1px solid #f0f0f0;text-align:center;">
      <img src="https://teezer.live/reelsoo-logo.png" width="120" alt="Teezer" style="display:inline-block;width:120px;height:auto;vertical-align:middle;">
    </td>
  </tr>

  <!-- ── Hero ── -->
  <tr>
    <td style="padding:36px 32px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:middle;padding-right:20px;">
            <p style="margin:0 0 14px;font-size:26px;font-weight:800;color:#0f172a;line-height:1.2;letter-spacing:-0.3px;">
              Login Verification &#128274;
            </p>
            <p style="margin:0 0 10px;font-size:15px;color:#374151;line-height:1.5;">
              Hi <strong style="color:#fe2c55;">{{ $firstName }}</strong>,
            </p>
            <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.75;">
              We received a request to log in to your Teezer account. Please use the verification code below to complete your login.
            </p>
          </td>
          <td style="width:170px;vertical-align:middle;text-align:center;">
            <img src="https://teezer.live/email-login-illustration.png" width="155" alt="" style="display:block;width:155px;height:auto;margin:0 auto;">
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── OTP Code Box ── -->
  <tr>
    <td style="padding:0 24px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #fecdd3;border-radius:12px;">
        <tr>
          <td style="padding:28px 20px;text-align:center;">

            <p style="margin:0 0 22px;font-size:17px;font-weight:700;color:#0f172a;">Your Login Verification Code</p>

            @php $digits = str_split($otp); @endphp
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 22px;">
              <tr>
                @foreach($digits as $digit)
                <td style="padding:0 5px;">
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" valign="middle"
                          style="width:62px;height:72px;background:#ffffff;border:1.5px solid #fca5a5;border-radius:10px;font-size:36px;font-weight:800;color:#fe2c55;text-align:center;vertical-align:middle;line-height:72px;">{{ $digit }}</td>
                    </tr>
                  </table>
                </td>
                @endforeach
              </tr>
            </table>

            <p style="margin:0;font-size:13px;color:#374151;line-height:1.5;">
              This code will expire in <strong style="color:#fe2c55;">{{ $expiryMinutes }} minutes.</strong>
            </p>

          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── Security Notice ── -->
  <tr>
    <td style="padding:0 24px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:12px;">
        <tr>
          <td style="padding:18px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <!-- Shield icon -->
                <td style="width:52px;vertical-align:middle;padding-right:14px;">
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" valign="middle"
                          style="width:48px;height:48px;background:#dbeafe;border-radius:24px;text-align:center;vertical-align:middle;font-size:22px;line-height:48px;">&#128737;</td>
                    </tr>
                  </table>
                </td>
                <!-- Text -->
                <td style="vertical-align:middle;">
                  <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0f172a;">Didn't try to log in?</p>
                  <p style="margin:0;font-size:12px;color:#475569;line-height:1.65;">If you didn't request this login, please ignore this email or contact our support team immediately to secure your account.</p>
                </td>
                <!-- Button -->
                <td style="width:130px;vertical-align:middle;text-align:right;padding-left:16px;">
                  <a href="https://teezer.live/contact"
                     style="display:inline-block;border:1.5px solid #93c5fd;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:600;color:#3b82f6;text-decoration:none;white-space:nowrap;background:#ffffff;">
                    Contact Support
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── Footer ── -->
  <tr>
    <td style="padding:20px 32px 28px;border-top:1px solid #f0f0f0;text-align:center;">

      <!-- Social icons -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
        <tr>
          <td style="padding:0 5px;">
            <a href="https://facebook.com/teezer" style="display:inline-block;text-decoration:none;">
              <img src="https://teezer.live/icons/social/facebook.png" width="34" height="34" alt="Facebook" style="display:block;width:34px;height:34px;border-radius:50%;">
            </a>
          </td>
          <td style="padding:0 5px;">
            <a href="https://instagram.com/teezer" style="display:inline-block;text-decoration:none;">
              <img src="https://teezer.live/icons/social/instagram.png" width="34" height="34" alt="Instagram" style="display:block;width:34px;height:34px;border-radius:50%;">
            </a>
          </td>
          <td style="padding:0 5px;">
            <a href="https://twitter.com/teezer" style="display:inline-block;text-decoration:none;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" valign="middle" style="width:34px;height:34px;background:#000000;border-radius:17px;text-align:center;vertical-align:middle;">
                    <img src="https://teezer.live/icons/social/twitter.png" width="18" height="18" alt="X" style="display:block;width:18px;height:18px;margin:0 auto;">
                  </td>
                </tr>
              </table>
            </a>
          </td>
          <td style="padding:0 5px;">
            <a href="https://youtube.com/@teezer" style="display:inline-block;text-decoration:none;">
              <img src="https://teezer.live/icons/social/youtube.png" width="34" height="34" alt="YouTube" style="display:block;width:34px;height:34px;border-radius:50%;">
            </a>
          </td>
          <td style="padding:0 5px;">
            <a href="https://t.me/teezer" style="display:inline-block;text-decoration:none;">
              <img src="https://teezer.live/icons/social/telegram.png" width="34" height="34" alt="Telegram" style="display:block;width:34px;height:34px;border-radius:50%;">
            </a>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;">
        &copy; {{ date('Y') }} Teezer. All rights reserved.
      </p>
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        <a href="https://teezer.live/privacy" style="color:#9ca3af;text-decoration:none;">Privacy Policy</a>
        &nbsp;&bull;&nbsp;
        <a href="https://teezer.live/terms" style="color:#9ca3af;text-decoration:none;">Terms of Service</a>
        &nbsp;&bull;&nbsp;
        <a href="https://teezer.live/contact" style="color:#9ca3af;text-decoration:none;">Help Center</a>
      </p>
    </td>
  </tr>

</table>

</td></tr>
</table>

</body>
</html>

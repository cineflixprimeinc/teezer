<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

class AdminEmailSettingsController extends Controller
{
    private const MASKED = '••••••••';

    private const EMAIL_KEYS = [
        'mail_mailer', 'mail_host', 'mail_port',
        'mail_username', 'mail_password', 'mail_encryption',
        'mail_from_address', 'mail_from_name',
    ];

    private const OTP_KEYS = [
        'otp_expiry_minutes', 'otp_max_per_10min',
        'otp_max_per_hour', 'otp_max_per_day',
    ];

    private const OTP_DEFAULTS = [
        'otp_expiry_minutes' => '30',
        'otp_max_per_10min'  => '5',
        'otp_max_per_hour'   => '10',
        'otp_max_per_day'    => '20',
    ];

    public function index(): JsonResponse
    {
        $email = AppSetting::whereIn('key', self::EMAIL_KEYS)->pluck('value', 'key');
        $otp   = AppSetting::whereIn('key', self::OTP_KEYS)->pluck('value', 'key');

        return response()->json([
            'success' => true,
            'data' => [
                'email' => [
                    'mail_mailer'       => $email->get('mail_mailer', 'smtp'),
                    'mail_host'         => $email->get('mail_host', ''),
                    'mail_port'         => $email->get('mail_port', '587'),
                    'mail_username'     => $email->get('mail_username', ''),
                    'mail_password'     => $email->get('mail_password') ? self::MASKED : '',
                    'mail_encryption'   => $email->get('mail_encryption', 'tls'),
                    'mail_from_address' => $email->get('mail_from_address', ''),
                    'mail_from_name'    => $email->get('mail_from_name', 'Teezer'),
                ],
                'otp' => [
                    'otp_expiry_minutes' => $otp->get('otp_expiry_minutes', self::OTP_DEFAULTS['otp_expiry_minutes']),
                    'otp_max_per_10min'  => $otp->get('otp_max_per_10min',  self::OTP_DEFAULTS['otp_max_per_10min']),
                    'otp_max_per_hour'   => $otp->get('otp_max_per_hour',   self::OTP_DEFAULTS['otp_max_per_hour']),
                    'otp_max_per_day'    => $otp->get('otp_max_per_day',    self::OTP_DEFAULTS['otp_max_per_day']),
                ],
            ],
        ]);
    }

    public function updateEmail(Request $request): JsonResponse
    {
        $request->validate([
            'mail_mailer'       => ['required', 'in:smtp,sendmail,log,mailgun,ses'],
            'mail_host'         => ['nullable', 'string', 'max:255'],
            'mail_port'         => ['nullable', 'integer', 'min:1', 'max:65535'],
            'mail_username'     => ['nullable', 'string', 'max:255'],
            'mail_password'     => ['nullable', 'string', 'max:500'],
            'mail_encryption'   => ['nullable', 'in:tls,ssl,'],
            'mail_from_address' => ['required', 'email', 'max:255'],
            'mail_from_name'    => ['required', 'string', 'max:100'],
        ]);

        $fields = [
            'mail_mailer', 'mail_host', 'mail_port',
            'mail_username', 'mail_encryption',
            'mail_from_address', 'mail_from_name',
        ];

        foreach ($fields as $key) {
            if ($request->has($key)) {
                AppSetting::set($key, (string) $request->input($key, ''), 'string');
                AppSetting::where('key', $key)->update(['group' => 'email']);
            }
        }

        // Only update password if user actually sent a new value (not the masked placeholder)
        $pwd = $request->input('mail_password', '');
        if ($pwd && $pwd !== self::MASKED) {
            AppSetting::set('mail_password', $pwd, 'string');
            AppSetting::where('key', 'mail_password')->update(['group' => 'email']);
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_email_settings',
            target: null,
            description: 'Updated email/SMTP configuration',
            metadata: ['mailer' => $request->mail_mailer, 'host' => $request->mail_host],
        );

        return response()->json(['success' => true, 'message' => 'Email settings saved.']);
    }

    public function updateOtp(Request $request): JsonResponse
    {
        $request->validate([
            'otp_expiry_minutes' => ['required', 'integer', 'min:5',  'max:1440'],
            'otp_max_per_10min'  => ['required', 'integer', 'min:1',  'max:20'],
            'otp_max_per_hour'   => ['required', 'integer', 'min:1',  'max:60'],
            'otp_max_per_day'    => ['required', 'integer', 'min:1',  'max:200'],
        ]);

        foreach (self::OTP_KEYS as $key) {
            AppSetting::set($key, (string) $request->input($key), 'integer');
            AppSetting::where('key', $key)->update(['group' => 'otp']);
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_otp_settings',
            target: null,
            description: 'Updated OTP rate limit settings',
            metadata: $request->only(self::OTP_KEYS),
        );

        return response()->json(['success' => true, 'message' => 'OTP settings saved.']);
    }

    public function testEmail(Request $request): JsonResponse
    {
        $request->validate([
            'to' => ['required', 'email', 'max:191'],
        ]);

        // Apply DB settings to runtime config so the test uses the saved credentials
        $this->applyMailConfig();

        try {
            Mail::raw(
                "This is a test email from your Teezer admin panel.\n\nIf you received this, your email configuration is working correctly.",
                function ($msg) use ($request) {
                    $msg->to($request->to)
                        ->subject('Teezer - Email Configuration Test');
                }
            );
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to send: ' . $e->getMessage(),
            ], 422);
        }

        return response()->json(['success' => true, 'message' => "Test email sent to {$request->to}."]);
    }

    private function applyMailConfig(): void
    {
        $s = AppSetting::whereIn('key', self::EMAIL_KEYS)->pluck('value', 'key');
        if (!$s->get('mail_mailer')) return;

        config([
            'mail.default'                   => $s->get('mail_mailer', 'smtp'),
            'mail.mailers.smtp.host'         => $s->get('mail_host', ''),
            'mail.mailers.smtp.port'         => (int) $s->get('mail_port', 587),
            'mail.mailers.smtp.username'     => $s->get('mail_username', ''),
            'mail.mailers.smtp.password'     => $s->get('mail_password', ''),
            'mail.mailers.smtp.encryption'   => $s->get('mail_encryption', 'tls') ?: 'tls',
            'mail.from.address'              => $s->get('mail_from_address', ''),
            'mail.from.name'                 => $s->get('mail_from_name', 'Teezer'),
        ]);
    }
}

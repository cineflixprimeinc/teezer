<?php

namespace App\Services\Ads;

/**
 * Signs/verifies the per-serve impression token so billable ad events can't be
 * spoofed or replayed: a beacon is only honoured if it carries a token this server
 * minted at serve time, unexpired, and untampered.
 */
class AdSigner
{
    private const TTL_MINUTES = 60;

    public function mint(int $campaignId, int $adGroupId, int $creativeId, ?int $userId, int $priceCents): string
    {
        $exp     = now()->addMinutes(self::TTL_MINUTES)->timestamp;
        $payload = implode('.', [$campaignId, $adGroupId, $creativeId, $userId ?? 0, $priceCents, $exp]);
        $sig     = hash_hmac('sha256', $payload, $this->secret());

        return $this->b64(($payload . '.' . $sig));
    }

    /** @return array{campaign_id:int,ad_group_id:int,creative_id:int,user_id:int,price_cents:int}|null */
    public function verify(string $token): ?array
    {
        $raw = $this->unb64($token);
        if ($raw === null) {
            return null;
        }

        $parts = explode('.', $raw);
        if (count($parts) !== 7) {
            return null;
        }
        [$campaign, $group, $creative, $user, $price, $exp, $sig] = $parts;

        $payload  = implode('.', [$campaign, $group, $creative, $user, $price, $exp]);
        $expected = hash_hmac('sha256', $payload, $this->secret());

        if (! hash_equals($expected, $sig)) {
            return null;
        }
        if ((int) $exp < now()->timestamp) {
            return null;
        }

        return [
            'campaign_id' => (int) $campaign,
            'ad_group_id' => (int) $group,
            'creative_id' => (int) $creative,
            'user_id'     => (int) $user,
            'price_cents' => (int) $price,
        ];
    }

    private function secret(): string
    {
        return (string) (config('ads.signing_secret') ?: config('app.key'));
    }

    private function b64(string $s): string
    {
        return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    }

    private function unb64(string $s): ?string
    {
        $decoded = base64_decode(strtr($s, '-_', '+/'), true);

        return $decoded === false ? null : $decoded;
    }
}

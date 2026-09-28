'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getPaymentSettings,
  updatePaymentSettings,
  testPaypalConnection,
  testStripeConnection,
  type PaymentSettings,
  type PaymentSettingsUpdate,
} from '@/services/payment-settings.service';

const SECRET_MASK = '••••••••';

/* ── Brand SVG logos ────────────────────────────────────────────────────── */
function PayPalLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M7.5 3h7c3.3 0 5.5 1.8 5.1 5.1C19.1 11.8 16.5 14 13 14H10.5l-1 6H6l2.5-14.5L7.5 3z" fill="#003087"/>
      <path d="M19.5 8.5C19 12 16.5 14 13 14h-2.5l-1.5 8h3.5l.5-3h2c3.5 0 5.5-2 6-5.5.3-2.5-.5-4-1.5-5z" fill="#009cde"/>
    </svg>
  );
}

function StripeLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#6772E5"/>
      <path d="M11.1 9.5c0-.9.8-1.3 2-1.3 1.8 0 4 .6 5.5 1.5V6.2C17.1 5.4 15.4 5 13.1 5 9.5 5 7 6.8 7 9.7c0 4.6 6.3 3.8 6.3 5.8 0 1-.9 1.4-2.2 1.4-1.9 0-4.3-.8-6.1-1.8v3.5c2 .9 4 1.4 6.1 1.4C14.6 20 17 18.2 17 15c0-4.9-5.9-4.1-5.9-5.5z" fill="white"/>
    </svg>
  );
}

function RazorpayLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L4 20h5.5L12 14l2.5 6H20L12 2z" fill="#072654"/>
      <path d="M12 14l2.5 6H20L12 2l-3.5 9H12z" fill="#3395FF"/>
    </svg>
  );
}

function BankLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 9l9-7 9 7v2H3V9z" fill="#059669"/>
      <rect x="5" y="11" width="3" height="7" fill="#059669" opacity=".7"/>
      <rect x="10.5" y="11" width="3" height="7" fill="#059669" opacity=".7"/>
      <rect x="16" y="11" width="3" height="7" fill="#059669" opacity=".7"/>
      <rect x="3" y="18" width="18" height="2" rx="1" fill="#059669"/>
    </svg>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────────────── */
type Tab = 'gateways' | 'methods' | 'pricing' | 'economics';

const TABS: { id: Tab; label: string }[] = [
  { id: 'gateways',  label: 'Payment Gateways' },
  { id: 'methods',   label: 'Payment Methods'  },
  { id: 'pricing',   label: 'Pricing'          },
  { id: 'economics', label: 'Coin Economics'   },
];

/* ════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════════════════════ */
export default function PaymentSettingsPanel() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [tab, setTab]           = useState<Tab>('gateways');

  const [showPaypalSecret,  setShowPaypalSecret]  = useState(false);
  const [showStripeSecret,  setShowStripeSecret]  = useState(false);
  const [showStripeWebhook, setShowStripeWebhook] = useState(false);
  const [showRzpSecret,     setShowRzpSecret]     = useState(false);

  const [ppTest,  setPpTest]  = useState<'idle'|'testing'|'ok'|'fail'>('idle');
  const [ppMsg,   setPpMsg]   = useState('');
  const [strTest, setStrTest] = useState<'idle'|'testing'|'ok'|'fail'>('idle');
  const [strMsg,  setStrMsg]  = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try   { setSettings(await getPaymentSettings()); }
    catch { setError('Failed to load payment settings.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true); setError(null);
    try {
      const payload: PaymentSettingsUpdate = {
        paypal_enabled: settings.paypal.enabled,
        paypal_mode:    settings.paypal.mode,
        paypal_client_id: settings.paypal.client_id,
        stripe_enabled:        settings.stripe.enabled,
        stripe_mode:           settings.stripe.mode,
        stripe_publishable_key: settings.stripe.publishable_key,
        razorpay_enabled: settings.razorpay.enabled,
        razorpay_key_id:  settings.razorpay.key_id,
        bank_enabled:              settings.bank.enabled,
        bank_name:                 settings.bank.bank_name,
        bank_account_holder:       settings.bank.account_holder,
        bank_account_number:       settings.bank.account_number,
        bank_routing_number:       settings.bank.routing_number,
        bank_swift_code:           settings.bank.swift_code,
        bank_enabled_instructions: settings.bank.instructions,
        subscription_monthly_price: settings.pricing.subscription_monthly,
        subscription_annual_price:  settings.pricing.subscription_annual,
        badge_price:                settings.pricing.badge_price,
        card_enabled:      settings.methods.card,
        applepay_enabled:  settings.methods.applepay,
        googlepay_enabled: settings.methods.googlepay,
        upi_enabled:       settings.methods.upi,
        commission_rate:    settings.coins.commission_rate,
        min_withdrawal_usd: settings.coins.min_withdrawal_usd,
        coin_usd_rate:      settings.coins.coin_usd_rate,
      };
      if (settings.paypal.client_secret && settings.paypal.client_secret !== SECRET_MASK)
        payload.paypal_client_secret = settings.paypal.client_secret;
      if (settings.stripe.secret_key && settings.stripe.secret_key !== SECRET_MASK)
        payload.stripe_secret_key = settings.stripe.secret_key;
      if (settings.stripe.webhook_secret && settings.stripe.webhook_secret !== SECRET_MASK)
        payload.stripe_webhook_secret = settings.stripe.webhook_secret;
      if (settings.razorpay.key_secret && settings.razorpay.key_secret !== SECRET_MASK)
        payload.razorpay_key_secret = settings.razorpay.key_secret;
      await updatePaymentSettings(payload);
      setSaved(true);
      setPpTest('idle'); setStrTest('idle');
      await load();
      setTimeout(() => setSaved(false), 3500);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestPaypal = async () => {
    setPpTest('testing'); setPpMsg('');
    try {
      const r = await testPaypalConnection();
      setPpTest(r.connected ? 'ok' : 'fail'); setPpMsg(r.message);
    } catch { setPpTest('fail'); setPpMsg('Request failed - check server logs.'); }
  };

  const handleTestStripe = async () => {
    setStrTest('testing'); setStrMsg('');
    try {
      const r = await testStripeConnection();
      setStrTest(r.connected ? 'ok' : 'fail'); setStrMsg(r.message);
    } catch { setStrTest('fail'); setStrMsg('Request failed - check server logs.'); }
  };

  /* ── Loading / error ───────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center gap-3 text-neutral-400 text-sm">
        <span className="inline-block h-4 w-4 rounded-full border-2 border-neutral-600 border-t-white animate-spin" />
        Loading payment settings…
      </div>
    );
  }
  if (!settings) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6 flex flex-col gap-3">
        <p className="text-red-400 text-sm font-medium">{error ?? 'Failed to load settings.'}</p>
        <button onClick={load} className="self-start rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors">
          Try again
        </button>
      </div>
    );
  }

  /* ── Derived config status badges ─────────────────────────────────────── */
  const ppConfigured   = !!settings.paypal.client_id && settings.paypal.secret_is_set;
  const strConfigured  = !!settings.stripe.publishable_key && settings.stripe.secret_key_is_set;
  const rzpConfigured  = !!settings.razorpay.key_id && settings.razorpay.secret_is_set;
  const bankConfigured = !!settings.bank.bank_name && !!settings.bank.account_number;

  return (
    <div className="flex flex-col gap-0">

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-neutral-800 mb-6 -mt-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'text-white border-white bg-neutral-800/40'
                : 'text-neutral-400 border-transparent hover:text-neutral-200 hover:bg-neutral-800/20'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB: PAYMENT GATEWAYS
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'gateways' && (
        <div className="flex flex-col gap-5 max-w-3xl">

          {/* ── PayPal ─────────────────────────────────────────────────── */}
          <GatewayCard
            logo={<PayPalLogo size={26} />}
            name="PayPal"
            tagline="PayPal balance, cards & local payments"
            accentColor="#003087"
            accentLight="rgba(0,48,135,0.15)"
            enabled={settings.paypal.enabled}
            onToggleEnabled={(v) => setSettings(s => s && { ...s, paypal: { ...s.paypal, enabled: v } })}
            mode={settings.paypal.mode}
            modeOptions={['sandbox', 'live'] as const}
            modeLabels={{ sandbox: '🧪 Sandbox', live: '🟢 Live' }}
            onModeChange={(m) => {
              setSettings(s => s && { ...s, paypal: { ...s.paypal, mode: m as 'sandbox'|'live' } });
              setPpTest('idle');
            }}
            configured={ppConfigured}
            modeNote={settings.paypal.mode === 'live'
              ? { type: 'live', text: 'Live mode - real payments will be processed.' }
              : { type: 'test', text: 'Sandbox mode - test only. No real money charged.' }}
          >
            <div className="grid grid-cols-1 gap-3">
              <FancyTextField
                label="Client ID"
                placeholder="AXxx… (starts with A)"
                value={settings.paypal.client_id}
                hint="Found in your PayPal Developer → My Apps & Credentials"
                onChange={(v) => { setSettings(s => s && { ...s, paypal: { ...s.paypal, client_id: v } }); setPpTest('idle'); }}
              />
              <SecretTextField
                label="Client Secret"
                isSet={settings.paypal.secret_is_set}
                value={settings.paypal.client_secret}
                show={showPaypalSecret}
                onToggleShow={() => setShowPaypalSecret(v => !v)}
                placeholder={settings.paypal.secret_is_set ? SECRET_MASK : 'EXxx…'}
                hint="Keep secret - never share or expose in frontend code."
                onChange={(v) => { setSettings(s => s && { ...s, paypal: { ...s.paypal, client_secret: v } }); setPpTest('idle'); }}
              />
            </div>
            <TestConnectionRow
              onTest={handleTestPaypal}
              disabled={ppTest === 'testing' || !settings.paypal.client_id}
              status={ppTest}
              message={ppMsg}
            />
          </GatewayCard>

          {/* ── Stripe ─────────────────────────────────────────────────── */}
          <GatewayCard
            logo={<StripeLogo size={26} />}
            name="Stripe"
            tagline="Credit / Debit cards, Apple Pay & Google Pay"
            accentColor="#6772E5"
            accentLight="rgba(103,114,229,0.12)"
            enabled={settings.stripe.enabled}
            onToggleEnabled={(v) => setSettings(s => s && { ...s, stripe: { ...s.stripe, enabled: v } })}
            mode={settings.stripe.mode}
            modeOptions={['test', 'live'] as const}
            modeLabels={{ test: '🧪 Test', live: '🟢 Live' }}
            onModeChange={(m) => {
              setSettings(s => s && { ...s, stripe: { ...s.stripe, mode: m as 'test'|'live' } });
              setStrTest('idle');
            }}
            configured={strConfigured}
            modeNote={settings.stripe.mode === 'live'
              ? { type: 'live', text: 'Live mode - real charges processed.' }
              : { type: 'test', text: 'Test mode - use test card 4242 4242 4242 4242.' }}
          >
            <div className="grid grid-cols-1 gap-3">
              <FancyTextField
                label="Publishable Key"
                placeholder="pk_test_… or pk_live_…"
                value={settings.stripe.publishable_key}
                hint="Safe to include in frontend code - used to initialize Stripe.js."
                onChange={(v) => { setSettings(s => s && { ...s, stripe: { ...s.stripe, publishable_key: v } }); setStrTest('idle'); }}
              />
              <SecretTextField
                label="Secret Key"
                isSet={settings.stripe.secret_key_is_set}
                value={settings.stripe.secret_key}
                show={showStripeSecret}
                onToggleShow={() => setShowStripeSecret(v => !v)}
                placeholder={settings.stripe.secret_key_is_set ? SECRET_MASK : 'sk_test_… or sk_live_…'}
                hint="Keep secret - used server-side for PaymentIntent creation and captures."
                onChange={(v) => { setSettings(s => s && { ...s, stripe: { ...s.stripe, secret_key: v } }); setStrTest('idle'); }}
              />
              <SecretTextField
                label="Webhook Secret (optional)"
                isSet={settings.stripe.webhook_is_set}
                value={settings.stripe.webhook_secret}
                show={showStripeWebhook}
                onToggleShow={() => setShowStripeWebhook(v => !v)}
                placeholder={settings.stripe.webhook_is_set ? SECRET_MASK : 'whsec_…'}
                hint="From Stripe Dashboard → Webhooks. Used to verify webhook event signatures."
                onChange={(v) => setSettings(s => s && { ...s, stripe: { ...s.stripe, webhook_secret: v } })}
              />
            </div>
            <TestConnectionRow
              onTest={handleTestStripe}
              disabled={strTest === 'testing' || !settings.stripe.secret_key_is_set}
              status={strTest}
              message={strMsg}
            />
          </GatewayCard>

          {/* ── Razorpay ────────────────────────────────────────────────── */}
          <GatewayCard
            logo={<RazorpayLogo size={26} />}
            name="Razorpay"
            tagline="UPI, cards, netbanking & Indian wallets"
            accentColor="#3395FF"
            accentLight="rgba(51,149,255,0.10)"
            enabled={settings.razorpay.enabled}
            onToggleEnabled={(v) => setSettings(s => s && { ...s, razorpay: { ...s.razorpay, enabled: v } })}
            configured={rzpConfigured}
          >
            <div className="grid grid-cols-1 gap-3">
              <FancyTextField
                label="Key ID"
                placeholder="rzp_test_… or rzp_live_…"
                value={settings.razorpay.key_id}
                hint="Your Razorpay Key ID - used in the frontend checkout. Safe to expose."
                onChange={(v) => setSettings(s => s && { ...s, razorpay: { ...s.razorpay, key_id: v } })}
              />
              <SecretTextField
                label="Key Secret"
                isSet={settings.razorpay.secret_is_set}
                value={settings.razorpay.key_secret}
                show={showRzpSecret}
                onToggleShow={() => setShowRzpSecret(v => !v)}
                placeholder={settings.razorpay.secret_is_set ? SECRET_MASK : 'your_key_secret'}
                hint="Used server-side only for signature verification."
                onChange={(v) => setSettings(s => s && { ...s, razorpay: { ...s.razorpay, key_secret: v } })}
              />
            </div>
            <div className="mt-3 rounded-lg border border-blue-900/40 bg-blue-950/20 px-3 py-2 text-xs text-blue-300">
              <span className="font-semibold">ℹ️ Razorpay note:</span> UPI and wallet payments are primarily for Indian users.
              Currency is converted to INR at checkout.
            </div>
          </GatewayCard>

          {/* ── Bank Transfer ────────────────────────────────────────────── */}
          <GatewayCard
            logo={<BankLogo size={26} />}
            name="Bank Transfer"
            tagline="Direct bank / SWIFT - manual approval flow"
            accentColor="#059669"
            accentLight="rgba(5,150,105,0.10)"
            enabled={settings.bank.enabled}
            onToggleEnabled={(v) => setSettings(s => s && { ...s, bank: { ...s.bank, enabled: v } })}
            configured={bankConfigured}
          >
            <div className="grid grid-cols-2 gap-3">
              <FancyTextField
                label="Account Holder Name"
                placeholder="Teezer Inc."
                value={settings.bank.account_holder}
                onChange={(v) => setSettings(s => s && { ...s, bank: { ...s.bank, account_holder: v } })}
              />
              <FancyTextField
                label="Bank Name"
                placeholder="Chase Bank"
                value={settings.bank.bank_name}
                onChange={(v) => setSettings(s => s && { ...s, bank: { ...s.bank, bank_name: v } })}
              />
              <FancyTextField
                label="Account Number"
                placeholder="000123456789"
                value={settings.bank.account_number}
                onChange={(v) => setSettings(s => s && { ...s, bank: { ...s.bank, account_number: v } })}
              />
              <FancyTextField
                label="Routing / IFSC Number"
                placeholder="021000021"
                value={settings.bank.routing_number}
                onChange={(v) => setSettings(s => s && { ...s, bank: { ...s.bank, routing_number: v } })}
              />
              <FancyTextField
                label="SWIFT / BIC Code"
                placeholder="CHASUS33"
                value={settings.bank.swift_code}
                onChange={(v) => setSettings(s => s && { ...s, bank: { ...s.bank, swift_code: v } })}
              />
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                <span>Instructions for Users</span>
                <span className="text-neutral-500 font-normal">(shown at checkout)</span>
              </label>
              <textarea
                rows={3}
                placeholder="Please include your reference number in the transfer description. Coins will be credited within 1-3 business days after confirmation."
                value={settings.bank.instructions}
                onChange={(e) => setSettings(s => s && { ...s, bank: { ...s.bank, instructions: e.target.value } })}
                className="rounded-lg border border-neutral-700/60 bg-neutral-900/80 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500/30 placeholder:text-neutral-600 resize-none transition-colors"
              />
            </div>
          </GatewayCard>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: PAYMENT METHODS
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'methods' && (
        <div className="max-w-2xl">
          <SectionCard
            title="Active Payment Methods"
            description="Toggle which payment options appear on the coins purchase page for users."
          >
            <div className="grid grid-cols-1 gap-0 divide-y divide-neutral-800">
              {([
                { key: 'card',      icon: '💳', label: 'Credit / Debit Card', desc: 'Visa, Mastercard, Amex via Stripe',       gateway: 'Stripe'    },
                { key: 'paypal',    icon: '🅿️', label: 'PayPal',              desc: 'PayPal balance and linked cards',         gateway: 'PayPal'    },
                { key: 'applepay',  icon: '🍎', label: 'Apple Pay',            desc: 'Safari + iOS - shown automatically via Stripe', gateway: 'Stripe' },
                { key: 'googlepay', icon: '🔵', label: 'Google Pay',           desc: 'Chrome + Android - via Stripe',          gateway: 'Stripe'    },
                { key: 'upi',       icon: '🇮🇳', label: 'UPI / Wallet',         desc: 'India - UPI, Paytm, PhonePe via Razorpay', gateway: 'Razorpay' },
                { key: 'bank',      icon: '🏦', label: 'Bank Transfer',        desc: 'SWIFT / direct bank - manual approval',  gateway: 'Bank'      },
              ] as const).map(({ key, icon, label, desc, gateway }) => (
                <div key={key} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{icon}</span>
                    <div>
                      <p className="text-sm font-medium text-white">{label}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">{desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-neutral-600 hidden sm:block">via {gateway}</span>
                    <FancyToggle
                      value={settings.methods[key]}
                      onChange={(v) => setSettings(s => s && { ...s, methods: { ...s.methods, [key]: v } })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: PRICING
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'pricing' && (
        <div className="flex flex-col gap-5 max-w-2xl">
          <SectionCard
            title="Subscription Pricing"
            description="Set prices for monthly and annual premium subscriptions."
          >
            <div className="grid grid-cols-2 gap-4">
              <PriceCard
                icon="📅"
                label="Monthly Plan"
                sublabel="per month"
                value={settings.pricing.subscription_monthly}
                onChange={(v) => setSettings(s => s && { ...s, pricing: { ...s.pricing, subscription_monthly: v } })}
              />
              <PriceCard
                icon="🗓️"
                label="Annual Plan"
                sublabel="per year"
                value={settings.pricing.subscription_annual}
                onChange={(v) => setSettings(s => s && { ...s, pricing: { ...s.pricing, subscription_annual: v } })}
                highlight
              />
            </div>
            <div className="mt-4 rounded-lg bg-neutral-900 border border-neutral-800 p-3">
              <p className="text-xs text-neutral-400">
                <span className="text-white font-medium">Savings badge: </span>
                At current prices, annual saves{' '}
                <span className="text-green-400 font-semibold">
                  {settings.pricing.subscription_monthly > 0
                    ? Math.round((1 - settings.pricing.subscription_annual / (settings.pricing.subscription_monthly * 12)) * 100)
                    : 0}%
                </span>{' '}
                vs monthly - shown automatically on the subscription page.
              </p>
            </div>
          </SectionCard>

          <SectionCard
            title="Verification Badge"
            description="One-time purchase price for the blue verification checkmark."
          >
            <PriceCard
              icon="✅"
              label="Verification Badge"
              sublabel="one-time purchase"
              value={settings.pricing.badge_price}
              onChange={(v) => setSettings(s => s && { ...s, pricing: { ...s.pricing, badge_price: v } })}
            />
          </SectionCard>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: COIN ECONOMICS
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'economics' && (
        <div className="max-w-2xl">
          <SectionCard
            title="Coin Economics"
            description="Core rates that drive gifting, creator payouts, and withdrawals."
          >
            <div className="grid grid-cols-1 gap-4">
              <EconomicsRow
                icon="🏷️"
                label="Commission Rate"
                sublabel="Platform cut from all gift transactions"
                unit="%"
                value={settings.coins.commission_rate}
                min={0} max={100} step={0.5}
                onChange={(v) => setSettings(s => s && { ...s, coins: { ...s.coins, commission_rate: v } })}
              />
              <EconomicsRow
                icon="💸"
                label="Minimum Withdrawal"
                sublabel="Minimum USD balance required to request payout"
                unit="USD"
                value={settings.coins.min_withdrawal_usd}
                min={1} max={10000} step={1}
                onChange={(v) => setSettings(s => s && { ...s, coins: { ...s.coins, min_withdrawal_usd: v } })}
              />
              <EconomicsRow
                icon="🪙"
                label="Coins per $1 USD"
                sublabel="How many coins the user gets per dollar spent on packages"
                unit="coins"
                value={settings.coins.coin_usd_rate}
                min={1} max={100000} step={1}
                onChange={(v) => setSettings(s => s && { ...s, coins: { ...s.coins, coin_usd_rate: v } })}
              />
            </div>
            <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
              <p className="text-xs font-semibold text-neutral-300 mb-3">Revenue Preview</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-neutral-800/60 p-3">
                  <p className="text-xs text-neutral-500 mb-1">Creator keeps</p>
                  <p className="text-lg font-bold text-green-400">{100 - settings.coins.commission_rate}%</p>
                </div>
                <div className="rounded-lg bg-neutral-800/60 p-3">
                  <p className="text-xs text-neutral-500 mb-1">Platform takes</p>
                  <p className="text-lg font-bold text-white">{settings.coins.commission_rate}%</p>
                </div>
                <div className="rounded-lg bg-neutral-800/60 p-3">
                  <p className="text-xs text-neutral-500 mb-1">1000 coins =</p>
                  <p className="text-lg font-bold text-blue-400">
                    ${settings.coins.coin_usd_rate > 0 ? (1000 / settings.coins.coin_usd_rate).toFixed(2) : '-'}
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── Sticky save bar ─────────────────────────────────────────────── */}
      <div className="sticky bottom-0 left-0 right-0 mt-8 -mx-6 px-6 py-4 bg-neutral-950/90 backdrop-blur-md border-t border-neutral-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {saved && (
            <div className="flex items-center gap-2 rounded-full bg-green-950/60 border border-green-800/50 px-3 py-1.5 text-xs text-green-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              Settings saved successfully
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-full bg-red-950/60 border border-red-800/50 px-3 py-1.5 text-xs text-red-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              {error}
            </div>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-black hover:bg-neutral-100 active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-white/10"
        >
          {saving ? (
            <>
              <span className="h-3.5 w-3.5 rounded-full border-2 border-black/30 border-t-black animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <span>💾</span>
              Save All Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
════════════════════════════════════════════════════════════════════════════ */

/* ── Gateway Card ─────────────────────────────────────────────────────── */
function GatewayCard({
  logo, name, tagline, accentColor, accentLight, enabled, onToggleEnabled,
  mode, modeOptions, modeLabels, onModeChange, configured, modeNote, children,
}: {
  logo: React.ReactNode;
  name: string;
  tagline: string;
  accentColor: string;
  accentLight: string;
  enabled: boolean;
  onToggleEnabled: (v: boolean) => void;
  mode?: string;
  modeOptions?: readonly string[];
  modeLabels?: Record<string, string>;
  onModeChange?: (m: string) => void;
  configured: boolean;
  modeNote?: { type: 'live' | 'test'; text: string };
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className="rounded-2xl border border-neutral-700/40 overflow-hidden transition-all"
      style={{ background: `linear-gradient(135deg, ${accentLight} 0%, rgba(23,23,23,0.95) 40%)` }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-800/60">
        {/* Left color accent bar */}
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: accentColor }} />

        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: accentLight, border: `1.5px solid ${accentColor}40` }}>
            {logo}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-white text-[15px]">{name}</span>
              {/* Configured chip */}
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                configured
                  ? 'bg-green-950/60 border-green-700/40 text-green-400'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-400'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${configured ? 'bg-green-400' : 'bg-neutral-500'}`} />
                {configured ? 'Configured' : 'Not configured'}
              </span>
              {/* Mode chip */}
              {mode && (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                  mode === 'live'
                    ? 'bg-green-950/60 border-green-700/40 text-green-300'
                    : 'bg-yellow-950/60 border-yellow-700/40 text-yellow-300'
                }`}>
                  {mode === 'live' ? '🟢' : '🧪'} {mode === 'live' ? 'Live' : 'Test / Sandbox'}
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-0.5 truncate">{tagline}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Enable toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 hidden sm:block">{enabled ? 'Enabled' : 'Disabled'}</span>
            <FancyToggle value={enabled} onChange={onToggleEnabled} />
          </div>
          {/* Expand/collapse */}
          <button
            onClick={() => setOpen(v => !v)}
            className="h-7 w-7 rounded-lg border border-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white hover:border-neutral-500 transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}>
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Collapsible body */}
      {open && (
        <div className="px-5 py-5 flex flex-col gap-4">
          {/* Mode selector */}
          {modeOptions && modeLabels && onModeChange && (
            <div>
              <p className="text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wide">Environment</p>
              <div className="flex gap-2 flex-wrap">
                {modeOptions.map(m => (
                  <button
                    key={m}
                    onClick={() => onModeChange(m)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                      mode === m
                        ? m === 'live'
                          ? 'bg-green-600 border-green-500 text-white shadow-lg shadow-green-900/30'
                          : 'bg-white border-white text-black shadow-lg shadow-white/10'
                        : 'bg-transparent border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'
                    }`}
                  >
                    {modeLabels[m]}
                  </button>
                ))}
              </div>
              {modeNote && (
                <p className={`text-xs mt-2 ${modeNote.type === 'live' ? 'text-green-400' : 'text-yellow-500'}`}>
                  ⚠ {modeNote.text}
                </p>
              )}
            </div>
          )}

          {/* Children (fields + test btn) */}
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Section Card ─────────────────────────────────────────────────────── */
function SectionCard({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-700/40 bg-neutral-900/40 p-5">
      <h3 className="font-bold text-white text-[15px]">{title}</h3>
      {description && <p className="text-xs text-neutral-500 mt-0.5 mb-5">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </div>
  );
}

/* ── FancyToggle ──────────────────────────────────────────────────────── */
function FancyToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative h-6 w-11 rounded-full transition-all duration-200 shrink-0 ${
        value ? 'bg-white' : 'bg-neutral-700'
      }`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full shadow transition-transform duration-200 ${
        value ? 'translate-x-5 bg-black' : 'translate-x-0.5 bg-neutral-400'
      }`} />
    </button>
  );
}

/* ── FancyTextField ───────────────────────────────────────────────────── */
function FancyTextField({ label, value, placeholder, hint, onChange }: {
  label: string; value: string; placeholder?: string; hint?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-neutral-300">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-neutral-700/60 bg-neutral-900/80 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500/30 placeholder:text-neutral-600 transition-colors font-mono"
        spellCheck={false}
        autoComplete="off"
      />
      {hint && <p className="text-[11px] text-neutral-600">{hint}</p>}
    </div>
  );
}

/* ── SecretTextField ──────────────────────────────────────────────────── */
function SecretTextField({ label, isSet, value, show, onToggleShow, placeholder, hint, onChange }: {
  label: string; isSet: boolean; value: string; show: boolean;
  onToggleShow: () => void; placeholder?: string; hint?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-neutral-300">{label}</label>
        {isSet && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-950/50 border border-green-800/40 px-1.5 py-0.5 text-[10px] text-green-400 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> Set
          </span>
        )}
      </div>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-neutral-700/60 bg-neutral-900/80 px-3.5 py-2.5 text-sm text-white pr-16 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500/30 placeholder:text-neutral-600 transition-colors font-mono"
          spellCheck={false}
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-neutral-500 hover:text-white transition-colors"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <p className="text-[11px] text-neutral-600">{hint ?? 'Leave blank to keep the current value.'}</p>
    </div>
  );
}

/* ── Test Connection Row ──────────────────────────────────────────────── */
function TestConnectionRow({ onTest, disabled, status, message }: {
  onTest: () => void; disabled: boolean;
  status: 'idle'|'testing'|'ok'|'fail'; message: string;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap pt-1">
      <button
        onClick={onTest}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-xl border border-neutral-600 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-400 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {status === 'testing' ? (
          <><span className="h-3.5 w-3.5 rounded-full border-2 border-neutral-500 border-t-white animate-spin" /> Testing…</>
        ) : (
          <><span>🔌</span> Test Connection</>
        )}
      </button>
      {status === 'ok'   && <span className="flex items-center gap-1.5 text-sm text-green-400"><span>✓</span> {message}</span>}
      {status === 'fail' && <span className="flex items-center gap-1.5 text-sm text-red-400"><span>✗</span> {message}</span>}
    </div>
  );
}

/* ── Price Card ───────────────────────────────────────────────────────── */
function PriceCard({ icon, label, sublabel, value, onChange, highlight }: {
  icon: string; label: string; sublabel: string; value: number;
  onChange: (v: number) => void; highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-3 ${
      highlight
        ? 'border-white/20 bg-white/5'
        : 'border-neutral-800 bg-neutral-900/60'
    }`}>
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="text-xs text-neutral-500">{sublabel}</p>
        </div>
        {highlight && (
          <span className="ml-auto rounded-full bg-white/10 border border-white/20 px-2 py-0.5 text-[10px] font-bold text-white">
            BEST VALUE
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-neutral-400 text-sm font-medium">$</span>
        <input
          type="number" min={0} max={9999} step={0.01}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="flex-1 rounded-xl border border-neutral-700/60 bg-neutral-900 px-3 py-2.5 text-lg font-bold text-white text-center focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500/30 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-neutral-500 text-xs">USD</span>
      </div>
    </div>
  );
}

/* ── Economics Row ────────────────────────────────────────────────────── */
function EconomicsRow({ icon, label, sublabel, unit, value, min, max, step, onChange }: {
  icon: string; label: string; sublabel: string; unit: string;
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <span className="text-2xl shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-neutral-500 mt-0.5">{sublabel}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number" min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || min)}
          className="w-24 rounded-xl border border-neutral-700/60 bg-neutral-900 px-3 py-2 text-sm font-bold text-white text-right focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500/30 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-xs text-neutral-500 w-8">{unit}</span>
      </div>
    </div>
  );
}

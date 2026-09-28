"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Save, RefreshCw, CheckCircle2, XCircle, Loader2, Eye, EyeOff,
  Building2, Wifi, ChevronRight, ChevronDown, Shield, Lock,
  Headphones, Receipt, ShoppingCart, ArrowUpCircle, RotateCcw,
  CreditCard, BadgePercent, Coins,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { api, apiMessage } from "@/admin-panel/services/api";

type PS = {
  paypal:   { enabled:boolean; mode:"sandbox"|"live"; client_id:string; client_secret:string; secret_is_set:boolean };
  stripe:   { enabled:boolean; mode:"test"|"live"; publishable_key:string; secret_key:string; secret_key_is_set:boolean; webhook_secret:string; webhook_is_set:boolean };
  razorpay: { enabled:boolean; key_id:string; key_secret:string; secret_is_set:boolean };
  bank:     { enabled:boolean; account_holder:string; bank_name:string; account_number:string; routing_number:string; swift_code:string; instructions:string };
  pricing:  { subscription_monthly:number; subscription_annual:number; badge_price:number };
  methods:  { card:boolean; paypal:boolean; applepay:boolean; googlepay:boolean; upi:boolean; bank:boolean };
  // Apps. Apple and Google REQUIRE their own billing for digital goods, and a
  // verification badge is digital goods - these are not interchangeable with card/PayPal,
  // which are for the website.
  apple_iap:  { enabled:boolean; bundle_id:string; shared_secret:string; secret_is_set:boolean;
                product_basic:string; product_plus:string; product_business:string };
  google_iap: { enabled:boolean; package_name:string; service_account:string; service_account_is_set:boolean;
                product_basic:string; product_plus:string; product_business:string };
  coins:    { commission_rate:number; min_withdrawal_usd:number; coin_usd_rate:number };
};
const MASK = "••••••••";

const CURRENCIES = [
  { code:"USD", name:"US Dollar",       symbol:"$",  flag:"🇺🇸" },
  { code:"EUR", name:"Euro",            symbol:"€", flag:"🇪🇺" },
  { code:"GBP", name:"British Pound",   symbol:"£", flag:"🇬🇧" },
  { code:"INR", name:"Indian Rupee",    symbol:"₹", flag:"🇮🇳" },
  { code:"CAD", name:"Canadian Dollar", symbol:"C$", flag:"🇨🇦" },
  { code:"AUD", name:"Australian Dollar",symbol:"A$",flag:"🇦🇺" },
  { code:"JPY", name:"Japanese Yen",    symbol:"¥", flag:"🇯🇵" },
];

const CSS = `
@keyframes slide-down{from{opacity:0;max-height:0;transform:translateY(-6px)}to{opacity:1;max-height:900px;transform:translateY(0)}}
@keyframes fade-in{from{opacity:0}to{opacity:1}}
.cfg-panel{animation:slide-down .25s ease both;overflow:hidden}
.anim-fade{animation:fade-in .18s ease both}
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
input[type=number]{-moz-appearance:textfield}
`;

export default function PaymentSettingsPage() {
  const [s,        setS]        = useState<PS|null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [dirty,    setDirty]    = useState(false);
  const [expanded, setExpanded] = useState<string|null>(null);
  const [currency, setCurrency] = useState("USD");
  const [defMethod,setDefMethod]= useState("card");

  const [showPP,  setShowPP]  = useState(false);
  const [showSK,  setShowSK]  = useState(false);
  const [showSW,  setShowSW]  = useState(false);
  const [showRZP, setShowRZP] = useState(false);
  const [showAP,  setShowAP]  = useState(false);

  const [ppTest,  setPpTest]  = useState<"idle"|"testing"|"ok"|"fail">("idle");
  const [ppMsg,   setPpMsg]   = useState("");
  const [strTest, setStrTest] = useState<"idle"|"testing"|"ok"|"fail">("idle");
  const [strMsg,  setStrMsg]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{success:boolean;data:PS}>("/admin/payment-settings");
      setS(data.data); setDirty(false);
    } catch (e) { toast.error(apiMessage(e) || "Failed to load settings."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const upd = (patch: Partial<PS>) => { setS(p => p ? { ...p, ...patch } : p); setDirty(true); };

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const p: Record<string, unknown> = {
        paypal_enabled: s.paypal.enabled, paypal_mode: s.paypal.mode, paypal_client_id: s.paypal.client_id,
        stripe_enabled: s.stripe.enabled, stripe_mode: s.stripe.mode, stripe_publishable_key: s.stripe.publishable_key,
        razorpay_enabled: s.razorpay.enabled, razorpay_key_id: s.razorpay.key_id,
        apple_iap_enabled: s.apple_iap.enabled, apple_bundle_id: s.apple_iap.bundle_id,
        apple_product_basic: s.apple_iap.product_basic, apple_product_plus: s.apple_iap.product_plus,
        apple_product_business: s.apple_iap.product_business,
        google_iap_enabled: s.google_iap.enabled, google_package_name: s.google_iap.package_name,
        google_product_basic: s.google_iap.product_basic, google_product_plus: s.google_iap.product_plus,
        google_product_business: s.google_iap.product_business,
        bank_enabled: s.bank.enabled, bank_name: s.bank.bank_name, bank_account_holder: s.bank.account_holder,
        bank_account_number: s.bank.account_number, bank_routing_number: s.bank.routing_number,
        bank_swift_code: s.bank.swift_code, bank_enabled_instructions: s.bank.instructions,
        subscription_monthly_price: s.pricing.subscription_monthly,
        subscription_annual_price: s.pricing.subscription_annual,
        badge_price: s.pricing.badge_price,
        card_enabled: s.methods.card, applepay_enabled: s.methods.applepay,
        googlepay_enabled: s.methods.googlepay, upi_enabled: s.methods.upi,
        commission_rate: s.coins.commission_rate,
        min_withdrawal_usd: s.coins.min_withdrawal_usd,
        coin_usd_rate: Math.round(s.coins.coin_usd_rate),
      };
      if (s.paypal.client_secret  && s.paypal.client_secret  !== MASK) p.paypal_client_secret  = s.paypal.client_secret;
      if (s.stripe.secret_key     && s.stripe.secret_key     !== MASK) p.stripe_secret_key     = s.stripe.secret_key;
      if (s.stripe.webhook_secret && s.stripe.webhook_secret !== MASK) p.stripe_webhook_secret = s.stripe.webhook_secret;
      if (s.razorpay.key_secret   && s.razorpay.key_secret   !== MASK) p.razorpay_key_secret   = s.razorpay.key_secret;
      // Same rule as every other secret: the mask means "untouched", and sending it would
      // overwrite the real credential with a row of dots.
      if (s.apple_iap.shared_secret   && s.apple_iap.shared_secret   !== MASK) p.apple_shared_secret        = s.apple_iap.shared_secret;
      if (s.google_iap.service_account && s.google_iap.service_account !== MASK) p.google_service_account_json = s.google_iap.service_account;
      await api.post("/admin/payment-settings", p);
      toast.success("Payment settings saved successfully.");
      setDirty(false); setPpTest("idle"); setStrTest("idle");
      await load();
    } catch (e) { toast.error(apiMessage(e) || "Failed to save."); }
    finally { setSaving(false); }
  };

  const testPP = async () => {
    setPpTest("testing"); setPpMsg("");
    try {
      const { data } = await api.post<{success:boolean;data:{connected:boolean;message:string}}>("/admin/payment-settings/paypal/test");
      setPpTest(data.data.connected ? "ok" : "fail"); setPpMsg(data.data.message);
    } catch (e) { setPpTest("fail"); setPpMsg(apiMessage(e) || "Failed."); }
  };
  const testStripe = async () => {
    setStrTest("testing"); setStrMsg("");
    try {
      const { data } = await api.post<{success:boolean;data:{connected:boolean;message:string}}>("/admin/payment-settings/stripe/test");
      setStrTest(data.data.connected ? "ok" : "fail"); setStrMsg(data.data.message);
    } catch (e) { setStrTest("fail"); setStrMsg(apiMessage(e) || "Failed."); }
  };

  if (loading) return (
    <AdminShell title="Payment Settings">
      <style>{CSS}</style>
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#fd4605]" />
      </div>
    </AdminShell>
  );
  if (!s) return (
    <AdminShell title="Payment Settings">
      <style>{CSS}</style>
      <div className="rounded-2xl border border-red-100 bg-red-50 p-8 text-center max-w-sm mx-auto mt-10">
        <XCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
        <p className="text-[14px] font-semibold text-red-700 mb-4">Failed to load settings</p>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl bg-[#fd4605] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#e03e04] transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    </AdminShell>
  );

  const methodStates: Record<string,boolean> = {
    card:      s.methods.card,
    paypal:    s.paypal.enabled,
    applepay:  s.methods.applepay,
    googlepay: s.methods.googlepay,
    upi:       s.methods.upi,
    bank:      s.bank.enabled,
    apple_iap:  s.apple_iap.enabled,
    google_iap: s.google_iap.enabled,
  };
  const strCfg = !!s.stripe.publishable_key && s.stripe.secret_key_is_set;
  const ppCfg  = !!s.paypal.client_id && s.paypal.secret_is_set;
  const rzpCfg = !!s.razorpay.key_id && s.razorpay.secret_is_set;
  const bnkCfg = !!s.bank.bank_name && !!s.bank.account_number;

  const gatewayCfg: Record<string,boolean> = {
    card:strCfg, paypal:ppCfg, applepay:strCfg, googlepay:strCfg, upi:rzpCfg, bank:bnkCfg,
  };

  const activeCount   = Object.values(methodStates).filter(Boolean).length;
  const disabledCount = Object.values(methodStates).filter(v => !v).length;
  const total         = Object.keys(methodStates).length;
  const unconfigured  = Object.entries(gatewayCfg).filter(([,v]) => !v).length;

  const METHODS = [
    { key:"card",      name:"Credit / Debit Card",  desc:"Accept payments via Visa, Mastercard, and more.", recommended:true },
    { key:"paypal",    name:"PayPal",               desc:"Allow users to pay using their PayPal account." },
    { key:"applepay",  name:"Apple Pay",            desc:"Secure payments using Apple Pay." },
    { key:"googlepay", name:"Google Pay",           desc:"Allow users to pay using Google Pay." },
    { key:"upi",       name:"UPI / Local Wallets",  desc:"Accept payments through UPI and local wallets." },
    { key:"bank",      name:"Bank Transfer",        desc:"Allow direct bank transfers." },
    { key:"apple_iap",  name:"Apple In-App Purchase", desc:"iOS app payments. Required by the App Store for digital goods." },
    { key:"google_iap", name:"Google Play Billing",   desc:"Android app payments. Required by Play for digital goods." },
  ];

  const savingsPct = s.pricing.subscription_monthly > 0
    ? Math.round((1 - s.pricing.subscription_annual / (s.pricing.subscription_monthly * 12)) * 100) : 0;

  const currInfo = CURRENCIES.find(c => c.code === currency) ?? CURRENCIES[0];

  return (
    <AdminShell title="Payment Settings">
      <style>{CSS}</style>
      <div className="max-w-[1080px] space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-[22px] font-bold text-[#111827]">Payment Methods Settings</h1>
          <p className="text-[13px] text-[#6b7280] mt-0.5">Manage and configure payment methods for your platform.</p>
        </div>

        {/* Two-column */}
        <div className="flex gap-5 items-start">

          {/* ── Main ────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Available Payment Methods */}
            <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
              <div className="px-5 py-4 border-b border-[#f3f4f6]">
                <h2 className="text-[15px] font-bold text-[#111827]">Available Payment Methods</h2>
                <p className="text-[12px] text-[#9ca3af] mt-0.5">Enable or disable payment methods and configure their settings.</p>
              </div>
              <div className="divide-y divide-[#f9fafb]">
                {METHODS.map(({ key, name, desc, recommended }) => {
                  const on     = methodStates[key];
                  const isOpen = expanded === key;
                  return (
                    <div key={key}>
                      <div className={`flex items-center gap-4 px-5 py-4 transition-colors ${isOpen ? "bg-[#fafafa]" : "hover:bg-[#fafafa]"}`}>
                        {/* Logo box */}
                        <div className="flex items-center justify-center h-11 w-24 shrink-0 rounded-xl border border-[#e5e7eb] bg-white gap-1">
                          <MethodLogo k={key} />
                        </div>
                        {/* Name */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-semibold text-[#111827]">{name}</span>
                            {recommended && (
                              <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">Recommended</span>
                            )}
                          </div>
                          <p className="text-[12px] text-[#9ca3af] mt-0.5 truncate">{desc}</p>
                        </div>
                        {/* Status badge */}
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          on ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                             : "bg-red-50 border border-red-200 text-red-600"
                        }`}>{on ? "Enabled" : "Disabled"}</span>
                        {/* Toggle */}
                        <IOToggle value={on} onChange={v => {
                          if (key === "card")       upd({ methods: { ...s.methods, card: v } });
                          else if (key === "paypal")    upd({ paypal: { ...s.paypal, enabled: v } });
                          else if (key === "applepay")  upd({ methods: { ...s.methods, applepay: v } });
                          else if (key === "googlepay") upd({ methods: { ...s.methods, googlepay: v } });
                          else if (key === "upi")       upd({ methods: { ...s.methods, upi: v } });
                          else if (key === "bank")      upd({ bank: { ...s.bank, enabled: v } });
                          else if (key === "apple_iap")  upd({ apple_iap:  { ...s.apple_iap,  enabled: v } });
                          else if (key === "google_iap") upd({ google_iap: { ...s.google_iap, enabled: v } });
                        }} />
                        {/* Configure */}
                        <button onClick={() => setExpanded(isOpen ? null : key)}
                          className="shrink-0 flex items-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white hover:bg-[#f4f5f7] hover:border-[#d1d5db] px-4 py-2 text-[12px] font-semibold text-[#374151] transition-all active:scale-95">
                          Configure
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      {/* Inline config panel */}
                      {isOpen && (
                        <div className="cfg-panel border-t border-[#f0f1f3] bg-[#f9fafb] px-5 py-5">
                          <ConfigPanel gk={key} s={s} upd={upd}
                            showPP={showPP} setShowPP={setShowPP}
                            showSK={showSK} setShowSK={setShowSK}
                            showSW={showSW} setShowSW={setShowSW}
                            showRZP={showRZP} setShowRZP={setShowRZP}
                            showAP={showAP} setShowAP={setShowAP}
                            ppTest={ppTest} ppMsg={ppMsg} testPP={testPP}
                            strTest={strTest} strMsg={strMsg} testStripe={testStripe}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Default Payment Method */}
            <div className="rounded-2xl border border-[#e5e7eb] bg-white px-5 py-4">
              <h2 className="text-[14px] font-bold text-[#111827] mb-0.5">Default Payment Method</h2>
              <p className="text-[12px] text-[#9ca3af] mb-4">Select the default payment method that will be pre-selected for users during checkout.</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5">
                  <div className="flex items-center justify-center h-8 w-12 rounded-lg border border-[#e5e7eb]">
                    <MethodLogo k={defMethod} size="sm" />
                  </div>
                  <select value={defMethod} onChange={e => setDefMethod(e.target.value)}
                    className="flex-1 bg-transparent text-[13px] font-semibold text-[#111827] outline-none cursor-pointer">
                    {METHODS.filter(m => methodStates[m.key]).map(m => (
                      <option key={m.key} value={m.key}>{m.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="h-4 w-4 text-[#9ca3af] pointer-events-none shrink-0" />
                </div>
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-[#fd4605] hover:bg-[#e03e04] px-5 py-2.5 text-[13px] font-bold text-white transition-colors disabled:opacity-60 active:scale-95 shadow-sm shadow-[#fd4605]/20">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>

            {/* PCI Banner */}
            <div className="rounded-2xl border border-[#e5e7eb] bg-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Shield className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#111827]">Secure &amp; PCI Compliant</p>
                  <p className="text-[11px] text-[#9ca3af]">All payment methods are processed securely. We never store your full card details.</p>
                </div>
              </div>
              <div className="h-8 w-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                <Lock className="h-4 w-4 text-emerald-500" />
              </div>
            </div>

            {/* Pricing (collapsible) */}
            <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
              <button onClick={() => setExpanded(v => v === "__pricing" ? null : "__pricing")}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#fafafa] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-[#fd4605]/10 flex items-center justify-center">
                    <BadgePercent className="h-4 w-4 text-[#fd4605]" />
                  </div>
                  <div className="text-left">
                    <p className="text-[14px] font-bold text-[#111827]">Subscription &amp; Badge Pricing</p>
                    <p className="text-[12px] text-[#9ca3af]">Monthly ${s.pricing.subscription_monthly} &middot; Annual ${s.pricing.subscription_annual} &middot; Badge ${s.pricing.badge_price}</p>
                  </div>
                </div>
                {expanded === "__pricing" ? <ChevronDown className="h-4 w-4 text-[#9ca3af]" /> : <ChevronRight className="h-4 w-4 text-[#9ca3af]" />}
              </button>
              {expanded === "__pricing" && (
                <div className="cfg-panel border-t border-[#f3f4f6] p-5">
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { icon:"📅", label:"Monthly",   sub:"Per month",          k:"subscription_monthly" as const },
                      { icon:"🗓️", label:"Annual",    sub:`Save ${savingsPct}%`, k:"subscription_annual"  as const },
                      { icon:"🛡️", label:"Badge",     sub:"One-time",           k:"badge_price"          as const },
                    ].map(({ icon, label, sub, k }) => (
                      <div key={k} className="rounded-xl border border-[#e8eaed] p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-lg">{icon}</span>
                          <div>
                            <p className="text-[12px] font-semibold text-[#374151]">{label}</p>
                            <p className="text-[10px] text-[#9ca3af]">{sub}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 bg-[#f9fafb] border border-[#e8eaed] rounded-xl px-3 py-2 focus-within:border-[#fd4605] focus-within:ring-2 focus-within:ring-[#fd4605]/10 transition-all">
                          <span className="text-[13px] text-[#9ca3af]">$</span>
                          <input type="number" min={0} max={9999} step={0.01} value={s.pricing[k]}
                            onChange={e => upd({ pricing: { ...s.pricing, [k]: parseFloat(e.target.value) || 0 } })}
                            className="flex-1 bg-transparent text-[16px] font-black text-[#111827] text-center outline-none w-0"
                          />
                          <span className="text-[11px] text-[#9ca3af]">USD</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Economics (collapsible) */}
            <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
              <button onClick={() => setExpanded(v => v === "__econ" ? null : "__econ")}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#fafafa] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-amber-50 flex items-center justify-center">
                    <Coins className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="text-left">
                    <p className="text-[14px] font-bold text-[#111827]">Coin Economics</p>
                    <p className="text-[12px] text-[#9ca3af]">{s.coins.commission_rate}% commission &middot; {s.coins.coin_usd_rate} coins/$1 &middot; Min ${s.coins.min_withdrawal_usd}</p>
                  </div>
                </div>
                {expanded === "__econ" ? <ChevronDown className="h-4 w-4 text-[#9ca3af]" /> : <ChevronRight className="h-4 w-4 text-[#9ca3af]" />}
              </button>
              {expanded === "__econ" && (
                <div className="cfg-panel border-t border-[#f3f4f6] p-5 space-y-3">
                  {[
                    { icon:"🏷️", label:"Commission Rate",    desc:"Platform cut from all gifts",             unit:"%",    k:"commission_rate"    as const, min:0,  max:100,  step:0.5, color:"#fd4605" },
                    { icon:"💸", label:"Min Withdrawal",     desc:"Minimum USD before creator can withdraw", unit:"USD",  k:"min_withdrawal_usd" as const, min:1,  max:9999, step:1,   color:"#6b7280" },
                    { icon:"🪙", label:"Coins per $1",       desc:"How many coins per dollar spent",         unit:"coins",k:"coin_usd_rate"       as const, min:1,  max:99999,step:1,   color:"#f59e0b" },
                  ].map(({ icon, label, desc, unit, k, min, max, step, color }) => (
                    <div key={k} className="flex items-center gap-4 rounded-xl border border-[#f3f4f6] bg-[#fafafa] px-4 py-3">
                      <div className="h-9 w-9 rounded-xl bg-white border border-[#e8eaed] flex items-center justify-center text-lg shrink-0">{icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
                        <p className="text-[11px] text-[#9ca3af]">{desc}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input type="number" min={min} max={max} step={step} value={s.coins[k]}
                          onChange={e => upd({ coins: { ...s.coins, [k]: parseFloat(e.target.value) || min } })}
                          className="w-20 h-9 rounded-xl border border-[#e8eaed] bg-white px-2 text-[14px] font-bold text-right outline-none focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/10 transition-all"
                          style={{ color }}
                        />
                        <span className="text-[11px] text-[#9ca3af] w-8">{unit}</span>
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-3 gap-3 mt-1">
                    {[
                      { label:"Creator keeps", value:`${100-s.coins.commission_rate}%`,  color:"#10b981" },
                      { label:"Platform takes", value:`${s.coins.commission_rate}%`,      color:"#fd4605" },
                      { label:"1000 coins =",  value:`$${s.coins.coin_usd_rate>0?(1000/s.coins.coin_usd_rate).toFixed(2):"-"}`, color:"#6772E5" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="rounded-xl border border-[#e8eaed] bg-white p-3 text-center">
                        <p className="text-[10px] text-[#9ca3af] uppercase tracking-wide mb-1">{label}</p>
                        <p className="text-[20px] font-black" style={{ color }}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>{/* end main */}

          {/* ── Sidebar ─────────────────────────────────────────────── */}
          <div className="w-[290px] shrink-0 space-y-4">

            {/* Summary */}
            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
              <h3 className="text-[14px] font-bold text-[#111827] mb-4">Payment Methods Summary</h3>
              <div className="flex items-center gap-4 mb-3">
                <div className="h-14 w-14 rounded-2xl bg-[#fd4605]/10 flex items-center justify-center shrink-0">
                  <CreditCard className="h-7 w-7 text-[#fd4605]" />
                </div>
                <div>
                  <p className="text-[32px] font-black text-[#111827] leading-none">
                    {activeCount} <span className="text-[20px] font-bold text-[#9ca3af]">/ {total}</span>
                  </p>
                  <p className="text-[12px] font-medium text-[#6b7280] mt-0.5">Active Methods</p>
                </div>
              </div>
              <p className="text-[12px] text-[#9ca3af] mb-4">
                You have <span className="font-semibold text-[#374151]">{activeCount} payment method{activeCount !== 1 ? "s" : ""}</span> active out of {total} available.
              </p>
              <div className="space-y-2.5">
                {[
                  { dot:"bg-emerald-500", label:"Active",        count:activeCount },
                  { dot:"bg-red-500",     label:"Disabled",      count:disabledCount },
                  { dot:"bg-[#d1d5db]",  label:"Not Configured", count:unconfigured },
                ].map(({ dot, label, count }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dot}`} />
                      <span className="text-[12px] text-[#6b7280]">{label}</span>
                    </div>
                    <span className="text-[13px] font-bold text-[#111827]">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Transaction Currency */}
            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
              <h3 className="text-[14px] font-bold text-[#111827] mb-1">Transaction Currency</h3>
              <p className="text-[12px] text-[#9ca3af] mb-4">Select the default currency for all transactions.</p>
              <label className="block text-[11px] font-bold text-[#374151] uppercase tracking-wide mb-2">Currency</label>
              <div className="relative">
                <select value={currency} onChange={e => setCurrency(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-8 py-2.5 text-[13px] font-semibold text-[#111827] outline-none focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/10 transition-all cursor-pointer">
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.flag} {c.code} - {c.name} ({c.symbol})</option>
                  ))}
                </select>
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">{currInfo.flag}</span>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af] pointer-events-none" />
              </div>
              <p className="text-[11px] text-[#9ca3af] mt-2">Note: This will be used for all payments and payouts.</p>
            </div>

            {/* Payment Settings links */}
            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
              <h3 className="text-[14px] font-bold text-[#111827] mb-3">Payment Settings</h3>
              <div className="space-y-0.5">
                {[
                  { Icon:Receipt,        label:"Tax Settings",       sub:"Configure tax for payments",        href:"/tax-settings" },
                  { Icon:ShoppingCart,   label:"Checkout Settings",  sub:"Customize checkout experience",     href:"/checkout-settings" },
                  { Icon:ArrowUpCircle,  label:"Payout Settings",    sub:"Manage payout preferences",         href:"/payouts" },
                  { Icon:RotateCcw,      label:"Refund Settings",    sub:"Configure refund and cancellation", href:"/refunds" },
                ].map(({ Icon, label, sub, href }) => (
                  <a key={label} href={href}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[#f4f5f7] transition-colors group">
                    <div className="h-8 w-8 rounded-xl bg-[#f4f5f7] flex items-center justify-center group-hover:bg-[#e8eaed] transition-colors shrink-0">
                      <Icon className="h-4 w-4 text-[#6b7280]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#374151]">{label}</p>
                      <p className="text-[11px] text-[#9ca3af]">{sub}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#9ca3af] transition-colors shrink-0" />
                  </a>
                ))}
              </div>
            </div>

            {/* Need Help */}
            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-2xl bg-[#fd4605]/10 flex items-center justify-center shrink-0">
                  <Headphones className="h-6 w-6 text-[#fd4605]" />
                </div>
                <div>
                  <p className="text-[14px] font-bold text-[#111827] mb-1">Need Help?</p>
                  <p className="text-[12px] text-[#9ca3af] mb-3 leading-relaxed">If you need help setting up your payment methods, our support team is here for you.</p>
                  <button className="rounded-xl border-2 border-[#fd4605] px-4 py-1.5 text-[12px] font-bold text-[#fd4605] hover:bg-[#fd4605] hover:text-white transition-all active:scale-95">
                    Contact Support
                  </button>
                </div>
              </div>
            </div>

            {/* Unsaved indicator */}
            {dirty && (
              <div className="anim-fade rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-[12px] font-semibold text-amber-700">Unsaved changes</span>
                </div>
                <button onClick={save} disabled={saving}
                  className="rounded-xl bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors disabled:opacity-60">
                  {saving ? "Saving..." : "Save now"}
                </button>
              </div>
            )}

          </div>{/* end sidebar */}
        </div>
      </div>
    </AdminShell>
  );
}

/* ── iOS-style toggle ────────────────────────────────────────────────────── */
function IOToggle({ value, onChange }: { value:boolean; onChange:(v:boolean)=>void }) {
  return (
    <button type="button" onClick={() => onChange(!value)} role="switch" aria-checked={value}
      className={`relative shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#fd4605] ${value ? "bg-[#fd4605]" : "bg-[#d1d5db]"}`}
      style={{ width:44, height:24, padding:2 }}>
      <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

/* ── Payment method logos ────────────────────────────────────────────────── */
function MethodLogo({ k, size="md" }: { k:string; size?:"sm"|"md" }) {
  const h = size === "sm" ? 14 : 18;
  if (k === "apple_iap") return (
    <span className="text-[13px] font-bold text-[#111827]">IAP</span>
  );
  if (k === "google_iap") return (
    <span className="text-[13px] font-bold text-[#0f9d58]">Play</span>
  );
  if (k === "card") return (
    <>
      <svg width={h*2.2} height={h*1.4} viewBox="0 0 40 24" fill="none">
        <rect width="40" height="24" rx="4" fill="#1A1F71"/>
        <text x="50%" y="16.5" textAnchor="middle" fill="white" fontSize="9.5" fontWeight="bold" fontFamily="Arial,sans-serif" fontStyle="italic">VISA</text>
      </svg>
      <svg width={h*1.7} height={h*1.4} viewBox="0 0 32 24" fill="none">
        <rect width="32" height="24" rx="4" fill="#f0f0f0"/>
        <circle cx="12" cy="12" r="7" fill="#EB001B"/>
        <circle cx="20" cy="12" r="7" fill="#F79E1B"/>
        <path d="M16 6.5a7 7 0 0 1 0 11 7 7 0 0 1 0-11z" fill="#FF5F00"/>
      </svg>
    </>
  );
  if (k === "paypal") return (
    <svg width={h*1.4} height={h*1.4} viewBox="0 0 28 28" fill="none">
      <path d="M8 4h8c3.5 0 6 2 5.5 5.5C21 13.5 18 16 14.5 16H12l-1 7H7.5L10 6 8 4z" fill="#003087"/>
      <path d="M22 9.5C21.5 13 19 16 14.5 16h-2.5l-2 10h4l.5-3H17c3.8 0 6-2 6.5-6 .4-2.8-.5-4.5-1.5-6.5z" fill="#009cde" opacity=".75"/>
    </svg>
  );
  if (k === "applepay") return (
    <svg width={h*2.2} height={h} viewBox="0 0 44 20" fill="none">
      <rect width="44" height="20" rx="3" fill="#000"/>
      <path d="M10 5c-.7 0-1.2-.5-1.2-1.2 0-.8.7-1.6 1.5-1.6.7 0 1.2.5 1.2 1.2C11.5 4.2 10.8 5 10 5zm-.9 1.2c-.9 0-1.8.6-2.2.6-.5 0-1.4-.6-2.3-.6C3.4 6.2 2 7.6 2 10c0 1.4.5 2.8 1.2 3.8.6.9 1.1 1.6 1.9 1.6.8 0 1.1-.5 2-.5.9 0 1.1.5 1.9.5.8 0 1.4-.7 2-1.6.6-.9.8-1.8.8-1.8-.3-.1-1.6-.7-1.6-2.2 0-1.1.7-2 1.6-2.4l-1.7-1z" fill="white" transform="scale(.65) translate(4 2)"/>
      <text x="52%" y="14" textAnchor="middle" fill="white" fontSize="7" fontWeight="500" fontFamily="-apple-system,BlinkMacSystemFont,sans-serif">Pay</text>
    </svg>
  );
  if (k === "googlepay") return (
    <svg width={h*2.4} height={h} viewBox="0 0 48 20" fill="none">
      <rect width="48" height="20" rx="3" fill="#fff" stroke="#e8eaed"/>
      <text x="50%" y="14" textAnchor="middle" fontSize="8" fontWeight="600" fontFamily="Arial,sans-serif">
        <tspan fill="#4285F4">G</tspan><tspan fill="#EA4335">o</tspan><tspan fill="#FBBC05">o</tspan><tspan fill="#4285F4">g</tspan><tspan fill="#34A853">l</tspan><tspan fill="#EA4335">e </tspan><tspan fill="#5F6368">Pay</tspan>
      </text>
    </svg>
  );
  if (k === "upi") return (
    <svg width={h*2.4} height={h} viewBox="0 0 48 20" fill="none">
      <rect width="48" height="20" rx="3" fill="#fff" stroke="#e8eaed"/>
      <text x="50%" y="14" textAnchor="middle" fontSize="9" fontWeight="900" fontFamily="Arial,sans-serif">
        <tspan fill="#097939">U</tspan><tspan fill="#ED752E">P</tspan><tspan fill="#097939">I</tspan>
      </text>
      <path d="M40 4l4 6-4 6" stroke="#097939" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  return <Building2 className="text-[#6b7280]" style={{ width:h, height:h }} />;
}

/* ── Gateway config panel ────────────────────────────────────────────────── */
function ConfigPanel({ gk, s, upd, showPP, setShowPP, showSK, setShowSK, showSW, setShowSW, showRZP, setShowRZP, showAP, setShowAP, ppTest, ppMsg, testPP, strTest, strMsg, testStripe }: {
  gk:string; s:PS; upd:(p:Partial<PS>)=>void;
  showPP:boolean; setShowPP:(v:boolean)=>void;
  showSK:boolean; setShowSK:(v:boolean)=>void;
  showSW:boolean; setShowSW:(v:boolean)=>void;
  showRZP:boolean; setShowRZP:(v:boolean)=>void;
  showAP:boolean; setShowAP:(v:boolean)=>void;
  ppTest:"idle"|"testing"|"ok"|"fail"; ppMsg:string; testPP:()=>void;
  strTest:"idle"|"testing"|"ok"|"fail"; strMsg:string; testStripe:()=>void;
}) {
  if (gk === "card" || gk === "applepay" || gk === "googlepay") return (
    <div className="space-y-4">
      <SLabel>Stripe Configuration{(gk === "applepay" || gk === "googlepay") ? ` - powers ${gk === "applepay" ? "Apple Pay" : "Google Pay"}` : ""}</SLabel>
      {(gk === "applepay" || gk === "googlepay") && (
        <IBox color="blue">{gk === "applepay" ? "Apple Pay" : "Google Pay"} is powered by Stripe. Configure your Stripe credentials below to enable it.</IBox>
      )}
      <ModeRow>
        {(["test","live"] as const).map(m => (
          <ModeBtn key={m} active={s.stripe.mode===m} live={m==="live"} onClick={() => upd({ stripe:{...s.stripe,mode:m} })}>
            {m==="live" ? "🟢  Live" : "🧪  Test"}
          </ModeBtn>
        ))}
      </ModeRow>
      {s.stripe.mode==="live" && <MNote live>Live mode - real charges processed.</MNote>}
      {s.stripe.mode==="test" && <MNote>Test mode - use card 4242 4242 4242 4242.</MNote>}
      <Fld label="Publishable Key" placeholder="pk_test_… or pk_live_…" value={s.stripe.publishable_key} mono
        hint="Frontend-safe - initializes Stripe.js"
        onChange={v => upd({ stripe:{...s.stripe,publishable_key:v} })}
      />
      <Sec label="Secret Key" isSet={s.stripe.secret_key_is_set} value={s.stripe.secret_key} show={showSK}
        onToggleShow={() => setShowSK(!showSK)}
        placeholder={s.stripe.secret_key_is_set ? "Leave blank to keep current" : "sk_test_… or sk_live_…"}
        hint="Server-side only"
        onChange={v => upd({ stripe:{...s.stripe,secret_key:v} })}
      />
      <Sec label="Webhook Secret (optional)" isSet={s.stripe.webhook_is_set} value={s.stripe.webhook_secret} show={showSW}
        onToggleShow={() => setShowSW(!showSW)}
        placeholder={s.stripe.webhook_is_set ? "Leave blank to keep current" : "whsec_…"}
        hint="Stripe Dashboard → Webhooks"
        onChange={v => upd({ stripe:{...s.stripe,webhook_secret:v} })}
      />
      <TBtn onTest={testStripe} disabled={strTest==="testing"||!s.stripe.secret_key_is_set} status={strTest} msg={strMsg} />
    </div>
  );
  if (gk === "paypal") return (
    <div className="space-y-4">
      <SLabel>PayPal Configuration</SLabel>
      <ModeRow>
        {(["sandbox","live"] as const).map(m => (
          <ModeBtn key={m} active={s.paypal.mode===m} live={m==="live"} onClick={() => upd({ paypal:{...s.paypal,mode:m} })}>
            {m==="live" ? "🟢  Live" : "🧪  Sandbox"}
          </ModeBtn>
        ))}
      </ModeRow>
      {s.paypal.mode==="live" && <MNote live>Live - real payments processed.</MNote>}
      {s.paypal.mode==="sandbox" && <MNote>Sandbox - test only. No real charges.</MNote>}
      <Fld label="Client ID" placeholder="AXxx..." value={s.paypal.client_id} mono
        hint="PayPal Developer → My Apps & Credentials"
        onChange={v => upd({ paypal:{...s.paypal,client_id:v} })}
      />
      <Sec label="Client Secret" isSet={s.paypal.secret_is_set} value={s.paypal.client_secret} show={showPP}
        onToggleShow={() => setShowPP(!showPP)}
        placeholder={s.paypal.secret_is_set ? "Leave blank to keep current" : "EXxx..."}
        hint="Never expose in frontend code"
        onChange={v => upd({ paypal:{...s.paypal,client_secret:v} })}
      />
      <TBtn onTest={testPP} disabled={ppTest==="testing"||!s.paypal.client_id} status={ppTest} msg={ppMsg} />
    </div>
  );
  if (gk === "upi") return (
    <div className="space-y-4">
      <SLabel>Razorpay Configuration</SLabel>
      <IBox color="blue">Razorpay handles UPI &amp; Indian wallets. Amount auto-converts to INR at checkout.</IBox>
      <Fld label="Key ID" placeholder="rzp_test_… or rzp_live_…" value={s.razorpay.key_id} mono
        hint="Frontend-safe - used in Razorpay checkout widget"
        onChange={v => upd({ razorpay:{...s.razorpay,key_id:v} })}
      />
      <Sec label="Key Secret" isSet={s.razorpay.secret_is_set} value={s.razorpay.key_secret} show={showRZP}
        onToggleShow={() => setShowRZP(!showRZP)}
        placeholder={s.razorpay.secret_is_set ? "Leave blank to keep current" : "your_key_secret"}
        hint="Server-side only - signature verification"
        onChange={v => upd({ razorpay:{...s.razorpay,key_secret:v} })}
      />
    </div>
  );
  if (gk === "apple_iap") return (
    <div className="space-y-4">
      <SLabel>Apple In-App Purchase</SLabel>
      <IBox color="blue">
        The App Store requires IAP for digital goods - a verification badge is digital goods.
        Card and PayPal are for the website only. Create an auto-renewable subscription per plan
        in App Store Connect, then paste its Product ID below.
      </IBox>
      <Fld label="Bundle ID" placeholder="com.teezer.app" value={s.apple_iap.bundle_id} mono
        hint="App Store Connect → App Information"
        onChange={v => upd({ apple_iap:{...s.apple_iap,bundle_id:v} })}
      />
      <Sec label="App-Specific Shared Secret" isSet={s.apple_iap.secret_is_set} value={s.apple_iap.shared_secret} show={showAP}
        onToggleShow={() => setShowAP(!showAP)}
        placeholder={s.apple_iap.secret_is_set ? "Leave blank to keep current" : "32-character secret"}
        hint="App Store Connect → App Information → App-Specific Shared Secret. Used to verify receipts."
        onChange={v => upd({ apple_iap:{...s.apple_iap,shared_secret:v} })}
      />
      <SLabel>Product IDs</SLabel>
      <div className="grid grid-cols-3 gap-3">
        <Fld label="Basic ($5)"    placeholder="bv_basic_monthly"    value={s.apple_iap.product_basic}    mono onChange={v => upd({ apple_iap:{...s.apple_iap,product_basic:v} })} />
        <Fld label="Plus ($10)"    placeholder="bv_plus_monthly"     value={s.apple_iap.product_plus}     mono onChange={v => upd({ apple_iap:{...s.apple_iap,product_plus:v} })} />
        <Fld label="Business ($20)" placeholder="bv_business_monthly" value={s.apple_iap.product_business} mono onChange={v => upd({ apple_iap:{...s.apple_iap,product_business:v} })} />
      </div>
      <IBox color="green">These must match App Store Connect EXACTLY. A mismatch means the receipt verifies but is rejected as &quot;not for the plan you selected&quot;.</IBox>
    </div>
  );
  if (gk === "google_iap") return (
    <div className="space-y-4">
      <SLabel>Google Play Billing</SLabel>
      <IBox color="blue">
        Google Play requires its own billing for digital goods. Create a subscription per plan in
        the Play Console, then paste its Product ID below.
      </IBox>
      <Fld label="Package Name" placeholder="com.teezer.app" value={s.google_iap.package_name} mono
        hint="Play Console → App → Package name"
        onChange={v => upd({ google_iap:{...s.google_iap,package_name:v} })}
      />
      <div>
        <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">
          Service Account JSON
          {s.google_iap.service_account_is_set && <span className="ml-2 text-[11px] font-normal text-emerald-600">Configured</span>}
        </label>
        <textarea rows={4}
          placeholder={s.google_iap.service_account_is_set ? "Leave blank to keep current" : '{"type":"service_account","project_id":"…","private_key":"…"}'}
          value={s.google_iap.service_account}
          onChange={e => upd({ google_iap:{...s.google_iap,service_account:e.target.value} })}
          className="w-full rounded-xl border border-[#e8eaed] bg-white px-3 py-2.5 font-mono text-[12px] text-[#111827] placeholder:text-[#c4c9d4] outline-none focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/10 resize-none transition-all"
        />
        <p className="mt-1 text-[11px] text-[#9ca3af]">
          Google Cloud → IAM → Service Accounts → Keys → JSON. Grant it access in Play Console → Users and permissions.
        </p>
      </div>
      <SLabel>Product IDs</SLabel>
      <div className="grid grid-cols-3 gap-3">
        <Fld label="Basic ($5)"     placeholder="bv_basic_monthly"    value={s.google_iap.product_basic}    mono onChange={v => upd({ google_iap:{...s.google_iap,product_basic:v} })} />
        <Fld label="Plus ($10)"     placeholder="bv_plus_monthly"     value={s.google_iap.product_plus}     mono onChange={v => upd({ google_iap:{...s.google_iap,product_plus:v} })} />
        <Fld label="Business ($20)" placeholder="bv_business_monthly" value={s.google_iap.product_business} mono onChange={v => upd({ google_iap:{...s.google_iap,product_business:v} })} />
      </div>
      <IBox color="green">Prices are set in the Play Console, not here. The store charges; the server only verifies the receipt.</IBox>
    </div>
  );
  if (gk === "bank") return (
    <div className="space-y-4">
      <SLabel>Bank Transfer Details</SLabel>
      <div className="grid grid-cols-2 gap-3">
        <Fld label="Account Holder" placeholder="Teezer Inc."   value={s.bank.account_holder} onChange={v => upd({ bank:{...s.bank,account_holder:v} })} />
        <Fld label="Bank Name"      placeholder="Chase Bank"     value={s.bank.bank_name}      onChange={v => upd({ bank:{...s.bank,bank_name:v} })} />
        <Fld label="Account Number" placeholder="000123456789"    value={s.bank.account_number} onChange={v => upd({ bank:{...s.bank,account_number:v} })} />
        <Fld label="Routing / IFSC" placeholder="021000021"       value={s.bank.routing_number} onChange={v => upd({ bank:{...s.bank,routing_number:v} })} />
        <Fld label="SWIFT / BIC"    placeholder="CHASUS33"        value={s.bank.swift_code}     onChange={v => upd({ bank:{...s.bank,swift_code:v} })} />
      </div>
      <div>
        <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">Instructions <span className="font-normal text-[#9ca3af]">(shown at checkout)</span></label>
        <textarea rows={3} placeholder="Include your reference number. Coins credited within 1-3 business days."
          value={s.bank.instructions} onChange={e => upd({ bank:{...s.bank,instructions:e.target.value} })}
          className="w-full rounded-xl border border-[#e8eaed] bg-white px-3 py-2.5 text-[13px] text-[#111827] placeholder:text-[#c4c9d4] outline-none focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/10 resize-none transition-all"
        />
      </div>
      <IBox color="green">Bank transfer orders require manual admin approval before coins are credited.</IBox>
    </div>
  );
  return null;
}

function SLabel({ children }:{ children:React.ReactNode }) {
  return <p className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-widest">{children}</p>;
}
function ModeRow({ children }:{ children:React.ReactNode }) {
  return <div className="flex gap-2">{children}</div>;
}
function ModeBtn({ active, live, onClick, children }:{ active:boolean; live:boolean; onClick:()=>void; children:React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded-xl text-[12px] font-bold border transition-all active:scale-95 ${
      active ? live ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
                    : "bg-[#374151] border-[#374151] text-white"
             : "border-[#e8eaed] bg-white text-[#374151] hover:bg-[#f4f5f7]"
    }`}>{children}</button>
  );
}
function MNote({ live, children }:{ live?:boolean; children:React.ReactNode }) {
  return <p className={`text-[12px] font-medium ${live ? "text-emerald-600" : "text-amber-600"}`}>⚠ {children}</p>;
}
function Fld({ label, placeholder, value, hint, mono, onChange }:{
  label:string; placeholder?:string; value:string; hint?:string; mono?:boolean; onChange:(v:string)=>void;
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">{label}</label>
      <input type="text" spellCheck={false} autoComplete="off"
        placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        className={`h-10 w-full rounded-xl border border-[#e8eaed] bg-white px-3.5 text-[13px] text-[#111827] placeholder:text-[#c4c9d4] outline-none focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/10 transition-all ${mono?"font-mono":""}`}
      />
      {hint && <p className="mt-1 text-[11px] text-[#b0b7c3]">{hint}</p>}
    </div>
  );
}
function Sec({ label, isSet, value, show, onToggleShow, placeholder, hint, onChange }:{
  label:string; isSet:boolean; value:string; show:boolean; onToggleShow:()=>void;
  placeholder?:string; hint?:string; onChange:(v:string)=>void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <label className="text-[12px] font-semibold text-[#374151]">{label}</label>
        {isSet && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
            <CheckCircle2 className="h-2.5 w-2.5" /> Set
          </span>
        )}
      </div>
      <div className="relative">
        <input type={show?"text":"password"} spellCheck={false} autoComplete="new-password"
          placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
          className="h-10 w-full rounded-xl border border-[#e8eaed] bg-white px-3.5 pr-12 text-[13px] text-[#111827] font-mono placeholder:font-sans placeholder:text-[#c4c9d4] outline-none focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/10 transition-all"
        />
        <button type="button" onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151] p-1 rounded-lg hover:bg-[#f3f4f6] transition-colors">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-[11px] text-[#b0b7c3]">{hint}</p>}
    </div>
  );
}
function TBtn({ onTest, disabled, status, msg }:{
  onTest:()=>void; disabled:boolean; status:"idle"|"testing"|"ok"|"fail"; msg:string;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button onClick={onTest} disabled={disabled}
        className="inline-flex items-center gap-2 rounded-xl border border-[#e8eaed] bg-white px-4 py-2 text-[12px] font-semibold text-[#374151] hover:bg-[#f4f5f7] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95">
        {status==="testing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
        {status==="testing" ? "Testing..." : "Test Connection"}
      </button>
      {status==="ok" && (
        <span className="flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> {msg}
        </span>
      )}
      {status==="fail" && (
        <span className="flex items-center gap-1.5 rounded-xl bg-red-50 border border-red-200 px-3 py-1.5 text-[12px] font-semibold text-red-600">
          <XCircle className="h-3.5 w-3.5" /> {msg}
        </span>
      )}
    </div>
  );
}
function IBox({ color, children }:{ color:"blue"|"green"; children:React.ReactNode }) {
  return (
    <div className={`rounded-xl border px-4 py-2.5 text-[12px] font-medium ${
      color==="blue" ? "bg-blue-50 border-blue-100 text-blue-700" : "bg-emerald-50 border-emerald-100 text-emerald-700"
    }`}>
      {children}
    </div>
  );
}

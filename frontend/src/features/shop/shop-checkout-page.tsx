"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { CheckCircle2, Lock, Minus, Plus, ShieldCheck, Store } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth.store";
import { walletCoinsService } from "@/services/wallets-coins.service";
import {
  shopCheckoutService,
  type CheckoutProduct,
  type ShippingAddress,
} from "@/services/shop-checkout.service";

/**
 * The page mobile hands off to for a card/UPI Shop purchase - same reason and
 * same hand-off shape as the coins page (no payment SDK exists in the mobile
 * app). Scoped to one product/quantity rather than a package grid, since a
 * Shop purchase is always "buy this one thing", not a catalog pick.
 */
function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function StripePaymentForm({ orderId, onSuccess }: { orderId: number; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: "if_required" });
      if (error) {
        toast.error(error.message ?? "Payment failed. Please try again.");
      } else if (paymentIntent?.status === "succeeded") {
        await shopCheckoutService.captureStripePayment(orderId, paymentIntent.id);
        onSuccess();
      }
    } catch {
      toast.error("Payment failed. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || paying}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#fe2c55] py-3 text-[13px] font-black text-white transition hover:bg-[#e0193f] disabled:opacity-50"
      >
        <Lock className="h-3.5 w-3.5" />
        {paying ? "Processing…" : "Pay Now"}
      </button>
    </form>
  );
}

function StripePane({ payload, amount, currency }: { payload: () => Parameters<typeof shopCheckoutService.createStripeIntent>[0]; amount: number; currency: string }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);

  const payConfigQ = useQuery({ queryKey: ["payment-config"], queryFn: walletCoinsService.paymentConfig, staleTime: 10 * 60_000 });

  const init = async () => {
    setLoading(true);
    try {
      const pk = payConfigQ.data?.stripe?.publishable_key;
      if (pk) setStripePromise(loadStripe(pk));
      const data = await shopCheckoutService.createStripeIntent(payload());
      setClientSecret(data.client_secret);
      setOrderId(data.order_id);
    } catch (e) {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-[#16a34a]" />
        <p className="text-[15px] font-black text-[#111827]">Order placed</p>
        <p className="text-[12.5px] text-[#6b7280]">The seller has been notified. Thanks for shopping on Teezer.</p>
      </div>
    );
  }

  if (!payConfigQ.data?.stripe?.publishable_key) {
    return (
      <div className="rounded-[10px] border border-[#fde68a] bg-[#fffbeb] px-3 py-3 text-center">
        <p className="text-[12px] font-bold text-[#92400e]">Card payment isn't set up yet</p>
        <p className="mt-0.5 text-[10.5px] text-[#b45309]">Try again later, or ask the seller to enable another payment method.</p>
      </div>
    );
  }

  if (!clientSecret || !orderId || !stripePromise) {
    return (
      <button
        onClick={init}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#fe2c55] py-3 text-[13px] font-black text-white transition hover:bg-[#e0193f] disabled:opacity-60"
      >
        <Lock className="h-3.5 w-3.5" />
        {loading ? "Loading…" : `Pay with Card - ${fmt(amount, currency)}`}
      </button>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
      <StripePaymentForm orderId={orderId} onSuccess={() => setDone(true)} />
    </Elements>
  );
}

function RazorpayPane({ payload, amount, currency }: { payload: () => Parameters<typeof shopCheckoutService.createRazorpayOrder>[0]; amount: number; currency: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const pay = async () => {
    setLoading(true);
    try {
      const order = await shopCheckoutService.createRazorpayOrder(payload());

      await new Promise<void>((resolve, reject) => {
        if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).Razorpay) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Razorpay"));
        document.body.appendChild(script);
      });

      const RazorpayClass = (window as unknown as Record<string, unknown>).Razorpay as new (opts: Record<string, unknown>) => { open: () => void };
      const rzp = new RazorpayClass({
        key: order.key_id,
        amount: Math.round(order.amount * 100),
        currency: order.currency,
        name: "Teezer Shop",
        order_id: order.razorpay_order_id,
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            await shopCheckoutService.captureRazorpayPayment({
              order_id: order.order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            });
            setDone(true);
          } catch {
            toast.error("Payment verification failed. Contact support.");
          }
        },
      });
      rzp.open();
    } catch {
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-[#16a34a]" />
        <p className="text-[15px] font-black text-[#111827]">Order placed</p>
        <p className="text-[12.5px] text-[#6b7280]">The seller has been notified. Thanks for shopping on Teezer.</p>
      </div>
    );
  }

  return (
    <button
      onClick={pay}
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#5f259f] py-3 text-[13px] font-black text-white transition hover:bg-[#4b1d80] disabled:opacity-60"
    >
      <Lock className="h-3.5 w-3.5" />
      {loading ? "Loading…" : `Pay with UPI - ${fmt(amount, currency)}`}
    </button>
  );
}

export function ShopCheckoutPage({ productId }: { productId: number }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [qty, setQty] = useState(1);
  const [variation, setVariation] = useState<Record<string, string>>({});
  const [address, setAddress] = useState<ShippingAddress>({ name: "", phone: "", line1: "", city: "", country: "" });
  const [method, setMethod] = useState<"stripe" | "razorpay">("stripe");

  const productQ = useQuery({
    queryKey: ["shop-checkout-product", productId],
    queryFn: () => shopCheckoutService.product(productId),
    enabled: Number.isFinite(productId) && productId > 0,
  });

  const product = productQ.data;
  const amount = useMemo(() => (product ? Math.round(product.price * qty * 100) / 100 : 0), [product, qty]);

  const addressComplete = product?.is_digital || (address.name && address.phone && address.line1 && address.city && address.country);

  const payload = () => ({
    product_id: productId,
    quantity: qty,
    variation: Object.keys(variation).length ? variation : undefined,
    shipping_address: product?.is_digital ? undefined : address,
  });

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <Store className="h-10 w-10 text-[#d1d5db]" />
        <p className="text-[15px] font-black text-[#111827]">Log in to check out</p>
        <p className="text-[12.5px] text-[#6b7280]">You need a Teezer account to buy from this shop.</p>
        <a href="/" className="mt-2 rounded-[10px] bg-[#fe2c55] px-5 py-2.5 text-[13px] font-black text-white">Go to Teezer</a>
      </div>
    );
  }

  if (productQ.isLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-[#9ca3af]">Loading…</div>;
  }

  if (productQ.isError || !product) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-[15px] font-black text-[#111827]">This product isn't available</p>
        <p className="text-[12.5px] text-[#6b7280]">It may have been removed, or the shop isn't open for purchases right now.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[520px] px-4 py-8">
      <div className="rounded-[16px] border border-[#f0f1f5] bg-white p-4 shadow-sm">
        <div className="flex gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.image_url ?? product.images[0] ?? ""} alt="" className="h-20 w-20 flex-shrink-0 rounded-[10px] object-cover bg-[#f3f4f6]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-black text-[#111827]">{product.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[#9ca3af]">
              <Store className="h-3 w-3" /> {product.shop.name ?? product.shop.username}
            </p>
            <p className="mt-1.5 text-[16px] font-black text-[#111827]">{fmt(product.price, product.currency)}</p>
          </div>
        </div>

        {product.variations.length > 0 && (
          <div className="mt-4 space-y-2.5">
            {product.variations.map((v) => (
              <div key={v.name}>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">{v.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {v.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setVariation((prev) => ({ ...prev, [v.name]: opt }))}
                      className={`rounded-full border px-3 py-1 text-[11.5px] font-bold transition ${
                        variation[v.name] === opt ? "border-[#fe2c55] bg-[#fff5f7] text-[#fe2c55]" : "border-[#e5e7eb] text-[#374151] hover:border-[#fca5a5]"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">Quantity</p>
          <div className="flex items-center gap-3 rounded-full border border-[#e5e7eb] px-1.5 py-1">
            <button onClick={() => setQty((n) => Math.max(1, n - 1))} className="flex h-6 w-6 items-center justify-center rounded-full text-[#374151] hover:bg-[#f3f4f6]">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[18px] text-center text-[12.5px] font-bold tabular-nums">{qty}</span>
            <button onClick={() => setQty((n) => Math.min(product.stock || 1, n + 1))} className="flex h-6 w-6 items-center justify-center rounded-full text-[#374151] hover:bg-[#f3f4f6]">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {!product.is_digital && (
          <div className="mt-4 space-y-2 border-t border-[#f3f4f6] pt-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">Shipping address</p>
            <input placeholder="Full name" value={address.name} onChange={(e) => setAddress((a) => ({ ...a, name: e.target.value }))}
              className="w-full rounded-[9px] border border-[#e5e7eb] px-3 py-2 text-[12.5px] outline-none focus:border-[#fe2c55]" />
            <input placeholder="Phone number" value={address.phone} onChange={(e) => setAddress((a) => ({ ...a, phone: e.target.value }))}
              className="w-full rounded-[9px] border border-[#e5e7eb] px-3 py-2 text-[12.5px] outline-none focus:border-[#fe2c55]" />
            <input placeholder="Address" value={address.line1} onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))}
              className="w-full rounded-[9px] border border-[#e5e7eb] px-3 py-2 text-[12.5px] outline-none focus:border-[#fe2c55]" />
            <div className="flex gap-2">
              <input placeholder="City" value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                className="w-1/2 rounded-[9px] border border-[#e5e7eb] px-3 py-2 text-[12.5px] outline-none focus:border-[#fe2c55]" />
              <input placeholder="Country" value={address.country} onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))}
                className="w-1/2 rounded-[9px] border border-[#e5e7eb] px-3 py-2 text-[12.5px] outline-none focus:border-[#fe2c55]" />
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-[#f3f4f6] pt-4">
          <p className="text-[12.5px] font-bold text-[#374151]">Total</p>
          <p className="text-[17px] font-black text-[#111827]">{fmt(amount, product.currency)}</p>
        </div>

        {!addressComplete ? (
          <p className="mt-4 text-center text-[11.5px] text-[#9ca3af]">Fill in your shipping address to continue.</p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex gap-1.5 rounded-full bg-[#f3f4f6] p-1">
              <button onClick={() => setMethod("stripe")} className={`flex-1 rounded-full py-1.5 text-[11.5px] font-bold transition ${method === "stripe" ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280]"}`}>Card</button>
              <button onClick={() => setMethod("razorpay")} className={`flex-1 rounded-full py-1.5 text-[11.5px] font-bold transition ${method === "razorpay" ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280]"}`}>UPI</button>
            </div>
            {method === "stripe" ? (
              <StripePane payload={payload} amount={amount} currency={product.currency} />
            ) : (
              <RazorpayPane payload={payload} amount={amount} currency={product.currency} />
            )}
            <p className="flex items-center justify-center gap-1 text-[10.5px] text-[#9ca3af]">
              <ShieldCheck className="h-3 w-3" /> Payments are processed securely
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  DEFAULT_SHIPPING_METHOD_ID,
  SHIPPING_OPTIONS,
  type ShippingOptionId,
  resolveShippingOption,
} from "@/lib/constants";
import { money } from "@/lib/format";
import { SubmitInvoiceRequestButton } from "@/components/SubmitInvoiceRequestButton";

export function CartCheckoutPanel({
  subtotal,
  submitDisabled,
}: {
  subtotal: number;
  submitDisabled?: boolean;
}) {
  const [shippingMethodId, setShippingMethodId] = useState<ShippingOptionId>(
    DEFAULT_SHIPPING_METHOD_ID,
  );
  const shipping = resolveShippingOption(shippingMethodId);
  const orderTotal = subtotal + shipping.price;

  return (
    <div className="h-fit rounded-card border border-border bg-surface p-5">
      <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">SHIPPING</div>
      <fieldset className="space-y-2">
        <legend className="sr-only">Shipping method</legend>
        {SHIPPING_OPTIONS.map((opt) => {
          const selected = opt.id === shippingMethodId;
          return (
            <label
              key={opt.id}
              className={`flex cursor-pointer gap-3 rounded-chip border px-3 py-2.5 transition ${
                selected
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-accent/50"
              }`}
            >
              <input
                type="radio"
                name="shippingMethod"
                value={opt.id}
                checked={selected}
                onChange={() => setShippingMethodId(opt.id)}
                className="mt-1"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-ink">{opt.label}</span>
                  <span className="shrink-0 font-mono text-[12px] text-ink">
                    {opt.price === 0 ? "Free" : money(opt.price)}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] text-muted">{opt.description}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="mt-5 space-y-2 border-t border-border pt-4 text-[13px]">
        <div className="flex justify-between">
          <span className="text-secondary">Subtotal</span>
          <span className="font-mono">{money(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-secondary">Shipping</span>
          <span className="font-mono">
            {shipping.price === 0 ? "Free" : money(shipping.price)}
          </span>
        </div>
        <div className="flex justify-between pt-1">
          <span className="font-semibold text-ink">Order total</span>
          <span className="font-mono font-semibold text-ink">{money(orderTotal)}</span>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-muted">
        Checkout submits your order for review with the shipping option above. Soft holds continue
        for up to 7 days while staff reviews the request.
      </p>

      <div className="mt-5">
        <SubmitInvoiceRequestButton
          disabled={submitDisabled}
          shippingMethodId={shippingMethodId}
        />
      </div>
    </div>
  );
}

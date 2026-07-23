"use client";

import { useState } from "react";
import {
  compThresholdActive,
  defaultShippingMethodId,
  enabledShippingMethods,
  evaluateShippingCharge,
  type ShippingRules,
} from "@/lib/shipping-rules";
import { money } from "@/lib/format";
import { SubmitInvoiceRequestButton } from "@/components/SubmitInvoiceRequestButton";

export function CartCheckoutPanel({
  subtotal,
  submitDisabled,
  shippingRules,
}: {
  subtotal: number;
  submitDisabled?: boolean;
  shippingRules: ShippingRules;
}) {
  const methods = enabledShippingMethods(shippingRules);
  const [shippingMethodId, setShippingMethodId] = useState<string>(
    defaultShippingMethodId(shippingRules),
  );
  const [poNumber, setPoNumber] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const shipping = evaluateShippingCharge(shippingRules, shippingMethodId, subtotal);
  const orderTotal = subtotal + shipping.price;

  const compActive = compThresholdActive(shippingRules);
  const threshold = shippingRules.freeShippingThreshold;
  const qualifies = compActive && subtotal >= threshold;
  const awayFromComp = compActive && !qualifies ? threshold - subtotal : 0;

  return (
    <div className="h-fit rounded-card border border-border bg-surface p-5">
      <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">SHIPPING</div>
      {compActive ? (
        qualifies ? (
          <p className="mb-3 rounded-chip border border-accent/40 bg-accent/5 px-3 py-2 text-[11.5px] text-secondary">
            Complimentary shipping applied — orders of {money(threshold)}+ ship free on eligible
            methods.
          </p>
        ) : (
          <p className="mb-3 rounded-chip border border-border bg-ground px-3 py-2 text-[11.5px] text-secondary">
            You&rsquo;re <span className="font-mono text-ink">{money(awayFromComp)}</span> away from
            complimentary shipping (orders of {money(threshold)}+).
          </p>
        )
      ) : null}
      <fieldset className="space-y-2">
        <legend className="sr-only">Shipping method</legend>
        {methods.map((opt) => {
          const selected = opt.id === shippingMethodId;
          const charge = evaluateShippingCharge(shippingRules, opt.id, subtotal);
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
                    {charge.comped ? (
                      <>
                        <s className="mr-1.5 text-muted">{money(charge.basePrice)}</s>
                        Free
                      </>
                    ) : charge.price === 0 ? (
                      "Free"
                    ) : (
                      money(charge.price)
                    )}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] text-muted">{opt.description}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="mt-5 border-t border-border pt-4">
        <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
          YOUR REFERENCE
        </div>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted">
            PO number <span className="normal-case tracking-normal">(optional)</span>
          </span>
          <input
            type="text"
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
            maxLength={64}
            placeholder="e.g. PO-2026-0142"
            className="h-9 w-full rounded-chip border border-border bg-ground px-3 font-mono text-[12.5px] text-ink placeholder:font-sans placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted">
            Order notes <span className="normal-case tracking-normal">(optional)</span>
          </span>
          <textarea
            value={orderNote}
            onChange={(e) => setOrderNote(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Pricing questions, consolidation with a previous order, delivery timing…"
            className="w-full resize-y rounded-chip border border-border bg-ground px-3 py-2 text-[12.5px] text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-5 space-y-2 border-t border-border pt-4 text-[13px]">
        <div className="flex justify-between">
          <span className="text-secondary">Subtotal</span>
          <span className="font-mono">{money(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-secondary">
            Shipping{shipping.comped ? " · comped" : ""}
          </span>
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
          poNumber={poNumber}
          message={orderNote}
        />
      </div>
    </div>
  );
}

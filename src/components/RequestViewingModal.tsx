"use client";

import { useState, useTransition } from "react";
import { requestVideoCall } from "@/lib/actions/buyer";
import { Placeholder } from "./Placeholder";
import { clsx } from "@/lib/clsx";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIMES = ["9:30", "10:00", "11:30", "14:00", "16:30"];

export function RequestViewingModal({
  productId,
  productName,
  sku,
  repName,
  imageLabel,
}: {
  productId: string;
  productName: string;
  sku: string;
  repName: string;
  imageLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [dayIdx, setDayIdx] = useState(1);
  const [time, setTime] = useState("11:30");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  // Build a simple week starting today.
  const base = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d;
  });
  const slotLabel = `${DOW[dayIdx]} ${days[dayIdx].getDate()} · ${time} EST`;

  function submit() {
    const fd = new FormData();
    fd.set("productId", productId);
    fd.set("slot", slotLabel);
    fd.set("note", note);
    start(async () => {
      const res = await requestVideoCall(fd);
      if (res?.ok) setConfirmed(true);
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-[50px] items-center justify-center gap-2.5 rounded-chip border border-accent bg-accent/5 text-[12.5px] uppercase tracking-[0.14em] text-[#6E5A30] transition hover:bg-accent/10"
      >
        ◉ Request a video viewing
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-ink/40 p-6 pt-[8vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-[520px] max-w-full overflow-hidden rounded-card border border-border bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmed ? (
              <div className="p-8 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-success text-[16px] text-white">
                  ✓
                </div>
                <div className="mt-4 text-[20px] font-semibold text-ink">Viewing booked</div>
                <p className="mt-2 text-[13px] text-secondary">
                  Calendar invite and video link sent to you and {repName} for{" "}
                  <span className="font-mono text-ink">{slotLabel}</span>. (No email in this MVP —
                  logged to the server console.)
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-6 h-10 rounded-chip bg-ink px-6 text-[12px] uppercase tracking-[0.14em] text-ground"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="p-7">
                <div className="flex items-baseline justify-between">
                  <div className="text-[20px] font-semibold text-ink">Request a live viewing</div>
                  <button onClick={() => setOpen(false)} className="text-[16px] text-muted">
                    ✕
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-3 rounded-chip border border-border bg-ground p-3">
                  <Placeholder label={imageLabel} className="h-12 w-12 flex-none rounded" />
                  <div>
                    <div className="text-[13px] text-ink">{productName}</div>
                    <div className="font-mono text-[11px] text-muted">
                      {sku} · with {repName}
                    </div>
                  </div>
                </div>

                <div className="mt-5 micro-badge text-[10px] tracking-[0.14em] text-accent">
                  CHOOSE A DAY
                </div>
                <div className="mt-2.5 grid grid-cols-7 gap-1.5">
                  {days.map((d, i) => {
                    const weekend = i >= 5;
                    const on = dayIdx === i;
                    return (
                      <button
                        key={i}
                        disabled={weekend}
                        onClick={() => setDayIdx(i)}
                        className={clsx(
                          "rounded border py-2 text-center text-[11px]",
                          on
                            ? "border-accent bg-accent text-white"
                            : weekend
                            ? "border-border/60 text-muted/50"
                            : "border-border text-secondary hover:border-accent",
                        )}
                      >
                        {DOW[i]}
                        <br />
                        <span className={clsx("text-[13px]", on ? "text-white" : "text-ink")}>
                          {d.getDate()}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 micro-badge text-[10px] tracking-[0.14em] text-accent">
                  TIME · YOUR TIMEZONE (EST)
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {TIMES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTime(t)}
                      className={clsx(
                        "rounded border px-3.5 py-2 text-[12px]",
                        time === t
                          ? "border-accent bg-accent/10 text-[#6E5A30]"
                          : "border-border text-secondary hover:border-accent",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="mt-4 micro-badge text-[10px] tracking-[0.14em] text-accent">
                  NOTE FOR {repName.split(" ")[0].toUpperCase()}
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything you'd like shown up close…"
                  className="mt-2.5 min-h-[64px] w-full rounded-chip border border-border p-3 text-[12.5px] text-ink outline-none focus:border-accent"
                />

                <button
                  disabled={pending}
                  onClick={submit}
                  className="mt-5 h-12 w-full rounded-chip bg-ink text-[12px] uppercase tracking-[0.14em] text-ground disabled:opacity-60"
                >
                  {pending ? "Booking…" : `Confirm — ${slotLabel}`}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

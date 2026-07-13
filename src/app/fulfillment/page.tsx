import Link from "next/link";
import { prisma } from "@/lib/db";
import { ORDER_STATUS, CARRIERS } from "@/lib/constants";
import { heldUntil } from "@/lib/format";
import { Placeholder } from "@/components/Placeholder";
import { clsx } from "@/lib/clsx";
import {
  verifyPick,
  moveToPacking,
  toggleChecklistItem,
  setCarrier,
  setTracking,
  markShipped,
} from "@/lib/actions/fulfillment";

export const dynamic = "force-dynamic";

type SP = { [k: string]: string | string[] | undefined };

const TABS: { key: string; label: string; statuses: string[] }[] = [
  { key: "pick", label: "TO PICK", statuses: [ORDER_STATUS.TO_PICK, ORDER_STATUS.PICKING] },
  { key: "packing", label: "PACKING", statuses: [ORDER_STATUS.PACKING] },
  { key: "shipped", label: "SHIPPED", statuses: [ORDER_STATUS.SHIPPED] },
];

export default async function FulfillmentPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const tabKey = one(sp.tab) || "pick";
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];

  const tasks = await prisma.fulfillmentTask.findMany({
    include: {
      order: {
        include: {
          account: true,
          invoice: true,
          items: { include: { product: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
    orderBy: { order: { shipBy: "asc" } },
  });

  const counts = Object.fromEntries(
    TABS.map((t) => [t.key, tasks.filter((task) => t.statuses.includes(task.status)).length]),
  );

  const queue = tasks.filter((task) => tab.statuses.includes(task.status));
  const selectedNumber = one(sp.order);
  const active =
    queue.find((task) => task.order.number === selectedNumber) ?? queue[0] ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[390px_1fr]">
      {/* queue */}
      <div className="border-b border-white/15 p-6 lg:border-b-0 lg:border-r">
        <div className="mb-5 flex gap-2">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/fulfillment?tab=${t.key}`}
              className={clsx(
                "flex-1 rounded py-2.5 text-center font-mono text-[11px] font-semibold tracking-[0.08em]",
                t.key === tab.key
                  ? "bg-accent text-ink"
                  : "border border-white/25 text-white/70",
              )}
            >
              {t.label} · {counts[t.key]}
            </Link>
          ))}
        </div>

        {queue.length === 0 ? (
          <div className="rounded border border-dashed border-white/25 p-5 text-center text-[12px] text-white/50">
            {tab.key === "shipped"
              ? "Nothing shipped yet today — completed orders appear here."
              : "Queue clear — no orders waiting."}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {queue.map((task) => {
              const o = task.order;
              const isActive = active?.id === task.id;
              return (
                <Link
                  key={task.id}
                  href={`/fulfillment?tab=${tab.key}&order=${o.number}`}
                  className={clsx(
                    "block min-h-[44px] p-4",
                    isActive
                      ? "border-2 border-accent bg-accent/10"
                      : "border border-white/20",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[14px] font-semibold text-ground">{o.number}</span>
                    <StatusPill status={task.status} />
                  </div>
                  <div className="mt-1.5 text-[13px] text-white/75">
                    {o.account.company} · {o.items.length}{" "}
                    {o.items.length === 1 ? "piece" : "pieces"}
                  </div>
                  {o.shipBy && task.status !== ORDER_STATUS.SHIPPED ? (
                    <div className="mt-1 font-mono text-[11px] text-accent">
                      Ship by {heldUntil(o.shipBy)}
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* active order */}
      {active ? (
        <ActiveOrder task={active} />
      ) : (
        <div className="flex items-center justify-center p-16 text-[14px] text-white/50">
          Select an order from the queue to begin.
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    TO_PICK: "border border-white/35 text-white/75",
    PICKING: "bg-accent text-ink",
    PACKING: "bg-success/90 text-white",
    SHIPPED: "border border-white/35 text-white/60",
  };
  return (
    <span
      className={clsx(
        "micro-badge rounded-full px-2.5 py-1 text-[9.5px] tracking-[0.1em]",
        map[status] ?? "border border-white/35 text-white/70",
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function ActiveOrder({
  task,
}: {
  task: {
    id: string;
    status: string;
    carrier: string | null;
    trackingNumber: string | null;
    packingChecklist: string;
    order: {
      id: string;
      number: string;
      status: string;
      account: { company: string };
      invoice: { number: string; terms: string } | null;
      items: {
        id: string;
        pickVerifiedAt: Date | null;
        product: { name: string; sku: string; material: string; location: string; imageLabel: string };
      }[];
    };
  };
}) {
  const o = task.order;
  const verified = o.items.filter((i) => i.pickVerifiedAt).length;
  const allVerified = verified === o.items.length;
  const checklist: { label: string; done: boolean }[] = JSON.parse(task.packingChecklist);
  const checklistComplete = checklist.every((c) => c.done);
  const isShipped = task.status === ORDER_STATUS.SHIPPED;
  const canShip = checklistComplete && !!task.carrier && !!task.trackingNumber && !isShipped;

  return (
    <div className="p-7">
      <div className="mb-5 flex flex-wrap items-center gap-3.5">
        <h1 className="text-[24px] font-semibold text-ground">
          {o.number} · {o.account.company}
        </h1>
        <StatusPill status={task.status} />
        {!isShipped ? (
          <span className="font-mono text-[11px] text-white/60">
            {verified} OF {o.items.length} VERIFIED
          </span>
        ) : null}
        <div className="flex-1" />
        {o.invoice ? (
          <span className="font-mono text-[12px] text-white/60">
            {o.invoice.number} · {o.invoice.terms}
          </span>
        ) : null}
      </div>

      {/* pick items */}
      <div className="flex flex-col gap-3.5">
        {o.items.map((it) => {
          const done = !!it.pickVerifiedAt;
          const verify = verifyPick.bind(null, it.id);
          return (
            <div
              key={it.id}
              className={clsx(
                "grid grid-cols-[110px_1fr_200px] gap-4 p-4",
                done ? "border border-white/15 bg-white/[0.04]" : "border-2 border-accent bg-accent/[0.07]",
              )}
            >
              <Placeholder
                variant="vault"
                label="reference photo"
                className="h-[110px] w-[110px] border border-white/15 text-center text-[9.5px]"
              />
              <div>
                <div className="text-[16px] text-ground">{it.product.name}</div>
                <div className="mt-1 font-mono text-[12px] text-white/55">
                  {it.product.sku} · 1 of 1 · {it.product.material}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  <span className="bg-ground px-3.5 py-2 font-mono text-[15px] font-semibold tracking-[0.06em] text-ful-ground">
                    {it.product.location}
                  </span>
                </div>
              </div>
              <div className="flex flex-col justify-center gap-2">
                {done ? (
                  <>
                    <div className="flex h-[52px] items-center justify-center gap-2 bg-success font-mono text-[12px] font-semibold tracking-[0.08em] text-white">
                      ✓ PICKED &amp; VERIFIED
                    </div>
                    <div className="text-center font-mono text-[10.5px] text-white/50">
                      photo match confirmed {heldUntil(it.pickVerifiedAt!).split(", ")[1]}
                    </div>
                  </>
                ) : (
                  <form action={verify}>
                    <button className="flex h-[52px] w-full items-center justify-center gap-2 bg-accent font-mono text-[12px] font-semibold tracking-[0.08em] text-ink transition hover:opacity-90">
                      📷 VERIFY WITH PHOTO
                    </button>
                    <div className="mt-2 text-center font-mono text-[10.5px] text-white/50">
                      compare against reference before bin pull
                    </div>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {allVerified && task.status === ORDER_STATUS.PICKING ? (
        <form action={moveToPacking.bind(null, o.id)} className="mt-4">
          <button className="h-12 w-full bg-white/15 font-mono text-[12px] font-semibold tracking-[0.12em] text-ground transition hover:bg-white/25">
            ALL VERIFIED → MOVE TO PACKING
          </button>
        </form>
      ) : null}

      {/* packing + shipping */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* checklist */}
        <div className="border border-white/15 p-5">
          <div className="mb-3.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-accent">
            PACKING CHECKLIST
          </div>
          <div className="flex flex-col gap-3">
            {checklist.map((c, i) => {
              const toggle = toggleChecklistItem.bind(null, task.id, i);
              return (
                <form key={i} action={toggle}>
                  <button
                    disabled={isShipped}
                    className="flex min-h-[44px] w-full items-center gap-3 text-left text-[14px] text-white/85"
                  >
                    <span
                      className={clsx(
                        "flex h-6 w-6 flex-none items-center justify-center text-[13px]",
                        c.done ? "bg-success text-white" : "border-2 border-white/40",
                      )}
                    >
                      {c.done ? "✓" : ""}
                    </span>
                    {c.label}
                  </button>
                </form>
              );
            })}
          </div>
        </div>

        {/* shipping */}
        <div className="flex flex-col border border-white/15 p-5">
          <div className="mb-3.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-accent">
            SHIPPING LABEL &amp; TRACKING
          </div>
          <div className="mb-2 text-[12.5px] text-white/60">Carrier · insured art courier</div>
          <div className="mb-3.5 flex gap-2">
            {CARRIERS.map((c) => {
              const pick = setCarrier.bind(null, task.id, c);
              const on = task.carrier === c;
              return (
                <form key={c} action={pick} className="flex-1">
                  <button
                    disabled={isShipped}
                    className={clsx(
                      "w-full py-2.5 text-center font-mono text-[11px] font-semibold",
                      on ? "bg-white/15 text-ground" : "border border-white/25 text-white/60",
                    )}
                  >
                    {c}
                  </button>
                </form>
              );
            })}
          </div>

          <form action={setTracking} className="mb-3.5 flex gap-2">
            <input type="hidden" name="taskId" value={task.id} />
            <input
              name="trackingNumber"
              defaultValue={task.trackingNumber ?? ""}
              disabled={isShipped}
              placeholder="Scan or enter tracking number…"
              className="h-12 flex-1 border border-white/30 bg-white/[0.04] px-3.5 font-mono text-[13px] text-ground outline-none placeholder:text-white/45 focus:border-accent"
            />
            <button
              disabled={isShipped}
              className="h-12 border border-white/30 px-4 font-mono text-[11px] text-white/70"
            >
              SAVE
            </button>
          </form>

          <div className="flex-1" />

          {isShipped ? (
            <div className="flex h-14 items-center justify-center gap-2 bg-success/90 font-mono text-[12px] font-semibold tracking-[0.1em] text-white">
              ✓ SHIPPED · {task.carrier} · {task.trackingNumber}
            </div>
          ) : canShip ? (
            <form action={markShipped.bind(null, task.id)}>
              <button className="h-14 w-full bg-accent font-mono text-[12px] font-semibold tracking-[0.12em] text-ink transition hover:opacity-90">
                MARK SHIPPED
              </button>
            </form>
          ) : (
            <div className="flex h-14 items-center justify-center bg-white/[0.12] px-3 text-center font-mono text-[11px] font-semibold tracking-[0.1em] text-white/50">
              {!checklistComplete
                ? "MARK SHIPPED — COMPLETE CHECKLIST FIRST"
                : !task.carrier
                ? "SELECT A CARRIER FIRST"
                : "ENTER TRACKING NUMBER FIRST"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

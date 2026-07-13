import { getQuoteThresholds, getNotifyEmails } from "@/lib/firestore/settings";
import { ThresholdSettingsForm } from "@/components/ThresholdSettingsForm";

export const dynamic = "force-dynamic";

export default async function StaffSettingsPage() {
  const [thresholds, notifyEmails] = await Promise.all([
    getQuoteThresholds(),
    getNotifyEmails(),
  ]);

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Settings</h1>
        <span className="text-[12px] text-muted">
          Invoice request thresholds &amp; staff notifications
        </span>
      </div>

      <ThresholdSettingsForm
        minItemCount={thresholds.minItemCount}
        minCartTotal={thresholds.minCartTotal}
        notifyEmails={notifyEmails}
      />
    </div>
  );
}

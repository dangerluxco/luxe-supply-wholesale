import { getCurationShareForBuyer } from "@/lib/firestore/curation";
import { buildCurationApprovedCsv, curationCsvFilename } from "@/lib/curationCsv";

export const dynamic = "force-dynamic";

/** Public (token-only): buyer's approved-items CSV export — never includes cost. */
export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const share = await getCurationShareForBuyer(token);
  if (!share) return new Response("Not found", { status: 404 });

  const csv = buildCurationApprovedCsv(share, { includeCost: false });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${curationCsvFilename(share)}"`,
    },
  });
}

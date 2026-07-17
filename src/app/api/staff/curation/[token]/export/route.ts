import { requireStaffSession } from "@/lib/staff-api-auth";
import { getCurationShareForStaff } from "@/lib/firestore/curation";
import { buildCurationApprovedCsv, curationCsvFilename } from "@/lib/curationCsv";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { token } = await ctx.params;
  const share = await getCurationShareForStaff(token);
  if (!share) return new Response("Not found", { status: 404 });

  const csv = buildCurationApprovedCsv(share, { includeCost: true });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${curationCsvFilename(share)}"`,
    },
  });
}

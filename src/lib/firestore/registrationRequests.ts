import { getBucket, getDb, toIso, WHOLESALE_ORG_SLUG } from "./admin";
import { getLuxesupplyOrg } from "./staff";

export const REGISTRATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export type RegistrationDocumentUrls = {
  idFrontUrl: string | null;
  idBackUrl: string | null;
  businessRegistrationUrl: string | null;
  resaleCertificateUrl: string | null;
};

export type BuyerRegistrationRequest = {
  id: string;
  organizationId: string;
  status: RegistrationStatus;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  businessTaxId: string;
  company: string;
  documents: RegistrationDocumentUrls;
  reviewedAt: string | null;
  reviewedBy: string;
  reviewNote: string;
  buyerId: string | null;
  temporaryPassword: string | null;
  inviteCodeId: string | null;
  inviteCode: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function serialize(id: string, d: Record<string, unknown>): BuyerRegistrationRequest {
  const docs = (d.documents || {}) as Record<string, unknown>;
  const statusRaw = String(d.status || "pending");
  const status = (REGISTRATION_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as RegistrationStatus)
    : "pending";
  return {
    id,
    organizationId: String(d.organizationId || ""),
    status,
    firstName: String(d.firstName || ""),
    lastName: String(d.lastName || ""),
    email: String(d.email || "").toLowerCase(),
    phone: String(d.phone || ""),
    addressLine1: String(d.addressLine1 || ""),
    addressLine2: String(d.addressLine2 || ""),
    city: String(d.city || ""),
    state: String(d.state || ""),
    postalCode: String(d.postalCode || ""),
    country: String(d.country || "US"),
    businessTaxId: String(d.businessTaxId || ""),
    company: String(d.company || ""),
    documents: {
      idFrontUrl: docs.idFrontUrl ? String(docs.idFrontUrl) : null,
      idBackUrl: docs.idBackUrl ? String(docs.idBackUrl) : null,
      businessRegistrationUrl: docs.businessRegistrationUrl
        ? String(docs.businessRegistrationUrl)
        : null,
      resaleCertificateUrl: docs.resaleCertificateUrl
        ? String(docs.resaleCertificateUrl)
        : null,
    },
    reviewedAt: toIso(d.reviewedAt),
    reviewedBy: String(d.reviewedBy || ""),
    reviewNote: String(d.reviewNote || ""),
    buyerId: d.buyerId ? String(d.buyerId) : null,
    temporaryPassword: d.temporaryPassword ? String(d.temporaryPassword) : null,
    inviteCodeId: d.inviteCodeId ? String(d.inviteCodeId) : null,
    inviteCode: d.inviteCode ? String(d.inviteCode) : null,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

const COLLECTION = "salesPortalBuyerApplications";

export async function listRegistrationRequests(
  status?: RegistrationStatus | "all",
): Promise<BuyerRegistrationRequest[]> {
  const org = await getLuxesupplyOrg();
  const db = getDb();
  let snap;
  try {
    let q = db
      .collection(COLLECTION)
      .where("organizationId", "==", org.id)
      .orderBy("createdAt", "desc")
      .limit(200);
    if (status && status !== "all") {
      q = db
        .collection(COLLECTION)
        .where("organizationId", "==", org.id)
        .where("status", "==", status)
        .orderBy("createdAt", "desc")
        .limit(200);
    }
    snap = await q.get();
  } catch {
    // Fallback if composite index is missing
    snap = await db.collection(COLLECTION).where("organizationId", "==", org.id).limit(200).get();
  }

  let rows = snap.docs.map((doc) => serialize(doc.id, doc.data() || {}));
  if (status && status !== "all") {
    rows = rows.filter((r) => r.status === status);
  }
  rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return rows;
}

export async function getRegistrationRequestById(
  id: string,
): Promise<BuyerRegistrationRequest | null> {
  const snap = await getDb().collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return serialize(snap.id, snap.data() || {});
}

function extFromFile(file: File): string {
  const name = file.name || "";
  const fromName = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function uploadRegistrationFile(opts: {
  applicationId: string;
  field: string;
  file: File;
}): Promise<string> {
  const buf = Buffer.from(await opts.file.arrayBuffer());
  const ext = extFromFile(opts.file);
  const path = `sales-portal/${WHOLESALE_ORG_SLUG}/buyer-applications/${opts.applicationId}/${opts.field}.${ext}`;
  const bucket = getBucket();
  const object = bucket.file(path);
  // Download-token URLs work with user ADC locally; getSignedUrl requires a service-account
  // client_email (unavailable with gcloud user credentials).
  const downloadToken = crypto.randomUUID();
  await object.save(buf, {
    contentType: opts.file.type || "application/octet-stream",
    resumable: false,
    metadata: {
      cacheControl: "private, max-age=0",
      metadata: {
        applicationId: opts.applicationId,
        field: opts.field,
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
    path,
  )}?alt=media&token=${downloadToken}`;
}

export type CreateRegistrationInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  businessTaxId: string;
  company?: string;
  inviteCodeId?: string;
  inviteCode?: string;
  idFront: File;
  idBack: File;
  businessRegistration: File;
  resaleCertificate?: File | null;
};

export async function createRegistrationRequest(
  input: CreateRegistrationInput,
): Promise<BuyerRegistrationRequest> {
  const org = await getLuxesupplyOrg();
  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) throw new Error("A valid email is required.");

  const db = getDb();
  const pendingDup = await db
    .collection(COLLECTION)
    .where("organizationId", "==", org.id)
    .where("email", "==", email)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!pendingDup.empty) {
    throw new Error("A pending application for this email already exists.");
  }

  const ref = db.collection(COLLECTION).doc();
  const now = new Date();

  const [idFrontUrl, idBackUrl, businessRegistrationUrl, resaleCertificateUrl] =
    await Promise.all([
      uploadRegistrationFile({ applicationId: ref.id, field: "id-front", file: input.idFront }),
      uploadRegistrationFile({ applicationId: ref.id, field: "id-back", file: input.idBack }),
      uploadRegistrationFile({
        applicationId: ref.id,
        field: "business-registration",
        file: input.businessRegistration,
      }),
      input.resaleCertificate && input.resaleCertificate.size > 0
        ? uploadRegistrationFile({
            applicationId: ref.id,
            field: "resale-certificate",
            file: input.resaleCertificate,
          })
        : Promise.resolve(null),
    ]);

  const firstName = String(input.firstName || "").trim().slice(0, 80);
  const lastName = String(input.lastName || "").trim().slice(0, 80);

  await ref.set({
    organizationId: org.id,
    orgSlug: WHOLESALE_ORG_SLUG,
    status: "pending",
    firstName,
    lastName,
    email,
    phone: String(input.phone || "").trim().slice(0, 40),
    addressLine1: String(input.addressLine1 || "").trim().slice(0, 160),
    addressLine2: String(input.addressLine2 || "").trim().slice(0, 160),
    city: String(input.city || "").trim().slice(0, 80),
    state: String(input.state || "").trim().slice(0, 40),
    postalCode: String(input.postalCode || "").trim().slice(0, 20),
    country: String(input.country || "US").trim().slice(0, 40) || "US",
    businessTaxId: String(input.businessTaxId || "").trim().slice(0, 40),
    company: String(input.company || "").trim().slice(0, 160),
    inviteCodeId: input.inviteCodeId ? String(input.inviteCodeId) : null,
    inviteCode: input.inviteCode ? String(input.inviteCode).trim().toUpperCase() : null,
    documents: {
      idFrontUrl,
      idBackUrl,
      businessRegistrationUrl,
      resaleCertificateUrl,
    },
    reviewedAt: null,
    reviewedBy: "",
    reviewNote: "",
    buyerId: null,
    temporaryPassword: null,
    createdAt: now,
    updatedAt: now,
  });

  const saved = await ref.get();
  return serialize(saved.id, saved.data() || {});
}

export async function rejectRegistrationRequest(opts: {
  id: string;
  reviewedBy: string;
  reviewNote?: string;
}): Promise<BuyerRegistrationRequest> {
  const ref = getDb().collection(COLLECTION).doc(opts.id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Application not found.");
  const current = serialize(snap.id, snap.data() || {});
  if (current.status !== "pending") throw new Error("Only pending applications can be rejected.");

  const now = new Date();
  await ref.set(
    {
      status: "rejected",
      reviewedAt: now,
      reviewedBy: opts.reviewedBy,
      reviewNote: String(opts.reviewNote || "").trim().slice(0, 2000),
      updatedAt: now,
    },
    { merge: true },
  );
  const saved = await ref.get();
  return serialize(saved.id, saved.data() || {});
}

export async function markRegistrationApproved(opts: {
  id: string;
  reviewedBy: string;
  buyerId: string;
  temporaryPassword: string;
  reviewNote?: string;
}): Promise<BuyerRegistrationRequest> {
  const ref = getDb().collection(COLLECTION).doc(opts.id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Application not found.");
  const current = serialize(snap.id, snap.data() || {});
  if (current.status !== "pending") throw new Error("Only pending applications can be approved.");

  const now = new Date();
  await ref.set(
    {
      status: "approved",
      reviewedAt: now,
      reviewedBy: opts.reviewedBy,
      reviewNote: String(opts.reviewNote || "").trim().slice(0, 2000),
      buyerId: opts.buyerId,
      temporaryPassword: opts.temporaryPassword,
      updatedAt: now,
    },
    { merge: true },
  );
  const saved = await ref.get();
  return serialize(saved.id, saved.data() || {});
}

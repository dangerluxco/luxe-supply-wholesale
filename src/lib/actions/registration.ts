"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { createBuyer } from "@/lib/firestore/buyers";
import {
  createRegistrationRequest,
  getRegistrationRequestById,
  markRegistrationApproved,
  rejectRegistrationRequest,
} from "@/lib/firestore/registrationRequests";
import { consumeInviteCode, validateInviteCode } from "@/lib/firestore/inviteCodes";
import { notifyStaffOfRegistrationRequest } from "@/lib/notify";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const DOC_TYPES = new Set([...IMAGE_TYPES, "application/pdf"]);

function asFile(value: FormDataEntryValue | null, label: string, required: boolean): File | null {
  if (!value || typeof value === "string") {
    if (required) throw new Error(`${label} is required.`);
    return null;
  }
  const file = value as File;
  if (!file.size) {
    if (required) throw new Error(`${label} is required.`);
    return null;
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${label} must be 8MB or smaller.`);
  }
  return file;
}

function requireImage(file: File | null, label: string): File {
  if (!file) throw new Error(`${label} is required.`);
  if (!IMAGE_TYPES.has(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error(`${label} must be a JPEG, PNG, or WebP image.`);
  }
  return file;
}

function requireDoc(file: File | null, label: string): File {
  if (!file) throw new Error(`${label} is required.`);
  if (!DOC_TYPES.has(file.type) && !/\.(jpe?g|png|webp|pdf)$/i.test(file.name)) {
    throw new Error(`${label} must be an image or PDF.`);
  }
  return file;
}

export async function submitBuyerRegistration(
  _prev: { error?: string; ok?: boolean; message?: string } | undefined,
  formData: FormData,
) {
  try {
    const idFront = requireImage(asFile(formData.get("idFront"), "Front of government ID", true), "Front of government ID");
    const idBack = requireImage(asFile(formData.get("idBack"), "Back of government ID", true), "Back of government ID");
    const businessRegistration = requireDoc(
      asFile(formData.get("businessRegistration"), "Business registration document", true),
      "Business registration document",
    );
    const resaleRaw = asFile(formData.get("resaleCertificate"), "Resale certificate", false);
    const resaleCertificate =
      resaleRaw &&
      (DOC_TYPES.has(resaleRaw.type) || /\.(jpe?g|png|webp|pdf)$/i.test(resaleRaw.name))
        ? resaleRaw
        : null;

    const firstName = String(formData.get("firstName") || "").trim();
    const lastName = String(formData.get("lastName") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const addressLine1 = String(formData.get("addressLine1") || "").trim();
    const city = String(formData.get("city") || "").trim();
    const state = String(formData.get("state") || "").trim();
    const postalCode = String(formData.get("postalCode") || "").trim();
    const businessTaxId = String(formData.get("businessTaxId") || "").trim();
    const inviteCodeRaw = String(formData.get("inviteCode") || "").trim();

    if (!firstName || !lastName) throw new Error("First and last name are required.");
    if (!email) throw new Error("Email address is required.");
    if (!phone) throw new Error("Phone number is required.");
    if (!addressLine1 || !city || !state || !postalCode) {
      throw new Error("Full mailing address is required.");
    }
    if (!businessTaxId) throw new Error("Business Tax ID number is required.");

    const inviteCheck = await validateInviteCode(inviteCodeRaw);
    if (!inviteCheck.ok) throw new Error(inviteCheck.reason);

    const application = await createRegistrationRequest({
      firstName,
      lastName,
      email,
      phone,
      addressLine1,
      addressLine2: String(formData.get("addressLine2") || "").trim(),
      city,
      state,
      postalCode,
      country: String(formData.get("country") || "US").trim() || "US",
      businessTaxId,
      company: String(formData.get("company") || "").trim(),
      inviteCodeId: inviteCheck.code.id,
      inviteCode: inviteCheck.code.code,
      idFront,
      idBack,
      businessRegistration,
      resaleCertificate,
    });

    try {
      await consumeInviteCode(inviteCheck.code.id);
    } catch (err) {
      console.warn("[submitBuyerRegistration] invite consume failed:", err);
    }

    try {
      await notifyStaffOfRegistrationRequest({
        applicationId: application.id,
        name: `${application.firstName} ${application.lastName}`.trim(),
        email: application.email,
        company: application.company,
        phone: application.phone,
      });
    } catch (err) {
      console.warn("[submitBuyerRegistration] staff notify failed:", err);
    }

    return {
      ok: true,
      message:
        "Application received. Our team will review your documents and email you when a decision is made.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not submit application." };
  }
}

function assertStaff() {
  return getSession().then((session) => {
    if (
      !session ||
      (session.role !== ROLE.REP && session.role !== ROLE.MANAGER) ||
      session.source !== "firestore"
    ) {
      return null;
    }
    return session;
  });
}

export async function approveBuyerRegistration(
  applicationId: string,
  reviewNote?: string,
): Promise<{ error?: string; ok?: boolean; username?: string; temporaryPassword?: string }> {
  const session = await assertStaff();
  if (!session) return { error: "Staff session required." };

  const app = await getRegistrationRequestById(applicationId);
  if (!app) return { error: "Application not found." };
  if (app.status !== "pending") return { error: "Application is no longer pending." };

  try {
    const displayName = `${app.firstName} ${app.lastName}`.trim();
    const { buyer, temporaryPassword } = await createBuyer({
      email: app.email,
      displayName,
      company: app.company,
      ein: app.businessTaxId,
      phone: app.phone,
      createdBy: session.email,
    });

    await markRegistrationApproved({
      id: app.id,
      reviewedBy: session.email,
      buyerId: buyer.id,
      temporaryPassword,
      reviewNote,
    });

    revalidatePath("/wholesaleportal/rep/clients");
    revalidatePath(`/wholesaleportal/rep/applications/${app.id}`);

    return {
      ok: true,
      username: buyer.username,
      temporaryPassword,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not approve application." };
  }
}

export async function rejectBuyerRegistration(
  applicationId: string,
  reviewNote?: string,
): Promise<{ error?: string; ok?: boolean }> {
  const session = await assertStaff();
  if (!session) return { error: "Staff session required." };

  try {
    await rejectRegistrationRequest({
      id: applicationId,
      reviewedBy: session.email,
      reviewNote,
    });
    revalidatePath("/wholesaleportal/rep/clients");
    revalidatePath(`/wholesaleportal/rep/applications/${applicationId}`);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reject application." };
  }
}

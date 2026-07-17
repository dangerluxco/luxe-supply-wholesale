import { cert, getApps, initializeApp, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { existsSync, readFileSync } from "fs";
import path from "path";

const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  "photography-964f5";

export const WHOLESALE_ORG_SLUG = "luxesupply";
export const UPLOAD_DIRECTORY = "luxesupply";

export const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`;

function loadServiceAccountFromFile(): {
  projectId: string;
  clientEmail: string;
  privateKey: string;
} | null {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!raw) return null;
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  if (!existsSync(resolved)) {
    console.warn(`[firestore] GOOGLE_APPLICATION_CREDENTIALS file not found: ${resolved}`);
    return null;
  }
  try {
    const sa = JSON.parse(readFileSync(resolved, "utf8")) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (!sa.client_email || !sa.private_key) {
      console.warn(`[firestore] Invalid service account JSON at ${resolved}`);
      return null;
    }
    return {
      projectId: sa.project_id || PROJECT_ID,
      clientEmail: sa.client_email,
      privateKey: sa.private_key.replace(/\\n/g, "\n"),
    };
  } catch (err) {
    console.warn(
      `[firestore] Failed to read service account JSON:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

function initApp(): App {
  if (getApps().length) return getApps()[0]!;

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const sa = JSON.parse(json) as {
      project_id?: string;
      client_email: string;
      private_key: string;
    };
    return initializeApp({
      credential: cert({
        projectId: sa.project_id || PROJECT_ID,
        clientEmail: sa.client_email,
        privateKey: sa.private_key.replace(/\\n/g, "\n"),
      }),
      projectId: sa.project_id || PROJECT_ID,
      storageBucket: STORAGE_BUCKET,
    });
  }

  // Prefer an explicit key file over user ADC so local `npm run dev` does not
  // break when `gcloud auth application-default` expires (invalid_rapt).
  const fromFile = loadServiceAccountFromFile();
  if (fromFile) {
    return initializeApp({
      credential: cert(fromFile),
      projectId: fromFile.projectId,
      storageBucket: STORAGE_BUCKET,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET,
  });
}

export function getDb(): Firestore {
  initApp();
  return getFirestore();
}

export function getBucket() {
  initApp();
  return getStorage().bucket(STORAGE_BUCKET);
}

export function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const d = (value as { toDate: () => Date }).toDate();
    return d.toISOString();
  }
  return null;
}

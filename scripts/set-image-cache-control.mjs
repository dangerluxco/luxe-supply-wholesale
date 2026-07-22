// One-off maintenance: stamp long-lived Cache-Control metadata on the Storage
// objects behind luxesupply product images, so image fetches (including the
// Next optimizer's upstream fetches) are CDN/browser-cacheable.
//
// Safe by construction: only touches objects actually referenced by
// luxesupply Firestore image URLs. Re-runnable.
//
// Run from luxe-supply-wholesale/:  node scripts/set-image-cache-control.mjs
import { readFileSync } from "fs";
import admin from "firebase-admin";

const CACHE = "public, max-age=31536000, immutable";
const CONCURRENCY = 10;

const sa = JSON.parse(readFileSync(".secrets/firebase-admin.json", "utf8"));
admin.initializeApp({
  credential: admin.credential.cert(sa),
  storageBucket: "photography-964f5.firebasestorage.app",
});
const db = admin.firestore();
const bucket = admin.storage().bucket();

function objectPathFromUrl(url) {
  // https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<url-encoded-path>?...
  const m = /\/o\/([^?]+)/.exec(String(url || ""));
  return m ? decodeURIComponent(m[1]) : null;
}

function collectUrls(value, out) {
  if (typeof value === "string" && value.includes("firebasestorage.googleapis.com")) out.add(value);
  else if (Array.isArray(value)) for (const v of value) collectUrls(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectUrls(v, out);
}

const urls = new Set();
for (const coll of ["uploadHistory", "IIQItemDetails"]) {
  let last = null;
  for (;;) {
    let q = db.collection(coll).where("uploadDirectory", "==", "luxesupply").limit(500);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) collectUrls(doc.data(), urls);
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }
  console.log(`${coll}: cumulative ${urls.size} image urls`);
}

const paths = [...new Set([...urls].map(objectPathFromUrl).filter(Boolean))];
console.log(`unique storage objects: ${paths.length}`);

let done = 0;
let updated = 0;
let missing = 0;
let i = 0;
async function worker() {
  while (i < paths.length) {
    const p = paths[i++];
    try {
      await bucket.file(p).setMetadata({ cacheControl: CACHE });
      updated++;
    } catch (err) {
      if (err && err.code === 404) missing++;
      else console.warn("skip", p, err?.message || err);
    }
    done++;
    if (done % 200 === 0) console.log(`  ${done}/${paths.length}…`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`done: ${updated} updated, ${missing} missing, of ${paths.length}`);
process.exit(0);

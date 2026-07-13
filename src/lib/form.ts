/** Safe form field reader — avoids DOM/undici FormData type clashes in Next builds. */
export function formField(form: Awaited<ReturnType<Request["formData"]>>, key: string): string {
  const getter = (form as unknown as { get?: (k: string) => unknown }).get;
  if (typeof getter !== "function") return "";
  const v = getter.call(form, key);
  return v == null ? "" : String(v);
}

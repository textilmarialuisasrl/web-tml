import crypto from "crypto";

export function canonicalStringify(obj: any): string {
  if (obj === null || obj === undefined) {
    return "null";
  }
  if (typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (obj instanceof Date) {
    return JSON.stringify(obj.toISOString());
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalStringify).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((key) => {
    return JSON.stringify(key) + ":" + canonicalStringify(obj[key]);
  });
  return "{" + pairs.join(",") + "}";
}

export function generatePayloadHash(payload: any): string {
  const canonicalStr = canonicalStringify(payload);
  return crypto.createHash("sha256").update(canonicalStr).digest("hex");
}

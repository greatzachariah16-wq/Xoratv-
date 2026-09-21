/**
 * Normalizes any Nigerian MSISDN to 11 digits: 080XXXXXXXX
 */
export function normalizeNigerianPhone(raw: string): string {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");

  // Convert international prefixes (+234 or 234)
  if (digits.startsWith("234") && digits.length >= 13) {
    digits = "0" + digits.slice(3);
  } else if (
    digits.length === 10 &&
    (digits.startsWith("7") || digits.startsWith("8") || digits.startsWith("9"))
  ) {
    digits = "0" + digits;
  }

  return digits;
}

/**
 * Validates whether phone is a legitimate 11-digit Nigerian MSISDN
 */
export function isValidNigerianPhone(phone: string): boolean {
  const norm = normalizeNigerianPhone(phone);
  return /^0(70|80|81|90|91)\d{8}$/.test(norm);
}

/**
 * Checks whether number matches known MTN Nigeria prefix bands
 */
export function isMtnNigeriaNumber(phone: string): boolean {
  const norm = normalizeNigerianPhone(phone);
  if (!isValidNigerianPhone(norm)) return false;

  const prefix4 = norm.slice(0, 4);
  const prefix5 = norm.slice(0, 5);

  const mtn4 = [
    "0803",
    "0806",
    "0703",
    "0706",
    "0813",
    "0816",
    "0810",
    "0814",
    "0903",
    "0906",
    "0913",
    "0916",
    "0704",
  ];
  const mtn5 = ["07025", "07026"];

  return mtn4.includes(prefix4) || mtn5.includes(prefix5);
}

/**
 * Masks phone number for safe display in UI and public audit logs (080****5678)
 */
export function maskPhone(phone: string): string {
  const norm = normalizeNigerianPhone(phone);
  if (norm.length < 11) return phone;
  return `${norm.slice(0, 3)}****${norm.slice(7)}`;
}

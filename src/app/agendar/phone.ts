export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // A local Brazilian number (DDD + number, no "55" country code) is 10
  // or 11 digits — WhatsApp-originated contacts always store the "55"
  // prefix, so without this the two never match on the same person.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

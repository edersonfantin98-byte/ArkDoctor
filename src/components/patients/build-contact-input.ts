export type ContactFormFields = {
  name: string;
  phone: string;
  email: string;
  birthDate: string;
  cpf: string;
  sex: string;
  guardianName: string;
  guardianPhone: string;
  guardianRelationship: string;
  rg: string;
  address: string;
  cityState: string;
  guardianRg: string;
  notes: string;
};

/**
 * Builds the payload sent to create/update patient actions.
 *
 * When editing, an emptied optional field must send `null` so the
 * repository clears the existing DB value. When creating, an empty
 * field must send `undefined` so it's omitted (createContactInputSchema
 * doesn't accept `null`).
 */
export function buildContactInput(fields: ContactFormFields, isEditing: boolean) {
  const clearable = isEditing ? null : undefined;
  return {
    name: fields.name,
    phone: fields.phone,
    email: fields.email || clearable,
    birthDate: fields.birthDate || clearable,
    cpf: fields.cpf || clearable,
    sex: fields.sex === "M" || fields.sex === "F" ? fields.sex : clearable,
    guardianName: fields.guardianName || clearable,
    guardianPhone: fields.guardianPhone || clearable,
    guardianRelationship: fields.guardianRelationship || clearable,
    rg: fields.rg || clearable,
    address: fields.address || clearable,
    cityState: fields.cityState || clearable,
    guardianRg: fields.guardianRg || clearable,
    notes: fields.notes || clearable,
  };
}

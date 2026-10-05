import type { NewPortfolio } from "./data/types";

export type NewPortfolioErrors = Partial<Record<"name" | "shortName" | "description" | "ownership" | "managedFor", string>>;

/** Sheet tab names can't contain these characters. */
const BAD_TAB_CHARS = /[[\]*?:/\\]/g;

/** Validate the "New portfolio" form. Managed money can never be put in Personal. */
export function validateNewPortfolio(
  input: Record<string, unknown>,
  id: string,
  color: string,
): { ok: true; portfolio: NewPortfolio; tab: string } | { ok: false; errors: NewPortfolioErrors } {
  const s = (k: string) => (typeof input[k] === "string" ? (input[k] as string).trim() : "");
  const errors: NewPortfolioErrors = {};
  const name = s("name");
  if (!name) errors.name = "Give it a name.";
  else if (name.length > 60) errors.name = "Keep the name under 60 characters.";
  const shortName = s("shortName") || name.split(/\s+/).slice(0, 2).join(" ");
  if (shortName.length > 24) errors.shortName = "Keep the short name under 24 characters.";
  const description = s("description");
  if (description.length > 120) errors.description = "Keep the description under 120 characters.";
  const ownership = s("ownership");
  if (ownership !== "personal" && ownership !== "managed") errors.ownership = "Choose whose money this is.";
  const managedFor = s("managedFor");
  if (ownership === "managed" && !managedFor) errors.managedFor = "Who does this money belong to?";
  if (managedFor.length > 40) errors.managedFor = "Keep this under 40 characters.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const managed = ownership === "managed";
  const status = s("status") === "planned" ? "planned" : "active";
  return {
    ok: true,
    portfolio: {
      id,
      name,
      shortName,
      description,
      status,
      ownership: managed ? "managed" : "personal",
      includeInPersonal: !managed && status === "active" && (input.includeInPersonal === "on" || input.includeInPersonal === true),
      managedFor: managed ? managedFor : "",
      color,
    },
    tab: `${id} ${name}`.replace(BAD_TAB_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, 90),
  };
}

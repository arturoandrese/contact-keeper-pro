const STORAGE_KEY = "company_name_overrides";

export type CompanyOverrides = Record<string, string>; // domain -> display name

export function getCompanyOverrides(): CompanyOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setCompanyOverride(domain: string, displayName: string) {
  const overrides = getCompanyOverrides();
  overrides[domain.toLowerCase()] = displayName.toUpperCase().trim();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function removeCompanyOverride(domain: string) {
  const overrides = getCompanyOverrides();
  delete overrides[domain.toLowerCase()];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function getOverriddenName(domain: string): string | null {
  if (!domain) return null;
  const overrides = getCompanyOverrides();
  return overrides[domain.toLowerCase()] || null;
}

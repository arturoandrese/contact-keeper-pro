const SPLIT_PREFIXES = [
  "el", "la", "las", "los", "del", "mi", "tu", "su",
  "banco", "grupo", "club", "red", "centro", "portal",
];

const SPLIT_SUFFIXES = [
  "chile", "online", "digital", "net", "web", "app", "pro",
];

export function splitDomainWord(word: string): string {
  const w = word.toLowerCase();

  for (const prefix of SPLIT_PREFIXES) {
    if (w.startsWith(prefix) && w.length > prefix.length + 2) {
      const rest = w.slice(prefix.length);
      return `${prefix.toUpperCase()} ${splitDomainWord(rest).toUpperCase()}`;
    }
  }

  for (const suffix of SPLIT_SUFFIXES) {
    if (w.endsWith(suffix) && w.length > suffix.length + 2) {
      const rest = w.slice(0, w.length - suffix.length);
      return `${rest.toUpperCase()} ${suffix.toUpperCase()}`;
    }
  }

  return w.toUpperCase();
}

export function extractCompanyFromDomain(domain: string): string {
  if (!domain) return "";
  const clean = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const parts = clean.split(".");
  if (parts.length === 0) return domain.toUpperCase();
  const base = parts[0];
  if (!base) return domain.toUpperCase();
  return splitDomainWord(base);
}

export function simplifyCompanyName(name: string): string {
  if (!name || !name.trim()) return name;
  return name.trim().toUpperCase();
}

const vietnamTimezoneSuffix = "+07:00";

export function parseKiotVietDate(value: unknown) {
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const trimmed = value.trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const date = new Date(hasTimezone ? trimmed : `${trimmed}${vietnamTimezoneSuffix}`);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

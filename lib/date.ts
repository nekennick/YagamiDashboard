export function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export type DateRange = {
  from: Date;
  to: Date;
};

export function buildDateRange(range: string, from?: string, to?: string): DateRange | null {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  if (range === "all") {
    return null;
  }

  if (range === "custom") {
    return {
      from: from ? startOfDay(new Date(`${from}T00:00:00.000+07:00`)) : addDays(todayStart, -30),
      to: to ? endOfDay(new Date(`${to}T00:00:00.000+07:00`)) : todayEnd
    };
  }

  if (range === "today") {
    return { from: todayStart, to: todayEnd };
  }

  if (range === "7d") {
    return { from: addDays(todayStart, -6), to: todayEnd };
  }

  if (range === "thisMonth") {
    return { from: startOfMonth(now), to: todayEnd };
  }

  if (range === "lastMonth") {
    const lastMonth = addMonths(startOfMonth(now), -1);
    return { from: lastMonth, to: endOfDay(addDays(startOfMonth(now), -1)) };
  }

  if (range === "3m") {
    return { from: addMonths(todayStart, -3), to: todayEnd };
  }

  if (range === "6m") {
    return { from: addMonths(todayStart, -6), to: todayEnd };
  }

  if (range === "year") {
    return { from: new Date(now.getFullYear(), 0, 1), to: todayEnd };
  }

  // Mặc định là 30d
  return { from: addDays(todayStart, -29), to: todayEnd };
}

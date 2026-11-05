export class SummaryInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "SummaryInputError";
  }
}

export function summaryYear(value) {
  if (
    typeof value !== "string" ||
    !/^\d{1,4}$/.test(value) ||
    Number(value) < 1
  )
    throw new SummaryInputError("Choose a year between 1 and 9999.");
  return Number(value);
}

export function summaryView(params, today) {
  if (Object.keys(params).some((key) => key !== "year"))
    throw new SummaryInputError(
      "Only a year can be selected for this summary.",
    );
  return summaryYear(
    params.year === undefined ? today.slice(0, 4) : params.year,
  );
}

export function comparisonPayload(data) {
  if (
    !data ||
    Object.keys(data).some((key) => !["kind", "periods"].includes(key)) ||
    !["month", "year", "average"].includes(data.kind) ||
    !Array.isArray(data.periods) ||
    data.periods.length < 2 ||
    data.periods.length > 6
  )
    throw new SummaryInputError(
      "Choose two to six periods of the same comparison type.",
    );
  const periods = data.periods.map((period) => {
    if (
      !period ||
      Object.keys(period).some(
        (key) => !["year", "month", "end_year"].includes(key),
      )
    )
      throw new SummaryInputError("Choose valid comparison periods.");
    const year = summaryYear(String(period.year));
    if (
      data.kind !== "average" &&
      period.end_year !== null &&
      period.end_year !== undefined
    )
      throw new SummaryInputError(
        "Choose an end year only for yearly averages.",
      );
    if (data.kind !== "month") {
      if (period.month !== null && period.month !== undefined)
        throw new SummaryInputError(
          "Choose a month only when comparing months.",
        );
      if (data.kind === "average") {
        const end_year = summaryYear(String(period.end_year));
        if (end_year < year)
          throw new SummaryInputError(
            "The end year must not precede the start year.",
          );
        return { year, end_year, month: null };
      }
      return { year, month: null };
    }
    if (
      !/^\d{1,2}$/.test(String(period.month)) ||
      Number(period.month) < 1 ||
      Number(period.month) > 12
    )
      throw new SummaryInputError(
        "Choose a month between January and December.",
      );
    return { year, month: Number(period.month) };
  });
  if (
    new Set(
      periods.map(
        (period) => `${period.year}-${period.month}-${period.end_year}`,
      ),
    ).size !== periods.length
  )
    throw new SummaryInputError("Choose distinct comparison periods.");
  return { kind: data.kind, periods };
}

export function defaultComparison(year, today, kind = "month") {
  const currentYear = Number(today.slice(0, 4));
  const baseYear = Math.min(year, currentYear);
  if (kind === "average") {
    const start = Math.max(1, baseYear - 2);
    const previousEnd = Math.max(1, start - 1);
    return {
      kind,
      periods: [
        { year: start, end_year: baseYear },
        baseYear === 1
          ? { year: 2, end_year: 2 }
          : { year: Math.max(1, previousEnd - 2), end_year: previousEnd },
      ],
    };
  }
  if (kind !== "month")
    return {
      kind,
      periods: [{ year: baseYear }, { year: baseYear > 1 ? baseYear - 1 : 2 }],
    };
  const month = baseYear === currentYear ? Number(today.slice(5, 7)) : 12;
  return {
    kind,
    periods: [
      { year: baseYear, month },
      month > 1
        ? { year: baseYear, month: month - 1 }
        : { year: baseYear - 1, month: 12 },
    ],
  };
}

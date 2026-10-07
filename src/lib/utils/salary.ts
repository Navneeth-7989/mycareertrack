/**
 * Salary formatting for display.
 *
 * The form stores three independent columns — `salaryMin`, `salaryMax` and
 * `currency` — and every one of them is optional, so there are five shapes to
 * render rather than one. "₹12,00,000 – ₹0" for a row with no maximum is the
 * bug this file exists to prevent.
 */

/**
 * Grouping follows the currency, not the user.
 *
 * `en-IN` groups in lakhs — 12,00,000 — which is right for rupees and wrong for
 * everything else: the same formatter would print a US salary as "$1,20,000".
 * So the locale is chosen by the currency being shown, which is the only thing
 * that decides how the digits should be grouped.
 */
function formatterFor(currency: string): Intl.NumberFormat {
  const locale = currency === "INR" ? "en-IN" : "en-US";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      // Salaries are whole numbers. Intl defaults to two decimals for most
      // currencies, and "₹12,00,000.00" is noise in a field nobody enters
      // paise into.
      maximumFractionDigits: 0,
    });
  } catch {
    /*
     * `Intl.NumberFormat` throws a RangeError on a currency code it does not
     * recognise, and this value comes out of a nullable text column — so a row
     * written before the column was constrained, or restored from a backup,
     * could carry anything. Falling back to a plain number keeps the page
     * rendering; the code is appended by the caller so the figure is still
     * unambiguous.
     */
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  }
}

/**
 * The stored triple → one line, or null when there is nothing to say.
 *
 * Null rather than an em dash: the caller decides whether an absent salary
 * deserves a row at all, and a function that returns "—" forces every caller to
 * compare against a glyph to find out whether it has data.
 *
 * `currency` falls back to INR, matching the column default (§9). Blank falls
 * back too, not just null — the column is nullable text, and an empty string in
 * it would otherwise reach `Intl` as a currency code and throw.
 */
export function formatSalaryRange(
  min: number | null,
  max: number | null,
  currency: string | null,
): string | null {
  const code = currency?.trim() || "INR";
  const formatter = formatterFor(code);

  // Appended only when the code could not be resolved to a symbol — otherwise
  // "₹12,00,000 INR" says the same thing twice.
  const suffix = formatter.resolvedOptions().style === "currency" ? "" : ` ${code}`;

  const format = (value: number) => `${formatter.format(value)}${suffix}`;

  if (min !== null && max !== null) {
    // A range whose ends match is a single figure. Someone who knows the exact
    // number often types it into both fields.
    return min === max ? format(min) : `${format(min)} – ${format(max)}`;
  }

  if (min !== null) {
    return `From ${format(min)}`;
  }

  if (max !== null) {
    return `Up to ${format(max)}`;
  }

  return null;
}

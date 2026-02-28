import { BadgeList, SectionHeader } from "@repo/ui";

export function formatDateTime(value?: number): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isPositiveReason(reason: string): boolean {
  const normalized = reason.toLowerCase();
  const negativeMarkers = [
    "missing_",
    "_not_",
    "failed",
    "error",
    "rejected",
    "invalid",
  ];
  return !negativeMarkers.some((marker) => normalized.includes(marker));
}

function formatReasonLabel(reason: string): string {
  return reason
    .split("_")
    .map((token) => {
      if (token.length === 0) return token;
      if (token.toLowerCase() === "sfp") return "SFP";
      if (token.toLowerCase() === "poc") return "POC";
      if (token.toLowerCase() === "val") return "VAL";
      if (token.toLowerCase() === "vah") return "VAH";
      return token[0]?.toUpperCase() + token.slice(1);
    })
    .join(" ");
}

export function ReasonBadges({ reasons }: { reasons: string[] }) {
  return (
    <BadgeList
      items={reasons.map((reason, index) => ({
        id: `${reason}-${index}`,
        label: formatReasonLabel(reason),
        tone: isPositiveReason(reason) ? "positive" : "negative",
      }))}
      emptyMessage="No reasons"
    />
  );
}

export { SectionHeader };

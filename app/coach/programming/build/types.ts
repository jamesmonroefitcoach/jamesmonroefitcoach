// Shared programming types. Extracted from the (archived) classic build page so
// the live new-way flow doesn't depend on archived code.

export type ClientProgramItem = {
  clientId: string;
  clientName: string;
  programName: string | null;
  endsOn: string | null;
  daysUntilEnd: number | null;  // negative = already expired, null = no end date
  hasCurrent: boolean;
};

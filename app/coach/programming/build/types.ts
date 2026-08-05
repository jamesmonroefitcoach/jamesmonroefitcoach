// Shared programming types. Extracted from the (archived) classic build page so
// the live new-way flow doesn't depend on archived code.

export type ClientProgramItem = {
  clientId: string;
  clientName: string;
  programName: string | null;
  endsOn: string | null;
  daysUntilEnd: number | null;  // negative = already expired, null = no end date
  hasCurrent: boolean;
  /** Which kind the current one is, so the UI can label it — at-home reads
   *  "Program", in-gym reads "Session". Null when there's no current one. */
  programKind?: "in_gym" | "at_home" | null;
};

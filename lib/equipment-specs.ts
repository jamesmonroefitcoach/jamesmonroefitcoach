// Encode/decode helpers for equipment_specifics, which is a single text column
// that has to carry potentially two pieces of free-text — one for the
// "machine" checkbox and one for the "other" checkbox. When only one is
// filled we store the raw string for back-compat. When both are filled we
// store the combined "Machine: X | Other: Y" form and decode it on read.

export function decodeSpecs(
  equipment_list: readonly string[],
  specs: string | null | undefined
): { machineSpec: string; otherSpec: string } {
  const hasMachine = equipment_list.includes("machine");
  const hasOther = equipment_list.includes("other");
  const s = specs ?? "";
  if (!s) return { machineSpec: "", otherSpec: "" };
  if (/Other:/i.test(s) && /^Machine:/i.test(s)) {
    const machineMatch = /^Machine:\s*(.*?)(?:\s*\|\s*Other:.*)?$/i.exec(s);
    const otherMatch = /Other:\s*(.*)$/i.exec(s);
    return {
      machineSpec: (machineMatch?.[1] ?? "").trim(),
      otherSpec: (otherMatch?.[1] ?? "").trim(),
    };
  }
  if (hasMachine && !hasOther) return { machineSpec: s, otherSpec: "" };
  if (hasOther && !hasMachine) return { machineSpec: "", otherSpec: s };
  if (hasMachine && hasOther) return { machineSpec: s, otherSpec: "" };
  return { machineSpec: s, otherSpec: "" };
}

export function encodeSpecs(
  equipment_list: readonly string[],
  machineSpec: string,
  otherSpec: string
): string {
  const m = equipment_list.includes("machine") ? machineSpec.trim() : "";
  const o = equipment_list.includes("other") ? otherSpec.trim() : "";
  if (m && o) return `Machine: ${m} | Other: ${o}`;
  if (m) return m;
  if (o) return o;
  return "";
}

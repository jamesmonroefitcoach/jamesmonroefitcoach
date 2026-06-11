import { redirect } from "next/navigation";

// Default Build landing → Template (first sub-tab), matching the
// coach's pattern at /coach/programming/build.
export default function ClientBuildIndex() {
  redirect("/client/programming/build/template");
}

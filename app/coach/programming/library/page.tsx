import { redirect } from "next/navigation";

// Land on the first sub-tab when someone navigates to /coach/programming/library directly.
export default function LibraryLanding() {
  redirect("/coach/programming/library/exercise-library");
}

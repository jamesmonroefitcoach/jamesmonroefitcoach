import { redirect } from "next/navigation";

// Land on the first sub-tab when someone navigates to /client/programming/library directly.
export default function ClientLibraryLanding() {
  redirect("/client/programming/library/exercise-library");
}

import { redirect } from "next/navigation";

// The Availability page was folded into the bottom of the Calendar page (owner feedback
// 02/08) — keep old links and bookmarks working.
export default function AvailabilityRedirect() {
  redirect("/app/calendar");
}

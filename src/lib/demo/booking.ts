// Public self-booking link host. The patient-facing surface (backend/web/book.html,
// Firebase Hosting) resolves the token to the owner + their availability.
export const BOOKING_HOST = "https://aestheticx-91e6b.web.app/u/";

export function bookingLinkUrl(token: string): string {
  return BOOKING_HOST + token;
}

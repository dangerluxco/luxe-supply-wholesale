import { redirect } from "next/navigation";

/**
 * `/wholesale/checkout` is the canonical link the persistent Checkout button
 * points to — the actual checkout surface (line items, shipping, submit) lives
 * on the cart page. Kept as a distinct route so the URL is stable even if
 * checkout is ever split out of the cart page later.
 */
export default function CheckoutRedirect() {
  redirect("/wholesale/cart");
}

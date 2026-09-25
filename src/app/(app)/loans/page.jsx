import { redirect } from "next/navigation";

// "Loans" is now called "Debts"; keep old links and bookmarks working.
export default function LoansRedirect() {
  redirect("/debts");
}

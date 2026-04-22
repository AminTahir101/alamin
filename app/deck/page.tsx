import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AlamineProductDeck from "@/components/deck/AlamineProductDeck";

export const metadata = {
  title: "ALAMIN — Investor Deck",
  robots: "noindex, nofollow",
};

export default async function DeckPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("deck_access")?.value;

  if (token !== process.env.DECK_ACCESS_TOKEN) {
    redirect("/deck/gate");
  }

  return <AlamineProductDeck />;
}

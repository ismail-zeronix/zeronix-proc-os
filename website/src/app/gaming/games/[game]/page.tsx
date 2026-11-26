import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { gameFaq, GamePageView } from "@/components/gaming/game-page";
import { getSettings } from "@/lib/api";
import { GAMES, gameBySlug } from "@/lib/gaming";
import { loadBuilds } from "@/lib/gaming-data";

export const revalidate = 600;

export function generateStaticParams() {
  return GAMES.filter((g) => !g.path).map((g) => ({ game: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/gaming/games/[game]">): Promise<Metadata> {
  const g = gameBySlug((await params).game);
  if (!g) return {};
  return {
    title: { absolute: `${g.title} PC Requirements & Best Gaming PC in UAE | Zeronix Tech` },
    description: `What ${g.title} needs from your processor, graphics card and RAM, with the estimated FPS of every Zeronix Custom PC at 1080p, 1440p and 4K.`,
    alternates: { canonical: `/gaming/games/${g.slug}` },
  };
}

export default async function GamePage({ params }: PageProps<"/gaming/games/[game]">) {
  const game = gameBySlug((await params).game);
  if (!game) notFound();
  if (game.path) permanentRedirect(game.path);
  const [{ brand }, builds] = await Promise.all([getSettings(), loadBuilds()]);
  return <GamePageView game={game} builds={builds} ctaLabel={brand.ctaLabel} intro={`${game.note} Here is what it asks of each part and the frame rates to expect from every Zeronix Custom PC.`} faq={gameFaq(game, builds)} />;
}

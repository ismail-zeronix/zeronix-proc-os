import { redirect } from "next/navigation";

/** The old Compare page is Procurement's home now; old links and bookmarks keep their search. */
export default async function ComparePage({ searchParams }: PageProps<"/procurement/compare">) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") sp.set(k, v);
  redirect(`/procurement${sp.size ? `?${sp}` : ""}`);
}

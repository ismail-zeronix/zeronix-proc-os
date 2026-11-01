import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { requireApp } from "@/lib/auth/session";
import { getIndustry, listCategories } from "@/lib/website/catalog";
import { IndustryForm } from "./industry-form";

export const metadata = { title: "Industry · Zeronix Website" };

export default async function IndustryPage({ params }: PageProps<"/website/industries/[id]">) {
  await requireApp("website");
  const { id } = await params;
  const isNew = id === "new";
  const row = isNew ? null : await getIndustry(Number(id));
  if (!isNew && !row) notFound();
  const categories = (await listCategories()).map((c) => ({ slug: c.slug, name: c.name }));
  return (
    <div className="grid max-w-5xl gap-3">
      <div className="flex items-center gap-2">
        <BackButton fallback="/website/industries" />
        <h1 className="text-sm font-semibold">{row?.name ?? "New industry"}</h1>
      </div>
      <IndustryForm id={row?.id} categories={categories} initial={row ?? undefined} />
    </div>
  );
}

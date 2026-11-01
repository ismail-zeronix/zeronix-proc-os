import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { requireApp } from "@/lib/auth/session";
import { getCategory } from "@/lib/website/catalog";
import { CategoryForm } from "./category-form";

export const metadata = { title: "Category · Zeronix Website" };

export default async function CategoryPage({ params }: PageProps<"/website/categories/[id]">) {
  await requireApp("website");
  const { id } = await params;
  const isNew = id === "new";
  const row = isNew ? null : await getCategory(Number(id));
  if (!isNew && !row) notFound();
  return (
    <div className="grid max-w-5xl gap-3">
      <div className="flex items-center gap-2">
        <BackButton fallback="/website/categories" />
        <h1 className="text-sm font-semibold">{row?.name ?? "New category"}</h1>
      </div>
      <CategoryForm id={row?.id} initial={row ?? undefined} />
    </div>
  );
}

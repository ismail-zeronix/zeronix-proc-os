import { AppShell } from "@/components/app-shell";
import { requireApp } from "@/lib/auth/session";
import { viewerOf } from "@/lib/auth/visibility";
import { projectsBadges } from "@/lib/projects-data";

export default async function ProjectsLayout({ children }: LayoutProps<"/projects">) {
  const access = await requireApp("projects");
  return (
    <AppShell app="projects" badges={await projectsBadges(viewerOf(access))}>
      {children}
    </AppShell>
  );
}

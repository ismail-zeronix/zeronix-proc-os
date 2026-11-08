/**
 * Shown on every page while a platform admin is on a support visit (platform console "Enter"): who, whether it is read
 * only, and the way out. It stays on top of everything, so a support visit can never be mistaken for a normal sign-in.
 */
export function SupportBanner({ adminName, orgName, readOnly }: { adminName: string; orgName: string; readOnly: boolean }) {
  return (
    <div role="status" className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-red-600 px-3 py-1.5 text-center text-xs font-medium text-white">
      <span>
        Support view of {orgName} by {adminName}: {readOnly ? "read only" : "changes are ON and recorded"}
      </span>
      {/* a plain link: the exit route clears the visit cookie and goes back to the console */}
      <a href="/platform/exit" className="rounded bg-white/20 px-2 py-0.5 hover:bg-white/30">
        Exit support view
      </a>
    </div>
  );
}

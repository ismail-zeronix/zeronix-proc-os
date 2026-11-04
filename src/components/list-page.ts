/**
 * Root of a list page: at least the height of the screen between the portal header and the phone bottom bar, over the app shell's
 * bottom padding, so the list's bar (selection and pages) sits on the bottom edge even when the list is short.
 * The bar is the last child with mt-auto; it also sticks to the bottom while a long list scrolls.
 */
export const LIST_PAGE =
  "-mb-[calc(var(--mobile-nav-h)+1rem)] flex min-h-[calc(100svh-var(--header-h)-0.75rem-var(--mobile-nav-h))] flex-col gap-3 md:-mb-20 md:min-h-[calc(100svh-4rem)]";

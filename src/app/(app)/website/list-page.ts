/**
 * Root of a Website list page: at least the height of the screen below the portal header, and over the app shell's
 * bottom padding, so the list's bar (selection and pages) sits on the bottom edge even when the list is short.
 * The bar is the last child with mt-auto; it also sticks to the bottom while a long list scrolls.
 */
export const LIST_PAGE = "-mb-20 flex min-h-[calc(100svh-3.75rem)] flex-col gap-3 md:min-h-[calc(100svh-4rem)]";

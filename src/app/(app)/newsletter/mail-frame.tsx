/** A newsletter shown in a sandboxed frame (no scripts, no navigation), optionally scaled down for the gallery or narrowed to a phone. */
export function MailFrame({ html, title, height = 900, scale = 1, width = 640 }: { html: string; title: string; height?: number; scale?: number; width?: number }) {
  return (
    <div className="mx-auto overflow-hidden rounded-md border bg-white" style={scale === 1 ? { width: "100%", maxWidth: width, height } : { width: width * scale, height: height * scale, maxWidth: "100%" }}>
      <iframe
        title={title}
        srcDoc={html}
        sandbox=""
        tabIndex={-1}
        className="border-0"
        style={{ width: scale === 1 ? "100%" : width, height, transform: scale === 1 ? undefined : `scale(${scale})`, transformOrigin: "0 0" }}
      />
    </div>
  );
}

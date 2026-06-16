"use client";

import { useState } from "react";

// Small client wrapper so the server-rendered landing page can keep
// rendering as a server component. Falls back to the hatched
// placeholder + drop-file hint when /james-portrait.jpg isn't in the
// public/ folder yet.

export default function Portrait({
  src, alt, fallback,
}: {
  src: string;
  alt: string;
  fallback: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="public-portrait">
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} onError={() => setFailed(true)} />
      )}
      {failed && <span className="public-portrait-fallback">{fallback}</span>}
    </div>
  );
}

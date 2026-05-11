"use client";

import type { CSSProperties, MouseEvent } from "react";
import { useCallback } from "react";

type PreviousPageBackButtonProps = {
  fallbackHref: string;
  label?: string;
  style?: CSSProperties;
  className?: string;
};

function isSameOriginUrl(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

export default function PreviousPageBackButton({
  fallbackHref,
  label = "← Back",
  style,
  className,
}: PreviousPageBackButtonProps) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }

      event.preventDefault();

      const referrer = document.referrer;
      const hasReferrer = Boolean(referrer);
      const hasSafeReferrer = Boolean(referrer && isSameOriginUrl(referrer));

      if (window.history.length > 1 && (!hasReferrer || hasSafeReferrer)) {
        window.history.back();
        return;
      }

      window.location.href = fallbackHref;
    },
    [fallbackHref]
  );

  return (
    <a href={fallbackHref} onClick={handleClick} style={style} className={className}>
      {label}
    </a>
  );
}

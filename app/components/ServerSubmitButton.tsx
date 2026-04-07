"use client";

import type { CSSProperties, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type ServerSubmitButtonProps = {
  children: ReactNode;
  pendingText?: string;
  style?: CSSProperties;
  disabled?: boolean;
  name?: string;
  value?: string;
};

export default function ServerSubmitButton({
  children,
  pendingText,
  style,
  disabled = false,
  name,
  value,
}: ServerSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      style={{
        ...(style ?? {}),
        ...(isDisabled
          ? {
              opacity: 0.7,
              cursor: "wait",
            }
          : null),
      }}
    >
      {pending ? pendingText ?? children : children}
    </button>
  );
}

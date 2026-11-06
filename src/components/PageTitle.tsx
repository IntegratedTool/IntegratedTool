import { useEffect, useRef, type ReactNode } from 'react';

/** Page heading that receives focus when the page changes, so screen-reader users hear where they are. */
export function PageTitle({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <h2 id="page-title" ref={ref} tabIndex={-1} className="page-title">
      {children}
    </h2>
  );
}

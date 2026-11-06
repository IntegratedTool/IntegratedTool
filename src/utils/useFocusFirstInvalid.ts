import { useEffect, type RefObject } from 'react';

/**
 * After a failed submit, move focus to the first invalid control so keyboard and
 * screen-reader users land on the problem. `trigger` should change on every submit attempt.
 */
export function useFocusFirstInvalid(formRef: RefObject<HTMLFormElement | null>, trigger: number) {
  useEffect(() => {
    if (trigger === 0) return;
    const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    el?.focus();
  }, [trigger, formRef]);
}

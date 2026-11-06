/**
 * Central, department-editable configuration.
 * Every value that is "null" is a PLACEHOLDER awaiting approved departmental details;
 * the UI renders it as "to be notified" rather than inventing a value.
 */
export interface SiteLink {
  /** Translation key for the label */
  labelKey:
    | 'footer.gov'
    | 'footer.dept'
    | 'footer.privacy'
    | 'footer.terms'
    | 'footer.accessibility'
    | 'footer.help';
  /** null = not yet approved/published; rendered as plain text, not a dead link */
  href: string | null;
  external?: boolean;
}

export const siteConfig = {
  useMock: import.meta.env.VITE_USE_MOCK !== 'false',
  apiBase: (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1',

  /** Configured admin username accepted alongside an @tn.gov.in email (set by the department). */
  adminUsername: 'Admin Helpdesk',

  /** Public self-registration is policy-dependent; when false the form shows an approval-based notice. */
  selfRegistrationEnabled: true,

  /** OTP / throttling display values (the backend is the authority; these are for UI copy only). */
  otpLengthDigits: 6,

  contact: {
    email: null as string | null,
    phone: null as string | null,
    hours: null as string | null,
    faqUrl: null as string | null,
    manualsUrl: null as string | null,
    submitQueryUrl: null as string | null,
  },

  /** Path to the emblem asset supplied by the department (see README: public/emblem.png). */
  emblemSrc: '/emblem.png',

  footerLinks: [
    { labelKey: 'footer.gov', href: 'https://www.tn.gov.in', external: true },
    { labelKey: 'footer.dept', href: null },
    { labelKey: 'footer.privacy', href: null },
    { labelKey: 'footer.terms', href: null },
    { labelKey: 'footer.accessibility', href: null },
    { labelKey: 'footer.help', href: null },
  ] as SiteLink[],

  /** Fill with the approved "last updated" date at release time; null hides the line. */
  lastUpdated: null as string | null,
};

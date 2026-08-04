/**
 * Icon set.
 *
 * Hand-rolled rather than pulled from a library: the app needs a dozen glyphs and
 * a consistent 1.5px stroke matters more than breadth. Emoji are never used as
 * icons — they render differently per platform and cannot be themed.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width={18}
      height={18}
      {...props}
    >
      {children}
    </svg>
  );
}

export const InboxIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12h4l2 3h6l2-3h4" />
    <path d="M4.5 5.5h15l1.5 6.5v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" />
  </Icon>
);

export const BookIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z" />
    <path d="M4 19.5A1.5 1.5 0 0 1 5.5 18H19v3H5.5A1.5 1.5 0 0 1 4 19.5z" />
  </Icon>
);

export const GraphIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="7" r="2.5" />
    <circle cx="18" cy="6" r="2" />
    <circle cx="17" cy="17" r="2.5" />
    <circle cx="7" cy="17.5" r="2" />
    <path d="M8.2 8.4 15.3 15.4M8.4 6.6 16 6.1M6.3 9.5 6.9 15.5M9 17.3l5.5-.2" />
  </Icon>
);

export const CompassIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15 9-2 4-4 2 2-4z" />
  </Icon>
);

/** Four bars of differing height — usage, distinct from the node-and-edge Graph mark. */
export const MeterIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 20v-6M9.5 20V5M14.5 20v-9M19.5 20v-4" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const LinkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" />
  </Icon>
);

export const MergeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4v6a4 4 0 0 0 4 4h6" />
    <path d="M17 4v16" />
    <path d="m14 11 3 3-3 3" />
  </Icon>
);

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4.5 21 19H3z" />
    <path d="M12 10v4M12 16.5v.01" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 13 4 4L19 7" />
  </Icon>
);

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const UndoIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9h11a5 5 0 0 1 0 10h-6" />
    <path d="m8 5-4 4 4 4" />
  </Icon>
);

export const QuoteIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 7c-2.5 1-4 3-4 6h3.5v4H4v-4" />
    <path d="M19 7c-2.5 1-4 3-4 6h3.5v4H14v-4" />
  </Icon>
);

/** A panel with its left column ruled off — the sidebar itself, as its own control. */
export const PanelIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9.5 4v16" />
  </Icon>
);

export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </Icon>
);

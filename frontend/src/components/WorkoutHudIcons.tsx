type WorkoutHudIconProps = {
  className?: string;
};

function HudSvg({ className, children }: WorkoutHudIconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 80H84" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.28" />
      <path d="M18 16H78" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.18" />
      {children}
    </svg>
  );
}

export function SquatIcon({ className }: WorkoutHudIconProps) {
  return (
    <HudSvg className={className}>
      <path d="M18 28H78" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M16 22V34M80 22V34" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="48" cy="36" r="6" stroke="currentColor" strokeWidth="3" />
      <path d="M39 45L31 57L42 65" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M57 45L65 57L54 65" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 65L30 78M54 65L66 78" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 78H46M50 78H64" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
      <path d="M29 70H67" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 5" opacity="0.45" />
    </HudSvg>
  );
}

export function BenchIcon({ className }: WorkoutHudIconProps) {
  return (
    <HudSvg className={className}>
      <path d="M16 32H80" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M18 26V38M78 26V38" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M22 66H72" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M30 66L24 80M64 66L70 80" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="34" cy="54" r="5" stroke="currentColor" strokeWidth="3" />
      <path d="M39 56L56 61L68 54" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M43 48L31 35M57 50L65 35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M22 60H74" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.42" />
    </HudSvg>
  );
}

export function DeadliftIcon({ className }: WorkoutHudIconProps) {
  return (
    <HudSvg className={className}>
      <path d="M14 72H82" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <circle cx="18" cy="72" r="7" stroke="currentColor" strokeWidth="3" />
      <circle cx="78" cy="72" r="7" stroke="currentColor" strokeWidth="3" />
      <circle cx="48" cy="27" r="6" stroke="currentColor" strokeWidth="3" />
      <path d="M43 36L34 50L42 61" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M53 36L62 50L54 61" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 61L36 72M54 61L60 72" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M34 50H62" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M25 82H71" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 5" opacity="0.42" />
    </HudSvg>
  );
}

export function OverheadPressIcon({ className }: WorkoutHudIconProps) {
  return (
    <HudSvg className={className}>
      <path d="M18 20H78" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M16 14V26M80 14V26" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M38 36L30 20M58 36L66 20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <circle cx="48" cy="43" r="6" stroke="currentColor" strokeWidth="3" />
      <path d="M41 52L34 66M55 52L62 66" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M34 66L29 80M62 66L67 80" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M48 30V10M42 16L48 10L54 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.65" />
      <path d="M27 34V18M69 34V18" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.48" />
    </HudSvg>
  );
}

export function RecoveryIcon({ className }: WorkoutHudIconProps) {
  return (
    <HudSvg className={className}>
      <circle cx="48" cy="48" r="22" stroke="currentColor" strokeWidth="3" opacity="0.75" />
      <path d="M48 28V48L61 59" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M31 72H65" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
    </HudSvg>
  );
}

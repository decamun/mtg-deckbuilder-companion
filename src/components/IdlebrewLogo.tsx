export function IdlebrewLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 50 60"
      fill="currentColor"
      className={className}
      aria-label="idlebrew logo"
    >
      {/* Large 4-pointed magic star, upper center-left */}
      <path d="M17 4 L19 9 L24 11 L19 13 L17 18 L15 13 L10 11 L15 9 Z" />
      {/* Medium 4-pointed star, upper right */}
      <path d="M35 4 L36.5 7.5 L40 9 L36.5 10.5 L35 14 L33.5 10.5 L30 9 L33.5 7.5 Z" />
      {/* Small star, upper left */}
      <path d="M7 10.5 L8 13 L10.5 14 L8 15 L7 17.5 L6 15 L3.5 14 L6 13 Z" />
      {/* Tiny star, far right */}
      <path d="M43 13.5 L43.7 15.3 L45.5 16 L43.7 16.7 L43 18.5 L42.3 16.7 L40.5 16 L42.3 15.3 Z" />
      {/* Cup rim */}
      <ellipse cx="24" cy="22" rx="16" ry="3" />
      {/* Cup body */}
      <path d="M8 22 L12 50 Q12 52 14 52 L34 52 Q36 52 36 50 L40 22 Z" />
      {/* Cup handle */}
      <path
        d="M39 28 C48 28 48 43 37 43"
        stroke="currentColor"
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Saucer */}
      <ellipse cx="24" cy="56" rx="22" ry="4" />
    </svg>
  )
}

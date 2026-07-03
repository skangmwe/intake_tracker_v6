// The McDermott application lockup (application-lockup.md): the official symbol SVG + a thin
// divider + the app name in Georgia. One identity system for every app — never a bespoke logo,
// never the letters "McDermott" set in type. The symbol uses fill="currentColor" so it takes
// the surface's foreground (white on the navy sidebar). When collapsed, only the symbol shows.

interface LockupProps {
  name: string;
  /** Symbol box size in px — 32 in a sidebar/top bar, 48–64 on splash. */
  size?: number;
  /** Collapsed rail — render the symbol alone (application-lockup.md responsive rule). */
  symbolOnly?: boolean;
}

export function Lockup({ name, size = 32, symbolOnly = false }: LockupProps) {
  return (
    <span className="mws-lockup" data-ds="lockup">
      <span className="mws-lockup__symbol" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 171.84 171.84"
          xmlns="http://www.w3.org/2000/svg"
          fill="currentColor"
          role="img"
          aria-label="McDermott"
        >
          <path d="M43,85.12l22.6,36.87h-22.6v-36.87ZM113.34,121.9h16.81V47.95h-16.81v73.95ZM42.17,47.95l47.09,76.79,8.38-20.04-34.79-56.75h-20.67ZM171.84,85.92c0,47.37-38.55,85.92-85.92,85.92S0,133.29,0,85.92,38.55,0,85.92,0s85.92,38.55,85.92,85.92ZM162.77,85.92c0-42.37-34.47-76.85-76.85-76.85S9.07,43.55,9.07,85.92s34.47,76.85,76.85,76.85,76.85-34.47,76.85-76.85Z" />
        </svg>
      </span>
      {!symbolOnly && (
        <>
          <span className="mws-lockup__divider" aria-hidden="true" />
          <span className="mws-lockup__name">{name}</span>
        </>
      )}
    </span>
  );
}

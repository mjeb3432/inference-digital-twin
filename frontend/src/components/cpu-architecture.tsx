// Placeholder — drop in the 21st.dev `cpu-architecture` SVG component here.
// The parent center panel renders this while the Spline scene is empty.
// Keep the outer <svg> sized with viewBox so it scales into any container.
export function CpuArchitecture() {
  return (
    <svg
      viewBox="0 0 600 360"
      xmlns="http://www.w3.org/2000/svg"
      className="max-w-[70%] max-h-[70%] opacity-40"
      aria-hidden
    >
      <rect
        x="120" y="90" width="360" height="180"
        fill="none"
        stroke="#F5A623"
        strokeWidth="1.5"
        rx="6"
      />
      <text
        x="300" y="185"
        textAnchor="middle"
        fontFamily="IBM Plex Mono, monospace"
        fontSize="11"
        letterSpacing="0.24em"
        fill="#F5A623"
        opacity="0.75"
      >
        CPU · GPU · INTERCONNECT
      </text>
      {/* Replace with the real animated traces from the reference component */}
    </svg>
  );
}

export default CpuArchitecture;

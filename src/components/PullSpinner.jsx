// The pull-to-refresh indicator: twelve tapering spokes around a circle, the
// shape iOS uses.
//
// It does two jobs with one drawing, which is the point of it. While you are
// pulling, the spokes LIGHT UP IN TURN — the ring filling is how far you have
// pulled, so the gesture tells you where the threshold is without a word. Let go
// past it and the same ring starts chasing, which is the familiar "working" state.
//
// The chase runs COUNTERCLOCKWISE by request. It is done by fading each spoke in
// sequence rather than rotating the group: a rotating ring of twelve spokes
// visibly steps rather than turns, because the shape maps onto itself every 30
// degrees.
const SPOKES = 12;

export default function PullSpinner({ progress = 0, spinning = false, size = 18, className = '' }) {
  const lit = Math.min(SPOKES, Math.round(progress * SPOKES));
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      className={className} fill="currentColor"
    >
      {Array.from({ length: SPOKES }, (_, i) => (
        <rect
          key={i}
          x="11.1" y="2.2" width="1.8" height="6" rx="0.9"
          transform={`rotate(${i * 30} 12 12)`}
          className={spinning ? 'pull-spoke' : undefined}
          style={spinning
            // Negative delay starts each spoke part-way through, so the chase is
            // already running on the first frame. Counting DOWN the index sends it
            // anticlockwise.
            ? { animationDelay: `${-((SPOKES - i) / SPOKES) * 0.9}s` }
            : { opacity: i < lit ? 1 : 0.15 }}
        />
      ))}
    </svg>
  );
}

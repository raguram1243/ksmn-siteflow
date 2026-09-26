/**
 * AuroraBackground
 * ----------------
 * A lightweight, pure-CSS animated gradient background inspired by React Bits'
 * "Aurora" component — but without the WebGL (`ogl`) dependency.
 *
 * Uses softly animated, blurred gradient "blobs" in muted blue/grey tones
 * consistent with the KSMN brand. Designed to be subtle and business-appropriate:
 * slow movement, low opacity, no bright or fast motion.
 *
 * Adapts automatically to dark mode (deeper navy/slate tones) via the `.dark`
 * class on the document root.
 */
export default function AuroraBackground() {
  return (
    <div
      className="login-aurora-bg fixed inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      {/* Base gradient wash */}
      <div className="login-aurora-base absolute inset-0" />

      {/* Animated blurred gradient blobs */}
      <div className="login-aurora-blob login-aurora-blob--1" />
      <div className="login-aurora-blob login-aurora-blob--2" />
      <div className="login-aurora-blob login-aurora-blob--3" />

      {/* Subtle vignette to keep the center readable */}
      <div className="login-aurora-vignette absolute inset-0" />
    </div>
  )
}
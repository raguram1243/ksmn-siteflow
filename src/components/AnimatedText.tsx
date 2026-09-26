/**
 * AnimatedText
 * ------------
 * A lightweight, pure-CSS text animation inspired by React Bits' "SplitText"
 * — but without the GSAP dependency.
 *
 * Splits the provided text into words and animates each with a gentle
 * fade-in + slide-up, staggered slightly. The animation runs once on mount
 * and is quick and subtle (not a dramatic letter-by-letter scramble).
 *
 * Usage:
 *   <AnimatedText text="KSMN SiteFlow" className="..." />
 *   <AnimatedText text="Sign in to your account" className="..." delay={0.3} />
 */
interface AnimatedTextProps {
  text: string
  className?: string
  /** Delay (in seconds) before the animation starts. Default: 0 */
  delay?: number
  /** Per-word stagger (in seconds). Default: 0.08 */
  stagger?: number
  /** Animation duration per word (in seconds). Default: 0.6 */
  duration?: number
  /** HTML tag to render. Default: 'p' */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span'
}

export default function AnimatedText({
  text,
  className = '',
  delay = 0,
  stagger = 0.08,
  duration = 0.6,
  as: Tag = 'p',
}: AnimatedTextProps) {
  const words = text.split(' ')

  return (
    <Tag
      className={`login-animated-text ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {words.map((word, i) => (
        <span
          key={i}
          className="login-animated-word inline-block"
          style={{
            animationDelay: `${delay + i * stagger}s`,
            animationDuration: `${duration}s`,
          }}
        >
          {word}
          {i < words.length - 1 ? '\u00A0' : ''}
        </span>
      ))}
    </Tag>
  )
}
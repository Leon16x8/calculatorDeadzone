import { useEffect, useRef, useState, useCallback } from 'react';

interface ScrambledTextProps {
  text: string;
  radius?: number;
  duration?: number;
  scrambleChars?: string;
  className?: string;
}

interface CharState {
  original: string;
  display: string;
  scrambling: boolean;
  progress: number;
}

export default function ScrambledText({
  text,
  radius = 100,
  duration = 1.2,
  scrambleChars = '.:*#&@!?/\\|=-+<>',
  className = '',
}: ScrambledTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [chars, setChars] = useState<CharState[]>(() =>
    [...text].map((c) => ({ original: c, display: c, scrambling: false, progress: 1 })),
  );
  const animFrames = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    setChars([...text].map((c) => ({ original: c, display: c, scrambling: false, progress: 1 })));
    charRefs.current = new Array(text.length).fill(null);
  }, [text]);

  const randomChar = useCallback(() => {
    return scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
  }, [scrambleChars]);

  const scrambleChar = useCallback(
    (index: number, dist: number) => {
      if (animFrames.current.has(index)) {
        cancelAnimationFrame(animFrames.current.get(index)!);
      }

      const totalMs = duration * (1 - dist / radius) * 1000;
      const start = performance.now();

      const animate = (now: number) => {
        const elapsed = now - start;
        const t = Math.min(elapsed / totalMs, 1);

        if (t < 1) {
          setChars((prev) => {
            const next = [...prev];
            next[index] = {
              ...next[index],
              display: t > 0.7 ? next[index].original : randomChar(),
              scrambling: true,
              progress: t,
            };
            return next;
          });
          animFrames.current.set(index, requestAnimationFrame(animate));
        } else {
          setChars((prev) => {
            const next = [...prev];
            next[index] = {
              ...next[index],
              display: next[index].original,
              scrambling: false,
              progress: 1,
            };
            return next;
          });
          animFrames.current.delete(index);
        }
      };

      animFrames.current.set(index, requestAnimationFrame(animate));
    },
    [duration, radius, randomChar],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      charRefs.current.forEach((el, i) => {
        if (!el || chars[i]?.original === ' ') return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy);

        if (dist < radius && !animFrames.current.has(i)) {
          scrambleChar(i, dist);
        }
      });
    },
    [chars, radius, scrambleChar],
  );

  useEffect(() => {
    return () => {
      animFrames.current.forEach((id) => cancelAnimationFrame(id));
    };
  }, []);

  return (
    <span
      ref={containerRef}
      className={className}
      onPointerMove={handlePointerMove}
      style={{ cursor: 'default' }}
    >
      {chars.map((c, i) => (
        <span
          key={i}
          ref={(el) => { charRefs.current[i] = el; }}
          style={{
            display: 'inline-block',
            whiteSpace: c.original === ' ' ? 'pre' : undefined,
            opacity: c.scrambling ? 0.6 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          {c.display}
        </span>
      ))}
    </span>
  );
}

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';

interface TargetCursorProps {
  targetSelector?: string;
  spinDuration?: number;
  hideDefaultCursor?: boolean;
  hoverDuration?: number;
  parallaxOn?: boolean;
}

const BORDER_WIDTH = 3;
const CORNER_SIZE = 12;

const defaultCornerPositions = [
  { x: -CORNER_SIZE * 1.5, y: -CORNER_SIZE * 1.5 },
  { x: CORNER_SIZE * 0.5, y: -CORNER_SIZE * 1.5 },
  { x: CORNER_SIZE * 0.5, y: CORNER_SIZE * 0.5 },
  { x: -CORNER_SIZE * 1.5, y: CORNER_SIZE * 0.5 },
];

export default function TargetCursor({
  targetSelector = '.cursor-target',
  spinDuration = 2,
  hideDefaultCursor = true,
  hoverDuration = 0.2,
  parallaxOn = true,
}: TargetCursorProps) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const cornersRef = useRef<NodeListOf<HTMLDivElement> | null>(null);
  const spinTl = useRef<gsap.core.Timeline | null>(null);
  const tickerFn = useRef<(() => void) | null>(null);
  const targetCorners = useRef<{ x: number; y: number }[] | null>(null);
  const activeStrength = useRef({ current: 0 });

  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const small = window.innerWidth <= 768;
    return touch && small;
  }, []);

  const moveCursor = useCallback((x: number, y: number) => {
    if (!cursorRef.current) return;
    gsap.to(cursorRef.current, { x, y, duration: 0.1, ease: 'power3.out' });
  }, []);

  useEffect(() => {
    if (isMobile || !cursorRef.current) return;

    const cursor = cursorRef.current;
    cornersRef.current = cursor.querySelectorAll<HTMLDivElement>('.tc-corner');
    const originalCursor = document.body.style.cursor;
    if (hideDefaultCursor) document.body.style.cursor = 'none';

    let activeTarget: HTMLElement | null = null;
    let leaveHandler: (() => void) | null = null;
    let resumeTimeout: ReturnType<typeof setTimeout> | null = null;

    // Detect when the hovered target is removed from the DOM
    // (e.g. calibration button disappears after click)
    const observer = new MutationObserver(() => {
      if (activeTarget && !document.contains(activeTarget)) {
        if (leaveHandler) leaveHandler();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    gsap.set(cursor, { xPercent: -50, yPercent: -50, x: window.innerWidth / 2, y: window.innerHeight / 2 });

    const createSpin = () => {
      spinTl.current?.kill();
      spinTl.current = gsap.timeline({ repeat: -1 }).to(cursor, { rotation: '+=360', duration: spinDuration, ease: 'none' });
    };
    createSpin();

    const ticker = () => {
      if (!targetCorners.current || !cursorRef.current || !cornersRef.current) return;
      const s = activeStrength.current.current;
      if (s === 0) return;
      const cx = gsap.getProperty(cursorRef.current, 'x') as number;
      const cy = gsap.getProperty(cursorRef.current, 'y') as number;
      cornersRef.current.forEach((corner, i) => {
        const curX = gsap.getProperty(corner, 'x') as number;
        const curY = gsap.getProperty(corner, 'y') as number;
        const tx = targetCorners.current![i].x - cx;
        const ty = targetCorners.current![i].y - cy;
        const fx = curX + (tx - curX) * s;
        const fy = curY + (ty - curY) * s;
        const dur = s >= 0.99 ? (parallaxOn ? 0.2 : 0) : 0.05;
        gsap.to(corner, { x: fx, y: fy, duration: dur, ease: dur === 0 ? 'none' : 'power1.out', overwrite: 'auto' });
      });
    };
    tickerFn.current = ticker;

    const onMove = (e: MouseEvent) => moveCursor(e.clientX, e.clientY);
    window.addEventListener('mousemove', onMove);

    const onDown = () => {
      if (dotRef.current) gsap.to(dotRef.current, { scale: 0.7, duration: 0.3 });
      if (cursorRef.current) gsap.to(cursorRef.current, { scale: 0.9, duration: 0.2 });
    };
    const onUp = () => {
      if (dotRef.current) gsap.to(dotRef.current, { scale: 1, duration: 0.3 });
      if (cursorRef.current) gsap.to(cursorRef.current, { scale: 1, duration: 0.2 });
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);

    const onEnter = (e: Event) => {
      const target = (e.target as HTMLElement).closest?.(targetSelector) as HTMLElement | null;
      if (!target || !cursorRef.current || !cornersRef.current) return;
      if (activeTarget === target) return;

      if (activeTarget && leaveHandler) {
        activeTarget.removeEventListener('mouseleave', leaveHandler);
        leaveHandler = null;
      }
      if (resumeTimeout) { clearTimeout(resumeTimeout); resumeTimeout = null; }

      activeTarget = target;
      cornersRef.current.forEach((c) => gsap.killTweensOf(c));
      gsap.killTweensOf(cursorRef.current, 'rotation');
      spinTl.current?.pause();
      gsap.set(cursorRef.current, { rotation: 0 });

      const rect = target.getBoundingClientRect();
      const cx = gsap.getProperty(cursorRef.current, 'x') as number;
      const cy = gsap.getProperty(cursorRef.current, 'y') as number;

      targetCorners.current = [
        { x: rect.left - BORDER_WIDTH, y: rect.top - BORDER_WIDTH },
        { x: rect.right + BORDER_WIDTH - CORNER_SIZE, y: rect.top - BORDER_WIDTH },
        { x: rect.right + BORDER_WIDTH - CORNER_SIZE, y: rect.bottom + BORDER_WIDTH - CORNER_SIZE },
        { x: rect.left - BORDER_WIDTH, y: rect.bottom + BORDER_WIDTH - CORNER_SIZE },
      ];

      gsap.ticker.add(tickerFn.current!);
      gsap.to(activeStrength.current, { current: 1, duration: hoverDuration, ease: 'power2.out' });

      cornersRef.current.forEach((corner, i) => {
        gsap.to(corner, { x: targetCorners.current![i].x - cx, y: targetCorners.current![i].y - cy, duration: 0.2, ease: 'power2.out' });
      });

      const onLeave = () => {
        gsap.ticker.remove(tickerFn.current!);
        targetCorners.current = null;
        gsap.set(activeStrength.current, { current: 0, overwrite: true });
        activeTarget = null;

        if (cornersRef.current) {
          gsap.killTweensOf(Array.from(cornersRef.current));
          cornersRef.current.forEach((corner, i) => {
            gsap.to(corner, { x: defaultCornerPositions[i].x, y: defaultCornerPositions[i].y, duration: 0.3, ease: 'power3.out' });
          });
        }

        resumeTimeout = setTimeout(() => {
          if (!activeTarget && cursorRef.current) createSpin();
          resumeTimeout = null;
        }, 50);

        target.removeEventListener('mouseleave', onLeave);
        leaveHandler = null;
      };

      leaveHandler = onLeave;
      target.addEventListener('mouseleave', onLeave);
    };
    window.addEventListener('mouseover', onEnter, { passive: true });

    return () => {
      if (tickerFn.current) gsap.ticker.remove(tickerFn.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseover', onEnter);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      if (activeTarget && leaveHandler) activeTarget.removeEventListener('mouseleave', leaveHandler);
      observer.disconnect();
      spinTl.current?.kill();
      document.body.style.cursor = originalCursor;
    };
  }, [targetSelector, spinDuration, hideDefaultCursor, hoverDuration, parallaxOn, isMobile, moveCursor]);

  if (isMobile) return null;

  return (
    <div ref={cursorRef} className="tc-wrap">
      <div ref={dotRef} className="tc-dot" />
      <div className="tc-corner tc-tl" />
      <div className="tc-corner tc-tr" />
      <div className="tc-corner tc-br" />
      <div className="tc-corner tc-bl" />
    </div>
  );
}

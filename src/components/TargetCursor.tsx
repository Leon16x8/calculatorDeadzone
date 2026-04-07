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

    // ── Native select suspension session ───────────
    //
    // Native <select> dropdowns are rendered by the OS outside the DOM.
    // Deterministic session model with explicit open/close tracking.
    //
    // dropdownOpen tracks whether the native dropdown is currently shown.
    // A second mousedown on the same select means the user is closing it.
    const nativeSelector = 'select, [data-native-cursor]';
    let sessionActive = false;
    let sessionEl: HTMLElement | null = null;
    let dropdownOpen = false;

    const startSession = (el: HTMLElement) => {
      const target = el.closest?.(nativeSelector) as HTMLElement | null;
      if (!target) return;
      sessionActive = true;
      sessionEl = target;
      dropdownOpen = true;
      if (cursorRef.current) gsap.set(cursorRef.current, { display: 'none' });
      sessionEl.style.setProperty('cursor', 'default', 'important');
    };

    // Idempotent — safe to call from multiple racing events
    const endSession = () => {
      if (!sessionActive) return;
      sessionActive = false;
      dropdownOpen = false;
      if (sessionEl) {
        sessionEl.style.removeProperty('cursor');
        sessionEl.blur();
        sessionEl = null;
      }
      if (cursorRef.current) gsap.set(cursorRef.current, { display: '' });
    };

    // ── Start/toggle signal ──
    const onNativeDown = (e: Event) => {
      const el = e.target as HTMLElement;
      const clickedNative = el?.closest?.(nativeSelector) as HTMLElement | null;

      if (clickedNative) {
        if (sessionActive && clickedNative === sessionEl) {
          // Second click on the same select — user is closing the dropdown
          endSession();
        } else {
          startSession(el);
        }
      } else if (sessionActive) {
        // Click outside the suspended select — dropdown closed
        endSession();
      }
    };
    // focusin: covers Tab-into-select (keyboard navigation)
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (!sessionActive && el?.closest?.(nativeSelector)) startSession(el);
    };

    // ── End signals ──
    // change: user picked an option (select keeps focus, no focusout)
    const onNativeChange = (e: Event) => {
      if (sessionActive && (e.target as HTMLElement)?.closest?.(nativeSelector)) {
        endSession();
      }
    };
    // focusout: focus moved to another element (e.g. Tab away)
    const onFocusOut = (e: FocusEvent) => {
      if (sessionActive && (e.target as HTMLElement)?.closest?.(nativeSelector)) {
        endSession();
      }
    };
    // Keyboard: Escape/Enter/Tab close the dropdown without change event
    const onNativeKey = (e: Event) => {
      const key = (e as KeyboardEvent).key;
      if (sessionActive && (key === 'Escape' || key === 'Enter' || key === 'Tab')) {
        endSession();
      }
    };

    // Capture phase for mousedown so we see it before any other handler
    document.addEventListener('mousedown', onNativeDown, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('change', onNativeChange);
    document.addEventListener('keydown', onNativeKey);

    const onEnter = (e: Event) => {
      if (sessionActive) return;
      const el = e.target as HTMLElement;
      if (el.closest?.(nativeSelector)) return;
      const target = el.closest?.(targetSelector) as HTMLElement | null;
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
      document.removeEventListener('mousedown', onNativeDown, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('change', onNativeChange);
      document.removeEventListener('keydown', onNativeKey);
      if (sessionActive) endSession();
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

'use client';

import { useCallback, useEffect, useRef } from 'react';

// Adapted from the base.org /ledgers DotGridBackground.
// Renders a subtle animated dot grid on a canvas — dots push away from the cursor.
export function DotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: -1, y: -1 });
  const animRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const gap = 20;
    const baseRadius = 1;
    const mx = mouse.current.x;
    const my = mouse.current.y;
    const influenceRadius = 120;
    const pushStrength = 6;
    const vFadeRange = 60;

    for (let x = gap; x < w; x += gap) {
      for (let y = gap; y < h; y += gap) {
        const distFromTopBottom = Math.min(y, h - y);
        const alpha = Math.min(distFromTopBottom / vFadeRange, 1);

        const dx = x - mx;
        const dy = y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const mouseFactor = mx < 0 ? 0 : Math.max(0, 1 - dist / influenceRadius);
        const push = mouseFactor * mouseFactor * pushStrength;
        const drawX = dist > 0 ? x + (dx / dist) * push : x;
        const drawY = dist > 0 ? y + (dy / dist) * push : y;

        ctx.beginPath();
        ctx.arc(drawX, drawY, baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${alpha * 0.07})`;
        ctx.fill();
      }
    }

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    const onMove = (e: PointerEvent) => {
      const rect = canvas?.getBoundingClientRect();
      if (rect) mouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => {
      mouse.current = { x: -1, y: -1 };
    };

    if (canvas) {
      canvas.addEventListener('pointermove', onMove, { passive: true });
      canvas.addEventListener('pointerleave', onLeave);
      animRef.current = requestAnimationFrame(draw);
    }

    return () => {
      canvas?.removeEventListener('pointermove', onMove);
      canvas?.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}

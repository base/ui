"use client";

import { motion, animate } from "motion/react";
import { Fragment, useEffect, useRef } from "react";

const GRID_DOT_SIZE = 6.90346;
const GRID_DOT_RX = 0.782701;

const TOP_GRID: { x: number; y: number }[] = [
  // 13 columns × 3 rows
  { x: 49.4388, y: 18.9502 }, { x: 49.4388, y: 30.4561 }, { x: 49.4388, y: 41.9614 },
  { x: 60.9452, y: 18.9502 }, { x: 60.9452, y: 30.4561 }, { x: 60.9452, y: 41.9614 },
  { x: 72.45, y: 18.9502 }, { x: 72.45, y: 30.4561 }, { x: 72.45, y: 41.9614 },
  { x: 83.9562, y: 18.9502 }, { x: 83.9562, y: 30.4561 }, { x: 83.9562, y: 41.9614 },
  // tab row 4 (cols 2–3)
  { x: 72.45, y: 53.9502 }, { x: 83.9562, y: 53.9502 },
  { x: 95.671, y: 18.9502 }, { x: 95.671, y: 30.4561 }, { x: 95.671, y: 41.9614 },
  { x: 107.177, y: 18.9502 }, { x: 107.177, y: 30.4561 }, { x: 107.177, y: 41.9614 },
  { x: 118.682, y: 18.9502 }, { x: 118.682, y: 30.4561 }, { x: 118.682, y: 41.9614 },
  { x: 130.188, y: 18.9502 }, { x: 130.188, y: 30.4561 }, { x: 130.188, y: 41.9614 },
  { x: 141.903, y: 18.9502 }, { x: 141.903, y: 30.4561 }, { x: 141.903, y: 41.9614 },
  { x: 153.41, y: 18.9502 }, { x: 153.41, y: 30.4561 }, { x: 153.41, y: 41.9614 },
  { x: 164.914, y: 18.9502 }, { x: 164.914, y: 30.4561 }, { x: 164.914, y: 41.9614 },
  { x: 176.421, y: 18.9502 }, { x: 176.421, y: 30.4561 }, { x: 176.421, y: 41.9614 },
  { x: 188.135, y: 18.9502 }, { x: 188.135, y: 30.4561 }, { x: 188.135, y: 41.9614 },
  // tab row 4 (cols 11–12)
  { x: 176.421, y: 53.9502 }, { x: 188.135, y: 53.9502 },
];

const BOTTOM_GRID: { x: number; y: number }[] = [
  // matrix(1 0 0 -1 X Y) → top-left at (X, Y - GRID_DOT_SIZE)
  { x: 67.6389, y: 185.5506 }, { x: 67.6389, y: 174.0437 }, { x: 67.6389, y: 162.5387 },
  { x: 79.1451, y: 185.5506 }, { x: 79.1451, y: 174.0437 }, { x: 79.1451, y: 162.5387 },
  { x: 90.6499, y: 185.5506 }, { x: 90.6499, y: 174.0437 }, { x: 90.6499, y: 162.5387 },
  { x: 102.156, y: 185.5506 }, { x: 102.156, y: 174.0437 }, { x: 102.156, y: 162.5387 },
  // tab (cols 1–2 from left)
  { x: 78.8389, y: 150.5506 }, { x: 90.3451, y: 150.5506 },
  { x: 113.871, y: 185.5506 }, { x: 113.871, y: 174.0437 }, { x: 113.871, y: 162.5387 },
  { x: 125.377, y: 185.5506 }, { x: 125.377, y: 174.0437 }, { x: 125.377, y: 162.5387 },
  { x: 136.882, y: 185.5506 }, { x: 136.882, y: 174.0437 }, { x: 136.882, y: 162.5387 },
  { x: 148.389, y: 185.5506 }, { x: 148.389, y: 174.0437 }, { x: 148.389, y: 162.5387 },
  { x: 160.103, y: 185.5506 }, { x: 160.103, y: 174.0437 }, { x: 160.103, y: 162.5387 },
  { x: 171.61, y: 185.5506 }, { x: 171.61, y: 174.0437 }, { x: 171.61, y: 162.5387 },
  { x: 183.114, y: 185.5506 }, { x: 183.114, y: 174.0437 }, { x: 183.114, y: 162.5387 },
  { x: 194.621, y: 185.5506 }, { x: 194.621, y: 174.0437 }, { x: 194.621, y: 162.5387 },
  { x: 206.335, y: 185.5506 }, { x: 206.335, y: 174.0437 }, { x: 206.335, y: 162.5387 },
  // tab (cols 9–10 from left)
  { x: 171.239, y: 150.5506 }, { x: 182.954, y: 150.5506 },
];

const ALL_DOTS = [...TOP_GRID, ...BOTTOM_GRID];

const DOT_HALF = GRID_DOT_SIZE / 2;
const DOT_GLOW_RADIUS = 36;
const DOT_GLOW_FADE_RATE = 3.5;
const DOT_GLOW_COLOR = "#D0D8E0";

const PHANTOM_CENTER_X = 132;
const PHANTOM_CENTER_Y = 105;
const PHANTOM_AMP_X = 80;
const PHANTOM_AMP_Y = 75;
const PHANTOM_FREQ_X1 = 0.13;
const PHANTOM_FREQ_X2 = 0.31;
const PHANTOM_FREQ_Y1 = 0.19;
const PHANTOM_FREQ_Y2 = 0.37;

const _wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function CenterSquares() {
  const staticRef = useRef<SVGRectElement | null>(null);
  const quadGroupRef = useRef<SVGGElement | null>(null);
  const cellGroupRef = useRef<SVGGElement | null>(null);
  const quadRefs = useRef<(SVGRectElement | null)[]>(Array(4).fill(null));
  const cellRefs = useRef<(SVGRectElement | null)[]>(Array(16).fill(null));

  useEffect(() => {
    let alive = true;

    const setLayer = (layer: "static" | "quads" | "cells") => {
      if (staticRef.current) staticRef.current.style.opacity = layer === "static" ? "1" : "0";
      if (quadGroupRef.current) quadGroupRef.current.style.opacity = layer === "quads" ? "1" : "0";
      if (cellGroupRef.current) cellGroupRef.current.style.opacity = layer === "cells" ? "1" : "0";
    };

    (async () => {
      while (alive) {
        setLayer("quads");
        await Promise.all(
          quadRefs.current.map((el, qi) => {
            if (!el) return;
            const qr = qi < 2 ? 0 : 1;
            const qc = qi % 2;
            return animate(el, { x: qc === 0 ? -4.5 : 4.5, y: qr === 0 ? -4.5 : 4.5 }, { duration: 0.5, ease: [0, 0, 0.25, 1.3] });
          }),
        );
        if (!alive) break;

        await _wait(120);

        await Promise.all(
          cellRefs.current.map((el, i) => {
            if (!el) return;
            const c = i % 4;
            const r = Math.floor(i / 4);
            return animate(el, { x: c < 2 ? -4.5 : 4.5, y: r < 2 ? -4.5 : 4.5 }, { duration: 0 });
          }),
        );
        setLayer("cells");

        await Promise.all(
          cellRefs.current.map((el, i) => {
            if (!el) return;
            const c = i % 4;
            const r = Math.floor(i / 4);
            return animate(el, { x: -6 + c * 4, y: -6 + r * 4 }, { delay: i * 0.014, duration: 0.46, ease: [0, 0, 0.25, 1.3] });
          }),
        );
        if (!alive) break;

        await _wait(420);

        await Promise.all(
          cellRefs.current.map((el, i) => {
            if (!el) return;
            const c = i % 4;
            const r = Math.floor(i / 4);
            return animate(el, { x: c < 2 ? -4.5 : 4.5, y: r < 2 ? -4.5 : 4.5 }, { delay: (15 - i) * 0.014, duration: 0.42, ease: [0.4, 0, 0.15, 1] });
          }),
        );
        if (!alive) break;

        await _wait(100);
        setLayer("quads");

        await Promise.all(
          quadRefs.current.map((el) => {
            if (!el) return;
            return animate(el, { x: 0, y: 0 }, { duration: 0.42, ease: [0.4, 0, 0.15, 1] });
          }),
        );
        if (!alive) break;

        setLayer("static");
        await _wait(4500);
      }
    })();

    return () => { alive = false; };
  }, []);

  const CX = 114.8;
  const CY = 88.9502;
  const SZ = 33.6;
  const HALF = SZ / 2;

  return (
    <>
      <rect ref={staticRef} x={CX} y={CY} width={SZ} height={SZ} rx="2" fill="var(--bds-brand)" />
      <g ref={quadGroupRef} style={{ opacity: 0 }}>
        {[0, 1, 2, 3].map((qi) => (
          <rect
            key={qi}
            ref={(el: SVGRectElement | null) => { quadRefs.current[qi] = el; }}
            x={CX + (qi % 2) * HALF}
            y={CY + (qi < 2 ? 0 : 1) * HALF}
            width={HALF}
            height={HALF}
            rx="1.4"
            fill="var(--bds-brand)"
          />
        ))}
      </g>
      <g ref={cellGroupRef} style={{ opacity: 0 }}>
        {Array.from({ length: 16 }, (_, i) => {
          const c = i % 4;
          const r = Math.floor(i / 4);
          const cellW = SZ / 4 + 0.4;
          return (
            <rect
              key={i}
              ref={(el: SVGRectElement | null) => { cellRefs.current[i] = el; }}
              x={CX + c * (SZ / 4) - 0.2}
              y={CY + r * (SZ / 4) - 0.2}
              width={cellW}
              height={cellW}
              rx="0.7"
              fill="var(--bds-brand)"
            />
          );
        })}
      </g>
    </>
  );
}

export function DecentralizedV2() {
  const svgRef = useRef<SVGSVGElement>(null);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const dotRefs = useRef<(SVGRectElement | null)[]>(Array(ALL_DOTS.length).fill(null));
  const boosts = useRef<Float64Array>(new Float64Array(ALL_DOTS.length));

  const updateCursor = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const t = pt.matrixTransform(ctm.inverse());
    cursorRef.current = { x: t.x, y: t.y };
  };

  useEffect(() => {
    let frameId: number;
    const start = performance.now();
    let lastTick = start;

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTick) / 1000);
      lastTick = now;
      const elapsed = (now - start) / 1000;

      const phantomX =
        PHANTOM_CENTER_X + PHANTOM_AMP_X * (Math.sin(elapsed * 2 * Math.PI * PHANTOM_FREQ_X1) * 0.85 + Math.sin(elapsed * 2 * Math.PI * PHANTOM_FREQ_X2 + 1.3) * 0.15);
      const phantomY =
        PHANTOM_CENTER_Y + PHANTOM_AMP_Y * (Math.sin(elapsed * 2 * Math.PI * PHANTOM_FREQ_Y1 + 0.5) * 0.85 + Math.sin(elapsed * 2 * Math.PI * PHANTOM_FREQ_Y2) * 0.15);

      const cursor = cursorRef.current;
      const ax = cursor ? cursor.x : phantomX;
      const ay = cursor ? cursor.y : phantomY;

      const blend = 1 - Math.exp(-DOT_GLOW_FADE_RATE * dt);
      const r2 = DOT_GLOW_RADIUS * DOT_GLOW_RADIUS;

      let nearestIdx = 0;
      let nearestD2 = Infinity;
      for (let i = 0; i < ALL_DOTS.length; i++) {
        const dx = ALL_DOTS[i].x + DOT_HALF - ax;
        const dy = ALL_DOTS[i].y + DOT_HALF - ay;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearestD2) { nearestD2 = d2; nearestIdx = i; }
      }
      const snapX = ALL_DOTS[nearestIdx].x + DOT_HALF;
      const snapY = ALL_DOTS[nearestIdx].y + DOT_HALF;
      const scale = Math.exp(-nearestD2 / r2);

      for (let i = 0; i < ALL_DOTS.length; i++) {
        const dx = ALL_DOTS[i].x + DOT_HALF - snapX;
        const dy = ALL_DOTS[i].y + DOT_HALF - snapY;
        const ideal = scale * Math.exp(-(dx * dx + dy * dy) / r2);
        boosts.current[i] += (ideal - boosts.current[i]) * blend;
        const el = dotRefs.current[i];
        if (el) el.style.opacity = String(boosts.current[i]);
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const pillKeyframes = {
    duration: 6.0,
    times: [0, 0.108, 0.333, 0.442, 0.667, 0.775, 1],
    ease: [[0, 0, 0.3, 1.4], "linear", [0, 0, 0.3, 1.4], "linear", [0, 0, 0.3, 1.4], "linear"] as any,
    repeat: Infinity,
  };

  const BOTTOM_BARS_X = [102.2, 107.8, 113.4, 119, 124.6, 130.2, 135.8, 141.4, 147, 152.6, 158.2];
  const TOP_BARS_X = [158.2, 152.6, 147, 141.4, 135.8, 130.2, 124.6, 119, 113.4, 107.8, 102.2];

  return (
    <div
      className="flex h-full w-full items-center justify-center"
      onPointerEnter={updateCursor}
      onPointerMove={updateCursor}
      onPointerLeave={() => { cursorRef.current = null; }}
    >
      <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width="264" height="212" viewBox="0 0 264 212" fill="none">
        {/* Dot grids */}
        {ALL_DOTS.map((dot, i) => (
          <Fragment key={i}>
            <rect x={dot.x} y={dot.y} width={GRID_DOT_SIZE} height={GRID_DOT_SIZE} rx={GRID_DOT_RX} fill="white" />
            <rect
              ref={(el: SVGRectElement | null) => { dotRefs.current[i] = el; }}
              x={dot.x} y={dot.y} width={GRID_DOT_SIZE} height={GRID_DOT_SIZE} rx={GRID_DOT_RX}
              fill={DOT_GLOW_COLOR} style={{ opacity: 0 }}
            />
          </Fragment>
        ))}

        {/* Main curved connection paths */}
        <path d="M36.4 182.75C36.4 195.121 46.4288 205.15 58.8 205.15H131.6H198.8" stroke="var(--bds-brand)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M226.8 28.7501C226.8 16.3789 216.771 6.3501 204.4 6.3501H131.6H64.4" stroke="var(--bds-brand)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M64 6.75H36" stroke="#DDE3E9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M227 204.75H199" stroke="#DDE3E9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Center double-box frame */}
        <path d="M95.2 70.3501C95.2 69.7978 95.6477 69.3501 96.2 69.3501H167C167.552 69.3501 168 69.7978 168 70.3501V141.15C168 141.702 167.552 142.15 167 142.15H96.2C95.6477 142.15 95.2 141.702 95.2 141.15V70.3501Z" fill="white" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M100 74.75C100 74.1977 100.448 73.75 101 73.75H163C163.552 73.75 164 74.1977 164 74.75V136.75C164 137.302 163.552 137.75 163 137.75H101C100.448 137.75 100 137.302 100 136.75V74.75Z" fill="white" stroke="#DDE3E9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Left pills — rotate downward */}
        <motion.path d="M30.7999 21.7502C30.7999 20.2038 32.0535 18.9502 33.5999 18.9502H39.1999C40.7463 18.9502 41.9999 20.2038 41.9999 21.7502C41.9999 23.2966 40.7463 24.5502 39.1999 24.5502H33.5999C32.0535 24.5502 30.7999 23.2966 30.7999 21.7502Z" fill="#9AB8FF"
          animate={{ y: [0, 9.8, 9.8, 19.6, 19.6, 0, 0] }}
          transition={pillKeyframes}
        />
        <motion.path d="M30.7999 31.55C30.7999 30.0036 32.0535 28.75 33.5999 28.75H39.1999C40.7463 28.75 41.9999 30.0036 41.9999 31.55C41.9999 33.0964 40.7463 34.35 39.1999 34.35H33.5999C32.0535 34.35 30.7999 33.0964 30.7999 31.55Z" fill="var(--bds-brand)"
          animate={{ y: [0, 9.8, 9.8, -9.8, -9.8, 0, 0] }}
          transition={pillKeyframes}
        />
        <motion.path d="M30.7999 41.3503C30.7999 39.8039 32.0535 38.5503 33.5999 38.5503H39.1999C40.7463 38.5503 41.9999 39.8039 41.9999 41.3503C41.9999 42.8967 40.7463 44.1503 39.1999 44.1503H33.5999C32.0535 44.1503 30.7999 42.8967 30.7999 41.3503Z" fill="#A7E66B"
          animate={{ y: [0, -19.6, -19.6, -9.8, -9.8, 0, 0] }}
          transition={pillKeyframes}
        />

        {/* Right pills — rotate upward */}
        <motion.path d="M221.2 170.15C221.2 168.604 222.454 167.35 224 167.35H229.6C231.146 167.35 232.4 168.604 232.4 170.15C232.4 171.696 231.146 172.95 229.6 172.95H224C222.454 172.95 221.2 171.696 221.2 170.15Z" fill="#A7E66B"
          animate={{ y: [0, 19.6, 19.6, 9.8, 9.8, 0, 0] }}
          transition={pillKeyframes}
        />
        <motion.path d="M221.2 179.95C221.2 178.404 222.454 177.15 224 177.15H229.6C231.146 177.15 232.4 178.404 232.4 179.95C232.4 181.496 231.146 182.75 229.6 182.75H224C222.454 182.75 221.2 181.496 221.2 179.95Z" fill="var(--bds-brand)"
          animate={{ y: [0, -9.8, -9.8, 9.8, 9.8, 0, 0] }}
          transition={pillKeyframes}
        />
        <motion.path d="M221.2 189.75C221.2 188.204 222.454 186.95 224 186.95H229.6C231.146 186.95 232.4 188.204 232.4 189.75C232.4 191.297 231.146 192.55 229.6 192.55H224C222.454 192.55 221.2 191.297 221.2 189.75Z" fill="#9AB8FF"
          animate={{ y: [0, -9.8, -9.8, -19.6, -19.6, 0, 0] }}
          transition={pillKeyframes}
        />

        {/* Connection arms */}
        <path d="M84 105.75H95.2M84 105.75C84 131.778 62.8998 153.35 36.8713 153.35C36.611 153.35 36.4 153.561 36.4 153.821V164.55M84 105.75C84 79.4612 62.6888 58.1499 36.4 58.1499" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M179.2 105.75L168 105.75M179.2 105.75C179.2 79.7216 200.3 58.1501 226.329 58.1501C226.589 58.1501 226.8 57.9391 226.8 57.6788L226.8 46.9501M179.2 105.75C179.2 132.039 200.511 153.35 226.8 153.35" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Center animated square */}
        <CenterSquares />

        {/* Small accent rects beside pills */}
        <rect x="30.7999" y="51.1499" width="11.2" height="14" rx="2" fill="#DDE3E9" />
        <rect x="221.2" y="146.35" width="11.2" height="14" rx="2" fill="#DDE3E9" />

        {/* Bottom-left U-bracket */}
        <path d="M58.8 186.95V168.55C58.8 166.341 57.0091 164.55 54.8 164.55H18C15.7909 164.55 14 166.341 14 168.55V186.95" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="26.6" y="177.15" width="19.6" height="11.2" rx="2" fill="#A7E66B" />

        {/* Bottom endpoint squares */}
        <rect x="221.2" y="199.55" width="11.2" height="11.2" rx="1" fill="white" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="193.2" y="199.55" width="11.2" height="11.2" rx="1" fill="white" stroke="#A7E66B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Top-right U-bracket (inverted) */}
        <path d="M249.2 24.5503V42.9503C249.2 45.1594 247.409 46.9503 245.2 46.9503H208.4C206.191 46.9503 204.4 45.1594 204.4 42.9503V24.5503" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="217" y="23.1499" width="19.6" height="11.2" rx="2" fill="#9AB8FF" />

        {/* Top endpoint squares */}
        <rect x="30.7999" y="0.75" width="11.2" height="11.2" rx="1" fill="white" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="58.8" y="0.75" width="11.2" height="11.2" rx="1" fill="white" stroke="#A7E66B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Left node — circle + spinning diamond */}
        <circle cx="36.4" cy="105.75" r="36.4" fill="#DDE3E9" />
        <circle cx="36" cy="105.75" r="32" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <motion.g
          style={{ transformOrigin: "36.8389px 90.3501px" }}
          animate={{ rotate: [0, -12, 378, 351, 365, 360] }}
          transition={{
            duration: 2.5,
            times: [0, 0.1, 0.55, 0.68, 0.82, 1.0],
            ease: [[0.5, 0, 0.5, 1], [0, 0, 0.25, 1], [0.5, 0, 0.5, 1], [0.5, 0, 0.5, 1], [0.5, 0, 0.5, 1]],
            repeat: Infinity,
            repeatDelay: 4.5,
          }}
        >
          <rect x="36.8389" y="90.3501" width="22.4" height="22.4" rx="2" transform="rotate(45 36.8389 90.3501)" fill="white" />
        </motion.g>

        {/* Right node — circle + 2×2 breathing grid */}
        <circle cx="226.8" cy="105.75" r="36.4" fill="#DDE3E9" />
        <circle cx="227" cy="105.75" r="32" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <motion.rect x="215.6" y="94.5498" width="8.4" height="8.4" rx="0.95" fill="white"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          animate={{ fillOpacity: [1, 0.5, 1], scale: [1, 0.74, 1] }}
          transition={{ fillOpacity: { duration: 3.2, repeat: Infinity, ease: "easeInOut" }, scale: { duration: 2.1, repeat: Infinity, ease: "easeInOut" } }}
        />
        <motion.rect x="215.6" y="108.55" width="8.4" height="8.4" rx="0.95" fill="white"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          animate={{ fillOpacity: [0.5, 1, 0.5], scale: [1, 0.8, 1] }}
          transition={{ fillOpacity: { duration: 3.2, repeat: Infinity, ease: "easeInOut" }, scale: { duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: 0.7 } }}
        />
        <motion.rect x="229.6" y="94.5498" width="8.4" height="8.4" rx="0.95" fill="white"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          animate={{ fillOpacity: [0.5, 1, 0.5], scale: [1, 0.76, 1] }}
          transition={{ fillOpacity: { duration: 3.2, repeat: Infinity, ease: "easeInOut" }, scale: { duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 1.3 } }}
        />
        <motion.rect x="229.6" y="108.55" width="8.4" height="8.4" rx="0.95" fill="white"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          animate={{ fillOpacity: [1, 0.5, 1], scale: [1, 0.78, 1] }}
          transition={{ fillOpacity: { duration: 3.2, repeat: Infinity, ease: "easeInOut" }, scale: { duration: 1.9, repeat: Infinity, ease: "easeInOut", delay: 0.4 } }}
        />

        {/* Bottom bars — L→R sweep, blue highlight static */}
        {BOTTOM_BARS_X.map((x, i) => {
          const C = 2.4;
          const f = (i + 0.5) / 11;
          const hw = 0.05;
          return (
            <motion.rect key={`bb${x}`} x={x} y={147.75} width={2.8} height={5.6} rx={0.5} fill="#DDE3E9"
              animate={{ opacity: [1, 1, 0, 1, 1] }}
              transition={{ duration: C, times: [0, Math.max(0.001, f - hw), f, Math.min(0.999, f + hw), 1], ease: "easeInOut", repeat: Infinity }}
            />
          );
        })}
        <rect x="141.4" y="147.75" width="19.6" height="5.6" rx="0.5" fill="var(--bds-brand)" />

        {/* Top bars — R→L sweep, green highlight static */}
        {TOP_BARS_X.map((x, i) => {
          const C = 2.4;
          const f = (i + 0.5) / 11;
          const hw = 0.05;
          return (
            <motion.rect key={`tb${x}`} x={x} y={58.1499} width={2.8} height={5.6} rx={0.5} fill="#DDE3E9"
              animate={{ opacity: [1, 1, 0, 1, 1] }}
              transition={{ duration: C, times: [0, Math.max(0.001, f - hw), f, Math.min(0.999, f + hw), 1], ease: "easeInOut", repeat: Infinity }}
            />
          );
        })}
        <rect x="102.2" y="58.1499" width="19.6" height="5.6" rx="0.5" fill="#A7E66B" />
      </svg>
    </div>
  );
}

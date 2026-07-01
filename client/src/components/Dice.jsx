import { useEffect, useRef } from "react";
import "./dice.css";

const LAYOUTS = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};
const FACE_ORDER = ["front", "back", "right", "left", "top", "bottom"];
const IDLE_X = -48;
const Y_OPTIONS = {
  die1: [-25, -32, -40, -48, -55],
  die2: [25, 32, 40, 48, 55],
};

function fillFace(face, n) {
  if (!face) return;
  face.innerHTML = "";
  for (let i = 1; i <= 9; i++) {
    const cell = document.createElement("div");
    cell.className = "d3-cell";
    if (LAYOUTS[n].includes(i)) {
      const dot = document.createElement("div");
      dot.className = "d3-pip";
      cell.appendChild(dot);
    }
    face.appendChild(cell);
  }
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function DieCube({ wrapRef, dieRef, shadowRef, idleClass }) {
  return (
    <div className="d3-wrap" ref={wrapRef}>
      <div className="d3-shadow" ref={shadowRef} />
      <div className={`d3-die ${idleClass}`} ref={dieRef}>
        <div className="d3-face d3-face-front" />
        <div className="d3-face d3-face-back" />
        <div className="d3-face d3-face-right" />
        <div className="d3-face d3-face-left" />
        <div className="d3-face d3-face-top" />
        <div className="d3-face d3-face-bottom" />
      </div>
    </div>
  );
}

/**
 * Props:
 *   roll     — [die1, die2] values (1-6). Omit to show [1, 1] as idle state.
 *   rollSeq  — increment this number to trigger the jump/spin animation.
 */
export default function Dice({ roll, rollSeq }) {
  const wrap1 = useRef(null);
  const die1 = useRef(null);
  const shadow1 = useRef(null);
  const wrap2 = useRef(null);
  const die2 = useRef(null);
  const shadow2 = useRef(null);

  const spin = useRef({
    die1: { tX: 0, tY: 0, tZ: 0 },
    die2: { tX: 0, tY: 0, tZ: 0 },
  });
  const lastSeqRef = useRef(rollSeq);

  // Paint decorative side faces once; the visible top face starts at the
  // current value so a mid-game mount (e.g. reconnect) isn't stuck on "1".
  useEffect(() => {
    const v1 = roll ? roll[0] : 1;
    const v2 = roll ? roll[1] : 1;
    const values1 = [1, 6, 2, 5, v1, 4];
    const values2 = [5, 2, 6, 1, v2, 4];
    FACE_ORDER.forEach((cls, i) => {
      fillFace(die1.current.querySelector(".d3-face-" + cls), values1[i]);
      fillFace(die2.current.querySelector(".d3-face-" + cls), values2[i]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (rollSeq === lastSeqRef.current) return;
    lastSeqRef.current = rollSeq;

    const v1 = roll ? roll[0] : 1;
    const v2 = roll ? roll[1] : 1;

    [
      { key: "die1", wrap: wrap1, die: die1, shadow: shadow1, value: v1 },
      { key: "die2", wrap: wrap2, die: die2, shadow: shadow2, value: v2 },
    ].forEach(({ key, wrap, die, shadow, value }) => {
      const s = spin.current[key];

      wrap.current.classList.remove("d3-jumping");
      void wrap.current.offsetWidth;
      wrap.current.classList.add("d3-jumping");

      shadow.current.style.opacity = "0.25";
      shadow.current.style.transform = "translateX(-50%) scale(0.55)";

      s.tX += 2;
      s.tY += 3;
      s.tZ += 1;
      const landingY = pick(Y_OPTIONS[key]);
      die.current.style.transform =
        `rotateX(${IDLE_X + s.tX * 360}deg) rotateY(${landingY + s.tY * 360}deg) rotateZ(${s.tZ * 360}deg)`;

      setTimeout(() => {
        fillFace(die.current.querySelector(".d3-face-top"), value);
      }, 420);
      setTimeout(() => {
        shadow.current.style.opacity = "1";
        shadow.current.style.transform = "translateX(-50%) scale(1)";
      }, 550);
    });
  }, [rollSeq, roll]);

  return (
    <div className="d3-row">
      <DieCube wrapRef={wrap1} dieRef={die1} shadowRef={shadow1} idleClass="d3-die--a" />
      <DieCube wrapRef={wrap2} dieRef={die2} shadowRef={shadow2} idleClass="d3-die--b" />
    </div>
  );
}

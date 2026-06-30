import { useEffect, useRef, useState } from "react";

const DOT_POSITIONS = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};
const ALL_CELLS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// Rotation (deg) that brings the named printed face to point at the viewer,
// given each cube face's own placement transform below (front=1, back=6,
// right=2, left=5, top=3, bottom=4) -- each value here is the inverse of
// that face's local rotation, since CSS composes parent-then-child.
const FACE_ORIENTATION = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 0, y: 180 },
};

// Added to every target so the cube never rests dead-on -- a fixed camera-angle
// offset that keeps the front face and one side face both in view at rest.
const IDLE_TILT = { x: -22, y: 32 };

function tiltedTarget(value) {
  const base = FACE_ORIENTATION[value] || FACE_ORIENTATION[1];
  return { x: base.x + IDLE_TILT.x, y: base.y + IDLE_TILT.y };
}

function mod360(n) {
  return ((n % 360) + 360) % 360;
}

function Pips({ value }) {
  const active = DOT_POSITIONS[value] || [];
  return (
    <div className="die3d-pips">
      {ALL_CELLS.map((cell) => (
        <span key={cell} className={`die-pip ${active.includes(cell) ? "die-pip-on" : ""}`} />
      ))}
    </div>
  );
}

function useDieRotation(value, rollSeq) {
  const [rotation, setRotation] = useState(() => {
    const target = tiltedTarget(value);
    return { x: target.x, y: target.y, z: 0 };
  });
  const lastSeqRef = useRef(rollSeq);

  useEffect(() => {
    if (rollSeq === lastSeqRef.current) return;
    lastSeqRef.current = rollSeq;
    const target = tiltedTarget(value);
    setRotation((prev) => {
      const spins = 1 + Math.floor(Math.random() * 2); // 1-2 extra full turns for flourish
      const deltaX = mod360(target.x - mod360(prev.x));
      const deltaY = mod360(target.y - mod360(prev.y));
      return {
        x: prev.x + spins * 360 + deltaX,
        y: prev.y + (spins + 1) * 360 + deltaY,
        z: (Math.random() - 0.5) * 14,
      };
    });
  }, [rollSeq, value]);

  return rotation;
}

function Die3D({ value, rollSeq }) {
  const rotation = useDieRotation(value, rollSeq);
  return (
    <div className="die3d">
      <div
        className="die3d-cube"
        style={{ transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) rotateZ(${rotation.z}deg)` }}
      >
        <div className="die3d-face die3d-front">
          <Pips value={1} />
        </div>
        <div className="die3d-face die3d-back">
          <Pips value={6} />
        </div>
        <div className="die3d-face die3d-right">
          <Pips value={2} />
        </div>
        <div className="die3d-face die3d-left">
          <Pips value={5} />
        </div>
        <div className="die3d-face die3d-top">
          <Pips value={3} />
        </div>
        <div className="die3d-face die3d-bottom">
          <Pips value={4} />
        </div>
      </div>
    </div>
  );
}

export default function Dice({ roll, rollSeq }) {
  const v1 = roll ? roll[0] : 1;
  const v2 = roll ? roll[1] : 1;

  return (
    <div className="dice-row">
      <Die3D value={v1} rollSeq={rollSeq} />
      <Die3D value={v2} rollSeq={rollSeq} />
    </div>
  );
}

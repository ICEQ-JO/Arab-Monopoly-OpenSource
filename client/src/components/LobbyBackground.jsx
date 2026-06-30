import SandParticles from "./SandParticles";

export default function LobbyBackground() {
  return (
    <>
      <video
        autoPlay loop muted playsInline
        style={{
          position: "fixed", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", zIndex: 0, pointerEvents: "none",
          filter: "brightness(1.30) saturate(1.35) contrast(1.08)",
        }}
      >
        <source src="/lobby-bg.mp4" type="video/mp4" />
      </video>
      <SandParticles />
    </>
  );
}

import { useEffect, useState, useCallback } from "react"
import { registerLauncher, type LaunchOptions } from "../lib/envelope"

interface Flight {
  id: number
  fromX: number
  fromY: number
  midAX: number
  midAY: number
  midBX: number
  midBY: number
  toX: number
  toY: number
  label: string
}

let nextId = 0

export function EnvelopeLayer() {
  const [flights, setFlights] = useState<Flight[]>([])

  const launch = useCallback(({ fromEl, toEl, label = "发往未来" }: LaunchOptions) => {
    // 持久化调试标记：动画播完后依然可查，方便验证触发是否正确
    ;(window as unknown as Record<string, unknown>).__envelopeLaunched = {
      at: Date.now(),
      label,
      hasFrom: !!fromEl,
      hasTo: !!toEl,
    }
    if (!fromEl || !toEl) return
    const from = fromEl.getBoundingClientRect()
    const to = toEl.getBoundingClientRect()
    const fromX = from.left + from.width / 2
    const fromY = from.top + from.height / 2
    const toX = to.left + to.width / 2
    const toY = to.top + 8

    const midAX = window.innerWidth / 2
    const midAY = window.innerHeight * 0.30
    const midBX = (midAX + toX) / 2
    const midBY = Math.min(midAY, toY) - 30

    const flight: Flight = {
      id: ++nextId,
      fromX, fromY,
      midAX, midAY, midBX, midBY,
      toX, toY,
      label,
    }
    setFlights((prev) => [...prev, flight])

    setTimeout(() => {
      setFlights((prev) => prev.filter((f) => f.id !== flight.id))
    }, 2700)
  }, [])

  useEffect(() => {
    registerLauncher(launch)
  }, [launch])

  return (
    <div className="fixed inset-0 pointer-events-none z-[1000]">
      {flights.map((f) => (
        <Envelope key={f.id} flight={f} />
      ))}
    </div>
  )
}

/**
 * 信封 + 文字 一起飞。只用一个 animation，避免 transform 冲突。
 */
function Envelope({ flight }: { flight: Flight }) {
  const { fromX, fromY, midAX, midAY, midBX, midBY, toX, toY, label } = flight

  const vars = {
    ["--fx" as string]: `${fromX}px`,
    ["--fy" as string]: `${fromY}px`,
    ["--ax" as string]: `${midAX}px`,
    ["--ay" as string]: `${midAY}px`,
    ["--bx" as string]: `${midBX}px`,
    ["--by" as string]: `${midBY}px`,
    ["--tx" as string]: `${toX}px`,
    ["--ty" as string]: `${toY}px`,
  } as React.CSSProperties

  return (
    <>
      {/* 信封本体（只负责 transform + opacity） */}
      <div
        className="absolute will-change-transform"
        style={{ ...vars, animation: "env-fly 2.4s cubic-bezier(0.22, 1, 0.36, 1) forwards" }}
      >
        <EnvelopeSVG />
      </div>

      {/* 文字标签（独立 div，transform 走同样路径但偏移一些；opacity 合进同一个 keyframe） */}
      <div
        className="absolute will-change-transform"
        style={{
          ...vars,
          // 文字的 Y 偏移比信封多 40px（信封下方）
          ["--fy" as string]: `${fromY + 44}px`,
          ["--ay" as string]: `${midAY + 38}px`,
          ["--by" as string]: `${midBY + 26}px`,
          ["--ty" as string]: `${toY + 34}px`,
          animation: "env-fly 2.4s cubic-bezier(0.22, 1, 0.36, 1) forwards",
          fontSize: "14px",
          fontWeight: 700,
          color: "#C8863F",
          whiteSpace: "nowrap",
          textShadow: "0 1px 2px rgba(255,255,255,0.95)",
        }}
      >
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border-2 border-accent/30 shadow-md">
          ✉️ {label}
        </span>
      </div>

      {/* 落点 ripple —— 延迟出现 */}
      <div
        className="absolute will-change-transform"
        style={{
          left: toX - 30,
          top: toY - 30,
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(230,90,59,0.45) 0%, transparent 70%)",
          animation: "env-ripple 1.0s ease-out 2.1s forwards",
          animationFillMode: "backwards",
        }}
      />
    </>
  )
}

function EnvelopeSVG() {
  return (
    <svg
      width="48"
      height="40"
      viewBox="0 0 48 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.22))" }}
    >
      <rect x="2" y="6" width="44" height="32" rx="3" fill="#FFF8E5" stroke="#C8863F" strokeWidth="1.5" />
      <polygon
        points="2,6 24,22 46,6"
        fill="#E5A64B"
        stroke="#C8863F"
        strokeWidth="1.5"
        strokeLinejoin="round"
        style={{ transformOrigin: "24px 14px", animation: "env-flap 2.4s cubic-bezier(0.3, 1.5, 0.4, 1) forwards" }}
      />
      <rect
        x="6" y="8" width="36" height="26" rx="2"
        fill="#FFFBF2" stroke="#D4A868" strokeWidth="0.8"
        style={{ animation: "env-letter 2.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards" }}
      />
      <line x1="10" y1="14" x2="38" y2="14" stroke="#E5A64B" strokeWidth="1" opacity="0.5" />
      <line x1="10" y1="19" x2="32" y2="19" stroke="#E5A64B" strokeWidth="1" opacity="0.35" />
      <line x1="10" y1="24" x2="28" y2="24" stroke="#E5A64B" strokeWidth="1" opacity="0.2" />
      <circle
        cx="24" cy="24" r="4"
        fill="#DC2626" stroke="#991B1B" strokeWidth="0.8"
        style={{ animation: "env-seal 2.4s ease-out forwards" }}
      />
    </svg>
  )
}

import { Check } from "lucide-react"
import { THEMES, type ThemeId } from "../../lib/theme"
import { cn } from "../../lib/utils"
import pkg from "../../../package.json"

/** 外观主题选择 */
export function AppearanceTab({ theme, onPick }: { theme: ThemeId; onPick: (id: ThemeId) => void }) {
  return (
    <div className="px-6 pb-6">
      <div className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-3">
        外观主题
      </div>
      <div className="grid grid-cols-2 gap-3">
        {THEMES.map((t) => {
          const active = theme === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t.id)}
              className={cn(
                "relative text-left p-3 rounded-xl border-2 transition-all active:scale-[0.98]",
                active
                  ? "border-primary bg-primary/5 shadow-card"
                  : "border-border-light hover:border-border bg-surface hover:bg-surface-hover",
              )}
            >
              <div
                className="w-full h-14 rounded-lg mb-2.5 p-2 flex items-end gap-1.5 overflow-hidden"
                style={{ backgroundColor: t.swatch[0] }}
              >
                <span className="w-5 h-5 rounded-full" style={{ backgroundColor: t.swatch[1] }} />
                <span className="w-5 h-5 rounded-full" style={{ backgroundColor: t.swatch[2] }} />
                <span className="flex-1" />
                <span className="w-9 h-2.5 rounded-full opacity-40" style={{ backgroundColor: t.swatch[1] }} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-text">{t.name}</span>
                {active && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
              </div>
              <p className="text-[11px] text-text-muted mt-0.5 leading-snug">{t.desc}</p>
            </button>
          )
        })}
      </div>

      <div className="mt-5 pt-4 border-t border-border-light flex items-center justify-between text-[11px] text-text-muted">
        <span>人生记趣录 · Life Journal</span>
        <span>v{pkg.version}</span>
      </div>
    </div>
  )
}

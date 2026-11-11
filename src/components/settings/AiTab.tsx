import { useEffect, useState, type FormEvent } from "react"
import { Bot, RefreshCw } from "lucide-react"
import { apiGetAIConfig, apiResetAIConfig, apiUpdateAIConfig, type AIConfig } from "../../api/client"

/** AI 助手配置（管理员）：保存立即生效，无需重启 */
export function AiTab() {
  const [ai, setAi] = useState<AIConfig | null>(null)
  const [aiForm, setAiForm] = useState({ base_url: "", api_key: "", model: "" })
  const [aiMsg, setAiMsg] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)

  // 进入 AI 页时拉取当前配置
  useEffect(() => {
    apiGetAIConfig()
      .then((cfg) => {
        setAi(cfg)
        setAiForm({ base_url: cfg.base_url, api_key: cfg.api_key, model: cfg.model })
      })
      .catch((e: any) => setAiMsg(`❌ ${e?.message ?? "加载 AI 配置失败"}`))
  }, [])

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setAiBusy(true)
    setAiMsg(null)
    try {
      setAi(await apiUpdateAIConfig(aiForm))
      setAiMsg("✅ 已保存，AI 提问立即生效（无需重启）")
    } catch (err: any) {
      setAiMsg(`❌ ${err?.message ?? "保存失败"}`)
    } finally {
      setAiBusy(false)
    }
  }

  const handleReset = async () => {
    setAiBusy(true)
    setAiMsg(null)
    try {
      const cfg = await apiResetAIConfig()
      setAi(cfg)
      setAiForm({ base_url: cfg.base_url, api_key: cfg.api_key, model: cfg.model })
      setAiMsg("✅ 已清除设置页配置，回退服务器 .env")
    } catch (err: any) {
      setAiMsg(`❌ ${err?.message ?? "重置失败"}`)
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="px-6 pb-6 space-y-3">
      <div className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-1 flex items-center gap-1.5">
        <Bot className="w-3.5 h-3.5" />
        AI 助手配置
      </div>
      <p className="text-[11px] text-text-muted leading-relaxed">
        修改后立即生效，无需重启服务器；留空的字段将回退到服务器 .env 配置。
      </p>
      <p className="text-[11px] leading-relaxed text-text-secondary">
        {!ai
          ? (aiMsg ?? "加载中…")
          : ai.source === "db"
            ? "当前生效配置：设置页保存值"
            : ai.source === "env"
              ? "当前生效配置：服务器 .env"
              : "当前生效配置：部分字段来自设置页，部分来自 .env"}
      </p>

      <label className="block text-xs font-medium text-text-secondary">
        API 地址（base_url）
        <input
          type="url"
          value={aiForm.base_url}
          onChange={(e) => setAiForm((v) => ({ ...v, base_url: e.target.value }))}
          placeholder="https://api.deepseek.com"
          disabled={!ai || aiBusy}
          className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border outline-none text-sm focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:opacity-50"
        />
      </label>

      <label className="block text-xs font-medium text-text-secondary">
        API Key
        <input
          type="password"
          autoComplete="off"
          value={aiForm.api_key}
          onChange={(e) => setAiForm((v) => ({ ...v, api_key: e.target.value }))}
          placeholder="留空则使用服务器 .env 的 AI_API_KEY"
          disabled={!ai || aiBusy}
          className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border outline-none text-sm focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:opacity-50"
        />
      </label>

      <label className="block text-xs font-medium text-text-secondary">
        模型名称（model）
        <input
          type="text"
          value={aiForm.model}
          onChange={(e) => setAiForm((v) => ({ ...v, model: e.target.value }))}
          placeholder="deepseek-chat"
          disabled={!ai || aiBusy}
          className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border outline-none text-sm focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:opacity-50"
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!ai || aiBusy}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-light disabled:opacity-50 transition-colors"
        >
          {aiBusy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          保存配置
        </button>
        <button
          type="button"
          disabled={!ai || aiBusy}
          onClick={handleReset}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-hover text-sm font-medium text-text-secondary hover:bg-surface-active disabled:opacity-50 transition-colors"
        >
          恢复默认
        </button>
      </div>

      {aiMsg && <p className="text-xs text-text-secondary">{aiMsg}</p>}
    </form>
  )
}

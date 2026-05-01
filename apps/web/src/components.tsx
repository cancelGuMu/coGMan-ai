import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import type { StepCompletionStatus } from "./types";
import "./components.css";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

const saveStatusCopy: Record<SaveStatus, { label: string; description: string }> = {
  idle: { label: "待编辑", description: "当前步骤尚未产生新的修改。" },
  dirty: { label: "未保存", description: "页面已有修改，请保存草稿。" },
  saving: { label: "保存中", description: "正在写入本地项目数据。" },
  saved: { label: "已保存", description: "最新修改已经保存。" },
  error: { label: "保存失败", description: "保存时遇到问题，请稍后重试。" },
};

export function SaveStatusBadge({
  status,
  detail,
}: {
  status: SaveStatus;
  detail?: string;
}) {
  const copy = saveStatusCopy[status];

  return (
    <span className={`save-status-badge save-status-badge-${status}`} title={detail ?? copy.description}>
      <span className="save-status-dot" aria-hidden="true" />
      {copy.label}
    </span>
  );
}

export type EmptyStateTone = "empty" | "generate" | "import";

const emptyStateCopy: Record<EmptyStateTone, { eyebrow: string; actionLabel: string }> = {
  empty: { eyebrow: "暂无内容", actionLabel: "稍后补充" },
  generate: { eyebrow: "等待生成", actionLabel: "开始生成" },
  import: { eyebrow: "等待导入", actionLabel: "导入素材" },
};

export function EmptyStatePanel({
  tone = "empty",
  title,
  description,
  action,
}: {
  tone?: EmptyStateTone;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const copy = emptyStateCopy[tone];

  return (
    <div className={`empty-state-panel empty-state-panel-${tone}`}>
      <span className="empty-state-eyebrow">{copy.eyebrow}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}

export type ErrorNoticeTone = "api" | "import" | "generation" | "generic";

const errorNoticeTitle: Record<ErrorNoticeTone, string> = {
  api: "接口请求失败",
  import: "导入失败",
  generation: "生成失败",
  generic: "操作失败",
};

export function ErrorNotice({
  tone = "generic",
  message,
  action,
}: {
  tone?: ErrorNoticeTone;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className={`error-notice error-notice-${tone}`} role="alert">
      <strong>{errorNoticeTitle[tone]}</strong>
      <p>{message}</p>
      {action ? <div className="error-notice-action">{action}</div> : null}
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        {eyebrow ? <span className="section-header-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="section-header-actions">{actions}</div> : null}
    </div>
  );
}

export function DualColumnLayout({
  primary,
  secondary,
  className = "",
}: {
  primary: ReactNode;
  secondary: ReactNode;
  className?: string;
}) {
  return (
    <div className={`dual-column-layout ${className}`.trim()}>
      <div className="dual-column-primary">{primary}</div>
      <div className="dual-column-secondary">{secondary}</div>
    </div>
  );
}

export function ThreeColumnWorkbench({
  left,
  center,
  right,
  className = "",
}: {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  className?: string;
}) {
  return (
    <div className={`three-column-workbench ${className}`.trim()}>
      <aside className="workbench-rail">{left}</aside>
      <section className="workbench-stage">{center}</section>
      <aside className="workbench-detail">{right}</aside>
    </div>
  );
}

export type VersionRecord = {
  id: string;
  title: string;
  description: string;
  created_at: string;
};

export function VersionHistoryPanel({
  versions,
  onRestore,
}: {
  versions: VersionRecord[];
  onRestore?: (version: VersionRecord) => void;
}) {
  return (
    <div className="version-history-panel">
      <div className="version-history-head">
        <strong>版本记录</strong>
        <span>{versions.length} 条</span>
      </div>
      {versions.length ? (
        <div className="version-history-list">
          {versions.map((version) => (
            <article className="version-history-item" key={version.id}>
              <div>
                <strong>{version.title}</strong>
                <p>{version.description}</p>
                <time>{version.created_at}</time>
              </div>
              {onRestore ? (
                <button className="ghost-mini-button" type="button" onClick={() => onRestore(version)}>
                  恢复
                </button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyStatePanel title="暂无版本记录" description="保存或生成后，这里会记录关键版本快照。" />
      )}
    </div>
  );
}

export function AIGenerationButtonGroup({
  onGenerate,
  onRegenerate,
  onStop,
  onCopyPrompt,
  disabled = false,
  isGenerating = false,
  generatingLabel = "AI 生成中",
}: {
  onGenerate: () => void;
  onRegenerate?: () => void;
  onStop?: () => void;
  onCopyPrompt?: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
  generatingLabel?: string;
}) {
  return (
    <div className="ai-generation-button-group">
      <button
        className={`primary-pill inline-pill ai-action-button${isGenerating ? " is-generating" : ""}`}
        type="button"
        onClick={onGenerate}
        disabled={disabled || isGenerating}
        aria-busy={isGenerating}
      >
        {isGenerating ? <span className="ai-button-spinner" aria-hidden="true" /> : null}
        {isGenerating ? generatingLabel : "生成"}
      </button>
      <button
        className="ghost-button inline-button"
        type="button"
        onClick={onRegenerate ?? onGenerate}
        disabled={disabled || isGenerating}
      >
        {isGenerating ? "等待生成完成" : "重新生成"}
      </button>
      {onStop ? (
        <button className="ghost-button inline-button" type="button" onClick={onStop} disabled={disabled || !isGenerating}>
          停止
        </button>
      ) : null}
      <button className="ghost-button inline-button" type="button" onClick={onCopyPrompt} disabled={!onCopyPrompt || isGenerating}>
        复制提示词
      </button>
    </div>
  );
}

export function AIActionButton({
  children,
  loadingLabel = "AI 生成中",
  isGenerating = false,
  disabled = false,
  className = "ghost-button inline-button",
  onClick,
}: {
  children: ReactNode;
  loadingLabel?: string;
  isGenerating?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`${className} ai-action-button${isGenerating ? " is-generating" : ""}`.trim()}
      type="button"
      onClick={onClick}
      disabled={disabled || isGenerating}
      aria-busy={isGenerating}
    >
      {isGenerating ? <span className="ai-button-spinner" aria-hidden="true" /> : null}
      {isGenerating ? loadingLabel : children}
    </button>
  );
}

export function ImportFileButton({
  label = "导入文件",
  filename,
  accept = ".txt,.md,.docx",
  onChange,
}: {
  label?: string;
  filename?: string | null;
  accept?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="ghost-button inline-button import-file-button">
      {label}
      <input type="file" accept={accept} onChange={onChange} hidden />
      {filename ? <span>{filename}</span> : null}
    </label>
  );
}

export function NextStepButton({
  disabled,
  onClick,
  children = "进入下一步",
}: {
  disabled?: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button className={`next-step-button${disabled ? " is-disabled" : ""}`} type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function StepStatusDot({ status }: { status: StepCompletionStatus }) {
  return <span className={`step-status-dot step-status-dot-${status}`} aria-label={`步骤状态：${status}`} />;
}

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="loading-skeleton" aria-label="内容加载中">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} style={{ "--row-index": index } as CSSProperties} />
      ))}
    </div>
  );
}

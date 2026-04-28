import type { ReactNode } from "react";
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

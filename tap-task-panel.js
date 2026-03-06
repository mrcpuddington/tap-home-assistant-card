const CARD_TYPE = "tap-task-panel";
const DEFAULT_TITLE = "Current Tasks";
const DEFAULT_MAX_TASKS = 25;
const DEFAULT_FONT_SCALE = 1;

class TapTaskPanelCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = {
      title: DEFAULT_TITLE,
      max_tasks: DEFAULT_MAX_TASKS,
      show_header: true,
      font_scale: DEFAULT_FONT_SCALE,
    };
    this._busy = new Set();
    this._error = "";
    this.attachShadow({ mode: "open" });
  }

  static getStubConfig() {
    return {
      type: `custom:${CARD_TYPE}`,
      title: DEFAULT_TITLE,
    };
  }

  setConfig(config) {
    if (!config || typeof config !== "object") {
      throw new Error("Invalid configuration");
    }
    this._config = {
      ...this._config,
      ...config,
    };
    this._config.font_scale = clampNumber(
      Number(this._config.font_scale ?? DEFAULT_FONT_SCALE),
      0.8,
      1.3,
      DEFAULT_FONT_SCALE,
    );
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    const rows = this._getTasks().length;
    return Math.max(3, Math.min(10, rows + 1));
  }

  _getTasks() {
    if (!this._hass) return [];
    const configured = Array.isArray(this._config.entities) ? this._config.entities : null;

    const entities = configured
      ? configured
          .map((entityId) => this._hass.states[entityId])
          .filter(Boolean)
      : Object.values(this._hass.states).filter((state) => {
          return (
            state.entity_id.startsWith("sensor.tap_task_") &&
            state.attributes &&
            state.attributes.task_id
          );
        });

    const tasks = entities.map((state) => {
      const attrs = state.attributes || {};
      const taskName = (attrs.friendly_name || state.entity_id).replace(/^Tap Task\s+/i, "");
      const intervalDays = Number(attrs.interval_days || 1);
      const timesPerDay = Number(attrs.times_per_day || 1);
      const nextDueAt = parseDate(attrs.next_due_at);
      const lastDone = parseDate(attrs.last_done);
      const isComplete = Boolean(attrs.is_complete_this_interval);
      const isOverdue = Boolean(attrs.is_overdue) || state.state === "overdue";
      const status = String(state.state || "unknown");

      return {
        entityId: state.entity_id,
        taskId: String(attrs.task_id || ""),
        name: taskName,
        intervalDays,
        timesPerDay,
        nextDueAt,
        lastDone,
        isComplete,
        isOverdue,
        status,
      };
    });

    tasks.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.nextDueAt && b.nextDueAt) return a.nextDueAt.getTime() - b.nextDueAt.getTime();
      if (a.nextDueAt) return -1;
      if (b.nextDueAt) return 1;
      return a.name.localeCompare(b.name);
    });

    return tasks.slice(0, Number(this._config.max_tasks || DEFAULT_MAX_TASKS));
  }

  _render() {
    if (!this._hass || !this.shadowRoot) return;
    const tasks = this._getTasks();
    const showHeader = this._config.show_header !== false;
    const fontScale = clampNumber(
      Number(this._config.font_scale ?? DEFAULT_FONT_SCALE),
      0.8,
      1.3,
      DEFAULT_FONT_SCALE,
    );

    const rows = tasks
      .map((task) => {
        const completeDisabled = task.isComplete || this._busy.has(`complete:${task.entityId}`);
        const reopenDisabled = !task.isComplete || this._busy.has(`reopen:${task.entityId}`);
        const dueClass = task.isOverdue ? "due overdue" : "due";

        return `
          <div class="row">
            <div class="meta">
              <div class="name-line">
                <span class="name">${escapeHtml(task.name)}</span>
                <span class="frequency"> - ${escapeHtml(frequencyLabel(task.intervalDays, task.timesPerDay))}</span>
              </div>
              <div class="line">Last: ${escapeHtml(formatDate(task.lastDone) || "-")}</div>
              <div class="${dueClass}">Next Due: ${escapeHtml(formatDate(task.nextDueAt) || "-")}</div>
            </div>
            <div class="actions">
              <button class="btn complete ${completeDisabled ? "disabled" : ""}" data-action="complete" data-entity-id="${escapeHtml(task.entityId)}" ${completeDisabled ? "disabled" : ""}>
                <span class="icon">✓</span>
                <span>${task.isComplete ? "DONE" : "COMPLETE"}</span>
              </button>
              <button class="btn reopen ${reopenDisabled ? "disabled" : ""}" data-action="reopen" data-entity-id="${escapeHtml(task.entityId)}" ${reopenDisabled ? "disabled" : ""}>
                <span class="icon">↺</span>
                <span>REOPEN</span>
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    this.shadowRoot.innerHTML = `
      <ha-card>
        <style>
          :host {
            display: block;
            --tap-scale: ${fontScale};
          }

          ha-card {
            background: radial-gradient(circle at 20% -10%, rgba(0, 170, 255, 0.12), rgba(17, 19, 23, 0) 34%), #111317;
            border: 1px solid rgba(255, 255, 255, 0.09);
            border-radius: 14px;
            box-shadow: none;
            color: #e7ecf1;
            padding: 14px 14px 8px;
          }

          .title {
            font-size: calc(22px * var(--tap-scale));
            letter-spacing: 0.2px;
            font-weight: 700;
            margin: 0 0 10px;
          }

          .panel-title {
            font-size: calc(16px * var(--tap-scale));
            font-weight: 700;
            margin: 0 0 2px;
            color: #eef4ff;
          }

          .row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 14px;
            padding: 12px 0;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
          }

          .row:first-of-type {
            border-top: 0;
            padding-top: 10px;
          }

          .name-line {
            font-size: calc(17px * var(--tap-scale));
            line-height: 1.35;
            margin-bottom: 3px;
          }

          .name {
            color: #f6fbff;
            font-weight: 700;
          }

          .frequency {
            color: #d8dee8;
            font-weight: 600;
          }

          .line {
            font-size: calc(13px * var(--tap-scale));
            line-height: 1.4;
            color: #d5dbe5;
          }

          .due {
            font-size: calc(13px * var(--tap-scale));
            line-height: 1.4;
            color: #d5dbe5;
          }

          .due.overdue {
            color: #ff4b43;
            font-weight: 700;
          }

          .actions {
            display: flex;
            align-items: center;
            gap: 8px;
            white-space: nowrap;
            padding-left: 6px;
          }

          .btn {
            border: 1px solid transparent;
            background: rgba(255, 255, 255, 0.02);
            padding: 6px 9px;
            border-radius: 9px;
            font-size: calc(11px * var(--tap-scale));
            font-weight: 800;
            letter-spacing: 0.08em;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
            transition: opacity 0.2s ease, transform 0.06s ease, background 0.2s ease;
          }

          .btn:active {
            transform: translateY(1px);
          }

          .btn.complete {
            color: #00a6ff;
            border-color: rgba(0, 166, 255, 0.35);
          }

          .btn.complete:hover {
            background: rgba(0, 166, 255, 0.12);
          }

          .btn.reopen {
            color: #f8493f;
            border-color: rgba(248, 73, 63, 0.35);
          }

          .btn.reopen:hover {
            background: rgba(248, 73, 63, 0.12);
          }

          .btn.disabled {
            opacity: 0.35;
            cursor: default;
            background: rgba(255, 255, 255, 0.02);
          }

          .icon {
            font-size: calc(12px * var(--tap-scale));
            line-height: 1;
          }

          .empty {
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            padding: 14px 0 12px;
            color: #aeb8c8;
            font-size: calc(13px * var(--tap-scale));
          }

          .error {
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            color: #ff5f58;
            font-size: calc(12px * var(--tap-scale));
            padding: 12px 0 8px;
          }

          @media (max-width: 900px) {
            .title {
              font-size: calc(18px * var(--tap-scale));
            }
            .name-line {
              font-size: calc(15px * var(--tap-scale));
            }
            .line,
            .due {
              font-size: calc(12px * var(--tap-scale));
            }
            .btn {
              font-size: calc(10px * var(--tap-scale));
            }
            .icon {
              font-size: calc(11px * var(--tap-scale));
            }
            .actions {
              gap: 6px;
            }
          }
        </style>
        ${showHeader ? `<div class="title">Tap</div>` : ""}
        <div class="panel-title">${escapeHtml(this._config.title || DEFAULT_TITLE)}</div>
        ${rows || `<div class="empty">No Tap tasks found yet.</div>`}
        ${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : ""}
      </ha-card>
    `;

    this.shadowRoot.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        const target = event.currentTarget;
        const action = target?.dataset?.action;
        const entityId = target?.dataset?.entityId;
        if (!action || !entityId) return;
        if (action === "complete") {
          this._runAction("complete_task", entityId, `complete:${entityId}`);
        } else if (action === "reopen") {
          this._runAction("reopen_task", entityId, `reopen:${entityId}`);
        }
      });
    });
  }

  async _runAction(service, entityId, busyKey) {
    if (!this._hass) return;
    if (this._busy.has(busyKey)) return;

    this._busy.add(busyKey);
    this._error = "";
    this._render();

    try {
      await this._hass.callService("tap", service, {
        entity_id: entityId,
      });
    } catch (error) {
      this._error = error?.message || "Action failed.";
    } finally {
      this._busy.delete(busyKey);
      this._render();
    }
  }
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function formatDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function frequencyLabel(intervalDays, timesPerDay) {
  if (timesPerDay > 1) return `${timesPerDay} times/day`;
  if (intervalDays === 1) return "every day";
  if (intervalDays === 7) return "every 1 week";
  if (intervalDays === 30) return "every 1 month";
  if (intervalDays === 365) return "every 1 year";
  if (intervalDays % 30 === 0) return `every ${Math.round(intervalDays / 30)} months`;
  if (intervalDays % 7 === 0) return `every ${Math.round(intervalDays / 7)} weeks`;
  return `every ${intervalDays} days`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

if (!customElements.get(CARD_TYPE)) {
  customElements.define(CARD_TYPE, TapTaskPanelCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.find((card) => card.type === CARD_TYPE)) {
  window.customCards.push({
    type: CARD_TYPE,
    name: "Tap Task Panel",
    description: "Task panel for the Tap integration with complete/reopen actions.",
    preview: true,
  });
}

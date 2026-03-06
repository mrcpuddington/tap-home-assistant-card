const CARD_TYPE = "tap-task-panel";
const DEFAULT_TITLE = "Current Tasks";
const DEFAULT_MAX_TASKS = 25;

class TapTaskPanelCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = {
      title: DEFAULT_TITLE,
      max_tasks: DEFAULT_MAX_TASKS,
      show_header: true,
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
                <span class="icon">◯</span>
                <span>${task.isComplete ? "DONE" : "COMPLETE"}</span>
              </button>
              <button class="btn reopen ${reopenDisabled ? "disabled" : ""}" data-action="reopen" data-entity-id="${escapeHtml(task.entityId)}" ${reopenDisabled ? "disabled" : ""}>
                <span class="icon">⌫</span>
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
          }

          ha-card {
            background: #111317;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            box-shadow: none;
            color: #e7ecf1;
            padding: 18px 16px 8px;
          }

          .title {
            font-size: 38px;
            letter-spacing: 0.3px;
            font-weight: 700;
            margin: 2px 0 14px;
          }

          .panel-title {
            font-size: 18px;
            font-weight: 700;
            margin: 0 0 6px;
            color: #eef4ff;
          }

          .row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 18px;
            padding: 16px 0;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
          }

          .row:first-of-type {
            border-top: 0;
            padding-top: 6px;
          }

          .name-line {
            font-size: 21px;
            line-height: 1.35;
            margin-bottom: 6px;
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
            font-size: 18px;
            line-height: 1.35;
            color: #d5dbe5;
          }

          .due {
            font-size: 18px;
            line-height: 1.35;
            color: #d5dbe5;
          }

          .due.overdue {
            color: #ff4b43;
            font-weight: 700;
          }

          .actions {
            display: flex;
            align-items: center;
            gap: 12px;
            white-space: nowrap;
          }

          .btn {
            border: none;
            background: transparent;
            padding: 6px 8px;
            border-radius: 10px;
            font-size: 24px;
            font-weight: 800;
            letter-spacing: 0.03em;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            transition: opacity 0.2s ease, transform 0.06s ease;
          }

          .btn:active {
            transform: translateY(1px);
          }

          .btn.complete {
            color: #00a6ff;
          }

          .btn.reopen {
            color: #f8493f;
          }

          .btn.disabled {
            opacity: 0.35;
            cursor: default;
          }

          .icon {
            font-size: 22px;
            line-height: 1;
          }

          .empty {
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            padding: 14px 0 12px;
            color: #aeb8c8;
            font-size: 16px;
          }

          .error {
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            color: #ff5f58;
            font-size: 14px;
            padding: 12px 0 8px;
          }

          @media (max-width: 900px) {
            .title {
              font-size: 28px;
            }
            .name-line {
              font-size: 18px;
            }
            .line,
            .due {
              font-size: 15px;
            }
            .btn {
              font-size: 14px;
            }
            .icon {
              font-size: 16px;
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

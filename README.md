# Tap Task Panel Card

Custom Lovelace card for Home Assistant that renders Tap tasks in a compact panel with quick actions.

## Features

- Dark task panel layout inspired by terminal/system dashboards.
- Pulls tasks from Tap task sensors (`sensor.tap_task_*`).
- Highlights overdue tasks in red.
- One-click actions:
  - `tap.complete_task`
  - `tap.reopen_task`
- Works with the Tap integration service update that supports entity targeting.

## Install (Manual)

1. Copy `tap-task-panel.js` to your Home Assistant `www` folder:
   - `/config/www/tap-task-panel.js`
2. In Home Assistant, go to:
   - `Settings -> Dashboards -> Resources`
3. Add resource:
   - URL: `/local/tap-task-panel.js`
   - Type: `JavaScript Module`
4. Refresh browser.

## Card Configuration

```yaml
type: custom:tap-task-panel
title: Current Tasks
show_header: true
max_tasks: 20
font_scale: 1.0
```

### Optional: Choose Specific Entities

```yaml
type: custom:tap-task-panel
title: House Tasks
font_scale: 0.9
entities:
  - sensor.tap_task_clean_gutters
  - sensor.tap_task_replace_air_filter
```

## Requirements

- Tap integration installed and connected.
- Tap task sensors available.
- Tap integration version that supports service `entity_id` resolution for:
  - `tap.complete_task`
  - `tap.reopen_task`

export type KbSeedArticle = {
  title: string
  slug: string
  category: string
  tags: string[]
  body: string
}

export const STRATFLOW_KB_ARTICLES: KbSeedArticle[] = [
  {
    title: 'StratFlow — Getting Started (Projects, Flow Hub, and Navigation)',
    slug: 'stratflow-guide',
    category: 'StratFlow',
    tags: ['stratflow', 'projects', 'flow hub', 'board', 'list', 'sprint', 'timeline', 'reports', 'activity'],
    body: `# StratFlow — Getting Started (Projects, Flow Hub, and Navigation)

StratFlow is BOAZ’s strategic delivery workspace. It combines **project planning**, **agile execution**, and **portfolio visibility** into one Flow Hub.

---

## ✅ What you can do in StratFlow

- Create projects with a ready-to-use workflow (Scrum / Kanban / Traditional / Hybrid)
- Track work as **Epics, Stories, Tasks, Defects** (and optional **Spikes**)
- Plan issues into sprints and manage sprint capacity
- Visualize delivery through Board, List, Sprint, Timeline, Reports, and Activity views
- Track dependencies (Blocked / Blocks) and log time (billable vs non-billable)

---

## ✅ Where to find it

- Projects home: \`/apps/stratflow\`
- A project’s Flow Hub: \`/apps/stratflow/<projectId>\`

---

## The Flow Hub (views)

### Board
Use the Board for day-to-day execution and WIP visibility.
- Drag-and-drop issues across columns
- Filter each column by issue type
- See a **Blocked** badge when an issue is blocked by another issue

### List
Use List view for power filtering and bulk operations.
- Saved filters (presets + custom)
- Bulk edit (assignee, sprint, labels, components)
- Export issues to CSV

### Sprint
Use Sprint view to plan and run delivery.
- Maintain backlog vs active sprint
- Track sprint progress (planned vs done points)
- Edit sprint name, goal, dates, and capacity points
- Close sprint (governance checks apply)

### Timeline
Use Timeline for roadmap visibility.
- Epic roadmap by phase and target dates
- Sprint timeline bars (when start/end dates exist)
- Drill into blocked items from an Epic card

### Reports
Use Reports to measure throughput, cycle time (approx), WIP health, and time logged.
- WIP by column
- WIP limits (per column)
- Blocked metrics
- Time rollups and time CSV export

### Activity
Use Activity to see changes as a feed.
- Issue updates/moves/comments/links
- Sprint lifecycle events
- Bulk updates and time events

---

## Recommended learning path (self-service)

1. Projects + templates: \`/apps/crm/support/kb/stratflow-projects\`
2. Issues (Epics/Stories/Tasks/Defects): \`/apps/crm/support/kb/stratflow-issues\`
3. Sprint planning: \`/apps/crm/support/kb/stratflow-sprints\`
4. Dependencies (Blocked/Blocks): \`/apps/crm/support/kb/stratflow-dependencies\`
5. Time tracking: \`/apps/crm/support/kb/stratflow-time-tracking\`
6. Reports: \`/apps/crm/support/kb/stratflow-reports\`

---

Need help? In StratFlow, click the **?** help icon for the page you’re on.
`,
  },
  {
    title: 'StratFlow — Projects & Templates (Scrum, Kanban, Traditional, Hybrid)',
    slug: 'stratflow-projects',
    category: 'StratFlow',
    tags: ['stratflow', 'projects', 'templates', 'scrum', 'kanban', 'traditional', 'hybrid'],
    body: `# StratFlow — Projects & Templates (Scrum, Kanban, Traditional, Hybrid)

Projects are the top-level container in StratFlow. When you create a project, StratFlow generates a starter workflow (boards + columns) based on the template you choose.

---

## Create a project

1. Go to \`/apps/stratflow\`
2. Click **New project**
3. Choose a template
4. Enter name + key
5. Create

---

## Templates (what they create)

### Scrum
Best for sprint-based delivery.
- **Backlog** board (Backlog column)
- **Sprint Board** (To Do / In Progress / In Review / Done)

### Kanban
Best for continuous flow work.
- **Board** (To Do / In Progress / In Review / Done)

### Traditional
Best for milestone-based delivery.
- **Milestones** board (Not Started / In Progress / Blocked / Complete)

### Hybrid
Best when you need both backlog and flow.
- **Board** (To Do / In Progress / In Review / Done)
- **Backlog**

---

## Project key (important)

The project key is used for quick identification (similar to Jira project keys).
- Keep it short and stable (2–12 characters)

---

Need help? Click the **?** icon in StratFlow projects.
`,
  },
  {
    title: 'StratFlow — Issues (Epics, Stories, Tasks, Defects, Spikes)',
    slug: 'stratflow-issues',
    category: 'StratFlow',
    tags: ['stratflow', 'issues', 'epic', 'story', 'task', 'defect', 'spike', 'priority', 'labels', 'components'],
    body: `# StratFlow — Issues (Epics, Stories, Tasks, Defects, Spikes)

Issues are the units of work in StratFlow.

---

## Issue types (when to use each)

- **Epic**: a large initiative spanning many issues
- **Story**: a user-facing increment of value (often sprint-planned)
- **Task**: a unit of work (implementation / ops / internal)
- **Defect**: a bug or production issue
- **Spike**: research/investigation (optional)

---

## Creating issues

### Fast-create (Board)
1. In a column, type a title in “Add an issue…”
2. Press Enter (or click +)
3. The issue is created in that column and inherits that column’s status

### Full edit (Issue Focus)
Click an issue card to open **Issue Focus** and edit fields:
- Summary, description, acceptance criteria
- Priority
- Sprint
- Epic link (disabled for Epics)
- Story points
- Assignee (project members only)
- Labels and Components

---

## Governance rules (quality gates)

To move issues to **Done**, the API enforces:
- **Story** must have Acceptance Criteria
- **Defect** must have a Description

If a rule blocks the move, you’ll see an error and the move is prevented.

---

## Keyboard shortcuts (Issue Focus)

- **Esc**: close Issue Focus
- **F**: toggle full window
- **Ctrl/Cmd + Enter**: save

---

Need help? Click the **?** icon in Issue Focus or the Flow Hub.
`,
  },
  {
    title: 'StratFlow — Sprint Planning (Backlog, Active Sprint, Capacity, Close Sprint)',
    slug: 'stratflow-sprints',
    category: 'StratFlow',
    tags: ['stratflow', 'sprint', 'planning', 'capacity', 'story points', 'close sprint'],
    body: `# StratFlow — Sprint Planning (Backlog, Active Sprint, Capacity, Close Sprint)

Sprint view helps you plan and execute sprint-based delivery.

---

## Key ideas

- **Backlog**: unplanned work (no sprint)
- **Planned sprint**: issues assigned to a sprint
- **Active sprint**: the sprint currently being executed (one per project)
- **Capacity points**: optional, used for utilization reporting

---

## Plan a sprint

1. Open a project → **Sprint** tab
2. Create a sprint (name, optional goal)
3. Set sprint active (if needed)
4. Assign issues into the sprint
5. (Optional) set sprint start/end dates + capacity points

---

## Sprint details

In Sprint view you can edit:
- Name and goal
- Start and end dates
- Capacity points

You also get a progress summary:
- Planned vs Done points
- Capacity utilization

---

## Close sprint (governance)

Only the **project owner** can close a sprint.

When closing:
- If there is open work, the system blocks close unless you use **Force close**
- Closing is logged in Activity

---

Need help? Click the **?** icon on Sprint view.
`,
  },
  {
    title: 'StratFlow — Dependencies (Blocked / Blocks / Relates to)',
    slug: 'stratflow-dependencies',
    category: 'StratFlow',
    tags: ['stratflow', 'dependencies', 'blocked', 'blocks', 'relates_to'],
    body: `# StratFlow — Dependencies (Blocked / Blocks / Relates to)

Dependencies explain why work can’t proceed and make project risk visible.

---

## Link types

- **Blocked by**: this issue cannot move forward until another issue is done
- **Blocks**: this issue is preventing another issue from moving forward
- **Relates to**: informational relationship

---

## How “Blocked” works in StratFlow

An issue is considered **Blocked** if it has at least one **Blocked by** link.

Blocked issues:
- show a **Blocked** badge on cards
- can be filtered in Board/List/Sprint views
- are highlighted in Reports and epic rollups

---

## Add a dependency

1. Open an issue → Issue Focus
2. In **Dependencies**, choose link type (Blocked by / Blocks / Relates to)
3. Select the other issue
4. Click **Add**

---

## Unblock

If an issue is blocked, Issue Focus shows a **Blocked** banner and an **Unblock** action that removes all “Blocked by” links (use when the dependency is resolved).

---

Need help? Click the **?** icon on the Board or in Issue Focus.
`,
  },
  {
    title: 'StratFlow — Time Tracking (Billable vs Non‑billable) + Rollups',
    slug: 'stratflow-time-tracking',
    category: 'StratFlow',
    tags: ['stratflow', 'time tracking', 'billable', 'reports'],
    body: `# StratFlow — Time Tracking (Billable vs Non‑billable) + Rollups

Time entries help teams understand effort and (optionally) track billable delivery.

---

## Log time

1. Open an issue → Issue Focus
2. In **Time**, set:
   - Work date
   - Hours
   - Billable toggle
   - Optional note
3. Click **Log time**

Notes:
- Time is stored as **minutes**.
- Only the entry author (or project owner) can edit/delete a time entry.

---

## Reports rollups

In **Reports**, StratFlow shows:
- Total time logged
- Billable vs non-billable totals
- Time by person
- Top issues by time
- Export time entries to CSV

---

## Best practices

- Use billable only when your organization has a clear billing policy.
- Write notes that explain *what changed* (useful in audits).
- Review the “Top issues (time)” list weekly to spot risk or scope creep.

---

Need help? Click the **?** icon in Reports.
`,
  },
  {
    title: 'StratFlow — Reports (WIP, Throughput, Cycle Time, Work Health)',
    slug: 'stratflow-reports',
    category: 'StratFlow',
    tags: ['stratflow', 'reports', 'wip', 'throughput', 'cycle time', 'health', 'csv'],
    body: `# StratFlow — Reports (WIP, Throughput, Cycle Time, Work Health)

Reports provide a high-level view of delivery health and flow.

---

## Metrics included

- **Total / Done / WIP / Backlog**
- **Throughput** (7d / 14d / 30d)
- **Cycle time (approx)**: createdAt → updatedAt when status is Done
- **Blocked** count + oldest blocked age
- **WIP by column**
- **WIP limits** table
- **Time rollups** (total + billable)

---

## WIP limits (governance)

You can set WIP limits per column. When the limit is reached:
- Creating or moving issues into that column is prevented by the API

---

## Export

Reports view supports:
- Export of headline metrics CSV
- Export of time entries CSV
- Export of list issues CSV (from List view)

---

Need help? Click the **?** icon on Reports.
`,
  },
]


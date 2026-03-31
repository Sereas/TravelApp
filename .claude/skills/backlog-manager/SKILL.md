---
name: backlog
description: Manage project backlog items stored under backlog/front and backlog/back. Use for adding a backlog item, reviewing backlog items, or implementing a backlog item from the backlog files.
disable-model-invocation: true
---

You are the backlog manager for this repository.

The project backlog structure is:

- `backlog/front/backlog.md`
- `backlog/front/screens/`
- `backlog/back/backlog.md`
- `backlog/back/screens/`

Use this skill when the user asks to:
- add an item to the backlog
- refine or clarify a backlog item
- list or read backlog items
- execute or implement a backlog item from backlog

The user request is:

$ARGUMENTS

## High-level behavior

You must first determine which mode applies:

1. **ADD MODE**
   Trigger when the user wants to add a new backlog item.
2. **READ MODE**
   Trigger when the user wants to inspect, summarize, list, or find items in backlog.
3. **EXECUTE MODE**
   Trigger when the user wants you to implement, fix, or work on a specific backlog item.

Do not skip required clarification when the item is underspecified.

---

## Repository conventions

### Backlog locations
- Frontend items live in `backlog/front/backlog.md`
- Backend items live in `backlog/back/backlog.md`

### Screenshots / artifacts
- Frontend screenshots and visual artifacts live in `backlog/front/screens/`
- Backend screenshots or technical artifacts live in `backlog/back/screens/`

If the user provides a screenshot or wants a screenshot captured/used, link it from the correct folder in the item.

### Item IDs
Use these prefixes:
- Frontend: `FRONT-###`
- Backend: `BACK-###`

Always increment from the highest existing ID in the relevant backlog file.

---

## ADD MODE

When adding a new item, follow this sequence strictly.

### Step 1 — Determine front vs back
Determine whether the item belongs to frontend or backend.

Use this rule:
- UI, layout, visual bugs, interactions, pages, styling, client UX, rendering issues => **front**
- APIs, DB, auth logic, services, integrations, background jobs, server validation, business logic => **back**

If mixed or unclear, ask the user which side should own it.
If the issue spans both sides, ask whether to:
- create one primary item with cross-references, or
- create two separate items

Default to two items if frontend and backend work are independently implementable.

### Step 2 — Determine fix vs feature
Classify as one of:
- `bugfix`
- `feature`
- `improvement`
- `refactor`

If not clear, ask the user.

### Step 3 — Capture missing requirements
Before writing the item, make sure you have enough detail.

You must confirm or ask for:
- concise title
- expected behavior
- current behavior
- scope / boundaries
- artifacts available (screenshots, logs, API examples, error text)
- relevant files/components/endpoints if known
- acceptance criteria

For frontend items, if expected behavior is vague, ask the user to describe:
- what should happen
- where it happens
- what is wrong today
- what “done” looks like visually

For backend items, if expected behavior is vague, ask the user to describe:
- input
- output
- validation/business rule
- failure mode
- persistence/integration impact

Do not create a backlog item until the core expected behavior is sufficiently clear.

### Step 4 — Handle artifacts
If the user provided or referenced artifacts:
- identify whether they already exist in the repo
- if not yet stored in the proper backlog folder, create or move them into:
  - `backlog/front/screens/` or
  - `backlog/back/screens/`

Use descriptive filenames in kebab-case.

If there are multiple artifacts, store all of them and reference each one.

### Step 5 — Write the item
Append the new item to the correct backlog file using the exact template from `templates/backlog_item.md`.

Populate every field.
If a field is unknown, write `Unknown` rather than leaving it blank.

### Step 6 — Confirm
After writing the item, report:
- new item ID
- backlog file used
- linked artifacts
- whether any assumptions were made

---

## READ MODE

When reading backlog items:

1. Inspect both backlog files unless the user clearly scoped the request.
2. If the user asks to find a relevant item, match by:
   - ID
   - title
   - keywords
   - related artifacts
3. Return:
   - item ID
   - title
   - type
   - status
   - one-paragraph summary
   - referenced artifacts
4. If there are multiple likely matches, present the best matches and ask which one to use only if needed.

---

## EXECUTE MODE

When asked to execute a backlog item, follow this sequence.

### Step 1 — Resolve the item
Find the item by:
- exact ID, or
- strong title/keyword match

Read the full item from backlog.

If the request is ambiguous, identify the most likely item and say which one you are using.

### Step 2 — Load all referenced context
You must inspect:
- the backlog item itself
- referenced screenshots/artifacts
- referenced files/modules if listed
- nearby implementation files needed to understand the change

For frontend items, study screenshots carefully and use them as implementation context.
For backend items, inspect relevant code paths, schemas, handlers, and tests.

### Step 3 — Restate the task internally
Before editing, extract:
- the problem
- the intended behavior
- the acceptance criteria
- any constraints or non-goals

### Step 4 — Implement minimally and cleanly
Make the smallest high-quality change that satisfies the item.

Prefer:
- consistency with existing patterns
- no unnecessary refactors
- clear naming
- preserving existing behavior outside scope

### Step 5 — Validate
After implementation:
- run focused checks/tests if available
- verify acceptance criteria against the backlog item
- verify no obvious regressions

### Step 6 — Update backlog item
Update the item’s status field:
- `todo`
- `in_progress`
- `done`
- `blocked`

When work is completed, also add an `Implementation Notes` section entry summarizing:
- what changed
- files touched
- validation performed
- follow-ups if any

If blocked, record the blocker clearly.

---

## Rules for asking questions

Ask the user questions only when missing information would materially reduce implementation quality.

You should ask when:
- front vs back is unclear
- expected behavior is missing or contradictory
- item type is unclear
- screenshots/artifacts are referenced but not available
- multiple backlog items match and selecting the wrong one is risky

Do not ask unnecessary questions when the request is already actionable.

---

## Backlog authoring standards

Every item must be atomic and executable.
A good item:
- covers one change
- has explicit expected behavior
- has concrete acceptance criteria
- references artifacts by file path
- is scoped narrowly enough to complete in one focused implementation pass

If the user gives a broad request, split it into multiple backlog items.

---

## Output format when adding an item

Use this response shape:

- `Created: <ID>`
- `Area: front|back`
- `Type: bugfix|feature|improvement|refactor`
- `File: <backlog path>`
- `Artifacts: <artifact paths or none>`
- `Summary: <one paragraph>`

## Output format when executing an item

Use this response shape:

- `Item: <ID>`
- `Status: done|blocked|in_progress`
- `Files changed: <list>`
- `Validation: <checks run>`
- `Notes: <brief summary>`

---

## Important constraints

- Never invent screenshot paths. Verify they exist.
- Never create a backlog item without expected behavior.
- Never execute against a vague item without first clarifying it or updating the backlog item.
- When a request is mixed front/back, prefer splitting into two linked items.
- Preserve backlog readability. Keep item formatting consistent.
- Append new items; do not rewrite the whole file unless necessary.
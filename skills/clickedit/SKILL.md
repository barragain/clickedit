---
name: clickedit
description: Lets the user edit their running site in the browser (text, comments, circles and arrows, removed or moved blocks, style tweaks) while you apply each saved change in the source. Use when the user says "open clickedit", "open clickedit on my site", "edit my site with clickedit", "let me edit the page", or when a clickedit save or publish request arrives.
---

# clickedit

The user clicks their running dev site to change it. Each Save writes a readable list of changes to `.clickedit/<page>-<time>.md` in the project. You apply them in the source, mark them applied, and wait for the next one. Everything runs on this computer with Node 18 or newer. Nothing to install.

## Find this skill's folder

The tool's code sits next to this file, in `scripts/`. Every command below is `node "<skill folder>/scripts/clickedit.mjs" ...`, run from the project's root folder.

- Claude Code: the folder is the "Base directory for this skill" shown when this skill loads (`${CLAUDE_SKILL_DIR}`).
- Codex and other agents: the folder that holds this SKILL.md, as listed with the skill.
- Not sure: look for `skills/clickedit/scripts/clickedit.mjs` under the project's `.claude/`, `.agents/` or other agent folder, then under your home folder (`~/.claude/skills/`, `~/.agents/skills/`, `~/.config/agents/skills/`).

Quote the path, since it can contain spaces. Below, `clickedit` is short for `node "<skill folder>/scripts/clickedit.mjs"`.

## Start

1. Find the dev site's address. If a dev server is already running, use its address, but first check it serves this project (its page matches this project's source); another project's server on the same port does not count. If not, read `package.json` (or the project's README or config) for the dev command, start it in the background, and take the address it prints (for example `http://localhost:3000`). Check the address answers before going on. If you cannot tell how the project runs, ask the user for the address.
2. In the background, run `clickedit --proxy <dev address>` and keep it running. It prints the address the user opens (default `http://localhost:4300`).
   - If it says a port is in use, clickedit may already be running: open `http://localhost:4399/status`. Reuse that session only if its `out` is this project's `.clickedit` folder. Otherwise it belongs to another project: run with free ports instead, for example `--proxy-port 4302 --port 4398`.
   - If the project already loads `http://localhost:4399/clickedit.js` in dev, run `clickedit` without `--proxy` and the user opens the dev site itself.
3. Make sure `.clickedit/` is in `.gitignore`.
4. Tell the user the address to open, and that they click any words to type, right-click to comment, and press Save when done.
5. Start the loop below right away.

## The loop

1. In the background, run `clickedit --wait`. It exits when the user saves or publishes, and prints the file.
2. A line starting with `SAVED` means a save. Read the printed list and apply every numbered change in the source:
   - `TEXT`: replace the `before` words with the `after` words. An `html after` line carries bold or italic.
   - `COMMENT`: do what the note asks for that element.
   - `CIRCLE around` and `ARROW from X to Y`: marks the user drew. Read them with their note, if any.
   - `REMOVE`, `MOVE`, `STYLE`: remove the block, move it, or set the CSS value shown.
   - The path in backticks (tags, classes, ids) and the quoted words find the element in the source. The URL is the page as the user saw it; with the proxy it shows the proxy's port, the path is the same.
   - A save made in phone view is for the mobile layout: change the mobile styles only.
3. Run `clickedit --applied`. It marks saves applied up to the one the wait printed, and the badge in the page turns green. If the user saved again while you worked, it says a newer save is still waiting.
4. Start `clickedit --wait` again in the background. If a save is still waiting, it prints it at once; otherwise it waits for the next one. Keep the loop going until the user says they are done; then stop the proxy and the dev server you started.

If your agent is not woken when a background command finishes (Codex, for example), use `clickedit --next` everywhere this skill says `clickedit --wait`, and never leave a `--wait` running. Tell the user to press Save and then say "saved" (or "published") in the chat. When they do, run `clickedit --next`: it prints the oldest save not applied yet and exits. Apply it, run `clickedit --applied`, and run `clickedit --next` again until it says nothing is waiting, so every save is handled. The proxy and the dev server must keep running between messages, so start them in a way that outlives the command (a background or detached process).

## Publish

A line starting with `PUBLISH` means the user clicked Publish. The user has already approved it, so go ahead without asking again.

1. Apply anything still pending and run `clickedit --applied`.
2. Deploy the way this project deploys. Look for it in this order: a deploy script in `package.json` (`deploy`, `release`, `publish`), the project's README or notes, a CI workflow that deploys on push (then commit and push). If you find none, ask the user how the site goes live.
3. Open the live page to check the changes are there. If the deploy has no live address to check, say so.
4. Tell the user what went live, then start `clickedit --wait` again.

Never commit `.clickedit/`.

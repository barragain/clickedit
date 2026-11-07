---
name: clickedit
description: Apply page edits the user makes in the browser with clickedit. Use when the user wants to edit a page visually, says "clickedit", "let me edit the page", "open the editor", or when a clickedit save or publish request arrives.
---

# clickedit

The user edits the running dev site in the browser (text, comments, circles and arrows, removed or moved blocks, style tweaks). Each Save writes a readable list of changes to `.clickedit/<page>-<time>.md`. You apply them in the source.

## Start

1. Start the project's dev server if it is not running, and note its address (for example `http://localhost:3000`).
2. In the background, keep this running: `npx clickedit --proxy <dev address>`. It prints the address the user opens (default `http://localhost:4300`).
   - If the project already loads `http://localhost:4399/clickedit.js` in dev, run `npx clickedit` without `--proxy` and the user opens the dev site itself.
3. Make sure `.clickedit/` is in `.gitignore`.
4. Tell the user which address to open.

## The loop

1. In the background, run `npx clickedit --wait`. It exits when the user saves or publishes, and prints the file.
2. A line starting with `SAVED` means a save. Read the printed list and apply every numbered change in the source:
   - `TEXT`: replace the `before` words with the `after` words. An `html after` line carries bold or italic.
   - `COMMENT`: do what the note asks for that element.
   - `CIRCLE around` and `ARROW from X to Y`: marks the user drew. Read them with their note, if any.
   - `REMOVE`, `MOVE`, `STYLE`: remove the block, move it, or set the CSS value shown.
   - The path in backticks (tags, classes, ids) and the quoted words find the element in the source. The URL is the page as the user saw it; with the proxy it shows the proxy's port, the path is the same.
   - A save made in phone view is for the mobile layout: change the mobile styles only.
3. Run `npx clickedit --applied`. The badge in the page turns green.
4. Start `npx clickedit --wait` again.

## Publish

A line starting with `PUBLISH` means the user clicked Publish. Apply anything still pending, run `npx clickedit --applied`, then deploy the way this project deploys (commit and push first if that is how it ships). Open the live page to check the changes are there, then tell the user what went live.

Never commit `.clickedit/`.

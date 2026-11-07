# clickedit (for Codex and other coding agents)

Paste this section into your project's AGENTS.md.

## Page edits with clickedit

The user edits the running dev site in the browser. Each Save writes a list of changes to `.clickedit/<page>-<time>.md`. Apply them in the source.

- Start: run the dev server, then keep `npx github:barragain/clickedit --proxy <dev address>` running in the background and tell the user to open the address it prints. Add `.clickedit/` to `.gitignore`.
- Wait: run `npx github:barragain/clickedit --wait` in the background. It exits on the next save or publish request and prints it.
- On `SAVED`: apply every numbered change (`TEXT`, `COMMENT`, `CIRCLE`, `ARROW`, `REMOVE`, `MOVE`, `STYLE`). The path in backticks and the quoted words find the element. Phone view saves are for the mobile layout only. Then run `npx github:barragain/clickedit --applied` (it marks saves applied up to the one the wait printed) and start `npx github:barragain/clickedit --wait` again. If the user saved again meanwhile, that wait prints the newer save at once.
- On `PUBLISH`: apply anything pending, run `npx github:barragain/clickedit --applied`, deploy the way this project deploys, open the live page to check it, and report what went live.
- Never commit `.clickedit/`.

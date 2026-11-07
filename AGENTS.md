# clickedit (for Codex and other coding agents)

Paste this section into your project's AGENTS.md.

## Page edits with clickedit

The user edits the running dev site in the browser. Each Save writes a list of changes to `.clickedit/<page>-<time>.md`. Apply them in the source.

- Start: run the dev server (if one already answers, check it serves this project), then keep `npx github:barragain/clickedit --proxy <dev address>` running in the background and tell the user to open the address it prints. If a port is in use, `http://localhost:4399/status` shows whose clickedit it is (`out`); if it is another project's, use `--proxy-port` and `--port` with free ports. Add `.clickedit/` to `.gitignore`.
- Wait: run `npx github:barragain/clickedit --wait` in the background. It exits on the next save or publish request and prints it.
- On `SAVED`: apply every numbered change (`TEXT`, `COMMENT`, `CIRCLE`, `ARROW`, `REMOVE`, `MOVE`, `STYLE`). The path in backticks and the quoted words find the element. Phone view saves are for the mobile layout only. Then run `npx github:barragain/clickedit --applied` (it marks saves applied up to the one the wait printed) and start `npx github:barragain/clickedit --wait` again. If the user saved again meanwhile, that wait prints the newer save at once.
- On `PUBLISH`: the user already approved it. Apply anything pending, run `npx github:barragain/clickedit --applied`, then deploy the way this project deploys (a `deploy` script in `package.json`, the README, or a CI workflow that deploys on push; ask the user if there is none). Open the live page to check it, report what went live, and start the wait again.
- Agents that are not woken when a background command ends (Codex): keep the proxy and dev server running as detached processes, ask the user to say "saved" after each Save, then run `npx github:barragain/clickedit --next` (prints the oldest save not applied yet, or says nothing is waiting), apply it, run `--applied`, and repeat `--next` until nothing is waiting.
- Never commit `.clickedit/`.

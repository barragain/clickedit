# clickedit

![Edit a headline, leave a comment, save, and the badge turns green once your AI applies it](media/hero.gif)

**Click your local site to change it. Your AI coding agent makes the same changes in the code.**

```sh
npx skills add barragain/clickedit
```

Then tell your AI "open clickedit on my site". It starts clickedit and gives you an address. Open it, click any words and type. Press Save when you are done. Works with Claude Code, Codex and other coding agents, on any framework that runs a local dev server.

---

## How does my AI get the changes?

Every Save writes a short text file to `.clickedit/` in your project. Your AI reads it and edits the source.

1. Your AI starts your dev server and clickedit, and tells you the address to open.
2. Your AI runs clickedit's wait in the background. It waits for your next Save.
3. You edit the page and press Save.
4. The wait ends and prints the list of changes. Your AI applies each one in the code.
5. Your AI marks the save applied. The badge in the page turns green.
6. Your AI starts the wait again, ready for the next round.

A save looks like this:

```md
# Edits for http://localhost:4300/
Saved 2026-11-07T13:51:07.361Z, viewport 1280x800

1. TEXT at `section.hero > div.hero-copy > h1` ("Plan the week in ten minutes")
   before: "Plan the week in ten minutes"
   after:  "Plan the week in five minutes"
2. COMMENT on `section.hero > div.hero-copy > p.lead` ("Harbor puts every task..."): Shorter, please
3. CIRCLE around `article.plan.plan-main > p.price` ("$6 per person a month"): Show the yearly price too
```

Circles and arrows are saved as the elements they cover, so your AI reads them as text. It never needs to look at a picture.

### Set up your AI

```sh
npx skills add barragain/clickedit
```

Run it in your project. It installs the clickedit skill, with the tool inside it, for Claude Code, Codex and the other agents you pick. Add `-g` to have it in every project. The installer needs Node 22.20 or newer; clickedit itself runs on Node 18. Then say "open clickedit on my site" or "edit my site with clickedit".

Without the installer: run `npx github:barragain/clickedit --proxy <your dev address>` yourself, and give your AI the loop. For Codex and other agents, paste the section in [`AGENTS.md`](AGENTS.md) into your project's `AGENTS.md`.

Add `.clickedit/` to your `.gitignore`. Saves are notes for your AI, not code.

---

## Edit text

![Double-click a word in the headline and type a new one, then retype a button label](media/edit-text.gif)

Click any words to type over them. Buttons and links work too. Ctrl+B and Ctrl+I make words bold or italic. Changed text gets a yellow tint until your AI applies it.

## Comment

![Right-click a card, type a comment, and a pin stays on the page](media/comment.gif)

Right-click anything and write what you want changed. The comment stays on the page as a pin. Click the pin to edit or delete it.

## Draw circles and arrows

![Circle a price with the Draw tool, then drag an arrow from one plan to the other](media/draw.gif)

Press the pen button, or hold Shift, and drag. A loop becomes "CIRCLE around" the elements inside it. A straight stroke becomes "ARROW from X to Y". Add a note to either one if you like.

## Drag to reorder

![Select the last step of a list and drag it to the top](media/drag.gif)

Select a block and drag it among its neighbours. The bar also has buttons to move the selection up or down, remove it, or select the bigger block around it.

## Style tweaks

![Select a card, open the style panel, and raise its padding and text size](media/style.gif)

Select a block and open the style panel. Change padding, margin, text size, text colour and background. The page updates as you go, and the save lists each value before and after.

## Phone view

![Open the phone view and edit the headline at phone width](media/phone.gif)

The phone button shows the page in a 390px frame. Everything works inside it. Saves made there are marked as edits for the mobile layout.

## Publish

![After a save, Publish asks first because the AI has not applied the save yet](media/publish.gif)

Publish asks your AI to apply every pending save and deploy the site. It covers every page you saved since the last publish. It warns you first about changes you have not saved and saves your AI has not applied yet.

### Also in the toolbar

The toolbar takes its font and main colour from your site, and picks light or dark to match. Undo steps back one change at a time. Unsaved edits survive a reload or a closed tab. Pause (or Esc) lets you use the page like a visitor.

MP4 versions of every clip are in [`media/`](media).

---

## Keyboard and mouse

| Action | Does |
|---|---|
| Click | Edit the words, or select the block |
| Ctrl+click (Cmd+click on Mac) | Use the button or link like a visitor |
| Right-click | Select and comment |
| Shift+drag | Draw a circle or an arrow |
| Drag a selected block | Move it among its neighbours |
| Ctrl+B, Ctrl+I | Bold, italic, while typing |
| Ctrl+Enter | Add the comment you are typing |
| Esc | Stop typing, then clear the selection, then turn off a tool, then pause |

## Options

```sh
npx github:barragain/clickedit --proxy http://localhost:3000   # serve your dev site with the toolbar added
npx github:barragain/clickedit                                 # save server only, for the script tag
npx github:barragain/clickedit --wait                          # wait for the next save or publish request, print it, exit
npx github:barragain/clickedit --applied                       # mark every save as applied
```

| Option | Default |
|---|---|
| `--proxy <url>` | none |
| `--proxy-port <n>` | 4300 |
| `--port <n>` (save server) | 4399 |
| `--out <dir>` | `.clickedit` |

### Script tag instead of the proxy

If you would rather open your dev site directly, run `npx github:barragain/clickedit` and add this tag to your layout, in development only:

```html
<script src="http://localhost:4399/clickedit.js" defer></script>
```

Put it behind your framework's development check, such as `import.meta.env.DEV` or `process.env.NODE_ENV === 'development'`, so it never ships to production.

---

## FAQ

**Which frameworks does it work with?**
Any site with a local dev server, whatever framework or language builds it, plain HTML included. The proxy adds the toolbar to every HTML page and passes everything else through as it is. Hot reload keeps working, because websockets go straight to your dev server.

**Which AI agents?**
Claude Code, Codex and other coding agents. Anything that can run a command in the background and read a file can follow the loop.

**Is anything sent online?**
No. clickedit runs on your computer and writes files to your project folder. It makes no outside requests and has no analytics. The servers listen on 127.0.0.1 and only accept saves from local pages.

**Does it change my code?**
No. clickedit only writes to `.clickedit/`. Your AI makes the code changes, so you see them in your usual diff.

**My dev site runs on a custom hostname.**
Use the proxy. The page then loads from `localhost`, which clickedit accepts.

**Does it need any packages?**
No. It runs on Node 18 or newer with no dependencies.

---

## Contributing

Issues and pull requests are welcome.

```sh
git clone https://github.com/barragain/clickedit
cd clickedit
npm test                                         # node:test, no install needed
npm run demo                                     # demo site on http://localhost:3000
node skills/clickedit/scripts/clickedit.mjs --proxy http://localhost:3000
```

The skill is [`skills/clickedit/SKILL.md`](skills/clickedit/SKILL.md) and the tool lives next to it in `scripts/`. The toolbar is one file, [`clickedit.js`](skills/clickedit/scripts/clickedit.js). The save server is [`server.mjs`](skills/clickedit/scripts/server.mjs) and the proxy is [`proxy.mjs`](skills/clickedit/scripts/proxy.mjs). `npm run media` records the clips in this README. It needs Playwright and ffmpeg, which are not dependencies.

## License

[MIT](LICENSE)

---

Made by [Matias Barragan](https://barragan.com.py) from [The Kit Room](https://thekitroom.co), kits your AI runs to do the work for you.

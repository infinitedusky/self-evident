---
name: docs-pages
description: How pages of this docs site are written - the two sections, what a page holds, and how diagrams are drawn. Use before writing or changing any page under docs/.
---

# Writing pages of these docs

This file is this workbench's own standard for its docs. Change it to say how
you want your docs written; the docs agent reads it before it writes.

## The two sections

- `docs/system/`, **How the system works**: what is true now. One page per
  subject, named for the subject. Present tense. No history, no plans.
- `docs/work/`, **Our work**: what we built and why, for people who were not
  there. One page per task, written when the task is closed, set out as
  [task-page.md](task-page.md) says. Frontmatter `task` and `date`
  (YYYY-MM-DD). Wherever the page names a part of the system it links that
  part's page in How the system works.
- A project is a folder of `docs/work/`: its `index.md` is the project's page
  (frontmatter `project`, what the project is for, then `## Tasks` with a
  linked line per task), and its tasks' pages are beside it. A task on its own
  sits in `docs/work/` itself.

The sidebars are built from the pages: never edit `docs/.vitepress/`. Each
folder's `index.md` lists its pages, a linked line each.

## A page

- Starts with `# ` and its subject, then one short paragraph a reader can stop
  after.
- Plain words and short paragraphs. The surprising thing first.
- Says only what was read in the code. Where something could not be checked,
  the page says so.
- Links to other pages from the site's root, without `.md`: `/system/sign-in`.
- Never a word in angle brackets outside a code span or a fenced block (the
  site reads it as HTML and the page breaks). Keep a code span on one line.

## Diagrams

Write a fenced block with the language `mermaid`, and a sentence before it
saying what it shows. Use one where a flow, a sequence between parts or a set of
parts is easier seen than read; not as decoration.

- `flowchart` and `sequenceDiagram` are drawn by Bonkei as a scene the reader
  can view flat, isometric or in 3D. Keep them small: about a dozen nodes at
  most, short labels. Split a bigger one in two.
- One diagram's own settings go after `mermaid`, for example
  `{height=600 mode=flat}`. `mode` is `flat`, `iso` (the default) or `3d`.
- Any other Mermaid diagram type is drawn by Mermaid, with a full-screen
  viewer.
- Do not set `themeVariables`: they break one of light and dark.

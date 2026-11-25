---
name: vitepress
description: What VitePress does with a Markdown page, and the mistakes that break a page or the whole site - frontmatter, angle brackets, curly braces, links, anchors, containers, code blocks, images. Use before writing or changing any page under docs/, and when the site's build fails.
---

# Writing Markdown that VitePress accepts

This site is VitePress 1.x. A page is Markdown, but it is compiled as a Vue
template, and its frontmatter is YAML. Most broken pages come from one of the
first four things below. One broken page stops the whole site from building.

## Frontmatter is YAML

The block between the `---` lines at the top of a page.

- A value containing a colon followed by a space, or a `#`, or starting with
  any of `[ ] { } > | * & ! % @` or a quote, must be in double quotes:
  `title: "Sign-in: how a session starts"`. Unquoted, the site does not build.
- Inside double quotes, write a double quote as `\"`.
- Dates are `YYYY-MM-DD`, unquoted.
- When unsure, quote the value. Quoting is never wrong for text.

## Angle brackets are HTML

Outside a code span or a fenced block, `<word>` is read as an HTML tag or a
Vue component. An unknown or unclosed one breaks the page.

- A placeholder goes in a code span: `` `<port>` ``, never bare.
- A generic type goes in a code span: `` `Map<string, number>` ``.
- "Less than" in prose is written out, or as `&lt;`.
- A code span stays on one line.

## Double curly braces are Vue

Outside code, `{{ something }}` is evaluated as JavaScript when the page is
drawn, and fails if it is not valid. Template syntax from another language
(Handlebars, Jinja, GitHub Actions `${{ }}`) goes in a code span or a fenced
block, where it is left alone.

## Links are checked

The build fails on a link to a page that does not exist.

- Link from the site's root, without `.md`: `[Sign-in](/system/sign-in)`.
- A folder's own page is the folder with a trailing slash: `/work/census-import/`.
- A heading's anchor is its text in small letters, spaces to hyphens,
  punctuation dropped: `## Sessions and cookies` is `#sessions-and-cookies`.
  Where a heading may be reworded, pin it: `## Sessions {#sessions}`.
- A link to something outside the site is a full `https://` address.
- Never link to `localhost`, to a file on this computer, or into the code by
  a relative path: name the file in a code span instead.

## One title

A page has one `# ` heading, first. Sections are `## `, and `### ` under
them. The right-hand outline is built from `## ` and `### `.

## Call-outs

Use a container where a reader must not miss something; not for decoration.

```md
::: warning Fragile
The import assumes one file per day.
:::
```

The kinds are `info`, `tip`, `warning`, `danger` and `details` (folded until
clicked). The text after the kind is its title. Every `:::` that opens must be
closed by a `:::` on its own line.

## Code blocks

- Fence with three backticks and name the language: `ts`, `sh`, `json`,
  `sql`, `md`. An unknown language name is drawn as plain text with a warning.
- To show a block that itself contains three backticks, fence the outer one
  with four.
- Highlight lines with braces after the language: ` ```ts{2,4-6} `.
- Several versions of one thing side by side: `::: code-group`, with each
  block labelled ` ```sh [pnpm] `.

## Pictures

A picture a page shows is in `docs/public/` and is linked from the root:
`![What it shows](/flow.png)` for `docs/public/flow.png`. Always give the
words in the square brackets.

## Other things that surprise

- `:word:` between colons becomes an emoji when it names one (`:tada:`). Put
  such text in a code span.
- A table needs its header row and the `| --- |` row under it, and a blank
  line before it. A `|` inside a cell is written `\|`.
- A list needs a blank line before it, or it joins the paragraph above.
- Do not write `<script>` or `<style>` in a page.
- Never edit anything under `docs/.vitepress/`: the navigation and sidebars
  are built from the pages themselves.

## When the build fails

Read the last lines of the error for the file and line. "incomplete explicit
mapping pair" or "bad indentation of a mapping entry" is frontmatter (a colon
that needs quotes). "Element is missing end tag" or "Invalid end tag" is a
bare angle bracket. "dead link" names the page and the link. Fix the page it
names and nothing else.

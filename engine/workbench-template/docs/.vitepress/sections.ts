import { existsSync, readdirSync, readFileSync, utimesSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DefaultTheme } from "vitepress";
import type { Plugin } from "vite";

// The docs have two sections, and their sidebars are read from the pages
// themselves: a page added to a section's folder shows up without anyone
// editing the configuration (the docs agent cannot edit it).
//   - system/: "How the system works". Listed by title.
//   - work/:   "Our work". A page per task, newest first by the `date` in
//              its frontmatter. A project is a folder: its index.md is the
//              project's page, and its tasks' pages are listed under it.
export const SECTIONS = [
	{ dir: "system", title: "How the system works", newestFirst: false },
	{ dir: "work", title: "Our work", newestFirst: true },
] as const;

const here = dirname(fileURLToPath(import.meta.url));
const docs = resolve(here, "..");
const configFile = join(here, "config.ts");

type Page = { file: string; link: string; title: string; date: string };

function read(dir: string, file: string): Page {
	const text = readFileSync(join(docs, dir, file), "utf8");
	const front = text.match(/^---\n([\s\S]*?)\n---\n/);
	const body = front ? text.slice(front[0].length) : text;
	const name = file.replace(/\.md$/, "");
	return {
		file,
		link: name === "index" ? `/${dir}/` : `/${dir}/${name}`,
		title: body.match(/^# +(.+?)\s*$/m)?.[1] ?? (name === "index" ? dir.split("/").pop()! : name),
		date: front?.[1].match(/^date:\s*["']?([0-9-]+)/m)?.[1] ?? "",
	};
}

function pages(dir: string): Page[] {
	const root = join(docs, dir);
	if (!existsSync(root)) return [];
	return readdirSync(root).filter((f) => f.endsWith(".md")).map((f) => read(dir, f));
}

const folders = (dir: string): string[] => {
	const root = join(docs, dir);
	if (!existsSync(root)) return [];
	return readdirSync(root, { withFileTypes: true }).filter((f) => f.isDirectory()).map((f) => `${dir}/${f.name}`);
};

type Entry = { item: DefaultTheme.SidebarItem; title: string; date: string; file: string };

// A folder's pages, its own index left out: each page a line, each folder of
// pages (a project) a group under its own page, dated by its newest page.
function entries(dir: string): Entry[] {
	const own = pages(dir).filter((p) => p.file !== "index.md").map((p) => ({ item: { text: p.title, link: p.link }, title: p.title, date: p.date, file: p.file }));
	const groups = folders(dir).flatMap((d) => {
		const index = pages(d).find((p) => p.file === "index.md");
		const items = sorted(entries(d), true);
		if (!index && !items.length) return [];
		const title = index?.title ?? d.split("/").pop()!;
		const date = items.map((e) => e.date).sort().pop() ?? "";
		return [{ item: { text: title, link: index?.link, collapsed: false, items: items.map((e) => e.item) }, title, date, file: d }];
	});
	return [...own, ...groups];
}

const sorted = (all: Entry[], newestFirst: boolean) =>
	[...all].sort((a, b) => (newestFirst ? b.date.localeCompare(a.date) || b.file.localeCompare(a.file) : a.title.localeCompare(b.title)));

export function sidebar(): DefaultTheme.SidebarMulti {
	const out: DefaultTheme.SidebarMulti = {};
	for (const s of SECTIONS) {
		out[`/${s.dir}/`] = [
			{ text: s.title, items: [{ text: "Overview", link: `/${s.dir}/` }, ...sorted(entries(s.dir), s.newestFirst).map((e) => e.item)] },
		];
	}
	return out;
}

export const nav = (): DefaultTheme.NavItem[] => SECTIONS.map((s) => ({ text: s.title, link: `/${s.dir}/`, activeMatch: `^/${s.dir}/` }));

// The sidebar is worked out when the configuration is read, so a running dev
// server would go on showing the old one. When a page of a section is added,
// removed or retitled, the configuration file is touched: VitePress restarts
// itself when that file changes, and reads the sidebar again.
export function sectionsWatcher(): Plugin {
	const listed = () => JSON.stringify(sidebar());
	let was = "";
	return {
		name: "docs-sections",
		apply: "serve",
		configureServer(server) {
			was = listed();
			const check = (file: string) => {
				if (!file.endsWith(".md") || !SECTIONS.some((s) => file.startsWith(join(docs, s.dir)))) return;
				const now = listed();
				if (now === was) return;
				was = now;
				const t = new Date();
				utimesSync(configFile, t, t);
			};
			server.watcher.on("add", check).on("unlink", check).on("change", check);
		},
	};
}

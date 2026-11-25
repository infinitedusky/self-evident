import { defineConfig } from "vitepress";
import { bonkeiMarkdown } from "@bonkei/vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
import { nav, sectionsWatcher, sidebar } from "./sections";

// A workbench's docs site. Change the title and description. The two sections
// and their sidebars come from sections.ts; the diagram setup below should stay
// as it is.
const config = defineConfig({
	title: "{{app}}",
	description: "How {{app}} works and what we built, in words and diagrams",
	lastUpdated: true,
	cleanUrls: true,
	// Docs about local setup link to localhost all the time.
	ignoreDeadLinks: "localhostLinks",

	markdown: {
		// Every ```mermaid block gets the full-screen pan/zoom viewer, so pages
		// never wrap diagrams by hand. Runs after vitepress-plugin-mermaid has
		// turned the fence into its <Mermaid> component.
		config(md) {
			const fence = md.renderer.rules.fence;
			if (!fence) return;
			md.renderer.rules.fence = (tokens, idx, options, env, self) => {
				const html = fence(tokens, idx, options, env, self);
				return tokens[idx].info.trim() === "mermaid" ? `<FullscreenDiagram>${html}</FullscreenDiagram>` : html;
			};
			// Flowcharts and sequence diagrams are drawn by Bonkei (flat, iso or 3D, with
			// its own controls). It is installed last, so it is asked first; any other
			// diagram type falls through to Mermaid and the viewer above.
			bonkeiMarkdown(md, { height: 480 });
		},
	},

	mermaid: {
		// The plugin switches to "dark" by itself in dark mode. Do NOT set
		// themeVariables: they stick across the switch and break one mode.
		theme: "default",
		securityLevel: "strict",
		maxTextSize: 50000,
		flowchart: { useMaxWidth: true, htmlLabels: true },
		sequence: { actorFontWeight: "bold", messageFontSize: 14, actorFontSize: 14 },
	},

	themeConfig: {
		search: { provider: "local" },
		// Two sections, each listed from its own pages (sections.ts).
		nav: nav(),
		sidebar: sidebar(),
	},

	vite: {
		plugins: [sectionsWatcher()],
		optimizeDeps: { include: ["mermaid"] },
		ssr: { noExternal: ["mermaid"] },
	},
});

export default withMermaid(config);

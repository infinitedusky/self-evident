import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-mcp",
    "msw-storybook-addon",
    // The screen map (docs › Self Evident/Map): our standard for every Storybook; the glob is relative to this folder.
    { "name": "@zigbang/storybook-addon-story-flow", "options": { "flowGlob": "../src/stories/**/*.flow.json" } }
  ],
  "framework": "@storybook/react-vite",
  "staticDirs": ["../public"] // the MSW worker that fakes the engine
};
export default config;
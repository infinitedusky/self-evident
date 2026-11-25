# vendor

Bonkei (https://github.com/infinitedusky/bonkei, MIT) is not on npm yet, so the two packages the docs site needs
are kept here as the tarballs `pnpm pack` makes, and `package.json` installs them from this folder.

- `bonkei-0.0.0.tgz`: the library (`packages/core`)
- `bonkei-vitepress-0.0.0.tgz`: the VitePress plugin (`packages/vitepress`)

Built from Bonkei's `main` at `9ec37a8`. To bring them up to date, in a checkout of Bonkei:

```bash
pnpm install && pnpm --filter bonkei build
(cd packages/core && pnpm pack --pack-destination <this folder>)
(cd packages/vitepress && pnpm pack --pack-destination <this folder>)
```

then `pnpm install` here. When Bonkei is published, depend on `@bonkei/vitepress` from npm and delete this folder.

# Addfox Reference

Practical reference for Addfox configuration, manifest usage, entry behavior, and cross-browser setup.

## Quick links

- [Entry Configuration](./rules/entry.md)
- [Chromium Guide](./rules/chromium.md)
- [Firefox Guide](./rules/firefox.md)
- [MV3 Guide](./rules/mv3.md)
- [MV2 Guide](./rules/mv2.md)
- [Manifest Fields](./rules/manifest-fields.md)

---

## Config file

Use `addfox.config.ts` in project root:

```ts
import { defineConfig } from 'addfox';

export default defineConfig({
  appDir: 'app',
  outDir: 'extension',
  manifest: {
    chromium: { manifest_version: 3, name: 'My Extension', version: '1.0.0' },
    firefox: { manifest_version: 3, name: 'My Extension', version: '1.0.0' }
  }
});
```

## Key config fields

- `manifest`: single object or split by browser (`chromium` / `firefox`)
- `entry`: custom entries when reserved entry discovery is not enough
- `plugins`: Rsbuild plugins (`@rsbuild/plugin-react`, vue plugin, etc.)
- `rsbuild`: advanced bundler overrides
- `appDir`: source root for entries (default `app`)
- `outDir`: output under `.addfox` (default `extension`)

## Entry behavior

- If `entry` is omitted, Addfox auto-discovers reserved entry folders in `app/`.
- Reserved entries include: `background`, `content`, `popup`, `options`, `sidepanel`, `devtools`, `offscreen`, `sandbox`, `newtab`, `bookmarks`, `history`.
- Use `entry` for custom names, custom HTML generation, or disabling reserved entries.

## Browser split strategy

- Keep shared manifest fields in a base object.
- Override browser-specific fields in `manifest.chromium` and `manifest.firefox`.
- Validate both targets in CI with build + smoke checks.

## Related docs

- [SKILL.md](./SKILL.md)
- [rules/entry.md](./rules/entry.md)
- [rules/manifest-fields.md](./rules/manifest-fields.md)

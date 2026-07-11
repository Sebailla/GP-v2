/**
 * PostCSS config for `apps/web` — Tailwind v4 setup (slice 4 batch 4b).
 *
 * Per design §6.5: the `@tailwindcss/postcss` plugin is the canonical
 * Tailwind v4 processing entrypoint. The plugin scans the project's
 * source files (per its `content` autodetection rules) and emits the
 * utility classes that match the tokens declared in `app/globals.css`.
 *
 * No autoprefixer is required as a PostCSS plugin in Tailwind v4 — the
 * build emits a `lightningcss`-processed output that already includes
 * vendor prefixes. Autoprefixer remains a dep (brief requirement) for
 * any non-Tailwind CSS that needs manual prefixing.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;

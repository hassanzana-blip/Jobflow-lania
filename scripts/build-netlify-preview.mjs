import {
  cpSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const root = process.cwd(),
  stage = resolve(root, ".netlify-static");
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage);
for (const name of ["src", "tsconfig.json", "package.json", "next-env.d.ts"])
  cpSync(resolve(root, name), resolve(stage, name), { recursive: true });
if (existsSync(resolve(root, "public")))
  cpSync(resolve(root, "public"), resolve(stage, "public"), {
    recursive: true,
  });
for (const name of ["api", "auth", "app"])
  rmSync(resolve(stage, "src/app", name), { recursive: true, force: true });
rmSync(resolve(stage, "src/proxy.ts"), { force: true });
writeFileSync(
  resolve(stage, "src/app/hitta-jobb/page.tsx"),
  `export {default} from '../produktvisning/page';`,
);
writeFileSync(
  resolve(stage, "src/app/manifest.ts"),
  `import type {MetadataRoute} from 'next';export const dynamic='force-static';export default function manifest():MetadataRoute.Manifest{return {name:'JobbFlow · Produktvisning',short_name:'JobbFlow',start_url:'/produktvisning/',display:'standalone',background_color:'#f3f4e9',theme_color:'#f3f4e9',icons:[{src:'/icon.png',sizes:'512x512',type:'image/png'}]}}`,
);
// Standalone visual deployment never imports live auth or accepts real candidate data.
for (const route of ["kom-igang", "logga-in"])
  writeFileSync(
    resolve(stage, "src/app", route, "page.tsx"),
    `import {ActionLink} from '@/components/ui';import {sv} from '@/i18n/sv';export default function Page(){return <main id="main" className="auth-main"><p className="editorial-eyebrow">JobbFlow · Produktvisning</p><h1>{sv.auth.title}</h1><div className="notice">{sv.auth.unavailable}</div><ActionLink href="/produktvisning/" arrow>{sv.auth.preview}</ActionLink></main>}`,
  );
rmSync(resolve(stage, "src/server"), { recursive: true, force: true });
symlinkSync(
  resolve(root, "node_modules"),
  resolve(stage, "node_modules"),
  "dir",
);
writeFileSync(
  resolve(stage, "next.config.ts"),
  `import type {NextConfig} from 'next';const config:NextConfig={output:'export',trailingSlash:true,poweredByHeader:false,turbopack:{root:${JSON.stringify(root)}},images:{unoptimized:true}};export default config;`,
);
const env = { ...process.env };
for (const key of Object.keys(env))
  if (
    /SUPABASE|STRIPE|META_MODEL|RESEND|POSTHOG|DATABASE_URL|REDIS_URL|ENABLE_/.test(
      key,
    )
  )
    delete env[key];
execFileSync(
  process.execPath,
  [resolve(root, "node_modules/next/dist/bin/next"), "build"],
  { cwd: stage, env, stdio: "inherit" },
);
writeFileSync(
  resolve(stage, "out/_headers"),
  `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'\n  X-Robots-Tag: noindex\n`,
);
writeFileSync(resolve(stage, "out/netlify.toml"), `[build]\n  publish = "."\n`);
console.log("Netlify upload folder: .netlify-static/out");

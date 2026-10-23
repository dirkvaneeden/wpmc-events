# Stage 10: Import members from audioutcasts.com

No database changes.
1. Add to .env.local (and to Vercel -> Settings -> Environment Variables, then redeploy):
   MEMBERS_API_KEY=your-key
   MEMBERS_API_URL=https://audioutcasts.com/api/v1/members   (optional, this is the default)
2. Extract with `tar -xf`, run `npm run build`, then commit and push.

New: lib/members-api.ts, app/admin/members-import/*, components/MemberImport.tsx
Updated: components/ShellBar.tsx, app/page.tsx, app/globals.css

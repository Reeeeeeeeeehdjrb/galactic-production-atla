# Galactic Production Atlas

An interactive, local-first manufacturing map built with React + Vite. It includes the supplied blueprint image, right-click drag panning, wheel zoom, resource search, recipe details, dependency chains, editable resources, map hotspots, and JSON import/export.

## Run locally
1. Install Node.js 20 or newer.
2. In this folder run `npm install`.
3. Run `npm run dev`.
4. Open the local URL shown by Vite.

## How to use
- Scroll over the blueprint to zoom.
- Hold the **right mouse button** and drag to pan.
- Search for a resource in the top search bar.
- Use **Admin tools** to add/edit resources and recipes.
- To place a hotspot: enable Admin tools, select a resource, click **＋ Hotspot**, then click the resource's position on the map.
- Export JSON regularly as a backup. Import JSON to restore or move your database.

## Render free deployment (static site)
This version is deliberately a static site so it can be hosted as a Render Static Site without a paid server. It stores edits in the current browser's localStorage. That means data is local to each browser/device; it is **not a shared online database**. Use Export JSON / Import JSON to transfer updates. For a multi-user shared database, connect a hosted database such as Supabase and add server-side access controls.

1. Create a GitHub repository.
2. Upload/push all files in this project to the repository root. Do not omit `public/production-map.png`.
3. In Render, choose **New + → Static Site** and connect the GitHub repository.
4. Set **Build Command** to `npm install && npm run build`.
5. Set **Publish Directory** to `dist`.
6. Create the site. Render will provide a public `onrender.com` URL.
7. When you change code, push the changes to GitHub; Render will rebuild and deploy automatically if auto-deploy is enabled.

No environment variables or database are required for this local-first edition.

## Free hosting limitations
- Render Static Sites are generally available on the free tier.
- This app's data is stored in browser localStorage, not on Render. Clearing browser data can erase it; export backups.
- Every visitor has their own local data. Changes do not sync between users.
- The website image is deployed as a normal static asset.
- A future shared edition should use a hosted database (for example Supabase) with row-level security and authenticated admin access. Do not put database service-role secrets in frontend code.

## Notes
- The sample resources are clearly labeled examples, not verified Star Wars recipes or lore.
- The uploaded map image is included at `public/production-map.png`.
- Admin mode in this starter is a UI editing mode, not secure authentication. Do not treat it as a protected multi-user admin console.

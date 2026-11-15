# Rotation

A personal closet and outfit planner. Add photos of your clothes, shoes, jewelry, cologne and
accessories, build outfits on a flat-lay board, save and name them, and plan them on a calendar.

It is a plain static site: no build step, no server, no accounts, nothing to install.

## Put it on Vercel

1. Create a new, empty repository on GitHub (for example `rotation`) and add these files to it.
2. On vercel.com choose **Add New → Project** and import that repository.
3. Leave every setting as it is (Framework Preset: **Other**, no build command) and press **Deploy**.

Every push to the repository redeploys the site.

To run it on your own computer instead, serve the folder with any static server, for example
`python3 -m http.server 4173`, and open `http://localhost:4173`. Opening `index.html` straight from
disk will not work, because browsers block JavaScript modules on `file://` pages.

## What it does

- **Closet** – upload one photo or many. Each photo opens in the cutout studio, where the
  background is removed and the piece is placed on a warm backdrop (Bone, Sand, Tan or Stone, set in
  Settings) so white clothes stay visible. Filter by category and search by name, brand or color.
- **Build** – the outfit laid out top, bottoms, socks, shoes, with layer, cologne, accessories and
  jewelry beside it. Use the arrows, swipe, or tap a piece to swap it and see the whole look update.
  Shuffle deals a random outfit. Save it with a name.
- **Outfits** – every saved outfit. Open one to rename, duplicate, plan, wear today or edit.
- **Calendar** – tap a day to plan an outfit for it, add a note, or build a new outfit for that day.
- **Today** – today's outfit, the week ahead and a count of what is in the closet.

## Background removal

There are two engines, and you can switch between them for any photo:

- **Smart** runs a segmentation model (`briaai/RMBG-1.4`, through Transformers.js) inside the
  browser. The first use downloads about 45 MB from jsDelivr and Hugging Face; after that the
  browser keeps it. Photos are processed on the device and are never uploaded.
- **Quick** is built in and needs no download. It removes the color found around the edges of the
  photo, so it works best when the piece is on a plain floor, wall or bed.

If Smart cannot load (no connection, an old browser), the app falls back to Quick on its own and
says so. Both results can be fixed up with the Erase and Restore brushes.

The RMBG-1.4 model is licensed by BRIA for non-commercial use, which covers a personal closet.

## Where your closet is stored

Everything is saved in the browser on the device you are using (IndexedDB). That means:

- A phone and a laptop each have their own closet. Use **Settings → Download a backup** on one and
  **Restore from a backup** on the other to move it.
- Clearing the browser's site data deletes the closet. Download a backup now and then.
- On iPhone and iPad, add the site to the Home Screen (Share → Add to Home Screen). Safari can clear
  the storage of ordinary websites that go unused for a while; Home Screen apps are kept.

## Files

```
index.html            page shell
css/app.css           all styles
js/main.js            start-up, navigation
js/store.js           data: items, outfits, plans, settings
js/db.js              IndexedDB wrapper
js/cutout.js          background removal (Quick engine, compositing, saving)
js/cutout-worker.js   background removal (Smart engine, runs in a worker)
js/add.js             cutout studio: adding photos and re-cutting
js/item.js            item sheet
js/plan.js            day sheet and "plan a day" dialog
js/flatlay.js         outfit pictures used on cards and the calendar
js/backup.js          backup files
js/samples.js         the drawn sample closet
js/views/             Today, Closet, Build, Outfits, Calendar, Settings
vercel.json           static hosting settings
```

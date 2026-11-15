# Removing the temporary demo sign-in

The one-click demo sign-in ("Demo astronaut" / "Demo surgeon" on the welcome screen) is temporary. Everything is marked `DEMO-ONLY`.
It only works when `DEMO_LOGIN=on` and the server is not in production. The quickest switch-off is to delete that line from `server/.env`
and restart the server (the buttons disappear and `/api/demo/login` answers 404). To delete the code completely:

1. `server/.env`: remove the `DEMO_LOGIN=on` line.
2. `server/src/demo-login.js`: delete the file.
3. `server/src/index.js`: delete the `import ... './demo-login.js'` line, the block between `==== DEMO-ONLY BEGIN` and `==== DEMO-ONLY END`, and `demoLogin: demoLoginOn(PROD),` in the `/api/health` reply.
4. `mobile/src/DemoLogin.tsx`: delete the file.
5. `mobile/app/welcome.tsx`: delete the two lines marked `DEMO-ONLY` (the import and `<DemoLogin />`).
6. `mobile/app/admin/index.tsx` and `mobile/app/admin/[id].tsx`: delete the `useDemoAdmin` import and call (DEMO-ONLY lines), and the "Admin panel (demo)" row in `mobile/app/(tabs)/profile.tsx`.
7. `mobile/src/auth.tsx`: delete the `demoLogin` type line, function and the `demoLogin,` entry in the provider value.
8. `server/test/admin.test.js`: the first test uses demo sign-in; rewrite it to sign in with `/api/auth/register` (role `surgeon` for the admin) before removing step 2.

The demo people (Alex Morgan, Mira Okafor, Daniel Reyes, Yuki Tanaka and Dr. Elena Voss) live in the local SQLite file `server/data/*.db`; delete that folder to remove them.
The flight-surgeon console and astronaut background file are real features and stay.

## Camera station (also temporary)
The `/camera` page lists astronauts and films one with no sign-in. Switch it off by removing `CAMERA_STATION=on` from `server/.env` (the page then says it is off and every `/api/station/*` route answers 404). To delete it: remove `mobile/app/camera.tsx`, the `'camera'` entry in `mobile/app/_layout.tsx` and `mobile/src/CookieBanner.tsx`, and the `/api/station` routes (`stationOn`, `mount('/api/station/:id' ...)`, `/api/station/crew`) in `server/src/cam.js`. When astronauts have their own sign-in on the camera device, replace it with an authenticated page.


## Live video (WebRTC)
Not demo-only: `server/src/rtc.js` (signaling, `ws`) and `mobile/src/data/rtcClient.ts` stay. Its `role=pub&station=` path is gated by `CAMERA_STATION=on`, so it disappears with the station. For use over the internet (not one LAN) add a TURN server to `ICE` in `rtcClient.ts` (e.g. coturn).

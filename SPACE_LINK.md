# Space link: why calls exist only near Earth

**The physics.** Radio travels at the speed of light. One-way signal time to Earth: ISS about 0.0015 s (plus network, under 1 s in practice), Moon 1.3 s, Mars 4 to 24 minutes, Jupiter about 45 minutes. A conversation needs a round trip of a few seconds. On Mars every sentence would arrive minutes late and the answer would take minutes more: a call is not a call.

**What Celeste does**
| Link | Signal time (one way) | What works |
|---|---|---|
| ISS / low Earth orbit | under 1 s | live voice and video calls (WebRTC) and messages |
| Moon | about 1.3 s | live calls still possible (2.6 s round trip) and messages |
| Mars, Jupiter, deep space | minutes to hours | **no live calls with Earth**. Text, voice and short video messages (store and forward) |

The rule is `server/src/linkdelay.js`: live calls only when the one-way delay is 2 seconds or less. It uses the astronaut's mission goal (iss, moon, mars, jupiter, deep) and falls back to the habitat. The server enforces it (a call is refused with `no-live-link`), the app hides call buttons and opens the message composer instead. Calls between crew mates on the same ship are unchanged: they do not cross to Earth.

**Store and forward (how deep-space networks work).** Real networks (NASA's Delay/Disruption-Tolerant Networking) do not keep a connection open. A message is handed to the next node, stored, and forwarded when the next link is up, then played when the person is ready. Celeste does the same:
1. You write text, record a voice message or record a short video. Video is compressed to about 200 kbit/s (about 1.5 MB per minute), voice to 24 kbit/s.
2. It is stored on the server and queued; "On its way" shows what has not arrived yet.
3. The other side opens it when ready; urgent messages are sorted first. Messages are deleted after 7 days or when removed.
4. `LINK_DELAY_SIM=on` really holds each message for the astronaut's signal time, so you can rehearse a Mars delay. It is off by default so demos stay fast.

**Safety.** SOS and automatic emergency alerts are messages, not calls: they go to every doctor and crew mate at once and keep escalating. Doctors can read the SI's 30-minute analysis, which works without any live link.

## Family, doctors and anything the astronaut wants to show (updated)
There are **no calls with family at all**. Family and doctors exchange text, voice, **video at normal quality (480p, 30 fps, compressed)** and photos. Nothing is live, so nothing is squeezed to a low frame rate.

**How a message crosses a long, unreliable link**
1. **Saved on the sender's device first** (IndexedDB outbox). Closing the app or losing the link loses nothing.
2. **Sent in 512 KB pieces** (`/api/upload`). The server counts the bytes that arrived. After a break the sender asks "how much do you have?" and continues from there, even hours later.
3. **No duplicates.** Each message has a client id; a retry after an unclear answer is recognised and ignored.
4. **Complete or nothing.** The recipient sees the message only after the last piece arrived.
5. Status on the sender's screen: waiting for the link, percent sent, delivered. Recordings are kept 14 days (family) or 7 days (doctors).
Limits: about 9 MB per message (a minute of 480p video), 6 unfinished uploads at once.

**Demo relative.** The login page has "Demo relative": a private link for Alex's mother with a few messages and a photo, to show the family side without any setup.

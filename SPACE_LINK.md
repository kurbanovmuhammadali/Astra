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

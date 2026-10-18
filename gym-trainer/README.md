# Spotter: 3D gym coach

A virtual personal trainer for the equipment you find in a Basic-Fit style gym (unofficial, not affiliated with Basic-Fit).

- **3D library**: 28 pieces of equipment and 42 exercises, each with an animated, rotatable demo. Highlighted muscles pulse while they work, and you can scrub through a rep, slow it to 0.25×, switch camera angles, show start/end "ghost" poses, X-ray the machine or spin it on a turntable.
- **Program builder**: a wizard that builds full-body, upper/lower or push/pull/legs splits from your goal, experience, days per week, session length, equipment preference and joints to protect. You can edit every day, exercise, set, rep range and rest time.
- **Gym mode**: big tap targets, weight/rep steppers, a rest timer with beep and vibration, swaps for when a machine is taken, notes, and the screen kept awake. Double progression tells you when to add weight.
- **Progress**: estimated 1RM trend per exercise, a 16-week consistency heat map, history and personal records.
- **AI coach** (when opened as a Claude artifact): chat that knows your program and history, proposes programs you can apply with one tap, opens 3D demos, and identifies machines from a photo.

## Run locally

No build step. Serve the folder with any static server and open it:

```sh
npx http-server gym-trainer -p 8080
```

Three.js loads from jsDelivr. Data is saved in the browser (`localStorage`). Use Program → Export backup to keep a copy.

## Code map

| File | What it does |
| --- | --- |
| `js/rig.js` | Procedural mannequin with two-bone IK for arms and legs, plus per-muscle meshes for highlighting |
| `js/equipment3d.js` | Procedural 3D models of every machine; moving parts follow the athlete's hands and feet |
| `js/exercises.js` | Equipment catalog and exercise library: keyframed poses, tempo, setup, steps, cues, mistakes |
| `js/viewer.js` | Three.js stage, rep timeline (hold, lift, squeeze, lower), cameras, thumbnails |
| `js/programs.js` | Program generator, set/rep prescriptions, progression suggestions, 1RM estimates |
| `js/store.js` | Local persistence plus optional sync to the Claude artifact database |
| `js/coach.js` | AI coach on the Claude artifact `sample` capability, with page tools |
| `js/app.js` | UI: Today, Library, Program, Progress, Coach, workout mode |

The coach and cross-device sync work only inside the Claude artifact viewer. Outside it, the app works fully offline-first.

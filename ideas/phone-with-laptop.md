---
title: The phone alongside the laptop
app: Homework Gate
lane: later
hypothesis: With his phone as a second device during homework (camera, sketchpad, the tutor in his hand), the working gets onto the sheet without friction and the proof is stronger, because it's drawn live on his own device.
measure: photos and sketches attached per math problem; tutor turns started on the phone; time from "photo of your work" to the photo on the sheet
baseline: Photos of work are uploaded from the device the sheet is on (built as stories on homework-gate PR #23).
look_by: 2026-12-01
---
Sandy, 2026-10-22, while choosing native Swift for the lock: "using the phone along with your screen would be
pretty cool", "you could sketch the math on your phone". Parked the same evening: the lock comes first.

- **Photo to the sheet.** He taps "photo of your work" on the laptop; his phone buzzes; he snaps the page; it
  appears beside that answer on the laptop.
- **Sketch the math.** A scratchpad on the phone (PencilKit; finger on iPhone, Pencil on iPad); the strokes
  appear live beside the problem on the laptop's sheet. The tutor reads the working (Claude reads handwriting),
  sees the steps in order, and can point at the line that went wrong. Strokes drawn live on his own device are
  strong proof.
- **The tutor in his hand.** The companion on the phone, the sheet on the laptop; Show me on the phone lights the
  passage on the laptop.
- How: both devices are signed in as the same child; one live channel per child (server-sent events) carries
  "take a photo for problem 3" one way and the photo or strokes the other. No pairing step.

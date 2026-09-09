---
name: cutroom-design-system
description: Visual direction and reusable tokens for the local CUTROOM video editor.
---

# CUTROOM

Read this as a professional video workspace for creators editing interviews and short clips on their own computer. Use a quiet editing room: warm charcoal surfaces, cream typography, and one acid-lime editing accent.

Dial: ENERGY 2 / RHYTHM 2 / MOTION 1.

## Decisions

- Dark canvas (#151714) supports video color judgment and long editing sessions. Slightly raised panels (#20231e) separate tools from media without shadows or glass.
- Cream text (#f5f5ef) and muted secondary text (#b3b8ac) remain readable on both surfaces. Lime (#d6f58a) identifies the active clip, playhead, selection, and main action; it is not a decorative background.
- Manrope is the interface typeface: clear numerals, compact labels, and enough character for a creator tool. Bundle fonts locally. Fraunces may appear sparingly in a future marketing headline, never in timecodes, settings, or transcript text.
- The media preview dominates. Put the project library on its left, transcript on its right, and timeline directly below. Keep the sidebar narrow and predictable.
- The repeated motif is the film cut: small straight separators, timecode ticks, and rectangular selections. Every line must mark a real boundary or position.
- Use 6px controls and 10px panels; avoid capsule-shaped fields. Show elevation through surface color and borders.
- Motion stays at feedback scale: hover, focus, selected state, and progress only. No continuous background animation, scroll choreography, or 3D.
- Use factual verbs: Import video, Transcribe, Create clip, Export clip. Label model downloads, offline availability, processing, and failed operations precisely.

## Responsive behavior

Below the width where three work areas fit, make preview the primary surface and stack transcript and timeline. Use a compact text navigation row. Never hide essential edit actions behind hover. Keep targets at least 44px and preserve keyboard focus visibility.

## State requirements

Import empty state explains accepted files. Transcription has a visible progress state with cancel where supported. Failures retain imported video and explain the next action. Successful export points to the local output. Demo projects, sample transcript, and placeholder media are explicitly labeled.

## Scope of this artifact

The linked HTML is a static design concept, not the working editor. Disabled preview controls are labeled. No uploaded media, AI model, or export pipeline is represented as implemented by this concept.

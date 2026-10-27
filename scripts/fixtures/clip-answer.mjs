// Synthetic clip-review answers shared by the isolated BYOK and Claude Code fixtures.
export function syntheticAnswer(text) {
  const transcript = JSON.parse(text.split("TRANSCRIPT:\n")[1]);
  const original = text.match(/Original proposal \[(\d+),(\d+)\]/);
  const first = original ? Number(original[1]) : transcript[0].index;
  const last = original ? Number(original[2]) : transcript[Math.min(2, transcript.length - 1)].index;
  return text.startsWith("Independently")
    ? { first, last, context: true, ending: true, appeal: true, clarity: true, reason: "A complete synthetic thought.", weakness: "",
        assessment: { scores: { hook: 3, payoff: 3, clarity: 3, novelty: 2, emotion: 0, value: 3 }, anchors: { hook: first, peak: first, payoff: last, contrast: -1 } } }
    : { candidates: [{ first: transcript[0].index, last: transcript[Math.min(2, transcript.length - 1)].index, title: "A useful idea", reason: "A complete synthetic thought.", weakness: "Check the video.", strength: 3 }] };
}

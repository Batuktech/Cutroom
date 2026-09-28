import assert from "node:assert/strict";

if (process.env.CUTROOM_MOCK_POSTIZ_TEST !== "1" || !process.env.CUTROOM_DATA_DIR?.includes("output")) throw new Error("Postiz fixture requires isolated test data.");
let posts = 0;
const channels = ["youtube", "instagram", "instagram-standalone", "tiktok"].map(identifier => ({ id: identifier, identifier, name: `Synthetic ${identifier}`, disabled: false }));
channels.push({ id: "uncertain", identifier: "tiktok", name: "Synthetic uncertain receipt", disabled: false });
channels.push({ id: "delayed", identifier: "youtube", name: "Synthetic slow channel", disabled: false });
channels.push({ id: "disabled", identifier: "youtube", name: "Synthetic disconnected", disabled: true });
channels.push({ id: "interrupted", identifier: "youtube", name: "Synthetic interrupted submission", disabled: false });
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  options.signal?.throwIfAborted();
  if (url.origin === "https://api.postiz.com") {
    assert.equal(options.headers.Authorization, "synthetic-postiz-secret");
    assert.equal(options.redirect, "error");
    if (url.pathname.endsWith("/integrations")) return Response.json(channels);
    if (url.pathname.includes("/integration-settings/")) {
      if (url.pathname.endsWith("/delayed")) await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 1600);
        options.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("Cancelled")); }, { once: true });
      });
      return Response.json({ output: { maxLength: 2200, settings: { type: "object", properties: {} }, rules: "Synthetic test rules" } });
    }
    if (url.pathname.endsWith("/upload")) {
      assert.ok(options.body instanceof FormData);
      const file = options.body.get("file");
      assert.equal(file.type, "video/mp4"); assert.ok(file.size > 1000);
      return Response.json({ id: "synthetic-upload", path: "https://uploads.postiz.com/synthetic.mp4" });
    }
    if (url.pathname.endsWith("/posts")) {
      const body = JSON.parse(options.body), p = body.posts[0];
      assert.ok(["draft", "now", "schedule"].includes(body.type));
      assert.equal(body.posts.length, 1); assert.equal(p.value[0].image[0].id, "synthetic-upload");
      assert.ok(p.value[0].content); assert.ok(p.settings.__type);
      if (p.settings.__type === "instagram" || p.settings.__type === "instagram-standalone") assert.equal(p.settings.post_type, "post");
      if (p.settings.__type === "youtube") assert.ok(p.settings.title);
      if (p.integration.id === "uncertain") throw new Error("Response lost: synthetic-postiz-secret");
      if (p.integration.id === "interrupted") await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 30_000);
        options.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("Cancelled")); }, { once: true });
      });
      return Response.json([{ postId: `synthetic-post-${++posts}`, integration: p.integration.id }]);
    }
  }
  if (url.href === "https://api.openai.com/v1/responses") {
    const copy = { title: "A small idea, well told", description: "Start with a useful idea and give it room to land.", hashtags: ["#VideoEditing", "#Storytelling"] };
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ youtube: copy, instagram: copy, tiktok: copy }) }] }] });
  }
  throw new Error("Network blocked by synthetic Postiz fixture");
};

import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--use-file-for-fake-audio-capture=/home/z/my-project/download/latency/utterances/sil_u01_greeting.wav",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage();
await page.setContent(`<!DOCTYPE html><html><body><script>
window.__sr = { supported: false, events: [], results: [] };
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  window.__sr.supported = true;
  const r = new SR();
  r.continuous = true;
  r.interimResults = true;
  r.lang = "ar-EG";
  r.onstart = () => window.__sr.events.push("start");
  r.onerror = (e) => window.__sr.events.push("error:" + e.error);
  r.onend = () => window.__sr.events.push("end");
  r.onresult = (e) => {
    for (let i = 0; i < e.results.length; i++) {
      window.__sr.results.push({ final: e.results[i].isFinal, text: e.results[i][0].transcript });
    }
  };
  r.start();
}
</script></body></html>`);
await page.waitForTimeout(12000);
const state = await page.evaluate(() => window.__sr);
console.log(JSON.stringify(state, null, 2).slice(0, 1200));
await browser.close();

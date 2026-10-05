// Generate Arabic speech locally via msedge-tts for the STT test.
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import fs from 'node:fs'

const TEXT = 'السلام عليكم يا طلاب، من يشرح لي لماذا نوحد المقامات قبل مقارنة الكسور؟'
const OUT = '/home/z/my-project/scripts/stt_test_input.mp3'

const tts = new MsEdgeTTS()
await tts.setMetadata('ar-SA-HamedNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
const { audioStream } = tts.toStream(TEXT)
const chunks = []
for await (const c of audioStream) chunks.push(Buffer.from(c))
fs.writeFileSync(OUT, Buffer.concat(chunks))
console.log('written:', OUT, fs.statSync(OUT).size, 'bytes')

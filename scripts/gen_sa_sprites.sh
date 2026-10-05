#!/bin/bash
# Saudi character sprites — Pixar-style matching the existing Egyptian set
set -e

STYLE="3D Pixar-style CGI cartoon portrait, soft realistic skin texture, large expressive eyes, subsurface scattering, studio lighting, plain seamless light grey/white studio backdrop, centered head-and-shoulders bust composition, front-facing, high resolution professional render"

gen() {
  local key=$1; local posture=$2; local desc=$3
  z-ai image -p "$STYLE. $desc" -o "public/students/$key/$posture.jpg" -s 1024x1024
}

# ============ سلطان — Saudi boy, confident, red-checkered ghutra + white thobe ============
gen sultan neutral "A 10-year-old Saudi Arabian schoolboy with tan skin, thick dark eyebrows and short neat black hair, wearing a crisp white thobe and a red-and-white checkered ghutra headscarf with black agal cord, gentle confident closed-mouth smile, calm attentive expression"
gen sultan speaking "The same 10-year-old Saudi Arabian schoolboy with tan skin, white thobe and red-and-white checkered ghutra headscarf with black agal, mouth open mid-speech as if answering a teacher in class, bright engaged eyes, cheerful confident expression"
gen sultan hand_raised "The same 10-year-old Saudi Arabian schoolboy with tan skin, white thobe and red-and-white checkered ghutra headscarf with black agal, eagerly raising his right hand high to answer a question in class, excited wide-eyed expression, mouth slightly open"
gen sultan distracted "The same 10-year-old Saudi Arabian schoolboy with tan skin, white thobe and red-and-white checkered ghutra headscarf with black agal, looking away to the side with chin resting on his hand, bored daydreaming expression, droopy eyelids"

# ============ فهد — Saudi boy, energetic, plain white ghutra ============
gen fahad neutral "A 10-year-old Saudi Arabian schoolboy with warm beige skin, short spiky black hair and thick eyebrows, wearing a crisp white thobe and a plain white ghutra headscarf with black agal cord, playful energetic closed-mouth grin, lively curious eyes"
gen fahad speaking "The same 10-year-old Saudi Arabian schoolboy with warm beige skin, white thobe and plain white ghutra headscarf with black agal, mouth wide open mid-sentence speaking enthusiastically, big excited smile, sparkling energetic eyes"
gen fahad hand_raised "The same 10-year-old Saudi Arabian schoolboy with warm beige skin, white thobe and plain white ghutra headscarf with black agal, jumping with enthusiasm raising his hand eagerly to participate, mouth open in excitement, very animated expression"
gen fahad distracted "The same 10-year-old Saudi Arabian schoolboy with warm beige skin, white thobe and plain white ghutra headscarf with black agal, gaze drifting far away to the side, mind wandering, sleepy inattentive expression, slight frown"

# ============ ريم — Saudi girl, excellent student, lavender hijab ============
gen reem neutral "A 11-year-old Saudi Arabian schoolgirl with fair warm skin and large bright brown eyes, wearing a neat lavender-purple hijab headscarf framed modestly around her face and a dark school abaya with a small white collar, gentle composed closed-mouth smile, intelligent attentive expression"
gen reem speaking "The same 11-year-old Saudi Arabian schoolgirl with fair warm skin, lavender-purple hijab and dark school abaya with white collar, mouth open mid-speech answering confidently in class, warm bright expression, engaged eyes"
gen reem hand_raised "The same 11-year-old Saudi Arabian schoolgirl with fair warm skin, lavender-purple hijab and dark school abaya with white collar, politely raising her hand with a calm eager smile, ready to answer, bright intelligent eyes"
gen reem distracted "The same 11-year-old Saudi Arabian schoolgirl with fair warm skin, lavender-purple hijab and dark school abaya with white collar, looking softly away toward the window, thoughtful daydreaming expression, relaxed eyelids"

# ============ جوري — Saudi girl, shy, soft blue hijab ============
gen jouri neutral "A 9-year-old Saudi Arabian schoolgirl with light tan skin, big shy brown eyes and long dark eyelashes, wearing a soft pastel-blue hijab headscarf draped modestly and a dark school abaya with tiny star embroidery, timid gentle closed-mouth smile, quiet reserved expression"
gen jouri speaking "The same 9-year-old Saudi Arabian schoolgirl with light tan skin, pastel-blue hijab and dark school abaya with star embroidery, mouth slightly open speaking softly and hesitantly, shy nervous but trying expression, gentle eyes"
gen jouri hand_raised "The same 9-year-old Saudi Arabian schoolgirl with light tan skin, pastel-blue hijab and dark school abaya with star embroidery, shyly half-raising her hand low near her shoulder, hesitant hopeful expression, biting lip nervously"
gen jouri distracted "The same 9-year-old Saudi Arabian schoolgirl with light tan skin, pastel-blue hijab and dark school abaya with star embroidery, looking down at her lap absent-mindedly, withdrawn dreamy expression, low gaze"

echo "ALL SAUDI SPRITES GENERATED"

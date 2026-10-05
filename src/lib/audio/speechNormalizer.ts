/**
 * Shared Speech Normalizer for transcription text (Web Speech API and Whisper).
 * Normalizes colloquial Egyptian phonetics, common ASR mishearings, greetings,
 * and converts Arabic-transliterated English words and phrases into proper English (Latin script).
 */

const arBoundary = (pattern: string) =>
  new RegExp(`(?<=^|[\\s.,?!،؛:؟])(${pattern})(?=$|[\\s.,?!،؛:؟])`, "gi");

const replaceWithPrefix = (
  text: string,
  pattern: string,
  englishWord: string
): string => {
  const reg = new RegExp(
    `(?<=^|[\\s.,?!،؛:؟])(و|ف)?(?:ال)?(?:${pattern})(?=$|[\\s.,?!،؛:؟])`,
    "gi"
  );
  return text.replace(reg, (_, prefix) => (prefix ? `${prefix} ${englishWord}` : englishWord));
};

/**
 * Converts English words and educational terms that Google Web Speech API (ar-EG)
 * transliterated into Arabic letters back into proper English words.
 */
function convertTransliteratedEnglish(text: string): string {
  let s = text;

  // 1. Science, Climate Change & Environment (Highest priority for Bilingual classes)
  s = replaceWithPrefix(s, "كلاي(?:ميت|مت|ميد)?\\s*(?:ميت)?\\s*(?:اتشنج|اتشينج|تشينج|شينج|تينز|تشنج)|كلايمت\\s*تشينج|كلايميت\\s*تشينج", "Climate Change");
  s = replaceWithPrefix(s, "جلوب[ا]?ل\\s*(?:وورنينج|وورمينج|وارمينج|ورمينج|ورنينج|ورمنج|ورمنغ)", "Global Warming");
  s = replaceWithPrefix(s, "جرين\\s*هاوس\\s*(?:افكت|إفكت|ايفكت|إيفكت)", "greenhouse effect");
  s = replaceWithPrefix(s, "جرين\\s*هاوس\\s*(?:جازيز|جازز|جاز|غازات)", "greenhouse gases");
  s = replaceWithPrefix(s, "جرين\\s*هاوس|جرينهاوس", "greenhouse");
  s = replaceWithPrefix(s, "سي\\s*[اأإ]?و\\s*ت[و2](?:ل|ال)?\\s*ك[ا]?ربون", "CO₂ والكربون");
  s = replaceWithPrefix(s, "سي\\s*[اأإ]?و\\s*ت[و2]", "CO₂");
  s = replaceWithPrefix(s, "ك[ا]?ربون(?:داي)?\\s*(?:داي\\s*)?(?:اكسايد|اوكسايد|اوكسيد|اكسيد)", "carbon dioxide");
  s = replaceWithPrefix(s, "فوسيل\\s*(?:فيولز|فيول)|فوسل\\s*(?:فيولز|فيول)", "fossil fuels");
  s = replaceWithPrefix(s, "رينيوبل\\s*انيرجي|رينيوابل\\s*انيرجي", "renewable energy");
  s = replaceWithPrefix(s, "سولار\\s*انيرجي", "solar energy");
  s = replaceWithPrefix(s, "سي\\s*(?:ليفيل|ليفل)\\s*رايز", "sea level rise");
  s = replaceWithPrefix(s, "سي\\s*(?:ليفيل|ليفل)", "sea level");
  s = replaceWithPrefix(s, "هيت\\s*ويفز", "heat waves");
  s = replaceWithPrefix(s, "تيمبريتشر|تمبرتشر", "temperature");
  s = replaceWithPrefix(s, "اكوسيستم|إكوسيستم", "ecosystem");
  s = replaceWithPrefix(s, "اتموسفير|أتموسفير", "atmosphere");
  s = replaceWithPrefix(s, "إيرث|ايرث", "Earth");
  s = replaceWithPrefix(s, "ووتر\\s*سايكل", "water cycle");
  s = replaceWithPrefix(s, "ايفابوريشن", "evaporation");
  s = replaceWithPrefix(s, "كوندينسيشن", "condensation");
  s = replaceWithPrefix(s, "بريسيبيتيشن", "precipitation");
  s = replaceWithPrefix(s, "فوتوسينثيسيس|فوتوسينسيس", "photosynthesis");
  s = replaceWithPrefix(s, "ريسايكلينج", "recycling");
  s = replaceWithPrefix(s, "بولوشن", "pollution");
  s = replaceWithPrefix(s, "جرافيتي", "gravity");

  // 2. Classroom Instructions & Phrases
  s = s
    .replace(arBoundary("(?:صامونج|صمون|صامون|صاموان|سموان)\\s*(?:جيف|جف)\\s*مي"), "Someone give me")
    .replace(arBoundary("(?:صامونج|صمون|صامون|صاموان|سموان)"), "Someone")
    .replace(arBoundary("اني\\s*وان|انيوان"), "anyone")
    .replace(arBoundary("افري\\s*وان|افريوان"), "everyone")
    .replace(arBoundary("افري\\s*بودي"), "everybody")
    .replace(arBoundary("(?:جيف|جف)\\s*مي"), "give me")
    .replace(arBoundary("تيل\\s*مي"), "tell me")
    .replace(arBoundary("شو\\s*مي"), "show me")
    .replace(arBoundary("اوبن\\s*يور\\s*بوك"), "open your book")
    .replace(arBoundary("كلوز\\s*يور\\s*بوك"), "close your book")
    .replace(arBoundary("لوك\\s*ات\\s*ذا\\s*(?:بورد|سبورة)"), "look at the board")
    .replace(arBoundary("لوك\\s*ات\\s*ذا\\s*سكرين"), "look at the screen")
    .replace(arBoundary("لوك\\s*هير"), "look here")
    .replace(arBoundary("ريبيت\\s*افتر\\s*مي"), "repeat after me")
    .replace(arBoundary("وان\\s*مور\\s*تايم"), "one more time")
    .replace(arBoundary("تيك\\s*يور\\s*تايم"), "take your time")
    .replace(arBoundary("ريز\\s*يور\\s*هاند"), "raise your hand")
    .replace(arBoundary("سايلنت\\s*بليز"), "silent please")
    .replace(arBoundary("بي\\s*كوايت"), "be quiet")
    .replace(arBoundary("ليسن\\s*تو\\s*مي|لسن\\s*تو\\s*مي"), "listen to me")
    .replace(arBoundary("فوكس\\s*(?:معايا|ويز\\s*مي)"), "focus معايا")
    .replace(arBoundary("ار\\s*يو\\s*ريدي"), "are you ready")
    .replace(arBoundary("ار\\s*يو\\s*ويز\\s*مي"), "are you with me")
    .replace(arBoundary("هو\\s*كان\\s*انسر"), "who can answer")
    .replace(arBoundary("هو\\s*كان"), "who can")
    .replace(arBoundary("هو\\s*نووز"), "who knows")
    .replace(arBoundary("وات\\s*اباوت"), "what about")
    .replace(arBoundary("واتس\\s*(?:ذيس|ديس)"), "what's this")
    .replace(arBoundary("واتس\\s*ذات"), "what's that")
    .replace(arBoundary("هاو\\s*ار\\s*يو"), "how are you")
    .replace(arBoundary("وات\\s*داز\\s*ات\\s*مين"), "what does it mean")
    .replace(arBoundary("واتس\\s*ذا\\s*مينينج"), "what's the meaning")
    .replace(arBoundary("ليتس\\s*جو|لتس\\s*جو"), "let's go")
    .replace(arBoundary("ليتس\\s*ستارت|لتس\\s*ستارت"), "let's start")
    .replace(arBoundary("ليتس\\s*سي|لتس\\s*سي"), "let's see")
    .replace(arBoundary("شير\\s*سكرين"), "share screen")

    // Greetings & Social Responses
    .replace(arBoundary("جود\\s*مورنينج"), "good morning")
    .replace(arBoundary("جود\\s*افتر\\s*نون"), "good afternoon")
    .replace(arBoundary("جود\\s*ايفنينج"), "good evening")
    .replace(arBoundary("جود\\s*باي|باي\\s*باي"), "goodbye")
    .replace(arBoundary("سي\\s*يو\\s*ليتر"), "see you later")
    .replace(arBoundary("سي\\s*يو"), "see you")
    .replace(arBoundary("ثانك\\s*يو\\s*فيري\\s*ماتش"), "thank you very much")
    .replace(arBoundary("ثانك\\s*يو|ثانكس"), "thank you")
    .replace(arBoundary("يو\\s*ار\\s*ويلكم"), "you're welcome")
    .replace(arBoundary("جريت\\s*جوب"), "great job")
    .replace(arBoundary("جود\\s*جوب"), "good job")
    .replace(arBoundary("ويل\\s*دان"), "well done")
    .replace(arBoundary("فيري\\s*جود"), "very good")
    .replace(arBoundary("براود\\s*اوف\\s*يو"), "proud of you")
    .replace(arBoundary("اوف\\s*كورس"), "of course")
    .replace(arBoundary("اكسكيوز\\s*مي"), "excuse me");

  // 2. Grammar, Linguistic Terms & Parts of Speech
  s = s
    .replace(arBoundary("(?:ان|إن)\\s*(?:اكزامبل|إكزامبل)"), "an example")
    .replace(arBoundary("(?:ال)?اكزامبلز|(?:ال)?إكزامبلز"), "examples")
    .replace(arBoundary("(?:ال)?اكزامبل|(?:ال)?إكزامبل"), "example")
    .replace(arBoundary("(?:ال)?جرامر"), "grammar")
    .replace(arBoundary("وربس|فيربس|فرربس"), "verbs")
    .replace(arBoundary("ورب|فيرب|فررب"), "verb")
    .replace(arBoundary("ريجيولار|ريجولار"), "regular")
    .replace(arBoundary("ارريجيولار|اريجولار|ارريجولار"), "irregular")
    .replace(arBoundary("ناونز"), "nouns")
    .replace(arBoundary("ناون"), "noun")
    .replace(arBoundary("ادجيكتيفز|ادجكتيفز"), "adjectives")
    .replace(arBoundary("ادجيكتيف|ادجكتيف"), "adjective")
    .replace(arBoundary("ادفيربس"), "adverbs")
    .replace(arBoundary("ادفيرب"), "adverb")
    .replace(arBoundary("بروناونس|برونوونز"), "pronouns")
    .replace(arBoundary("بروناون|برونوون"), "pronoun")
    .replace(arBoundary("بريبوزيشنز"), "prepositions")
    .replace(arBoundary("بريبوزيشن"), "preposition")
    .replace(arBoundary("كونجانكشن"), "conjunction")
    .replace(arBoundary("سينتنسز|سنتنسز"), "sentences")
    .replace(arBoundary("سينتنس|سنتنس"), "sentence")
    .replace(arBoundary("كويستشنز|كوتشنز"), "questions")
    .replace(arBoundary("كويستشن|كوتشن"), "question")
    .replace(arBoundary("انسرز"), "answers")
    .replace(arBoundary("انسر"), "answer")
    .replace(arBoundary("(?:ال)?رول"), "rule")
    .replace(arBoundary("(?:ال)?فورم"), "form")
    .replace(arBoundary("انفينيتيف"), "infinitive")
    .replace(arBoundary("جيراند"), "gerund")
    .replace(arBoundary("(?:ال)?فوكابلري|(?:ال)?فوكاب"), "vocabulary")
    .replace(arBoundary("(?:ال)?سبيلنج"), "spelling")
    .replace(arBoundary("(?:ال)?برونانسيشن"), "pronunciation")
    .replace(arBoundary("(?:ال)?مينينج"), "meaning")
    .replace(arBoundary("(?:ال)?ابوزيت"), "opposite")
    .replace(arBoundary("سينونيم"), "synonym")
    .replace(arBoundary("انتونيم"), "antonym")
    .replace(arBoundary("سيلابلز"), "syllables")
    .replace(arBoundary("سيلابل"), "syllable")
    .replace(arBoundary("(?:ال)?فونيكس"), "phonics")
    .replace(arBoundary("دايجراف"), "digraph")
    .replace(arBoundary("فاولز"), "vowels")
    .replace(arBoundary("فاول"), "vowel")
    .replace(arBoundary("كونسونانتس"), "consonants")
    .replace(arBoundary("كونسونانت"), "consonant");

  // 3. School Subjects, Educational Tools & Technology
  s = s
    .replace(arBoundary("(?:ال)?انجلش"), "English")
    .replace(arBoundary("(?:ال)?ماث"), "math")
    .replace(arBoundary("(?:ال)?ساينس"), "science")
    .replace(arBoundary("فرنش"), "French")
    .replace(arBoundary("هيستوري"), "history")
    .replace(arBoundary("جيوغرافي"), "geography")
    .replace(arBoundary("كمبيوتر|كومبيوتر"), "computer")
    .replace(arBoundary("(?:ال)?هوم\\s*ورك|(?:ال)?هومورك"), "homework")
    .replace(arBoundary("(?:ال)?كلاس\\s*روم|(?:ال)?كلاسروم"), "classroom")
    .replace(arBoundary("(?:ال)?كلاس"), "class")
    .replace(arBoundary("اونلاين"), "online")
    .replace(arBoundary("اوفلاين"), "offline")
    .replace(arBoundary("(?:ال)?مايكروفون"), "microphone")
    .replace(arBoundary("(?:ال)?مايك"), "mic")
    .replace(arBoundary("كاميرا"), "camera")
    .replace(arBoundary("(?:ال)?سكرين"), "screen")
    .replace(arBoundary("(?:ال)?تشات|(?:ال)?شات"), "chat")
    .replace(arBoundary("(?:ال)?لينك"), "link")
    .replace(arBoundary("(?:ال)?فايل"), "file")
    .replace(arBoundary("بي\\s*دي\\s*اف|بي\\s*دي\\s*إف|بي\\s*دي\\s*أف"), "PDF")
    .replace(arBoundary("(?:ال)?يونت"), "unit")
    .replace(arBoundary("(?:ال)?ليسون"), "lesson")
    .replace(arBoundary("(?:ال)?شابتر"), "chapter")
    .replace(arBoundary("بيج"), "page")
    .replace(arBoundary("باراجراف|براجراف"), "paragraph")
    .replace(arBoundary("تيكست"), "text")
    .replace(arBoundary("دايالوج"), "dialogue")
    .replace(arBoundary("كونفرسيشن"), "conversation")
    .replace(arBoundary("ستوري"), "story")
    .replace(arBoundary("(?:ال)?كويز"), "quiz")
    .replace(arBoundary("(?:ال)?تست"), "test")
    .replace(arBoundary("(?:ال)?اكزام|(?:ال)?إكزام"), "exam")
    .replace(arBoundary("ماركس"), "marks")
    .replace(arBoundary("مارك"), "mark")
    .replace(arBoundary("جريدز"), "grades")
    .replace(arBoundary("جريد"), "grade")
    .replace(arBoundary("سلايدز"), "slides")
    .replace(arBoundary("سلايد"), "slide")
    .replace(arBoundary("برزنتيشن"), "presentation")
    .replace(arBoundary("اكتيفيتي"), "activity")
    .replace(arBoundary("اكسرسايز|اكسرسيز"), "exercise")
    .replace(arBoundary("تاسك"), "task")
    .replace(arBoundary("بروجكت"), "project");

  // 4. Common Verbs & Conjugations
  s = s
    .replace(arBoundary("بليد"), "played")
    .replace(arBoundary("بلاي"), "play")
    .replace(arBoundary("وتشد"), "watched")
    .replace(arBoundary("وتش"), "watch")
    .replace(arBoundary("درانك"), "drank")
    .replace(arBoundary("درينك"), "drink")
    .replace(arBoundary("سليبت"), "slept")
    .replace(arBoundary("سليب"), "sleep")
    .replace(arBoundary("وينت"), "went")
    .replace(arBoundary("كيم"), "came")
    .replace(arBoundary("روت"), "wrote")
    .replace(arBoundary("رايت"), "write")
    .replace(arBoundary("سبوك"), "spoke")
    .replace(arBoundary("سبيك"), "speak")
    .replace(arBoundary("توكت"), "talked")
    .replace(arBoundary("توك"), "talk")
    .replace(arBoundary("تولد"), "told")
    .replace(arBoundary("تيل"), "tell")
    .replace(arBoundary("اسكت"), "asked")
    .replace(arBoundary("اسك"), "ask")
    .replace(arBoundary("ليسند"), "listened")
    .replace(arBoundary("ليسن|لسن"), "listen")
    .replace(arBoundary("هيرد"), "heard")
    .replace(arBoundary("هير"), "hear")
    .replace(arBoundary("رانينج"), "running")
    .replace(arBoundary("ران"), "run")
    .replace(arBoundary("وووكت|ووكت"), "walked")
    .replace(arBoundary("وووك|ووك"), "walk")
    .replace(arBoundary("سوام"), "swam")
    .replace(arBoundary("سويم"), "swim")
    .replace(arBoundary("فلو"), "flew")
    .replace(arBoundary("فلاي"), "fly")
    .replace(arBoundary("ستاديد"), "studied")
    .replace(arBoundary("ستادي"), "study")
    .replace(arBoundary("توت"), "taught")
    .replace(arBoundary("تيتش"), "teach")
    .replace(arBoundary("ليرند"), "learned")
    .replace(arBoundary("ليرن"), "learn")
    .replace(arBoundary("هيلبد"), "helped")
    .replace(arBoundary("هيلب"), "help")
    .replace(arBoundary("لايكد"), "liked")
    .replace(arBoundary("لايك"), "like")
    .replace(arBoundary("لافت"), "laughed")
    .replace(arBoundary("لاف"), "laugh")
    .replace(arBoundary("سمايل"), "smile")
    .replace(arBoundary("كراي"), "cry")
    .replace(arBoundary("كليند"), "cleaned")
    .replace(arBoundary("كلين"), "clean")
    .replace(arBoundary("واشد"), "washed")
    .replace(arBoundary("واش"), "wash")
    .replace(arBoundary("كوكت"), "cooked")
    .replace(arBoundary("كوك"), "cook")
    .replace(arBoundary("اوبند"), "opened")
    .replace(arBoundary("اوبن"), "open")
    .replace(arBoundary("كلوزد"), "closed")
    .replace(arBoundary("كلوز"), "close")
    .replace(arBoundary("ستارتد"), "started")
    .replace(arBoundary("ستارت"), "start")
    .replace(arBoundary("ستوبد"), "stopped")
    .replace(arBoundary("ستوب"), "stop")
    .replace(arBoundary("فينشد|فنشد"), "finished")
    .replace(arBoundary("فينش|فنش"), "finish")
    .replace(arBoundary("تشيك|شيك"), "check")
    .replace(arBoundary("ريبيت"), "repeat")
    .replace(arBoundary("براكتس"), "practice")
    .replace(arBoundary("ريفيو"), "review")
    .replace(arBoundary("كومبليت"), "complete")
    .replace(arBoundary("ماتش"), "match")
    .replace(arBoundary("تشوز|شوز"), "choose")
    .replace(arBoundary("سيركل"), "circle")
    .replace(arBoundary("اندرلاين"), "underline");

  // 5. Praise, Feedback & Reactions
  s = s
    .replace(arBoundary("اكسلنت|إكسلنت"), "excellent")
    .replace(arBoundary("بيرفكت"), "perfect")
    .replace(arBoundary("اميزنج|إميزنج"), "amazing")
    .replace(arBoundary("واندرفول"), "wonderful")
    .replace(arBoundary("فانتاستيك"), "fantastic")
    .replace(arBoundary("جريت"), "great")
    .replace(arBoundary("سوبر"), "super")
    .replace(arBoundary("كوريكت"), "correct")
    .replace(arBoundary("انكوريكت"), "incorrect")
    .replace(arBoundary("ترو"), "true")
    .replace(arBoundary("فولس"), "false")
    .replace(arBoundary("رونج"), "wrong")
    .replace(arBoundary("اكزاكتلي"), "exactly")
    .replace(arBoundary("ابسولوتلي"), "absolutely")
    .replace(arBoundary("سوري"), "sorry")
    .replace(arBoundary("بليز"), "please")
    .replace(arBoundary("شور"), "sure")
    .replace(arBoundary("ويلكم"), "welcome")
    .replace(arBoundary("اوكيه|اوكي|اوك"), "okay")
    .replace(arBoundary("هلو"), "hello")
    .replace(arBoundary("هاي"), "hi")
    .replace(arBoundary("نكست"), "next")
    .replace(arBoundary("ريدي"), "ready")
    .replace(arBoundary("دن"), "done");

  // 6. German (Deutsch) - Words, Greetings & Grammar
  s = s
    .replace(arBoundary("جوتن\\s*(?:تاج|تاق)"), "Guten Tag")
    .replace(arBoundary("جوتن\\s*مورجن"), "Guten Morgen")
    .replace(arBoundary("جوتن\\s*ابند"), "Guten Abend")
    .replace(arBoundary("جوت\\s*ناخت"), "Gute Nacht")
    .replace(arBoundary("اوف\\s*فيدرزين|اوف\\s*فيدر\\s*زين"), "Auf Wiedersehen")
    .replace(arBoundary("تشوس|تشوز|تشوسس"), "Tschüss")
    .replace(arBoundary("دانك\\s*شون|دانكي\\s*شون"), "Dankeschön")
    .replace(arBoundary("دانكي|دانكه"), "Danke")
    .replace(arBoundary("بيتي\\s*شون"), "Bitteschön")
    .replace(arBoundary("بيتي|بيته"), "Bitte")
    .replace(arBoundary("في\\s*جيتس|في\\s*جيت\\s*اس"), "Wie geht's?")
    .replace(arBoundary("في\\s*جيت\\s*اس\\s*دير"), "Wie geht es dir?")
    .replace(arBoundary("في\\s*جيت\\s*اس\\s*اينين"), "Wie geht es Ihnen?")
    .replace(arBoundary("في\\s*هايست\\s*دو"), "Wie heißt du?")
    .replace(arBoundary("فوهير\\s*كومت\\s*دو"), "Woher kommst du?")
    .replace(arBoundary("فاس\\s*ايست\\s*داس"), "Was ist das?")
    .replace(arBoundary("ايش\\s*هايسي|اش\\s*هايسي"), "Ich heiße")
    .replace(arBoundary("ايش\\s*بين|اش\\s*بين"), "Ich bin")
    .replace(arBoundary("سير\\s*جوت|زير\\s*جوت"), "Sehr gut")
    .replace(arBoundary("بريما"), "Prima")
    .replace(arBoundary("فونداربار|فوندربار"), "Wunderbar")
    .replace(arBoundary("دير\\s*تيش"), "der Tisch")
    .replace(arBoundary("داس\\s*بوخ"), "das Buch")
    .replace(arBoundary("دي\\s*تافل"), "die Tafel")
    .replace(arBoundary("(?:ال)?فيربن"), "Verben")
    .replace(arBoundary("(?:ال)?جراماتيك"), "Grammatik")
    .replace(arBoundary("(?:ال)?هاوس\\s*اوفجابين|(?:ال)?هاوس\\s*اوبجابن"), "Hausaufgaben")
    .replace(arBoundary("نوميناتيف"), "Nominativ")
    .replace(arBoundary("اكوزاتيف"), "Akkusativ")
    .replace(arBoundary("داتيف"), "Dativ")
    .replace(arBoundary("جينيتيف"), "Genitiv")
    .replace(arBoundary("بايشبيل"), "Beispiel")
    .replace(arBoundary("اوبونج|ايبونج"), "Übung")
    .replace(arBoundary("فراجا|فراجي"), "Frage")
    .replace(arBoundary("انتفورت"), "Antwort")
    .replace(arBoundary("شبريشن"), "sprechen")
    .replace(arBoundary("ليزن"), "lesen")
    .replace(arBoundary("شرايبن"), "schreiben")
    .replace(arBoundary("هورن"), "hören")
    .replace(arBoundary("ليرنن"), "lernen")
    .replace(arBoundary("فيرشتيهن"), "verstehen")
    .replace(arBoundary("دير"), "der")
    .replace(arBoundary("داس"), "das")
    .replace(arBoundary("اين"), "ein")
    .replace(arBoundary("ايني"), "eine");

  // 7. French (Français) - Greetings, Phrases & Grammar
  s = s
    .replace(arBoundary("بونجور"), "Bonjour")
    .replace(arBoundary("بونسوار"), "Bonsoir")
    .replace(arBoundary("بون\\s*نوي"), "Bonne nuit")
    .replace(arBoundary("او\\s*روفوار|اوروفوار"), "Au revoir")
    .replace(arBoundary("سيل\\s*فو\\s*بليه|سيلفوبليه"), "S'il vous plaît")
    .replace(arBoundary("ميرسي\\s*بوكو"), "Merci beaucoup")
    .replace(arBoundary("ميرسي"), "Merci")
    .replace(arBoundary("دو\\s*ريان"), "De rien")
    .replace(arBoundary("سالف|سالو"), "Salut")
    .replace(arBoundary("كومان\\s*سافا|سافا"), "Comment ça va?")
    .replace(arBoundary("كومان\\s*فو\\s*زابيلي\\s*فو"), "Comment vous appelez-vous?")
    .replace(arBoundary("جيمابل|جو\\s*مابيل"), "Je m'appelle")
    .replace(arBoundary("جو\\s*سوي|جوسوي"), "Je suis")
    .replace(arBoundary("تري\\s*بيان"), "Très bien")
    .replace(arBoundary("بارفيه"), "Parfait")
    .replace(arBoundary("دوكيمون"), "document")
    .replace(arBoundary("دوفوار|ليه\\s*دوفوار"), "les devoirs")
    .replace(arBoundary("جرامير|لا\\s*جرامير"), "la grammaire")
    .replace(arBoundary("لو\\s*فوكابولير|فوكابولير"), "le vocabulaire")
    .replace(arBoundary("لو\\s*فيرب|ليه\\s*فيرب"), "les verbes");

  return s;
}

export function normalizeSpeechTranscription(
  rawText: string,
  options?: { addPunctuation?: boolean }
): string {
  if (!rawText) return "";

  let text = rawText.trim();

  // Strip excessive spaces while preserving all multilingual alphabets (Arabic, Latin, German umlauts, French accents, Chinese, etc.)
  text = text.replace(/\s+/g, " ").trim();

  // 2. Greetings and common conversational openers
  text = text
    .replace(arBoundary("[أإا]?علم\\s*عليكم|سلام\\s*عليكم|سلم\\s*عليكم|سلامو\\s*عليكم|السام\\s*عليكم"), "السلام عليكم")
    .replace(
      /(?<=^|[\s.,?!،؛:])(?:أمنين|حملين|حاملين|أمين|أمليين|عمين|عملين|امين|املين)\s*(?:إياح|إيه|ايه|إي|اي)?(?=[\s.,?!،؛:]|$)/gi,
      "عاملين إيه"
    )
    .replace(arBoundary("أمنين\\s*إياح|أمنين|حملين|حاملين|عملين|عمين"), "عاملين")
    .replace(arBoundary("إياح\\s*بايبي|يا\\s*بايبي|بايبي|حايبي"), "يا حبايبي")
    .replace(arBoundary("ميز\\s*مريم|ميث\\s*مريم|مس\\s*مريم|ميس\\s*ماريوم"), "ميس مريم")
    .replace(arBoundary("معيكم"), "معاكم")
    .replace(arBoundary("يا\\s*حبيبي"), "يا حبايبي")
    .replace(arBoundary("ميز|ميث"), "ميس")
    .replace(arBoundary("ماريوم"), "مريم")
    .replace(arBoundary("سورة|ساره|صارة"), "سارة")
    .replace(arBoundary("ياسيم|يعيسين|ياسينو|يا سين|إيسي|ايسي"), "ياسين")
    .replace(arBoundary("يا عيسين"), "يا ياسين")
    .replace(arBoundary("يجانور|يانور"), "يا نور")
    .replace(arBoundary("شطرة"), "شاطرة")
    .replace(arBoundary("هم مرين دمعينة|دمعينة|دمعين"), "سامعيني")
    .replace(arBoundary("أولس و أهلق|أوريس و ألق|وليس ويجي|أتفاق دالي"), "قولي سؤالك")
    .replace(arBoundary("وما دين|وما دين\\?|وبدين"), "وبعدين")
    .replace(arBoundary("إصراحي|إصرحي"), "اشرحي")
    .replace(arBoundary("المأسوس"), "المقصود")
    .replace(arBoundary("يولي أمسل|قولي أمسل"), "قولي أمثلة")
    .replace(arBoundary("بدي إيه صار|إيه صار"), "ابدأي يا سارة")
    .replace(arBoundary("وللغم لسر"), "قولي يا سارة")
    .replace(arBoundary("انتمعين|معينة"), "سامعاني")
    .replace(arBoundary("سباح الخير|صباح الخير يا سدار"), "صباح الخير يا شطار")
    .replace(arBoundary("هذه\\s*بصارة|هذي\\s*بصارة|طب\\s*بصارة|يا\\s*بصارة|بصارة"), "يا سارة")
    .replace(arBoundary("وليلنا|وللناء|ولناء"), "قولي لنا")
    .replace(arBoundary("تحبيت\\s*ذاكرية|بتحبيت\\s*ذاكرية|بتحبيت\\s*تذاكرية"), "بتحبي تذاكريها")
    .replace(arBoundary("تذاكرية|بذاكرية"), "تذاكريها")
    .replace(arBoundary("تبقولينا"), "طب قولي لنا")
    .replace(arBoundary("قولينا"), "قول لنا")
    .replace(arBoundary("داري يسين|داري ياسين|تقدر يسين"), "تقدر يا ياسين")
    .replace(arBoundary("تقوليو"), "تقول لنا")
    .replace(arBoundary("نميسيل|ميسيل|ميسال"), "مثال")
    .replace(arBoundary("انتماعيا|انتمايا|انت معيا"), "أنت معايا")
    .replace(arBoundary("يسين"), "ياسين")
    .replace(arBoundary("ناسين ميسيل|ناسيين ميسيل|ناسين مسيل|ناسيين مسيل"), "ناسيين مثال")
    .replace(arBoundary("ناسين"), "ناسيين")
    .replace(arBoundary("هنأخو\\s*در|هنأخذ\\s*در|هناخو\\s*در|هناخد\\s*در"), "هناخد درس")
    .replace(arBoundary("رياضي\\s*يد|رياضي\\s*يوت|رياضييت"), "رياضيات")
    .replace(arBoundary("أرد\\s*أن\\s*أخذ|ارد\\s*ان\\s*اخذ"), "عايزين ناخد")
    .replace(arBoundary("كبتفتكر"), "طب تفتكري")
    .replace(arBoundary("وغيت|و\\s*غيت"), "وغير")
    .replace(arBoundary("دانية\\s*سين|دانية\\s*يسين|دانيه\\s*سين|دانيه\\s*يسين|دانية\\s*ياسين|دانيه\\s*ياسين|دانيه\\s*سن"), "ياسين")
    .replace(arBoundary("حبيبية\\s*(?:يشارك|يشترك|شارك)?|حبيبي\\s*شارك"), "حابب يشارك")
    .replace(arBoundary("حبيبية"), "حابب")
    .replace(arBoundary("إنها\\s*(?:ببشيرك|بشيرك|بتشارك|تشترك|بشارك)|ببشيرك|بشيرك"), "يشارك")
    .replace(arBoundary("شارك\\s*(?:تايني|تيني)"), "يشارك تاني")
    .replace(arBoundary("تايني|تيني"), "تاني")
    .replace(arBoundary("هنقش"), "هنناقش")
    .replace(arBoundary("عايزيني"), "عايزينه")
    .replace(arBoundary("حدي\\s*يقول\\s*لي|حدي\\s*قولي"), "حد يقول لي")
    .replace(arBoundary("حدي"), "حد")
    .replace(arBoundary("رافو|براهو|براو"), "برافو")
    .replace(arBoundary("يا\\s*نوش|يانوش"), "يا نور")
    .replace(arBoundary("نوش"), "نور")
    .replace(arBoundary("خمس\\s*طوصر|خمستوصر|خمس\\s*توصر"), "خمستاشر")
    .replace(arBoundary("حد\\s*فيهم"), "حد فهم")
    .replace(arBoundary("قالتو"), "قالته")
    .replace(arBoundary("هيه\\s*وبقى|هيه\\s*وبقا"), "يجاوب بقى")
    .replace(arBoundary("مشخص\\s*يا\\s*عمر|مش\\s*خص\\s*يا\\s*عمر"), "مثلاً يا عمر")
    .replace(arBoundary("(?:و)?غناها\\s*(?:الوقت|وقت)?\\s*(?:كثير|كتير)\\s*(?:قوي|أوي|اوي)"), "وغليناها وقت كتير أوي")
    .replace(arBoundary("(?:و)?غليناها\\s*(?:الوقت|وقت)?\\s*(?:كثير|كتير)\\s*(?:قوي|أوي|اوي)"), "وغليناها وقت كتير أوي")
    .replace(arBoundary("تفتكروا\\s*الميه|تفتكري\\s*الميه"), "تفتكروا المية");

  // 3. Convert all Arabic-transliterated English words and educational terms into proper English letters
  text = convertTransliteratedEnglish(text);

  if (options?.addPunctuation !== false) {
    text = punctuateArabicSpeech(text);
  }

  return text.trim();
}

export const normalizeTeacherSpeech = normalizeSpeechTranscription;

/**
 * Automatically restores Arabic punctuation (؟, !, ،, .) to transcribed speech.
 * Identifies question clauses, vocatives, transition markers, praise/exclamations,
 * and declarative sentences to produce naturally punctuated classroom discourse.
 */
export function punctuateArabicSpeech(text: string): string {
  if (!text || text.trim().length === 0) return "";
  let s = text.trim();

  // If already ends with punctuation, do minor formatting cleanup and return
  if (/[؟!.]/.test(s.slice(-1))) {
    return s.replace(/\s*([،؛!؟?.])\s*/g, "$1 ").replace(/\s+/g, " ").trim();
  }

  // 1. Normalize spacing around existing punctuation if any
  s = s.replace(/\s*([،؛!؟?.])\s*/g, "$1 ").replace(/\s+/g, " ").trim();

  // 2. Normalize common dialect words for clean punctuation
  s = s
    .replace(/(?<=^|\s)النهارده(?=\s|$)/g, "النهاردة")
    .replace(/(?<=^|\s)حاجه(?=\s|$)/g, "حاجة")
    .replace(/(?<=^|\s)بسيطه(?=\s|$)/g, "بسيطة")
    .replace(/(?<=^|\s)عايزه(?=\s|$)/g, "عايزة")
    .replace(/(?<=^|\s)ايه(?=\s|$|[،؟!.])/g, "إيه")
    .replace(/(?<=^|\s)ازاي(?=\s|$|[،؟!.])/g, "إزاي")
    .replace(/(?<=^|\s)اكبر(?=\s|$|[،؟!.])/g, "أكبر")
    .replace(/(?<=^|\s)اصغر(?=\s|$|[،؟!.])/g, "أصغر")
    .replace(/(?<=^|\s)هنبدا(?=\s|$|[،؟!.])/g, "هنبدأ");

  // 3. Isolated Praise / Exclamation at the start when followed by a transition/question:
  // "ممتاز طيب لو..." -> "ممتاز! طيب، لو..."
  s = s.replace(/^(ممتاز|برافو|أحسنت|شاطر|شاطرة|عظيم|جميل جدا|رائع|ما شاء الله)\s+(?=طيب|طب|يلا|لو|مين|إيه|ليه|إزاي)/i, "$1! ");

  // 4. Vocatives (منادى): add comma after vocative phrase IF followed by other words
  // "يا عمر ركز" -> "يا عمر، ركز"
  // "يا شباب جاهزين" -> "يا شباب، جاهزين"
  s = s.replace(
    /(?<=^|[\s،!?.])(يا\s+(?:عمر|سارة|ياسين|نور|شباب|ولاد|أولاد|جماعة|شطار|أبطال|بنات|مستر|ميس|أستاذ|معلمة|حضرة\s*الناظر|حبيبي|حبايبي))\s+(?=[^\s،!?.])/gi,
    "$1، "
  );

  // 5. Question words in the middle of a sentence after an introductory clause:
  // "حد يجاوبني ليه ما حدش" -> "حد يجاوبني، ليه ما حدش"
  s = s.replace(/([^،!?.]{4,})\s+(ليه|إزاي|ازاي)\s+/gi, "$1، $2 ");

  // 6. Transition words at start of clauses:
  // "يلا كل واحد" -> "يلا، كل واحد"
  // "طيب لو عندي" -> "طيب، لو عندي"
  s = s.replace(/^(يلا|طيب|طب|بصوا|شوفوا|المهم)\s+(?=[^\s،!?.])/i, "$1، ");
  s = s.replace(/(?<=[.!?،]\s*)(يلا|طيب|طب|بصوا|شوفوا|المهم)\s+(?=[^\s،!?.])/gi, "$1، ");

  // 7. Contrastive and explanatory clauses:
  // "بس قبل ما اشرح" -> "، بس قبل ما أشرح"
  s = s.replace(/\s+(بس\s+قبل\s+ما|بس\s+عايز|بس\s+عايزة|لكن\s+قبل|علشان\s+كده|وعلشان\s+كده|لكن)\s+/gi, "، $1 ");

  // 8. Compound questions joined by "و":
  // "الرقم اللي فوق اسمه إيه والرقم اللي تحت اسمه إيه"
  // -> "الرقم اللي فوق اسمه إيه؟ والرقم اللي تحت اسمه إيه؟"
  s = s.replace(
    /([^؟!?،]+(?:اسمه\s*إيه|يعني\s*إيه|إيه|كام|ليه|إزاي))\s+(و\s*(?:الرقم\s*اللي|اللي|مين|إيه|ليه|إزاي|كام|تفتكروا))/gi,
    "$1؟ $2"
  );

  // 9. Introductory clauses before question:
  // "عايزة أشوف أنتم فاكرين إيه من اللي أخدناه قبل كده، مين يقول لي يعني إيه كسر؟"
  s = s.replace(
    /([^،!?.]{8,})\s+(مين\s*(?:يقول|يعرف|يشرح|يجاوب|يكمل|شاطر|يقدر|أكبر|اصغر)|حد\s*(?:يقول|يعرف|يجاوب)|تفتكروا)/gi,
    "$1، $2"
  );

  // 10. Check if the utterance (or its last clause) is a question:
  const isQuestion =
    /[؟?]/.test(s) ||
    /(?:^|[\s،])(?:مين|إيه|ايه|ليه|إزاي|ازاي|فين|منين|كام|كم|هل|ماذا|ما\s*هو|ما\s*هي|تفتكروا|شايفين|أنهي|انهي|أيهم|ايهم|أكبر\s*ولا|اكبر\s*ولا|اسمه\s*إيه|اسمه\s*ايه|يعني\s*إيه|يعني\s*ايه|سامعيني|صوتي\s*واضح|مركزين|فاهمين|who|what|where|how|can\s*you|could\s*you)(?=[\s،]|$)/i.test(s);

  // 11. Check if utterance is pure praise/exclamation:
  const isExclamation =
    /^(?:ممتاز|برافو|أحسنت|شاطر|شاطرة|عظيم|جميل\s*جداً|رائع|ما\s*شاء\s*الله|صباح\s*الخير|مساء\s*الخير|السلام\s*عليكم|أهلاً\s*وسهلاً)(?:[\s،]|$)/i.test(s) &&
    s.split(/\s+/).length <= 6;

  // Add final punctuation mark:
  if (!/[؟!.]\s*$/.test(s)) {
    if (isQuestion) {
      s = s + "؟";
    } else if (isExclamation) {
      s = s + "!";
    } else {
      s = s + ".";
    }
  }

  // Final cleanup of double spaces or redundant punctuation
  s = s
    .replace(/\s*،\s*،/g, "، ")
    .replace(/\s*،\s*([؟!])/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/\s*([،؛!؟?.])/g, "$1")
    .replace(/([،؛!؟?.])(?=[^\s،؛!؟?.])/g, "$1 ")
    .trim();

  return s;
}

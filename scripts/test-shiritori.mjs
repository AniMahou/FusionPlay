// Stress test for Anime Shiritori answers. Plays every case through the real room referee.
//   node scripts/test-shiritori.mjs            run all cases
//   node scripts/test-shiritori.mjs -v         also print what every case resolved to
// Expectation per case:
//   /regex/            the answer must be accepted (or offered in the pick list) with a name matching it
//   ['pick', /regex/]  the player must get a pick list, and it must include a matching name
//   'none'             the answer must be rejected as unknown
process.env.ANIMAHOU_DB = ':memory:';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const { db } = await import(`${root}server/db.js`);
const { Matcher, chainLetters } = await import(`${root}server/shiritori/matcher.js`);
const { ShiritoriRooms } = await import(`${root}server/shiritori/rooms.js`);
const matcher = Matcher.fromSeed(`${root}server/seed/shiritori.json`);
const rooms = new ShiritoriRooms({ matcher, db });
clearInterval(rooms.timer);
const ev = db.prepare("SELECT * FROM events WHERE id = 'shiritori'").get();
const verbose = process.argv.includes('-v');

const CASES = [
  // ---------- Full names, both orders ----------
  ['Naruto Uzumaki', /naruto uzumaki|uzumaki naruto/i], ['Uzumaki Naruto', /uzumaki naruto/i],
  ['Sasuke Uchiha', /sasuke/i], ['Uchiha Itachi', /itachi/i], ['Obito Uchiha', /obito/i], ['Kakashi Hatake', /kakashi/i],
  ['Hinata Hyuga', /hinata hy/i], ['Hyuuga Hinata', /hy.*hinata/i], ['Jiraiya', /jiraiya/i], ['Tsunade', /tsunade/i], ['Gaara', /gaara/i],
  ['Monkey D. Luffy', /luffy/i], ['Monkey D Luffy', /luffy/i], ['Roronoa Zoro', /zoro/i], ['Vinsmoke Sanji', /sanji/i], ['Nico Robin', /robin/i], ['Portgas D. Ace', /ace/i], ['Trafalgar Law', /law/i],
  ['Eren Yeager', /eren/i], ['Eren Jaeger', /eren/i], ['Mikasa Ackerman', /mikasa/i], ['Levi Ackerman', /levi/i], ['Armin Arlert', /armin/i], ['Erwin Smith', /erwin/i], ['Hange Zoe', /hange|zo[eë]/i],
  ['Tanjiro Kamado', /tanjir/i], ['Nezuko Kamado', /nezuko/i], ['Zenitsu Agatsuma', /zenitsu/i], ['Inosuke Hashibira', /inosuke/i], ['Kyojuro Rengoku', /rengoku|kyou?jurou?/i], ['Giyu Tomioka', /giyu|tomioka/i], ['Shinobu Kocho', /shinobu/i], ['Muzan Kibutsuji', /muzan/i],
  ['Satoru Gojo', /gojo|satoru/i], ['Gojo Satoru', /gojo/i], ['Yuji Itadori', /yuu?ji|itadori/i], ['Megumi Fushiguro', /megumi|fushiguro/i], ['Nobara Kugisaki', /nobara/i], ['Ryomen Sukuna', /sukuna/i], ['Suguru Geto', /suguru|geto/i],
  ['Light Yagami', /light/i], ['L Lawliet', /lawliet/i], ['Ryuk', /ryuk/i], ['Lelouch Lamperouge', /lelouch/i], ['Lelouch vi Britannia', /lelouch/i],
  ['Edward Elric', /edward/i], ['Alphonse Elric', /alphonse/i], ['Roy Mustang', /mustang/i], ['Spike Spiegel', /spike/i],
  ['Okabe Rintarou', /okabe/i], ['Rintaro Okabe', /rintarou? okabe/i], ['Kurisu Makise', /kurisu/i], ['Makise Kurisu', /makise/i],
  ['Saitama', /saitama/i], ['Genos', /genos/i], ['Shigeo Kageyama', /shigeo|kageyama/i], ['Anya Forger', /anya/i], ['Loid Forger', /loid/i], ['Yor Forger', /yor/i],
  ['Denji', /denji/i], ['Power', /power/i], ['Makima', /makima/i], ['Aki Hayakawa', /aki/i],
  ['Frieren', /frieren/i], ['Fern', /fern/i], ['Himmel', /himmel/i], ['Stark', /stark/i],
  ['Rem', /rem/i], ['Emilia', /emilia/i], ['Subaru Natsuki', /subaru/i], ['Natsuki Subaru', /natsuki/i],
  ['Hachiman Hikigaya', /hachiman/i], ['Hikigaya Hachiman', /hikigaya/i], ['Yukino Yukinoshita', /yukino/i], ['Yui Yuigahama', /yui/i],
  ['Kirito', /kirito/i], ['Asuna Yuuki', /asuna/i], ['Yuuki Asuna', /yuu?ki asuna/i], ['Son Goku', /goku/i], ['Vegeta', /vegeta/i],
  ['Gon Freecss', /gon/i], ['Killua Zoldyck', /killua/i], ['Hisoka', /hisoka/i], ['Kurapika', /kurapika/i],
  ['Ichigo Kurosaki', /ichigo/i], ['Rukia Kuchiki', /rukia/i], ['Byakuya Kuchiki', /byakuya/i], ['Senku Ishigami', /senku/i],
  ['Shoyo Hinata', /sh[oō]u?y[oō]u?|hinata/i], ['Tobio Kageyama', /tobio|kageyama/i], ['Izuku Midoriya', /izuku|midoriya/i], ['Katsuki Bakugo', /katsuki|bakugou?/i], ['Bakugou Katsuki', /bakugou?/i],
  ['Shoto Todoroki', /sh[oō]u?to|todoroki/i], ['Shouto Todoroki', /sh[oō]u?to|todoroki/i], ['All Might', /all might|toshinori/i],
  ['Ken Kaneki', /kaneki|ken/i], ['Violet Evergarden', /violet/i], ['Marin Kitagawa', /marin/i], ['Kaguya Shinomiya', /kaguya/i], ['Chika Fujiwara', /chika/i],
  ['Thorfinn', /thorfinn/i], ['Askeladd', /askeladd/i], ['Guts', /guts/i], ['Griffith', /griffith/i], ['Rimuru Tempest', /rimuru/i], ['Ainz Ooal Gown', /ainz/i],
  ['Mai Sakurajima', /mai/i], ['Taiga Aisaka', /taiga/i], ['Holo', /holo/i], ['Megumin', /megumin/i], ['Kazuma Satou', /kazuma/i], ['Satou Kazuma', /sat[oō]u? kazuma/i], ['Aqua', /aqua/i],
  ['Zero Two', /zero two/i], ['Shinji Ikari', /shinji/i], ['Rei Ayanami', /rei/i], ['Asuka Langley Soryu', /asuka/i],
  ['Jotaro Kujo', /jou?tarou?|kuj/i], ['Dio Brando', /dio/i], ['Giorno Giovanna', /giorno/i], ['Mob', /mob|shigeo/i],
  ['Kyojuro Rengoku', /rengoku|kyou?jurou?/i], ['Ryuko Matoi', /ry[uū]u?ko|matoi/i],
  ['Tobi', /tobi/i], ['Uchiha Obito', /obito/i], ['Nami', /nami/i], ['Usopp', /usopp/i], ['Sasuke', /sasuke/i], ['Neji Hyuga', /neji/i], ['Rock Lee', /lee/i],
  ['Pain', /pain/i], ['Zabuza Momochi', /zabuza/i], ['Gintoki Sakata', /gintoki/i], ['Kagura', /kagura/i], ['Boa Hancock', /hancock/i], ['Whitebeard', /whitebeard|edward newgate/i],
  ['Kaido', /kaid/i], ['Nanami Kento', /nanami/i], ['Toji Fushiguro', /t[oō]u?ji/i], ['Maki Zenin', /maki/i], ['Akaza', /akaza/i], ['Tengen Uzui', /tengen|uzui/i],

  // ---------- First names alone ----------
  ['Obito', /obito/i], ['Itachi', /itachi/i], ['Kakashi', /kakashi/i], ['Luffy', /luffy/i], ['Zoro', /zoro/i], ['Tanjiro', /tanjir/i],
  ['Sukuna', /sukuna/i], ['Mikasa', /mikasa/i], ['Lelouch', /lelouch/i], ['Killua', /killua/i], ['Kurisu', /kurisu/i], ['Hachiman', /hachiman/i],
  ['Yukino', /yukino/i], ['Nezuko', /nezuko/i], ['Madara', /madara/i], ['Minato', /minato/i], ['Shikamaru', /shikamaru/i], ['Anya', /anya/i], ['Eren', /eren/i],

  // ---------- Last names alone ----------
  ['Rengoku', /rengoku/i], ['Gojo', /gojo/i], ['Gojou', /gojo/i], ['Uchiha', ['pick', /uchiha/i]], ['Ackerman', /ackerman/i],
  ['Kamado', ['pick', /kamado/i]], ['Elric', ['pick', /elric/i]], ['Forger', ['pick', /forger/i]], ['Yagami', /yagami/i], ['Hatake', /hatake|kakashi/i],
  ['Todoroki', /todoroki/i], ['Midoriya', /midoriya/i], ['Itadori', /itadori/i],

  // ---------- Romanization variants and typos ----------
  ['Gojou Satoru', /gojo/i], ['Kyoujurou Rengoku', /rengoku/i], ['Tunade', /tsunade/i], ['Ryuuko Matoi', /ry[uū]u?ko/i], ['Itachii', /itachi/i],
  ['Sasukee', /sasuke/i], ['Kakshi Hatake', /kakashi/i], ['Eren Yaeger', /eren/i], ['Narutoo Uzumaki', /naruto/i], ['Zenitzu Agatsuma', /zenitsu/i],
  ['Inosuke Hashibra', /inosuke/i], ['Mikasa Akerman', /mikasa/i], ['Lelouche', /lelouch/i], ['Kilua Zoldyck', /killua/i],

  // ---------- Common names: a pick list ----------
  ['Sakura', ['pick', /sakura/i]], ['Ichigo', ['pick', /ichigo/i]], ['Yuki', ['pick', /yuu?ki/i]], ['Hinata', ['pick', /hinata/i]], ['Rin', ['pick', /rin/i]],
  ['Kurosaki', /kurosaki/i],

  // ---------- Anime titles ----------
  ['Naruto', /naruto/i], ['Naruto Shippuden', /naruto/i], ['One Piece', /one piece/i], ['Attack on Titan', /attack on titan/i], ['Shingeki no Kyojin', /shingeki/i],
  ['Demon Slayer', /demon slayer/i], ['Kimetsu no Yaiba', /kimetsu/i], ['Jujutsu Kaisen', /jujutsu/i], ['Death Note', /death note/i], ['Code Geass', /code geass/i],
  ['Fullmetal Alchemist Brotherhood', /fullmetal/i], ['Fullmetal Alchemist', /fullmetal/i], ['Steins Gate', /steins/i], ['Steins;Gate', /steins/i], ['Hunter x Hunter', /hunter/i],
  ['Bleach', /bleach/i], ['Dragon Ball Z', /dragon ball/i], ['My Hero Academia', /hero academia/i], ['Boku no Hero Academia', /hero academia/i], ['Spy x Family', /spy/i],
  ['Chainsaw Man', /chainsaw/i], ['Sousou no Frieren', /frieren/i], ['Frieren Beyond Journeys End', /frieren/i], ['Re Zero', /re.?zero/i], ['ReZero', /re.?zero/i],
  ['Re:Zero kara Hajimeru Isekai Seikatsu', /re.?zero/i], ['Oregairu', /oregairu|snafu|yahari/i], ['Yahari Ore no Seishun Love Comedy wa Machiagatteru', /oregairu|snafu|yahari/i],
  ['Yahari Ore no Seishun Love Come wa Machigatteiru', /yahari/i], ['My Teen Romantic Comedy SNAFU', /snafu/i], ['Your Name', /your name/i], ['Kimi no Na wa', /kimi no na/i],
  ['Spirited Away', /spirited/i], ['Sen to Chihiro no Kamikakushi', /chihiro/i], ['Haikyuu', /haikyu/i], ['Haikyu', /haikyu/i], ['Tokyo Ghoul', /tokyo ghoul/i],
  ['Cowboy Bebop', /bebop/i], ['Neon Genesis Evangelion', /evangelion/i], ['Mob Psycho 100', /mob psycho/i], ['One Punch Man', /one.?punch/i], ['Vinland Saga', /vinland/i],
  ['Berserk', /berserk/i], ['Toradora', /toradora/i], ['Konosuba', /konosuba/i], ['Kono Subarashii Sekai ni Shukufuku wo', /kono subarashii/i], ['Sword Art Online', /sword art/i],
  ['Bocchi the Rock', /bocchi/i], ['Oshi no Ko', /oshi no ko/i], ['Kaguya-sama Love is War', /kaguya/i], ['Dr. Stone', /stone/i], ['Darling in the Franxx', /franxx/i],
  ["JoJo's Bizarre Adventure", /jojo/i], ['Your Lie in April', /april/i], ['Shigatsu wa Kimi no Uso', /shigatsu/i], ['Made in Abyss', /abyss/i], ['Tokyo Revengers', /revengers/i],
  ['Blue Lock', /blue lock/i], ['Solo Leveling', /solo leveling/i], ['Dandadan', /dan ?da ?dan/i], ['Mushoku Tensei', /mushoku/i], ['Overlord', /overlord/i],
  ['That Time I Got Reincarnated as a Slime', /slime/i], ['The Promised Neverland', /neverland/i], ['Promised Neverland', /neverland/i], ['Clannad', /clannad/i],
  ['Anohana', /anohana|ano hi/i], ['Fruits Basket', /fruits basket/i], ['Gintama', /gintama/i], ['Tengen Toppa Gurren Lagann', /gurren/i], ['Kill la Kill', /kill la kill/i],

  // ---------- Not names: must be rejected ----------
  ['asdfghjk', 'none'], ['the best anime ever made', 'none'], ['qwerty uiop', 'none'], ['zzzzzz', 'none'],
];

let pass = 0; const fails = [];
for (const [input, want] of CASES) {
  const { room, player: a } = rooms.create(ev, 'A', 'a@x');
  const b = rooms.join(room, 'B', 'b@x'); rooms.setReady(room, b, true); rooms.start(room, a);
  room.letter = chainLetters(input)[0];
  const cur = room.players.find((p) => p.id === room.turnId);
  const r = rooms.play(room, cur, input);
  const offered = r.status === 'choose' ? room.pending.map((o) => `${o.label || o.text} (${o.kind === 'anime' ? 'anime' : o.anime})`) : [];
  const got = r.status === 'accepted' ? r.text : r.status === 'choose' ? `PICK: ${offered.join(' | ')}` : `REJECTED: ${r.reason}`;
  let ok;
  if (want === 'none') ok = r.status === 'rejected';
  else if (Array.isArray(want)) ok = r.status === 'choose' && offered.some((o) => want[1].test(o));
  else ok = (r.status === 'accepted' && want.test(r.text)) || (r.status === 'choose' && offered.some((o) => want.test(o)));
  if (ok) pass++; else fails.push(`  ✗ ${input.padEnd(34)} → ${got}`);
  if (verbose) console.log(`${ok ? '✓' : '✗'} ${input.padEnd(34)} → ${got}`);
  rooms.rooms.delete(room.code);
}
console.log(`\n${pass} / ${CASES.length} passed (${matcher.size} names indexed)`);
if (fails.length) console.log(`\nFailures:\n${fails.join('\n')}`);
process.exit(fails.length ? 1 : 0);

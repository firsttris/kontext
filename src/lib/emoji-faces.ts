/**
 * The first half of the emojis the chat offers (emoji.ts): faces, people and gestures, animals
 * and plants, food. One per line: the emoji, then English and German names and words to find it
 * by, separated by "|". A compact choice, not all of Unicode: the keyboard's own picker has the
 * rest, and the server takes any single emoji (server/chat/chat.ts `isOneEmoji`).
 */
export const FACES = `
😀 grinning, smile, happy | grinsen, lachen, froh
😃 smiley, happy | lächeln, froh
😄 smile, laugh | lachen, freuen
😁 grin, beaming | strahlen, grinsen
😆 laughing, lol | lachen, lol
😅 sweat smile, phew | puh, erleichtert
🤣 rofl, rolling | kugeln vor lachen
😂 joy, tears of joy, lol | freudentränen, lachen
🙂 slight smile | leicht lächeln
🙃 upside down | kopfüber, ironisch
😉 wink | zwinkern
😊 blush, smile | erröten, lächeln
😇 innocent, angel | unschuldig, engel
🥰 love, hearts | verliebt, herzen
😍 heart eyes, love | herzaugen, verliebt
🤩 star struck, wow | begeistert, sterne
😘 kiss | kuss
😋 yum, tasty | lecker
😛 tongue | zunge
😜 wink tongue, crazy | zunge zwinkern, verrückt
🤪 zany, crazy | albern, verrückt
🤑 money | geld
🤗 hug | umarmung, drücken
🤭 oops, giggle | hoppla, kichern
🤫 shush, quiet | psst, leise
🤔 thinking, hmm | nachdenken, hmm
🤐 zipper, secret | geheim, schweigen
🤨 raised eyebrow, doubt | skeptisch, zweifel
😐 neutral | neutral
😑 expressionless | ausdruckslos
😶 no mouth, speechless | sprachlos
😏 smirk | grinsen, schmunzeln
😒 unamused | genervt
🙄 eye roll | augenrollen
😬 grimace, awkward | grimasse, peinlich
😌 relieved | erleichtert
😔 pensive | nachdenklich, traurig
😪 sleepy | schläfrig
😴 sleeping, zzz | schlafen, müde
😷 mask, sick | maske, krank
🤒 thermometer, ill | fieber, krank
🤧 sneeze, cold | niesen, erkältung
🥵 hot | heiß, schwitzen
🥶 cold, freezing | kalt, frieren
🤯 mind blown | umgehauen, kopf explodiert
🥳 party, celebrate | party, feiern
😎 cool, sunglasses | cool, sonnenbrille
🤓 nerd | streber
🧐 monocle, inspect | monokel, prüfen
😕 confused | verwirrt
😟 worried | besorgt
😮 open mouth, wow | staunen, oh
😲 astonished | erstaunt
😳 flushed, embarrassed | verlegen, rot
🥺 pleading, please | bitte, flehen
😢 cry, sad | weinen, traurig
😭 sob, crying | heulen, weinen
😱 scream, shock | schrei, schock
😤 triumph, huff | schnauben
😡 angry, pout | wütend, sauer
🤬 cursing | fluchen
😈 devil, smiling | teufel
💀 skull, dead | totenkopf, tot
💩 poo | haufen
🤡 clown | clown
👻 ghost | geist, gespenst
🤖 robot | roboter
😺 cat smile | katze lächeln
🙈 see no evil | nichts sehen, affe
🙉 hear no evil | nichts hören, affe
🙊 speak no evil | nichts sagen, affe
`;

export const PEOPLE = `
👋 wave, hello, bye | winken, hallo, tschüss
🤚 raised back of hand | hand erhoben
✋ hand, stop, high five | hand, stopp
🖖 vulcan salute | vulkanier gruß
👌 ok, perfect | ok, perfekt
🤌 pinched fingers, italian | finger zusammen
🤏 pinch, tiny | wenig, bisschen
✌️ victory, peace | sieg, frieden
🤞 crossed fingers, luck | daumen drücken, glück
🤟 love you gesture | ich liebe dich
🤘 rock on, horns | rock
🤙 call me | ruf mich an
👈 left | links
👉 right | rechts
👆 up | oben
👇 down | unten
☝️ index up, one | zeigefinger, eins
👍 thumbs up, like, yes, ok | daumen hoch, gut, ja
👎 thumbs down, dislike, no | daumen runter, schlecht, nein
✊ fist | faust
👊 fist bump | faustgruß
👏 clap, applause | klatschen, beifall
🙌 raising hands, hooray | hände hoch, hurra
👐 open hands | offene hände
🤲 palms up | hände offen
🤝 handshake, deal | handschlag, abgemacht
🙏 please, thanks, pray | bitte, danke
✍️ writing | schreiben
💪 strong, muscle | stark, muskel
🧠 brain, smart | gehirn, klug
👀 eyes, look | augen, schauen
👁️ eye | auge
👂 ear, listen | ohr, hören
👶 baby | baby
🧒 child | kind
👩 woman | frau
👨 man | mann
🧓 older person | älterer mensch
👷 construction worker, builder | bauarbeiter, handwerker
🧑‍🔧 mechanic, technician | mechaniker, monteur
👩‍🔧 woman mechanic, plumber | monteurin, klempnerin
👨‍🔧 man mechanic, plumber | monteur, klempner
🧑‍💼 office worker | büro, angestellt
🧑‍💻 technologist, developer | entwickler, computer
🧑‍🍳 cook | koch
🧑‍🏫 teacher | lehrer
🧑‍⚕️ health worker | arzt, pflege
🕵️ detective | detektiv
💁 tipping hand, info | auskunft
🙋 raising hand, me | melden, ich
🤷 shrug, dunno | schulterzucken, keine ahnung
🤦 facepalm | facepalm, kopf schütteln
🙆 ok gesture | ok geste
🙅 no gesture | nein geste
🏃 running, hurry | rennen, eilig
🚶 walking | gehen
💃 dancing | tanzen
👪 family | familie
🫶 heart hands | herzhände
`;

export const NATURE = `
🐶 dog | hund
🐱 cat | katze
🐭 mouse | maus
🐰 rabbit, bunny | hase
🦊 fox | fuchs
🐻 bear | bär
🐼 panda | panda
🐨 koala | koala
🐯 tiger | tiger
🦁 lion | löwe
🐮 cow | kuh
🐷 pig | schwein
🐸 frog | frosch
🐵 monkey | affe
🐔 chicken | huhn
🐧 penguin | pinguin
🐦 bird | vogel
🦆 duck | ente
🦉 owl | eule
🐝 bee | biene
🐛 bug | käfer, raupe
🦋 butterfly | schmetterling
🐌 snail, slow | schnecke, langsam
🐞 ladybug | marienkäfer
🐢 turtle, slow | schildkröte, langsam
🐍 snake | schlange
🐟 fish | fisch
🐬 dolphin | delfin
🐳 whale | wal
🐴 horse | pferd
🦄 unicorn | einhorn
🌸 blossom | blüte
🌹 rose | rose
🌻 sunflower | sonnenblume
🌷 tulip | tulpe
🌱 seedling, grow | keimling, wachsen
🌲 evergreen tree | tanne
🌳 tree | baum
🌴 palm, holiday | palme, urlaub
🍀 four leaf clover, luck | kleeblatt, glück
🍁 maple leaf, autumn | ahornblatt, herbst
🍂 fallen leaves, autumn | laub, herbst
☀️ sun | sonne
🌤️ sun behind cloud | heiter
⛅ partly cloudy | wolkig
🌧️ rain | regen
⛈️ thunderstorm | gewitter
❄️ snowflake, cold | schneeflocke, kalt
☃️ snowman | schneemann
🌈 rainbow | regenbogen
⚡ lightning, power | blitz, strom
🔥 fire, hot, lit | feuer, heiß
💧 droplet, water | tropfen, wasser
🌊 wave, sea | welle, meer
🌙 moon, night | mond, nacht
⭐ star | stern
🌍 globe, earth | erde, welt
`;

export const FOOD = `
🍏 green apple | grüner apfel
🍎 apple | apfel
🍐 pear | birne
🍊 orange | orange
🍋 lemon | zitrone
🍌 banana | banane
🍉 watermelon | wassermelone
🍇 grapes | trauben
🍓 strawberry | erdbeere
🍒 cherries | kirschen
🍑 peach | pfirsich
🥝 kiwi | kiwi
🍅 tomato | tomate
🥑 avocado | avocado
🥕 carrot | karotte
🌽 corn | mais
🥔 potato | kartoffel
🥨 pretzel | brezel
🥐 croissant | croissant
🍞 bread | brot
🧀 cheese | käse
🥚 egg | ei
🍳 cooking, fried egg | spiegelei, kochen
🥓 bacon | speck
🌭 hot dog | würstchen
🍔 burger | burger
🍟 fries | pommes
🍕 pizza | pizza
🥗 salad | salat
🍝 spaghetti, pasta | nudeln
🍜 noodles, ramen | nudelsuppe
🍣 sushi | sushi
🍰 cake | kuchen
🎂 birthday cake | geburtstagstorte
🧁 cupcake | muffin
🍩 doughnut | donut
🍪 cookie | keks
🍫 chocolate | schokolade
🍬 candy | bonbon
🍦 ice cream | eis
☕ coffee, break | kaffee, pause
🍵 tea | tee
🥤 drink, soda | getränk
🍺 beer | bier
🍻 cheers, beers | prost, bier
🥂 cheers, champagne | anstoßen, sekt
🍷 wine | wein
🍽️ plate, lunch | teller, mittagessen
`;

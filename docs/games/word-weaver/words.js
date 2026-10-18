/**
 * WORD WEAVER — embedded offline dictionary.
 *
 * ANSWER_POOL : common 5-letter words used as daily / unlimited / gauntlet answers.
 * EXTRA_POOL  : additional valid 5-letter words accepted as guesses but never chosen
 *               as an answer (rarer words, inflections, plurals).
 *
 * Stored as whitespace-separated strings to keep the payload compact; parsed once
 * at import time. No network access, ever.
 */

const ANSWER_RAW = `
abbey abide abort about above abuse acorn acrid acute adapt admit adobe adopt adore adult affix
afire afoot after again agent agile aging agony agree ahead aisle alarm album alert algae alias
alibi alien align alike alive alley allow alloy aloft alone along aloud alpha altar alter amber
amble amend amino ample amuse angel anger angle angry ankle annex annoy anvil aorta apart apple
apply apron arbor ardor arena argue arise armor aroma arose array arrow arson ashen aside asset
atlas atoll attic audio audit avail avert avoid await awake award aware awful awoke axiom
bacon badge badly bagel baker balmy banjo barge baron basic basil basin basis baste batch bathe
baton beach beady beard beast began begin begun being belly below bench berry bicep bigot binge
birch birth bison black blade blame bland blank blare blast blaze bleak bleat blend bless blimp
blind blink bliss blitz bloat block bloke blond blood bloom blown blues bluff blunt blurb blurt
blush board boast bogus bonus booth boost booze bosom bough bound bowel boxer brace braid brain
brake brand brash brass brave bravo brawl bread break breed bribe brick bride brief brine bring
brink brisk broad broil broke brook broom broth brown brunt brush brute buddy budge buggy bugle
build built bulge bulky bully bunch bunny burly burnt burst bushy buyer bylaw
cabin cable cacao cache cadet cagey cameo canal candy canoe canon caper carat cargo carol carve
caste catch cater cause cease cedar chafe chain chair chalk champ chant chaos charm chart chase
chasm cheap cheat check cheek cheer chess chest chewy chick chief child chili chill chime china
chirp chive choir choke chomp chord chore chose chuck chunk churn chute cider cigar cinch circa
civic civil claim clamp clang clank clash clasp class clean clear cleat clerk click cliff climb
cling cloak clock clone close cloth cloud clout clove clown clump clung coach coast cobra cocoa
colon color comet comfy comic comma coral corny couch cough could count court coven cover covet
crack craft cramp crane crank crash crass crate crave crawl craze crazy creak cream credo creed
creek creep crepe crest crime crimp crisp croak crock crook croon cross crowd crown crude cruel
crumb crush crust crypt cubic cumin curio curly curry curse curve curvy cyber cycle cynic
daddy daily dairy daisy dance dandy datum daunt dealt death debit debut decal decay decor decoy
defer deity delay delta demon dense depot depth derby deter detox devil diary dicey digit dimly
diner dingy dirty disco ditch ditto diver divot dizzy dodge dodgy doing dolly donor donut doubt
dough downy dozen draft drain drake drama drank drape drawl drawn dread dream dress dried drier
drift drill drink drive droll drone drool droop drove drown drunk dryly dummy dumpy dusky dusty
duvet dwarf dwell dwelt dying
eager eagle early earth easel eaten eater ebony edict eerie eight eject elbow elder elect elegy
elite elope elude email embed ember emcee empty enact ended endow enemy enjoy ensue enter entry
envoy epoch equal equip erase erect error erupt essay ether ethic evade event every evict evoke
exact exalt excel exert exile exist expel extra exult
fable facet faint fairy faith false famed fancy fatal fault fauna favor feast feign femur fence
feral ferry fetch fetus fever fewer fiber field fiend fiery fifth fifty fight filet filly filmy
filth final finch finer fired first fishy fixed fizzy flair flake flaky flame flank flare flash
flask fleck fleet flesh flick flier fling flint flirt float flock flood floor flora floss flour
flout flown fluff fluid fluke flung flunk flush flute foamy focal focus foggy folio folks folly
foray force forge forgo forte forth forty forum found foyer frail frame frank fraud freak freed
fresh friar fried frill frisk frizz frock frond front frost froth frown froze fruit fudge fully
fungi funky funny furry fussy fuzzy
gamma gauge gaunt gauze gavel gecko geese genre ghost ghoul giant giddy girth given glade gland
glare glass glaze gleam glean glide glint gloat globe gloom glory gloss glove gnome going goofy
goose gorge gouge gourd grace grade graft grail grain grand grant grape graph grasp grass grate
grave gravy graze great greed green greet grief grill grime grimy grind gripe groan groin groom
grope gross group grout grove growl grown gruel gruff grunt guard guava guess guest guide guild
guile guilt guise gully gumbo gusto gusty gypsy
habit hairy halve handy happy hardy harem harsh haste hasty hatch haunt haven havoc hazel heady
heard heart heath heave heavy hedge hefty heist hello helix hence hiker hilly hinge hippo hitch
hoard hobby hoist holly homey honey honor horde horse hotel hound house hover human humid humor
hunch hurry husky hutch hydro hyena
icing ideal idiom idiot igloo image imply inbox incur index inept inert infer ingot inlet inner
input inter irate irony islet issue itchy ivory
jaunt jazzy jeans jelly jerky jetty jewel jiffy joint joker jolly joust judge juice juicy jumbo
jumpy junta juror
karma kayak kebab knack knave knead kneel knelt knife knock knoll known koala kudos
label labor laden ladle lager lance lanky lapel lapse large larva laser lasso latch later lathe
latte laugh layer leach leafy leaky leapt learn lease leash least leave ledge leech leery legal
lemon lemur level lever libel liken lilac limbo limit linen liner lingo lithe liver livid llama
loath lobby local locus lodge lofty logic loose lorry loser lousy lover lower loyal lucid lucky
lumpy lunar lunch lunge lurch lurid lusty lying lymph lyric
macaw macho macro madam madly magic magma maize major maker mambo mango mangy manic manor maple
march marry marsh mason match matte mauve maxim maybe mayor meant meaty medal media medic melee
melon mercy merge merit merry messy metal meter metro micro midst might milky mimic mince miner
minor minty minus mirth miser mixed mixer mocha modal model modem moist molar moldy money month
moody moose moral morph mossy motel motif motto mound mount mourn mouse mousy mouth movie mower
mucus muddy mulch mummy munch mural murky mushy music musky musty muted
nacho nadir naive naked named nanny nasal nasty natal naval navel needy nerve never newer newly
niche niece night ninja ninth noble nobly noise noisy nomad noose north nosey notch noted novel
nudge nurse nutty nylon nymph
oasis obese occur ocean odder oddly offer often older olive omega onion onset opera optic orbit
order organ other otter ought ounce outdo outer ovary overt owing owner oxide ozone
pagan paint panda panel panic pansy pants paper parka parry parse party pasta paste pasty patch
patio pause payer peace peach pearl pecan pedal penal penny peony perch peril perky pesky pesto
petal petty phase phone phony photo piano picky piece piety piggy pilot pinch pinky pious piper
pitch pithy pivot pixel pizza place plaid plain plane plank plant plate plaza plead pleat pluck
plumb plume plump plunk plush poach point poise poker polar polka pooch poppy porch posse pouch
pound power prank prawn preen press price prick pride prime print prior prism privy prize probe
prone prong proof prose proud prove prowl proxy prude prune psalm pudgy puffy pulpy pulse punch
pupil puppy puree purge purse pushy putty
quack quail quake qualm quart quash queen queer quell query quest queue quick quiet quill quilt
quirk quite quota quote
rabid racer radar radio rainy raise rally ramen ranch range rapid raspy ratio raven rayon reach
react ready realm rebel rebut recap recur reedy refer regal rehab reign relax relay relic remit
renal renew repay repel reply rerun reset resin retro rhino rhyme rider ridge rifle right rigid
rigor rinse ripen riper risen risky rival river roast robin robot rocky rodeo rogue roman roomy
roost rotor rouge rough round rouse route rowdy royal ruddy rugby ruler rumor rural rusty
sadly safer saint salad salon salsa salty salve sandy sappy satin sassy sauce saucy sauna saute
savor savvy scald scale scalp scaly scamp scant scare scarf scary scene scent scoff scold scone
scoop scoot scope score scorn scour scout scowl scram scrap screw scrub scuba sedan seedy seize
sense sepia serum serve setup seven sever sewer shack shade shady shaft shake shaky shale shall
shame shank shape share shark sharp shave shawl sheaf shear sheen sheep sheer sheet shelf shell
shift shine shiny shire shirk shirt shoal shock shone shook shoot shore shorn short shout shove
shown showy shrew shrub shrug shunt shyly sight silky silly since sinew singe sinus siren sixth
sixty skate skiff skier skill skimp skirt skull skunk slack slain slant slash slate sleek sleep
sleet slept slice slick slide slime slimy sling slink slope slosh sloth slump slung slunk slurp
slush small smart smash smear smell smelt smile smirk smite smith smock smoke smoky snack snail
snake snaky snare snarl sneak sneer snide sniff snipe snoop snore snort snout snowy snuck snuff
soapy sober soggy solar solid solve sonar sonic sooty sorry sound south space spade spare spark
spasm spawn speak spear speck speed spell spend spent sperm spice spicy spike spiky spill spilt
spine spiny spire spite splat split spoil spoke spoof spook spool spoon spore sport spout spray
spree sprig spurn spurt squad squat squid stack staff stage staid stain stair stake stale stalk
stall stamp stand stank stare stark start stash state stave steak steal steam steed steel steep
steer stern stick stiff still stilt sting stink stint stock stoic stoke stole stomp stone stony
stood stool stoop store stork storm stout stove strap straw stray strew strip strut stuck study
stuff stump stung stunt style suave sugar suite sulky sunny super surge surly sushi swamp swarm
swath swear sweat sweep sweet swell swept swift swine swing swirl swish swoop sword swore sworn
syrup
table taboo tacit tacky taffy tally talon tango tangy taper tapir tardy tarot taste tasty taunt
tawny teach tease teddy teeth tempo tempt tenet tenor tense tenth tepid terse thank theft their
theme there these thick thief thigh thing think third thong thorn those three threw throb throw
thumb thump thyme tiara tibia tidal tiger tight timer timid tipsy tired titan title toast today
token tonal tonic tooth topaz topic torch torso total totem touch tough towel tower toxic toxin
trace track tract trade trail train trait tramp trash trawl tread treat trend triad trial tribe
trick tried trill trite troll troop trope trout truce truck truly trump trunk trust truth tryst
tulip tumor tunic turbo tutor twang tweak tweed tweet twice twine twirl twist tying
udder ulcer ultra uncle uncut under undid undue unfit union unite unity unlit unmet untie until
upend upper upset urban urine usage usher usual usurp utter
vague valet valid valor value valve vapor vault vegan venom venue verge verse verve vicar video
vigil vigor villa vinyl viola viper viral virus visit visor vista vital vivid vixen vocal vodka
vogue voice voter vouch vowel vying
wacky wafer wager wagon waist waive waltz waste watch water waver weary weave wedge weedy weigh
weird whale wharf wheat wheel where which whiff while whine whiny whirl whisk white whole whoop
whose widen wider widow width wield wimpy wince winch windy wiper wired wiser witch witty woken
woman women woody woozy wordy world worry worse worst worth would wound woven wrath wreak wreck
wring wrist write wrong wrote wrung wryly
xenon yacht yearn yeast yield yodel young yours youth yummy zebra zesty zippy
`;

const EXTRA_RAW = `
abaci abate abbot abhor abode abyss acing acorn acted actor adage adept adieu adjust admen adorn
aegis aerie affix afoul agape agate agile aglow agora ahoys aider ailed aimed aired aisle alack
alarm alder algal alkyd allay allot aloes aloha altos amass amaze amiss amity amour amped ample
angst anime anion anise anode antsy aphid apnea apses arced arced ardor areas arias armed aroma
arty asked aspen aspic assay aster astir atone atria audio auger aught augur aunts aural autos
avast avian avow awash awing axing axles azure
baaed backs bacon badge baggy bails baits baked bakes baled bales balks balls balmy bands banes
bangs banks banns barbs bards bared barer bares barge barks barns barons basks batty bawdy bayou
beads beaks beams beans beard bears beats beaus beeps beers beets befit begat beget begot belch
belie belle bells belts bends bents bergs berth beset besot bevel bezel bided bides biked bikes
bilge bilks bills binds bingo birds bitch bites blabs blags blahs blanc blats bleep blest blobs
blocs blogs blots blows blued bluer blues boars boats bobby boded bodes boers boils bolts bombs
bonds boned bones bongo bonny books boons boors boots booty bored bores borax bosun bouts bowed
bowls boxed boxes brags brans brats brays brays breve brews briar briny brits broad bronc brows
buffs bugle bulbs bulks bulls bumps bumpy bunks bunts buoys burps burrs busts butch butte butts
bytes
cabby cabin cacti cadre cafes cagey cairn cakes calfs calls calms calve camps canes canny capes
capon carbs cards cared cares carts carts casks casts caved caves cawed cease cedes cells celts
cents chads chaps chars chart chats chefs chess chews chides chins chips chits chops chows chugs
churl cited cites clads clams clans claps claws clays cleft clefs clips clods clogs clomp clops
clots clued clues coals coats cocks codas coded codes coeds coifs coils coins coked colas colds
colts combo combs comes comfy conch condo cones conic conks cooed cooks cools coops coped copes
copse cords cored cores corks corms corns costs cosec coted coupe coups cowed cowls crags crams
craps crawl creds crews cribs cries crocs crops crows crumb crums cubed cubes cuffs culls cults
curbs curds cured cures curls curse cusps cusps cutie cysts
dales dames damns damps dared dares darns darts dashy dated dates dauby dazed dazes deals deans
dears debug debit decks decry deeds deems deeps defog deign delve demos denim dents depot derms
desks dhows diced dices diets dikes dimes dined dines dings dints dirge dirks disks ditsy divas
dived dives docks doers doest doeth dogma doled doles dolls domed domes doled dooms doors doped
dopes dosed doses doted dotes doubt douse doves dowel dower downs doxie drabs drags drams drats
draws drays dregs dries drips drops drugs drums dryer ducks ducts dudes duels duets dukes duller
dulls dumps dunes dungs dunks duped dupes dusts duets dwarf dyers dyers dying
eared earls earns eased eases easts eaved eaves ebbed echos edged edges edict edits eider ejects
elans elope elude elves email embed emirs emits emote enact ended endue enema enrol entree envoi
eons epics epoxy equip erode erred essay ester etude euros evens evict ewers exams exeat exert
exits expos extol exude eyrie
faced faces facts faded fades fains faint fairs faked fakes falls famed fangs fared fares farms
fasts fated fates fauns fawns fazed fazes feeds feels feint fella felon felts fends ferns feted
fetes feuds fibs fiche fices fiefs fifes filch filed files fills films finds fined fines fires
firms firth fists fitly fives fjord flabs flags flans flaps flats flaws flays fleas flees flews
flips flits flock floes flogs flops flout flows flubs flues fluke flyer foals foams fobs foils
folds fonts foods fools foots fords forks forms forte forts fouls fowls foxed foxes frays freon
frets frets frier frowns fumed fumes funds furls furor fused fuses fusty
gabby gaffe gaily gains gaits gales galls gamed gamer games gamut gangs gaped gapes garbs gases
gassy gated gates gaudy gauds gaunt gawks gawky gazed gazes gears gecko gelds gelts gemmy genes
genie gents germs getup ghees gibed gibes gifts gilds gills gilts gimme girds girls girts gists
gives gizmo glens glide glitz gloms gloop glows glues gluey glums glyph gnarl gnats gnaws goads
goals goats gobs godly golem golfs gongs gonna goods goofs gores gorse gotta gouty gowns grabs
grads grams grasp grays grebe greys grids grins grips grits gross grubs grump guars gucks guffs
guise gulch gulls gulps gumbo gummy gunky guppy gured gurus gushy gusts gutsy guyed
hacks hades hafts haiku hails hairs hakes hales hallo halls halos halts hands hangs hanks hares
harks harms harps harts hasps hated hates hauls hawks hayed heads heals heaps hears heats heels
heirs helms helps hemps hemmed hents herbs herds heres heros hertz hewed hicks hided hides hikes
hills hilts hinds hints hired hires hisses hived hives hoary hoaxes hobos hocks hoers hogan hoked
hokum holds holed holes homed homes honed hones honks hoods hoofs hooks hoops hoots hoped hopes
horns hosed hoses hosts hound hours hovel howdy howls hulks hulls humps hunks hunts hurls hurts
husks hymns hyped hypes
ibex ibis iced ices icier icily icons ideas idled idler idles idols idyll iliac imams imbue impel
inane inept inked inkle inlay inned inns inset intro inure iodic ionic irked irons islet itchy
items
jacks jaded jades jails jambs janes japan jarls jaunt jawed jeeps jeers jells jerks jests jibed
jibes jilts jinks jinns jived jives jocks jogs joins jokes jolts jotty jowls joyed judos jugs
juked jukes julep jumps junks juror justs jutes
kales kaput karat karst kayos keels keens keeps kelps kempt kerbs kerns keyed khaki kicks kiddo
kills kilns kilos kilts kinds kings kinks kiosk kited kites kiwis knits knobs knots knows kraft
krill kudzu
laced laces lacks laded lades ladle lager laics lairs lakes lambs lamed lames lamps lands lanes
lards larks lasso lasts latex lauds lavas laved laves lawns laxly leads leaks leans leaps leers
lefts legit lends lenses lento leper lesser levee liana liars libel liens lieus lifts liked likes
lilts limbs limes limos limps lined lines links lints lions lisps lists lived liver lives loads
loafs loams loans lobed lobes locks locos lodes logos loins lolls loner longs looks looms loons
loops loots lopes lords lorry losses lotus louse louts loved loves lowed lowly lucks luges lulls
lumps lunes lunks lurks lusts lutes lymph lynch lyres
maced maces macks madly mages magma maids mailer mails maims mains maize malls malts maned manes
manga manly manse mantel maps marcs mares marks marls marts masks masts mated mates mauls mavens
mazes meads meals means meats mecca medals meeds meets melds melts memos mends menus meows mesas
meshy metes meted mewed miens miffs miked mikes milds miles milks mills mimed mimes minds mined
mines mints mired mires mists mites mitts moans moats mocks modes moist molds moles molls molts
monks moods moons moors moots moped mopes moral mores morns moths motes motto moult mound mouth
moved moves mowed mucks mucky muffs mugs muled mules mulls mumps munch murks mused muses musts
mutes myths
nabbed nabs nacre nadas naans nails naked napes narcs nares naves navvy nears neats necks needs
neons nerds nests netts newel newts nibby nicks nifty nines nixed nixes nodes nooks noons noses
notes nouns novae nubs nudes nuked nukes numbs nurds nutty nyala
oaken oakum oared oases oaths oaves obeys oboes ocher ochre octet odium odors offed oiled oinks
okays okras oldie olios omits onset oohed ooze oozed oozes opals opens opine opted orals orate
orbed orcas ordos organ osier ottos ousts ouzel ovals ovens overs ovoid owlet owned owner oxbow
oxen oxlip
paced paces packs pacts padre paged pages pails pains pairs paled pales palls palms panes pangs
pared pares parks parts pased pasha paths patio paved paves pawed pawns payed peaks peals peats
pecks peeks peels peeps peers pekoe pelts pends penes penis peons pepsi perms perts pests petit
phlox picas picks piers piety pigmy piked pikes piled piles pills pilus pimps pinch pined pines
pings pinks pints pipes pipit pique pitas pithy pixie plans plats plays plebs plied plies plods
plots plows ploys plugs plums pocks poems poets poked pokes poled poles polio polls polyp pomps
ponds pones pooch pools poops popes pored pores ports posed poses posit posse posts pouts prams
prays preps preys prigs prims probs prods profs progs proms props prosy pryer psych pucks puffs
pujas puked pukes pulls pulps pumas pumps punks punts pupas pured purls purrs pussy pylon pyres
quads quaff quays quins quips quirt quits quods quoit quoth
raced races racks radii rafts raged rages raids rails rains raked rakes ramps rands ranks rants
raped rapes rasps rated rates raved raves rawer rayed razed razes razor reads reals reams reaps
rears redly redos reeds reefs reeks reels refit reins rends rents repos rests revel revue rials
ribby ricks rides riels rifts rigid riled riles rimed rimes rinds rings riots ripes risks rites
rived rives roads roams roans roars robes rocks rodeo roils roles rolls romps roods roofs rooks
rooms roots roped ropes roses rotas rotes rotor rouge roust routs roved roves rowdy rowed rowel
rubes rubys rucks ruers ruffs rugby ruled rules rumps runes rungs runts ruses rusks rusts
sabot sacks sagas sages sagos sails saint saith sakes sales salts salts sands saner sarge sated
sates saved saver saves sawed scabs scads scans scars scats scaup scows sears seals seams seats
sects sedge seeds seeks seems seeps sells semis sends serfs serge sewed shads shags shahs shams
shard shims shins ships shirr shivs shoed shoes shoos shops shots shows shred shuns shuts sicks
sided sides sighs signs silks sills silos silts sines singe sings sinks sired sires sisal sites
sixes sizes skids skies skins skips skits slabs slags slams slaps slats slaws slays sleds slews
slims slips slits slobs slogs slops slots slows slugs slums slurs smews smogs smuts snaps sneds
snips snits snobs snogs snots snows snubs socks sodas sofas soils solds soles solos songs sonar
sooth soots sops sores sorts souls soups sours sowed sowen spans spars spats spays spews spins
spits spivs spots spuds spurs stabs stags stars stats stays steps stets stews stirs stows strep
strop studs stubs stuns styes suede suits sulks sumps sunup sured surfs swabs swags swans swaps
swats sways swigs swims swots synod
tabby tabla tacks tacos tads tails tains takes tales talks tally tamed tamer tames tamps tanks
taped taper tapes tarps tarry tarts tasks tatty taupe tawse taxed taxes taxis teals teams tears
teats techs teems teens tells temps tends tents terms terns tests texts thaws thees theft thens
thews thins thous thuds thugs tians ticks tided tides tiers tiffs tikes tiles tills tilts times
tinny tints tipis tired tires titan tithe toads toady toked tokes tolls tombs tomes toned tones
tongs tools toots topes topis torts toted totes touts towed towns toyed toys trams traps trawl
trays trees treks trews trims trios trips trods trots troys trues tsars tubas tubed tubes tucks
tufts tulle tunas tuned tuner tunes turfs turns tusks tutus twats tweak twerp twits typed types
typos tyros
udders ukase ulnae ultra umber umbra umped uncap uncle uncos undid undue unfed unify unpin unsay
untie unzip upped urged urges ursae usher usurp uteri
vails vales valse vamps vanes vaned vasts vaunt veals veers veils veins velds vends vents verbs
verso vests vetch vetos viand vials vibes vicar views vigas vined vines viola vipers virga visas
vised vises visor voids voled voles volts vomit voted votes vowed vowel
waded wader wades wadis wafts waged wager wages wails wains waits waked wakes wales walks walls
wands waned wanes wants wards wares warms warns warps warts washy wasps watts waved waver waves
waxed waxen waxes weald weals weans wears webby weeds weeks weeps weest weirs welds wells welts
wends wenny wetly whams whaps wharf whats wheys whigs whims whips whirs whits whizz whore wicks
widen wilds wiles wills wilts winds wines wings winks wipes wired wires wisps witty wived wives
woads woken wolds wolfs womby wonts woods wools words works worms worts wound woven wraps wrens
writs
xylem yanks yards yarns yawls yawns yawps yeahs yearn yeast yells yelps yenta yetis yipes yogas
yogis yoked yokel yokes yolks yowls yucca yucks yukky yurts
zaps zeals zebus zeros zests zetas zincs zings zippy zonal zoned zones zooms
`;

function parse(raw) {
  const out = [];
  const seen = new Set();
  for (const w of raw.split(/\s+/)) {
    const t = w.trim().toLowerCase();
    if (t.length !== 5) continue;
    if (!/^[a-z]{5}$/.test(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export const ANSWER_POOL = parse(ANSWER_RAW);

const answerSet = new Set(ANSWER_POOL);
export const EXTRA_POOL = parse(EXTRA_RAW).filter((w) => !answerSet.has(w));

/** Full accepted-guess dictionary (answers + extras). */
export const VALID_GUESSES = new Set([...ANSWER_POOL, ...EXTRA_POOL]);

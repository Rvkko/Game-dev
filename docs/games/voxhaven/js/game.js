/* =====================================================================
   Voxhaven — game.js
   Data tables (blocks/items/recipes/mobs), world generation, player,
   inventory, crafting, combat, mob AI, villages, interactions, and the
   Game orchestrator that owns the THREE scene.
   ===================================================================== */

const VOXHAVEN_VISUALS={
  renderer:{exposure:1.05,maxPixelRatio:2},
  overworld:{skyDay:0x8bbfe8,skyDawn:0xe58c6b,skyNight:0x07111e,fogDay:0xb2cad6,sunlight:0xfff3da,waterDeep:0x124861},
  aethon:{sky:0x28173b,fog:0x3d214d},
  effects:{bloomStrength:0.12,bloomRadius:0.15,bloomThreshold:0.85,selectionOutline:0xffc857}
};

// ---------- block ids ----------
const B = {
  AIR:0, GRASS:1, DIRT:2, STONE:3, SAND:4, GRAVEL:5, CLAY:6, SNOW:7, ICE:8, WATER:9,
  LOG:10, LEAVES:11, PLANKS:12, CACTUS:13, TALLGRASS:14, FLOWER_R:15, FLOWER_B:16, MUSHROOM:17,
  COAL:18, COPPER:19, IRON:20, GOLD:21, CRYSTAL:22, DEEPSTONE:23, DARKSTONE:24,
  BENCH:25, FURNACE:26, CHEST:27, BED:28, BED_FOOT:29, TORCH:30, LANTERN:31, DOOR:32,
  LADDER:33, GLASS:34, FENCE:35, STAIRS:36, SLAB:37, BRICK:38, STONEBRICK:39, ROOFTILE:40,
  CARPET:41, BOOKSHELF:42, HAY:43, PATH:44, WINDOW:45,
  WOOL:46, COPPER_BLOCK:47, IRON_BLOCK:48, GOLD_BLOCK:49, CRYSTAL_BLOCK:50,
  MOSSSTONE:51, BASALT:52, OBSIDIAN:53, SMOOTHSTONE:54,
  WOOL_RED:55, WOOL_BLUE:56, GRANITE:57, ANDESITE:58, DIORITE:59,
  POLISHED_GRANITE:60, POLISHED_ANDESITE:61, POLISHED_DIORITE:62,
  SANDSTONE:63, CHISELED_SANDSTONE:64, SMOOTH_SANDSTONE:65,
  CUT_COPPER:66, CUT_IRON:67, CUT_GOLD:68, COAL_BLOCK:69, TERRACOTTA:70,
  PACKED_ICE:71, FROSTED_GLASS:72, POLISHED_BASALT:73, DARK_PLANKS:74,
  CHISELED_STONEBRICK:75, MOSSY_STONEBRICK:76, CRACKED_STONEBRICK:77,
  POLISHED_DEEPSTONE:78, POLISHED_DARKSTONE:79,
  COBBLE:80,
  POTATO0:81, POTATO1:82, POTATO2:83, POTATO3:84,
  CARROT0:85, CARROT1:86, CARROT2:87, CARROT3:88,
  WHEAT0:89, WHEAT1:90, WHEAT2:91, WHEAT3:92,
  TOMATO0:93, TOMATO1:94, TOMATO2:95, TOMATO3:96,
  PUMPKIN:97, MELON:98, NETHERRACK:99, GLOWSTONE:100, MYCELIUM:101, SOULSAND:102,
  SUGARCANE:103, QUARTZ:104, NETHERBRICK:105, CAKE:106, BEETROOT:107,
  EMERALD:108, EMERALD_BLOCK:109, DIAMOND:110, DIAMOND_BLOCK:111,
  MARS_SOIL:112, REGOLITH:113, PERMAFROST:114, LAUNCHPAD:115, STARSHIP:116, SOLAR_PANEL:117, BATTERY:118,
  POTTED:119, BANNER:120, PLAMP:121,
  // ---- space age expansion ----
  ALIEN_GRASS:122, ALIEN_ROCK:123, ALIEN_CRYSTAL:124,
  ROCKET_HULL:125, ROCKET_NOSE:126, ROCKET_FIN:127,
  SCIENCE_BENCH:128, FUEL_TANK:129, HAB_PANEL:130,
  GLASS_DOME:131, ALIEN_PLANT:132, STAR_BEACON:133,
  ALIEN_LOG:134, ALIEN_LEAVES:135, HAB_FLOOR:136,
  METAL_DOOR:137, CAMPFIRE:138, SEAROCK:139, KELP:140,
  FALLEN_LOG:141, SHRUB:142, BARREL:143, RUBBLE:144
};
// door-like blocks share the open/close + collision + placement logic
function isDoorId(id){ return id===B.DOOR || id===B.METAL_DOOR; }

// helper to define a block row
function blk(name, opts){ return Object.assign({ name, render:'cube', solid:true, transparent:false, cutout:false, light:0, hardness:1, tool:null, tier:0, drop:null, dropCount:1 }, opts); }

// ---------- block table (index = id) ----------
const BLOCKS = [];
BLOCKS[B.AIR]      = blk('Air', { solid:false, transparent:true, render:'cube' });
BLOCKS[B.GRASS]    = blk('Grass Block', { tiles:{top:'grass_top',side:'grass_side',bottom:'dirt'}, hardness:0.6, tool:'shovel', drop:'dirt', give:'grass' });
BLOCKS[B.DIRT]     = blk('Dirt', { tiles:'dirt', hardness:0.5, tool:'shovel', drop:'dirt', give:'dirt' });
BLOCKS[B.STONE]    = blk('Stone', { tiles:'stone', hardness:1.5, tool:'pickaxe', tier:1, drop:'cobble', give:'stone' });
BLOCKS[B.SAND]     = blk('Sand', { tiles:'sand', hardness:0.5, tool:'shovel', drop:'sand', give:'sand' });
BLOCKS[B.GRAVEL]   = blk('Gravel', { tiles:'gravel', hardness:0.6, tool:'shovel', drop:'gravel', give:'gravel' });
BLOCKS[B.CLAY]     = blk('Clay', { tiles:'clay', hardness:0.6, tool:'shovel', drop:'clay', give:'clay' });
BLOCKS[B.SNOW]     = blk('Snow', { tiles:'snow', hardness:0.4, tool:'shovel', drop:'snow', give:'snow' });
BLOCKS[B.ICE]      = blk('Ice', { tiles:'ice', hardness:0.5, drop:'ice', give:'ice', frostBlend:true });   // solid frosted ice — its own subtly-translucent material, NOT the glass/water blend (see AI_LESSONS)
BLOCKS[B.WATER]    = blk('Water', { tiles:'water', solid:false, transparent:true, hardness:99 });
BLOCKS[B.LOG]      = blk('Timber Log', { tiles:{top:'log_top',bottom:'log_top',side:'log_side'}, hardness:2.0, tool:'axe', drop:'log', give:'log' });  // Minecraft-like: wood slower with low tier tools
BLOCKS[B.LEAVES]   = blk('Leaves', { tiles:'leaves', transparent:true, cutout:true, hardness:0.2, drop:null, give:'leaves', sway:0.35 });
BLOCKS[B.PLANKS]   = blk('Planks', { tiles:'planks', hardness:2.0, tool:'axe', drop:'planks', give:'planks' });
BLOCKS[B.CACTUS]   = blk('Cactus', { tiles:'cactus', hardness:0.5, drop:'cactus', give:'cactus' });
BLOCKS[B.TALLGRASS]= blk('Tall Grass', { tiles:'tallgrass', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:'seeds', give:'tallgrass' });
BLOCKS[B.FLOWER_R] = blk('Crimson Bloom', { tiles:'flower_red', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:'flower_r', give:'flower_r' });
BLOCKS[B.FLOWER_B] = blk('Azure Bloom', { tiles:'flower_blue', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:'flower_b', give:'flower_b' });
BLOCKS[B.MUSHROOM] = blk('Cap Fungus', { tiles:'mushroom', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:'mushroom', give:'mushroom' });
BLOCKS[B.COAL]     = blk('Coal Ore', { tiles:'coal', hardness:2, tool:'pickaxe', tier:1, drop:'coal', give:'coal_ore' });
BLOCKS[B.COPPER]   = blk('Copper Ore', { tiles:'copper', hardness:2.2, tool:'pickaxe', tier:2, drop:'copper_raw', give:'copper_ore' });
BLOCKS[B.IRON]     = blk('Iron Ore', { tiles:'iron', hardness:2.5, tool:'pickaxe', tier:2, drop:'iron_raw', give:'iron_ore' });
BLOCKS[B.GOLD]     = blk('Gold Ore', { tiles:'gold', hardness:2.5, tool:'pickaxe', tier:3, drop:'gold_raw', give:'gold_ore' });
BLOCKS[B.CRYSTAL]  = blk('Crystal Ore', { tiles:'crystal', hardness:3, tool:'pickaxe', tier:3, drop:'crystal', give:'crystal_ore' });
BLOCKS[B.DEEPSTONE]= blk('Deep Stone', { tiles:'deepstone', hardness:3, tool:'pickaxe', tier:3, drop:'deepstone', give:'deepstone' });
BLOCKS[B.DARKSTONE]= blk('Voidstone', { tiles:'darkstone', hardness:6, tool:'pickaxe', tier:4, drop:'darkstone', give:'darkstone' });
BLOCKS[B.BENCH]    = blk('Crafting Bench', { tiles:{top:'bench_top',side:'bench_side',bottom:'planks'}, render:'model', model:'bench', hardness:1, tool:'axe', drop:'bench', give:'bench' });
BLOCKS[B.FURNACE]  = blk('Stone Kiln', { tiles:{top:'stonebrick',side:'stonebrick',bottom:'stonebrick'}, render:'model', model:'furnace', hardness:2, tool:'pickaxe', tier:1, drop:'furnace', give:'furnace' });
BLOCKS[B.CHEST]    = blk('Storage Chest', { render:'model', model:'chest', hardness:1, tool:'axe', drop:'chest', give:'chest' });
BLOCKS[B.BED]      = blk('Bed', { render:'model', model:'bed', hardness:0.4, drop:'bed', give:'bed' });
BLOCKS[B.BED_FOOT] = blk('Bed', { render:'model', model:null, hardness:0.4, drop:null });
BLOCKS[B.TORCH]    = blk('Torch', { render:'model', model:'torch', solid:false, transparent:true, light:13, hardness:0.05, drop:'torch', give:'torch' });
BLOCKS[B.LANTERN]  = blk('Lantern', { render:'model', model:'lantern', solid:false, transparent:true, light:15, hardness:0.4, tool:'pickaxe', drop:'lantern', give:'lantern' });
BLOCKS[B.DOOR]     = blk('Wooden Door', { render:'model', model:'door', solid:true, hardness:0.7, tool:'axe', drop:'door', give:'door' });
BLOCKS[B.METAL_DOOR] = blk('Metal Hatch Door', { render:'model', model:'metaldoor', solid:true, hardness:2.4, tool:'pickaxe', tier:1, drop:'metal_door', give:'metal_door' });
BLOCKS[B.CAMPFIRE]   = blk('Campfire', { render:'model', model:'campfire', solid:true, transparent:true, light:12, hardness:1, tool:'axe', drop:'campfire', give:'campfire' });
BLOCKS[B.SEAROCK]    = blk('Sea Rock', { render:'model', model:'searock', solid:false, transparent:true, hardness:1.2, tool:'pickaxe', tier:1, drop:'cobble', give:'searock' });
BLOCKS[B.KELP]       = blk('Kelp', { tiles:'kelp', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:'kelp', give:'kelp' });
BLOCKS[B.FALLEN_LOG] = blk('Fallen Timber', { render:'model', model:'fallenlog', colH:0.48, hardness:1.4, tool:'axe', drop:'log' });
BLOCKS[B.SHRUB]      = blk('Wild Shrub', { render:'model', model:'shrub', solid:false, transparent:true, hardness:0.12, drop:'fiber', give:'shrub' });
BLOCKS[B.BARREL]     = blk('Storage Barrel', { render:'model', model:'barrel', colH:0.82, hardness:1, tool:'axe', drop:'barrel', give:'barrel' });
BLOCKS[B.RUBBLE]     = blk('Stone Rubble', { render:'model', model:'rubble', solid:false, transparent:true, hardness:0.45, tool:'pickaxe', drop:'cobble', give:'rubble' });
// kelp/searock cells replaced a water cell — treat them as water for swimming/breath/tint
function isWet(id){ return id===B.WATER || id===B.KELP || id===B.SEAROCK; }
BLOCKS[B.LADDER]   = blk('Ladder', { render:'model', model:'ladder', solid:false, transparent:true, hardness:0.3, tool:'axe', drop:'ladder', give:'ladder' });
BLOCKS[B.GLASS]    = blk('Glass', { tiles:'glass', transparent:true, hardness:0.3, drop:null, give:'glass' });
BLOCKS[B.FENCE]    = blk('Fence', { render:'model', model:'fence', solid:true, transparent:true, hardness:0.8, tool:'axe', drop:'fence', give:'fence' });
BLOCKS[B.STAIRS]   = blk('Stone Stairs', { render:'model', model:'stairs', hardness:1.4, tool:'pickaxe', tier:1, drop:'stairs', give:'stairs', colH:0.5 });
BLOCKS[B.SLAB]     = blk('Stone Slab', { render:'model', model:'slab', hardness:1.4, tool:'pickaxe', tier:1, drop:'slab', give:'slab', colH:0.5 });
BLOCKS[B.BRICK]    = blk('Bricks', { tiles:'brick', hardness:1.8, tool:'pickaxe', tier:1, drop:'brick', give:'brick' });
BLOCKS[B.STONEBRICK]=blk('Stone Bricks', { tiles:'stonebrick', hardness:1.8, tool:'pickaxe', tier:1, drop:'stonebrick', give:'stonebrick' });
BLOCKS[B.ROOFTILE] = blk('Roof Tile', { tiles:'rooftile', hardness:1, tool:'pickaxe', drop:'rooftile', give:'rooftile' });
BLOCKS[B.CARPET]   = blk('Carpet', { render:'model', model:'carpet', solid:false, transparent:true, hardness:0.1, drop:'carpet', give:'carpet' });
BLOCKS[B.BOOKSHELF]= blk('Bookshelf', { render:'model', model:'bookshelf', tiles:'bookshelf', hardness:1, tool:'axe', drop:'bookshelf', give:'bookshelf' });
BLOCKS[B.POTTED] = blk('Potted Plant', { render:'model', model:'potted', solid:false, transparent:true, hardness:0.15, drop:'potted', give:'potted' });
BLOCKS[B.BANNER] = blk('Banner', { render:'model', model:'banner', solid:false, transparent:true, hardness:0.1, drop:'banner', give:'banner' });
BLOCKS[B.PLAMP] = blk('Paper Lamp', { render:'model', model:'plamp', solid:false, transparent:true, light:12, hardness:0.15, drop:'plamp', give:'plamp' });
BLOCKS[B.HAY]      = blk('Hay Bale', { render:'model', model:'hay', tiles:{top:'hay',side:'hay',bottom:'hay'}, hardness:0.6, drop:'hay', give:'hay' });
BLOCKS[B.PATH]     = blk('Dirt Path', { tiles:'path', hardness:0.5, tool:'shovel', drop:'dirt', give:'path' });
BLOCKS[B.WINDOW]   = blk('Window', { render:'model', model:'window', transparent:true, hardness:0.3, drop:null, give:'window' });
BLOCKS[B.WOOL]        = blk('Wool', { tiles:'wool', hardness:0.3, drop:'wool', give:'wool' });
BLOCKS[B.COPPER_BLOCK]= blk('Copper Block', { tiles:'copper_block', hardness:2.5, tool:'pickaxe', tier:2, drop:'copper_block', give:'copper_block' });
BLOCKS[B.IRON_BLOCK]  = blk('Iron Block', { tiles:'iron_block', hardness:3, tool:'pickaxe', tier:3, drop:'iron_block', give:'iron_block' });
BLOCKS[B.GOLD_BLOCK]  = blk('Gold Block', { tiles:'gold_block', hardness:2.5, tool:'pickaxe', tier:4, drop:'gold_block', give:'gold_block' });
BLOCKS[B.CRYSTAL_BLOCK]=blk('Crystal Block', { tiles:'crystal_block', hardness:3.5, tool:'pickaxe', tier:4, drop:'crystal_block', give:'crystal_block' });
BLOCKS[B.MOSSSTONE]   = blk('Mossy Stone', { tiles:'mossstone', hardness:1.5, tool:'pickaxe', tier:1, drop:'mossstone', give:'mossstone' });
BLOCKS[B.BASALT]      = blk('Basalt', { tiles:'basalt', hardness:2, tool:'pickaxe', tier:2, drop:'basalt', give:'basalt' });
BLOCKS[B.OBSIDIAN]    = blk('Obsidian', { tiles:'obsidian', hardness:8, tool:'pickaxe', tier:5, drop:'obsidian', give:'obsidian' });
BLOCKS[B.SMOOTHSTONE] = blk('Smooth Stone', { tiles:'smoothstone', hardness:1.6, tool:'pickaxe', tier:1, drop:'smoothstone', give:'smoothstone' });
BLOCKS[B.WOOL_RED]    = blk('Red Wool', { tiles:'cloth_red', hardness:0.3, drop:'wool_red', give:'wool_red' });
BLOCKS[B.WOOL_BLUE]   = blk('Blue Wool', { tiles:'cloth_blue', hardness:0.3, drop:'wool_blue', give:'wool_blue' });
BLOCKS[B.GRANITE]     = blk('Granite', { tiles:'granite', hardness:1.7, tool:'pickaxe', tier:1, drop:'granite', give:'granite' });
BLOCKS[B.ANDESITE]    = blk('Andesite', { tiles:'andesite', hardness:1.7, tool:'pickaxe', tier:1, drop:'andesite', give:'andesite' });
BLOCKS[B.DIORITE]     = blk('Diorite', { tiles:'diorite', hardness:1.7, tool:'pickaxe', tier:1, drop:'diorite', give:'diorite' });
BLOCKS[B.POLISHED_GRANITE] = blk('Polished Granite', { tiles:'polished_granite', hardness:1.8, tool:'pickaxe', tier:1, drop:'polished_granite', give:'polished_granite' });
BLOCKS[B.POLISHED_ANDESITE]= blk('Polished Andesite', { tiles:'polished_andesite', hardness:1.8, tool:'pickaxe', tier:1, drop:'polished_andesite', give:'polished_andesite' });
BLOCKS[B.POLISHED_DIORITE] = blk('Polished Diorite', { tiles:'polished_diorite', hardness:1.8, tool:'pickaxe', tier:1, drop:'polished_diorite', give:'polished_diorite' });
BLOCKS[B.SANDSTONE]   = blk('Sandstone', { tiles:'sandstone', hardness:1.0, tool:'pickaxe', tier:1, drop:'sandstone', give:'sandstone' });
BLOCKS[B.CHISELED_SANDSTONE]=blk('Chiseled Sandstone', { tiles:'chiseled_sandstone', hardness:1.0, tool:'pickaxe', tier:1, drop:'chiseled_sandstone', give:'chiseled_sandstone' });
BLOCKS[B.SMOOTH_SANDSTONE]= blk('Smooth Sandstone', { tiles:'smooth_sandstone', hardness:1.0, tool:'pickaxe', tier:1, drop:'smooth_sandstone', give:'smooth_sandstone' });
BLOCKS[B.CUT_COPPER]  = blk('Cut Copper', { tiles:'cut_copper', hardness:2.5, tool:'pickaxe', tier:2, drop:'cut_copper', give:'cut_copper' });
BLOCKS[B.CUT_IRON]    = blk('Cut Iron', { tiles:'cut_iron', hardness:3, tool:'pickaxe', tier:3, drop:'cut_iron', give:'cut_iron' });
BLOCKS[B.CUT_GOLD]    = blk('Cut Gold', { tiles:'cut_gold', hardness:2.5, tool:'pickaxe', tier:3, drop:'cut_gold', give:'cut_gold' });
BLOCKS[B.COAL_BLOCK]  = blk('Coal Block', { tiles:'coal_block', hardness:2, tool:'pickaxe', tier:1, drop:'coal_block', give:'coal_block' });
BLOCKS[B.TERRACOTTA]  = blk('Terracotta', { tiles:'terracotta', hardness:1.2, tool:'pickaxe', tier:1, drop:'terracotta', give:'terracotta' });
BLOCKS[B.PACKED_ICE]  = blk('Packed Ice', { tiles:'packed_ice', hardness:0.6, drop:'packed_ice', give:'packed_ice', frostBlend:true });   // same subtle-translucent ice material, denser texture
BLOCKS[B.FROSTED_GLASS]= blk('Frosted Glass', { tiles:'frosted_glass', transparent:true, hardness:0.3, drop:null, give:'frosted_glass' });
BLOCKS[B.POLISHED_BASALT]= blk('Polished Basalt', { tiles:'polished_basalt', hardness:2.1, tool:'pickaxe', tier:2, drop:'polished_basalt', give:'polished_basalt' });
BLOCKS[B.DARK_PLANKS] = blk('Dark Planks', { tiles:'dark_planks', hardness:0.9, tool:'axe', drop:'dark_planks', give:'dark_planks' });
BLOCKS[B.CHISELED_STONEBRICK]=blk('Chiseled Stone Bricks', { tiles:'chiseled_stonebrick', hardness:1.8, tool:'pickaxe', tier:1, drop:'chiseled_stonebrick', give:'chiseled_stonebrick' });
BLOCKS[B.MOSSY_STONEBRICK]=blk('Mossy Stone Bricks', { tiles:'mossy_stonebrick', hardness:1.8, tool:'pickaxe', tier:1, drop:'mossy_stonebrick', give:'mossy_stonebrick' });
BLOCKS[B.CRACKED_STONEBRICK]=blk('Cracked Stone Bricks', { tiles:'cracked_stonebrick', hardness:1.6, tool:'pickaxe', tier:1, drop:'cracked_stonebrick', give:'cracked_stonebrick' });
BLOCKS[B.POLISHED_DEEPSTONE]=blk('Polished Deep Stone', { tiles:'polished_deepstone', hardness:3, tool:'pickaxe', tier:3, drop:'polished_deepstone', give:'polished_deepstone' });
BLOCKS[B.POLISHED_DARKSTONE]=blk('Polished Voidstone', { tiles:'polished_darkstone', hardness:6, tool:'pickaxe', tier:4, drop:'polished_darkstone', give:'polished_darkstone' });
BLOCKS[B.COBBLE]      = blk('Cobblestone', { tiles:'cobble', hardness:1.5, tool:'pickaxe', tier:1, drop:'cobble', give:'cobble' });
BLOCKS[B.POTATO0] = blk('Potatoes', { tiles:'potato0', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.POTATO1] = blk('Potatoes', { tiles:'potato1', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.POTATO2] = blk('Potatoes', { tiles:'potato2', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.POTATO3] = blk('Potatoes', { tiles:'potato3', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.CARROT0] = blk('Carrots', { tiles:'carrot0', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.CARROT1] = blk('Carrots', { tiles:'carrot1', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.CARROT2] = blk('Carrots', { tiles:'carrot2', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.CARROT3] = blk('Carrots', { tiles:'carrot3', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.WHEAT0] = blk('Wheat', { tiles:'wheat0', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.WHEAT1] = blk('Wheat', { tiles:'wheat1', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.WHEAT2] = blk('Wheat', { tiles:'wheat2', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.WHEAT3] = blk('Wheat', { tiles:'wheat3', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.TOMATO0] = blk('Tomatoes', { tiles:'tomato0', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.TOMATO1] = blk('Tomatoes', { tiles:'tomato1', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.TOMATO2] = blk('Tomatoes', { tiles:'tomato2', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.TOMATO3] = blk('Tomatoes', { tiles:'tomato3', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:null });
BLOCKS[B.PUMPKIN] = blk('Pumpkin', { render:'model', model:'pumpkin', tiles:'pumpkin', hardness:0.8, tool:'axe', drop:'pumpkin', give:'pumpkin' });
BLOCKS[B.MELON] = blk('Melon', { render:'model', model:'melon', tiles:'melon', hardness:0.6, tool:'axe', drop:'melon', give:'melon' });
BLOCKS[B.NETHERRACK] = blk('Netherrack', { tiles:'netherrack', hardness:0.4, tool:'pickaxe', drop:'netherrack', give:'netherrack' });
BLOCKS[B.GLOWSTONE] = blk('Glowstone', { tiles:'glowstone', light:15, hardness:0.3, tool:'pickaxe', drop:'glowstone', give:'glowstone' });
BLOCKS[B.MYCELIUM] = blk('Mycelium', { tiles:{top:'mycelium',side:'mycelium_side',bottom:'dirt'}, hardness:0.6, tool:'shovel', drop:'dirt', give:'mycelium' });
BLOCKS[B.SOULSAND] = blk('Soul Sand', { tiles:'soulsand', hardness:0.5, tool:'shovel', drop:'soulsand', give:'soulsand' });
BLOCKS[B.SUGARCANE] = blk('Sugar Cane', { tiles:'sugarcane', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:'sugarcane', give:'sugarcane' });
BLOCKS[B.QUARTZ] = blk('Quartz Block', { tiles:'quartz', hardness:0.8, tool:'pickaxe', tier:1, drop:'quartz', give:'quartz' });
BLOCKS[B.NETHERBRICK] = blk('Nether Brick', { tiles:'netherbrick', hardness:2, tool:'pickaxe', tier:1, drop:'netherbrick', give:'netherbrick' });
BLOCKS[B.CAKE] = blk('Cake', { render:'model', model:'cake', tiles:'cake', hardness:0.5, drop:null });
BLOCKS[B.BEETROOT] = blk('Beetroots', { tiles:'beetroot', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:'beetroot', give:'beetroot' });
BLOCKS[B.EMERALD]       = blk('Emerald Ore', { tiles:'emerald', hardness:3, tool:'pickaxe', tier:3, drop:'emerald', give:'emerald_ore' });
BLOCKS[B.DIAMOND]       = blk('Diamond Ore', { tiles:'diamond', hardness:4, tool:'pickaxe', tier:3, drop:'diamond', give:'diamond_ore' });
BLOCKS[B.EMERALD_BLOCK] = blk('Emerald Block', { tiles:'emerald_block', hardness:3, tool:'pickaxe', tier:2, drop:'emerald_block', give:'emerald_block' });
BLOCKS[B.DIAMOND_BLOCK] = blk('Diamond Block', { tiles:'diamond_block', hardness:5, tool:'pickaxe', tier:3, drop:'diamond_block', give:'diamond_block' });
BLOCKS[B.MARS_SOIL] = blk('Mars Soil', { tiles:'mars_soil', hardness:0.5, tool:'shovel', drop:'mars_soil', give:'mars_soil' });
BLOCKS[B.REGOLITH] = blk('Regolith', { tiles:'regolith', hardness:0.6, tool:'shovel', drop:'regolith', give:'regolith' });
BLOCKS[B.PERMAFROST] = blk('Permafrost', { tiles:'permafrost', hardness:0.7, tool:'shovel', drop:'permafrost', give:'permafrost' });
BLOCKS[B.LAUNCHPAD] = blk('Launch Pad', { tiles:'launchpad', hardness:2, tool:'pickaxe', tier:1, drop:'launchpad', give:'launchpad' });
BLOCKS[B.STARSHIP] = blk('Starship', { tiles:'starship', hardness:3, tool:'pickaxe', tier:2, drop:'starship', give:'starship' });
BLOCKS[B.SOLAR_PANEL] = blk('Solar Panel', { tiles:'solar_panel', hardness:0.4, tool:'pickaxe', drop:'solar_panel', give:'solar_panel' });
BLOCKS[B.BATTERY] = blk('Battery', { tiles:'battery', hardness:1.5, tool:'pickaxe', drop:'battery', give:'battery' });
// ---- space age expansion blocks ----
BLOCKS[B.ALIEN_GRASS]  = blk('Aethon Turf', { tiles:{top:'alien_grass_top',side:'alien_grass_side',bottom:'alien_rock'}, hardness:0.6, tool:'shovel', drop:'alien_grass', give:'alien_grass' });
BLOCKS[B.ALIEN_ROCK]   = blk('Aethon Rock', { tiles:'alien_rock', hardness:1.6, tool:'pickaxe', tier:1, drop:'alien_rock', give:'alien_rock' });
BLOCKS[B.ALIEN_CRYSTAL]= blk('Voidcrystal Ore', { tiles:'alien_crystal', light:7, hardness:2.6, tool:'pickaxe', tier:2, drop:'space_shard', give:'alien_crystal' });
BLOCKS[B.ROCKET_HULL]  = blk('Rocket Hull', { tiles:{top:'rocket_hull_top',side:'rocket_hull',bottom:'rocket_hull_top'}, hardness:3, tool:'pickaxe', tier:2, drop:'rocket_hull', give:'rocket_hull' });
BLOCKS[B.ROCKET_NOSE]  = blk('Rocket Nose Cone', { tiles:'rocket_nose', hardness:3, tool:'pickaxe', tier:2, drop:'rocket_nose', give:'rocket_nose' });
BLOCKS[B.ROCKET_FIN]   = blk('Rocket Fin', { tiles:'rocket_fin', hardness:3, tool:'pickaxe', tier:2, drop:'rocket_fin', give:'rocket_fin' });
BLOCKS[B.SCIENCE_BENCH]= blk('Science Lab', { render:'model', model:'science', tiles:{top:'science_top',side:'science_side',bottom:'hab_panel'}, light:4, hardness:2, tool:'pickaxe', tier:1, drop:'science_bench', give:'science_bench' });
BLOCKS[B.FUEL_TANK]    = blk('Fuel Tank', { render:'model', model:'fueltank', tiles:'fuel_tank', hardness:2, tool:'pickaxe', tier:1, drop:'fuel_tank', give:'fuel_tank' });
BLOCKS[B.HAB_PANEL]    = blk('Habitat Panel', { tiles:'hab_panel', hardness:1.4, tool:'pickaxe', tier:1, drop:'hab_panel', give:'hab_panel' });
BLOCKS[B.GLASS_DOME]   = blk('Reinforced Glass', { tiles:'glass_dome', transparent:true, hardness:1, tool:'pickaxe', drop:'glass_dome', give:'glass_dome' });
BLOCKS[B.ALIEN_PLANT]  = blk('Aethon Bloom', { tiles:'alien_plant', render:'cross', solid:false, transparent:true, cutout:true, hardness:0.05, drop:'alien_plant', give:'alien_plant' });
BLOCKS[B.STAR_BEACON]  = blk('Star Beacon', { tiles:'star_beacon', light:15, hardness:1.2, tool:'pickaxe', drop:'star_beacon', give:'star_beacon' });
BLOCKS[B.ALIEN_LOG]    = blk('Aethon Log', { tiles:{top:'alien_log_top',bottom:'alien_log_top',side:'alien_log_side'}, hardness:1.8, tool:'axe', drop:'alien_log', give:'alien_log' });
BLOCKS[B.ALIEN_LEAVES] = blk('Aethon Fronds', { tiles:'alien_leaves', transparent:true, cutout:true, hardness:0.2, drop:null, give:'alien_leaves', sway:0.3 });
BLOCKS[B.HAB_FLOOR]    = blk('Habitat Floor', { tiles:'hab_floor', hardness:1.4, tool:'pickaxe', tier:1, drop:'hab_floor', give:'hab_floor' });

// Tight collision proxies for non-cube art. Each box is [cx, cy, cz, sx, sy, sz]
// in block-local coordinates. Cube blocks keep the fast full-cell path.
const MODEL_COLLIDERS = {
  bench:[[0,.46,0,.96,.92,.96]], furnace:[[0,.48,0,.96,.96,.96]],
  chest:[[0,.36,0,.92,.72,.86]], bed:[[0,.22,.5,.9,.44,1.86]],
  campfire:[[0,.18,0,.9,.36,.9]], fallenlog:[[0,.32,0,.74,.64,.98]],
  barrel:[[0,.42,0,.78,.84,.78]], fence:[[0,.47,0,.28,.94,.28],[0,.53,0,1,.42,.14],[0,.53,0,.14,.42,1]],
  stairs:[[0,.17,0,1,.34,1],[0,.505,-.17,1,.33,.66],[0,.835,-.335,1,.33,.33]],
  slab:[[0,.24,0,1,.48,1]], bookshelf:[[0,.48,0,.96,.96,.92]], hay:[[0,.46,0,.94,.92,.94]],
  pumpkin:[[0,.36,0,.88,.72,.88]], melon:[[0,.34,0,.9,.68,.9]],
  cake:[[0,.25,0,.86,.5,.86]],
  science:[[0,.28,0,.98,.56,.74],[0,.75,-.15,.88,.5,.18]],
  fueltank:[[0,.5,0,.72,1,.72]], window:[[0,.5,0,1,1,.1]]
};
function rotatedCollider(boxDef, rot){
  const q=Math.round((rot||0)/(Math.PI/2)), odd=Math.abs(q)%2===1;
  let [x,y,z,sx,sy,sz]=boxDef;
  for(let i=0;i<((q%4)+4)%4;i++) [x,z]=[z,-x];
  return [x,y,z,odd?sz:sx,sy,odd?sx:sz];
}
const EMPTY_COLLIDERS=[], FULL_COLLIDERS=[[0,.5,0,1,1,1]], DOOR_COLLIDER=[0,.95,0,.92,1.9,.12];
const MODEL_COLLIDER_CACHE={};
for(const name in MODEL_COLLIDERS) MODEL_COLLIDER_CACHE[name]=[0,1,2,3].map(q=>MODEL_COLLIDERS[name].map(v=>rotatedCollider(v,q*Math.PI/2)));
const DOOR_COLLIDER_CACHE=[0,1,2,3].map(q=>[rotatedCollider(DOOR_COLLIDER,q*Math.PI/2)]);
function collisionQuarter(rot){ return ((Math.round((rot||0)/(Math.PI/2))%4)+4)%4; }
function blockCollisionBoxes(id, meta){
  const b=BLOCKS[id]; if(!b||!b.solid) return EMPTY_COLLIDERS;
  if(isDoorId(id)){
    const open=!!(meta&&meta.open), rot=((meta&&meta.rot)||0)+(open?Math.PI/2:0);
    return DOOR_COLLIDER_CACHE[collisionQuarter(rot)];
  }
  const cached=MODEL_COLLIDER_CACHE[b.model];
  return cached ? cached[collisionQuarter(meta&&meta.rot)] : FULL_COLLIDERS;
}
function sphereHitsWorld(world,x,y,z,r=.14){
  for(let yy=Math.floor(y-r);yy<=Math.floor(y+r);yy++) for(let xx=Math.floor(x-r);xx<=Math.floor(x+r);xx++) for(let zz=Math.floor(z-r);zz<=Math.floor(z+r);zz++){
    const id=world.getBlock(xx,yy,zz), def=BLOCKS[id]; if(!def||!def.solid) continue;
    const needsMeta=isDoorId(id)||!!MODEL_COLLIDER_CACHE[def.model], meta=needsMeta?world.meta.get(world.bkey(xx,yy,zz)):null;
    if(isDoorId(id)&&meta&&meta.open) continue;
    for(const c of blockCollisionBoxes(id,meta)){
      const [cx,cy,cz,sx,sy,sz]=c, bx=xx+.5+cx,by=yy+cy,bz=zz+.5+cz;
      const qx=clamp(x,bx-sx/2,bx+sx/2), qy=clamp(y,by-sy/2,by+sy/2), qz=clamp(z,bz-sz/2,bz+sz/2);
      if((x-qx)**2+(y-qy)**2+(z-qz)**2<r*r) return true;
    }
  }
  return false;
}

// One material identity drives hit particles, break bursts, audio, debris
// weight, and footsteps. New blocks opt in here instead of adding another
// destruction implementation.
const MATERIAL_FX={
  wood:   {colors:['#5a351f','#8b552e','#c18448'],gravity:8, life:0.8,size:[0.05,0.16],speed:2.2,hit:3,brk:12},
  stone:  {colors:['#555750','#77766f','#a09b8f'],gravity:16,life:0.62,size:[0.06,0.18],speed:2.6,hit:3,brk:10},
  soil:   {colors:['#493022','#68472f','#8e633e'],gravity:12,life:0.55,size:[0.04,0.13],speed:1.7,hit:3,brk:10},
  sand:   {colors:['#8d744d','#c5aa72','#e0c88e'],gravity:15,life:0.5,size:[0.025,0.08],speed:1.5,hit:4,brk:14},
  snow:   {colors:['#b7c7d1','#d8e3e9','#f0f6f7'],gravity:3, life:0.75,size:[0.025,0.08],speed:1.4,hit:4,brk:15,drift:0.8},
  ice:    {colors:['#6fa7bd','#a8d5e2','#e6f7fa'],gravity:9, life:0.8,size:[0.04,0.14],speed:3.1,hit:4,brk:13,slide:1},
  glass:  {colors:['#88b9c6','#c7e4e8','#f2ffff'],gravity:13,life:0.65,size:[0.025,0.11],speed:3.4,hit:2,brk:15},
  metal:  {colors:['#6b7076','#a9afb5','#e4d9b4'],gravity:18,life:0.5,size:[0.025,0.09],speed:4,hit:3,brk:9,spark:1},
  crystal:{colors:['#6ccbd7','#a1edf2','#e4ffff'],gravity:6, life:0.9,size:[0.035,0.13],speed:3.1,hit:4,brk:15,glow:1},
  leaves: {colors:['#294f2c','#3b7134','#78a74b'],gravity:2.5,life:1.15,size:[0.025,0.1],speed:1.5,hit:4,brk:14,drift:1.3},
  plant:  {colors:['#477b37','#70a34b','#d0a956'],gravity:2.5,life:0.85,size:[0.02,0.08],speed:1.2,hit:3,brk:10,drift:0.8},
  cloth:  {colors:['#8f3540','#c86269','#e8e2d4'],gravity:4, life:0.75,size:[0.04,0.12],speed:1.4,hit:2,brk:8},
  alien:  {colors:['#2fd6c8','#7656b3','#d8aaff'],gravity:4, life:1.05,size:[0.03,0.14],speed:2.8,hit:4,brk:16,glow:1,drift:0.5},
};
const BLOCK_MATERIAL={};
function materialBlocks(name,ids){ for(const id of ids) BLOCK_MATERIAL[id]=name; }
materialBlocks('wood',[B.LOG,B.PLANKS,B.BENCH,B.CHEST,B.DOOR,B.FENCE,B.LADDER,B.BOOKSHELF,B.HAY,B.DARK_PLANKS,B.FALLEN_LOG,B.BARREL]);
materialBlocks('soil',[B.GRASS,B.DIRT,B.CLAY,B.PATH,B.MYCELIUM,B.SOULSAND,B.TERRACOTTA,B.MARS_SOIL]);
materialBlocks('sand',[B.SAND,B.GRAVEL,B.SANDSTONE,B.SMOOTH_SANDSTONE,B.CHISELED_SANDSTONE]);
materialBlocks('snow',[B.SNOW,B.PERMAFROST]);
materialBlocks('ice',[B.ICE,B.PACKED_ICE,B.FROSTED_GLASS]);
materialBlocks('glass',[B.GLASS,B.WINDOW,B.GLASS_DOME]);
materialBlocks('metal',[B.COPPER,B.IRON,B.GOLD,B.COPPER_BLOCK,B.IRON_BLOCK,B.GOLD_BLOCK,B.CUT_COPPER,B.CUT_IRON,B.CUT_GOLD,B.ROCKET_HULL,B.ROCKET_NOSE,B.ROCKET_FIN,B.METAL_DOOR,B.FUEL_TANK,B.HAB_PANEL,B.HAB_FLOOR,B.LAUNCHPAD,B.STARSHIP,B.SOLAR_PANEL,B.BATTERY]);
materialBlocks('crystal',[B.CRYSTAL,B.CRYSTAL_BLOCK,B.DIAMOND,B.DIAMOND_BLOCK,B.GLOWSTONE,B.QUARTZ,B.STAR_BEACON]);
materialBlocks('leaves',[B.LEAVES,B.SHRUB]);
materialBlocks('plant',[B.TALLGRASS,B.FLOWER_R,B.FLOWER_B,B.MUSHROOM,B.CACTUS,B.KELP,B.SUGARCANE,B.POTATO0,B.POTATO1,B.POTATO2,B.POTATO3,B.CARROT0,B.CARROT1,B.CARROT2,B.CARROT3,B.WHEAT0,B.WHEAT1,B.WHEAT2,B.WHEAT3,B.TOMATO0,B.TOMATO1,B.TOMATO2,B.TOMATO3,B.BEETROOT,B.PUMPKIN,B.MELON]);
materialBlocks('cloth',[B.WOOL,B.WOOL_RED,B.WOOL_BLUE,B.BED,B.BED_FOOT,B.CARPET,B.BANNER]);
materialBlocks('alien',[B.ALIEN_GRASS,B.ALIEN_ROCK,B.ALIEN_CRYSTAL,B.ALIEN_PLANT,B.ALIEN_LOG,B.ALIEN_LEAVES]);
function blockMaterial(id){ return BLOCK_MATERIAL[id]||'stone'; }

// ---------- items ----------
// Non-block items first; placeable block items appended from BLOCKS.give.
const ITEMS = {};
function item(id, o){ ITEMS[id]=Object.assign({ id, name:id, max:64, icon:'gen' }, o); }
item('stick',{ name:'Stick', icon:'stick' });
item('coal',{ name:'Coal', icon:'coal', fuel:8 });
item('charcoal',{ name:'Charcoal', icon:'coal', fuel:8 });
item('copper_raw',{ name:'Raw Copper', icon:'ingot', col:'#c87f4a', smelt:'copper_ingot' });
item('iron_raw',{ name:'Raw Iron', icon:'ingot', col:'#d9b48a', smelt:'iron_ingot' });
item('gold_raw',{ name:'Raw Gold', icon:'ingot', col:'#f4d35e', smelt:'gold_ingot' });
item('copper_ingot',{ name:'Copper Ingot', icon:'ingot', col:'#e0975a' });
item('iron_ingot',{ name:'Iron Ingot', icon:'ingot', col:'#d6d6da' });
item('gold_ingot',{ name:'Gold Ingot', icon:'ingot', col:'#f4d35e' });
item('nether_brick',{ name:'Nether Brick', icon:'ingot', col:'#3a2a2a' });
item('crystal',{ name:'Crystal Shard', icon:'crystal' });
item('fiber',{ name:'Plant Fiber', icon:'fiber' });
item('wool',{ name:'Soft Wool', icon:'wool', blockId:B.WOOL });
item('raw_meat',{ name:'Raw Meat', icon:'meat_raw', food:2, raw:true, smelt:'cooked_meat' });
item('cooked_meat',{ name:'Cooked Meat', icon:'meat_cooked', food:7 });
item('raw_fish',{ name:'Raw Fish', icon:'fish_raw', food:2, raw:true, smelt:'cooked_fish' });
item('cooked_fish',{ name:'Cooked Fish', icon:'fish_cooked', food:6 });
item('gel',{ name:'Gel', icon:'gel' });
item('apple',{ name:'Wild Apple', icon:'apple', food:4 });
item('egg',{ name:'Egg', icon:'egg', food:2 });
item('seeds',{ name:'Grass Seeds', icon:'seeds' });
item('potato_seed',{ name:'Potato Seeds', icon:'seeds', blockId:B.POTATO0 });
item('carrot_seed',{ name:'Carrot Seeds', icon:'seeds', blockId:B.CARROT0 });
item('potato',{ name:'Potato', icon:'potato', food:2, raw:true, smelt:'baked_potato' });
item('baked_potato',{ name:'Baked Potato', icon:'baked_potato', food:6 });
item('carrot',{ name:'Carrot', icon:'carrot', food:3, raw:true, smelt:'cooked_carrot' });
item('cooked_carrot',{ name:'Cooked Carrot', icon:'cooked_carrot', food:5 });
item('wheat_seed',{ name:'Wheat Seeds', icon:'seeds', blockId:B.WHEAT0 });
item('wheat',{ name:'Wheat', icon:'wheat', food:1, raw:true, smelt:'bread' });
item('bread',{ name:'Bread', icon:'bread', food:5 });
item('tomato_seed',{ name:'Tomato Seeds', icon:'seeds', blockId:B.TOMATO0 });
item('tomato',{ name:'Tomato', icon:'tomato', food:2, raw:true, smelt:'cooked_tomato' });
item('cooked_tomato',{ name:'Cooked Tomato', icon:'cooked_tomato', food:5 });
item('raw_beef',{ name:'Raw Beef', icon:'meat_raw', food:2, raw:true, smelt:'cooked_beef' });
item('cooked_beef',{ name:'Cooked Beef', icon:'meat_cooked', food:8 });
item('raw_chicken',{ name:'Raw Chicken', icon:'meat_raw', food:2, raw:true, smelt:'cooked_chicken' });
item('cooked_chicken',{ name:'Cooked Chicken', icon:'meat_cooked', food:6 });
item('cookie',{ name:'Cookie', icon:'cookie', food:2 });
item('pumpkin_pie',{ name:'Pumpkin Pie', icon:'pie', food:8 });
item('melon_slice',{ name:'Melon Slice', icon:'melon_slice', food:2 });
item('glowstone_dust',{ name:'Glowstone Dust', icon:'crystal', col:'#f4d35e' });
item('sugar',{ name:'Sugar', icon:'sugar' });
item('paper',{ name:'Paper', icon:'paper' });
item('book',{ name:'Book', icon:'book' });
item('beetroot',{ name:'Beetroot', icon:'beetroot', food:1, raw:true, smelt:'cooked_beetroot' });
item('cooked_beetroot',{ name:'Cooked Beetroot', icon:'cooked_beetroot', food:5 });
item('beetroot_seeds',{ name:'Beetroot Seeds', icon:'seeds', blockId:B.BEETROOT });
item('leather',{ name:'Leather', icon:'leather' });
item('sugarcane',{ name:'Sugar Cane', icon:'sugarcane', blockId:B.SUGARCANE });
item('cake',{ name:'Cake', icon:'cake', blockId:B.CAKE });
item('bowl',{ name:'Bowl', icon:'bowl' });
item('mushroom_stew',{ name:'Mushroom Stew', icon:'stew', stewColor:'#8a552c', food:8 });
item('garden_salad',{ name:'Garden Salad', icon:'stew', stewColor:'#5fae4a', food:7 });
item('veggie_stew',{ name:'Hearty Veggie Stew', icon:'stew', stewColor:'#c97a3a', food:10 });
item('apple_pie',{ name:'Apple Pie', icon:'pie', food:9 });
item('hearty_breakfast',{ name:'Hearty Breakfast', icon:'stew', stewColor:'#d8a24a', food:11 });
item('beetroot_soup',{ name:'Beetroot Soup', icon:'stew', stewColor:'#8f2552', food:7 });
item('golden_carrot',{ name:'Golden Carrot', icon:'golden_carrot', food:6 });
item('raw_mutton',{ name:'Raw Mutton', icon:'meat_raw', food:2, raw:true, smelt:'cooked_mutton' });
item('cooked_mutton',{ name:'Cooked Mutton', icon:'meat_cooked', food:7 });
item('golden_apple',{ name:'Golden Apple', icon:'apple', food:10 });
item('flint',{ name:'Flint', icon:'flint' });
item('rotten_flesh',{ name:'Rotten Flesh', icon:'meat_raw', food:2, raw:true });
item('emerald',{ name:'Emerald', icon:'crystal', col:'#0f0' });
item('abyss_pearl',{ name:'Abyss Pearl', icon:'crystal', col:'#7ee6e6' });
item('tide_heart',{ name:'Heart of the Tide', icon:'shard', col:'#2ad6c8' });
item('ocean_crystal',{ name:'Ocean Crystal', icon:'crystal', col:'#40e0ff' });   // rare deep-sea reward
item('deep_scale',{ name:'Abyssal Scale', icon:'ingot', col:'#2a7a86' });         // sea-guard drop, deep-sea metal
// ---- ARTIFACTS: carried relics with real passive powers ----
item('sunstone',{ name:'Sunstone', icon:'crystal', col:'#ffb84a', max:1, stack:1 });        // carried: you never freeze
item('star_core',{ name:'Fallen Star Core', icon:'shard', col:'#9ad6ff', max:1, stack:1 }); // carried at launch: reinforced hull + bigger tanks
item('anomaly_core',{ name:'Hollow Star Core', icon:'shard', col:'#b04aff', max:1, stack:1 }); // shattered anomaly — the ultimate ship upgrade
item('diving_pod',{ name:'Diving Pod', icon:'pod', max:1, stack:1, pods:true });            // right-click water: dive deep, breathe freely
item('void_heart',{ name:'Heart of the Void', icon:'shard', col:'#c84aff' });
item('tide_charm',{ name:'Tide Charm', icon:'crystal', col:'#4ad6ff', max:1, stack:1 });   // carried: doubles breath underwater
item('boat',{ name:'Boat', icon:'boat', max:1, stack:1, boats:true });                     // right-click water to launch and ride
item('diamond',{ name:'Diamond', icon:'crystal', col:'#5cf' });
item('string',{ name:'String', icon:'string' });
item('raw_pork',{ name:'Raw Porkchop', icon:'meat_raw', food:3, raw:true, smelt:'cooked_pork' });
item('cooked_pork',{ name:'Cooked Porkchop', icon:'meat_cooked', food:8 });
item('raw_rabbit',{ name:'Raw Rabbit', icon:'meat_raw', food:2, raw:true, smelt:'cooked_rabbit' });
item('cooked_rabbit',{ name:'Cooked Rabbit', icon:'meat_cooked', food:5 });
item('rabbit_stew',{ name:'Rabbit Stew', icon:'stew', stewColor:'#c98a55', food:10 });
item('mars_soil',{ name:'Mars Soil', icon:'block', blockId:B.MARS_SOIL });
item('regolith',{ name:'Regolith', icon:'block', blockId:B.REGOLITH });
item('permafrost',{ name:'Permafrost', icon:'block', blockId:B.PERMAFROST });
item('launchpad',{ name:'Launch Pad', icon:'block', blockId:B.LAUNCHPAD });
item('starship',{ name:'Starship', icon:'block', blockId:B.STARSHIP });
item('solar_panel',{ name:'Solar Panel', icon:'block', blockId:B.SOLAR_PANEL });
item('battery',{ name:'Battery', icon:'block', blockId:B.BATTERY });
// ---- space age expansion items ----
item('space_shard',{ name:'Void Shard', icon:'shard', col:'#b07ad6' });
item('alien_alloy',{ name:'Alien Alloy', icon:'ingot', col:'#9a7ad6' });
item('circuit',{ name:'Circuit Board', icon:'circuit', col:'#3a9a5a' });
item('rocket_fuel',{ name:'Rocket Fuel', icon:'fuel', col:'#e0762a' });
item('oxygen_tank',{ name:'Oxygen Tank', icon:'oxygen', col:'#7ad6e6' });
// installable rocket systems (added to a rocket via the Launchpad dashboard)
item('engine_core',{ name:'Engine Core', icon:'ingot', col:'#d98a3a' });
item('guidance_computer',{ name:'Guidance Computer', icon:'circuit', col:'#5ec4e8' });
item('oxidizer_cell',{ name:'Oxidizer Cell', icon:'oxygen', col:'#9ad6c0' });
item('cybertruck',{ name:'Cybertruck', icon:'rover', stack:1, max:1, dur:500, effect:'speed', effectDur:300 });
item('neuralink',{ name:'Neuralink', icon:'neuralink', stack:1, max:1, effect:'regen', effectDur:600 });
item('flint_and_steel',{ name:'Flint and Steel', icon:'flint_steel', stack:1, max:1, dur:64, tool:'flint_and_steel', tier:1, speed:1 });
// flower_r / flower_b are created as placeable block items by the loop below
// smeltable blocks -> products handled via furnace map below
// tools
function tool(id, o){ item(id, Object.assign({ stack:1, max:1 }, o)); }
const TOOLS = [
  // Minecraft-inspired tiers: wood super slow, stone ok, copper good, iron fast (but not instant on soft blocks), gold fast but fragile, crystal instant on most
  ['wood_pickaxe','Wooden Pickaxe','pickaxe',1,60,2,2],['wood_axe','Wooden Axe','axe',1,60,3,2],['wood_shovel','Wooden Shovel','shovel',1,60,2,2],['wood_sword','Wooden Sword','sword',1,60,4,2],
  ['stone_pickaxe','Stone Pickaxe','pickaxe',2,130,2,4],['stone_axe','Stone Axe','axe',2,130,4,4],['stone_shovel','Stone Shovel','shovel',2,130,2,4],['stone_sword','Stone Sword','sword',2,130,5,4],
  ['copper_pickaxe','Copper Pickaxe','pickaxe',2,180,2,5],['copper_axe','Copper Axe','axe',2,180,4,5],['copper_shovel','Copper Shovel','shovel',2,180,2,5],['copper_sword','Copper Sword','sword',2,180,5,5],
  ['iron_pickaxe','Iron Pickaxe','pickaxe',3,260,3,6],['iron_axe','Iron Axe','axe',3,260,5,6],['iron_shovel','Iron Shovel','shovel',3,260,3,6],['iron_sword','Iron Sword','sword',3,260,7,6],
  ['gold_pickaxe','Gilded Pickaxe','pickaxe',4,90,2,12],['gold_axe','Gilded Axe','axe',4,90,4,12],['gold_shovel','Gilded Shovel','shovel',4,90,2,12],['gold_sword','Gilded Sword','sword',4,90,6,12],
  ['crystal_pickaxe','Crystal Pickaxe','pickaxe',5,500,4,8],['crystal_axe','Crystal Axe','axe',5,500,6,8],['crystal_shovel','Crystal Shovel','shovel',5,500,4,8],['crystal_sword','Crystal Sword','sword',5,500,9,8],
  ['shears','Shears','shears',1,150,1,2.0],
  ['tide_spear','Tide Spear','sword',4,300,9,6],       // forged from the Tide Lord's heart
  ['void_blade','Void Blade','sword',5,420,11,8],      // forged from the Alien Ruler's heart
];
TOOLS.forEach(([id,name,ic,tier,dur,dmg,speed])=> tool(id,{ name, icon:ic, tool:ic, tier, dur, dmg, speed }));

// armor — 4 material tiers x 4 slots; def points each shave ~5% off incoming
// damage (in hurtPlayer), capped at 70% total. Equipped via dedicated armor
// slots in the inventory screen, separate from the hotbar/backpack grid.
const ARMOR = [
  ['wool',   'Padded',  1, 70,  1],
  ['iron',   'Iron',    2, 220, 3],
  ['gold',   'Gilded',  2, 110, 4],
  ['crystal','Crystal', 3, 420, 5],
];
const ARMOR_SLOTS = [['helmet','head','armor_head'],['chestplate','chest','armor_chest'],['leggings','legs','armor_legs'],['boots','feet','armor_boots']];
for(const [mat,label,defPerPiece,dur,tier] of ARMOR) for(const [piece,slot,icon] of ARMOR_SLOTS){
  tool(mat+'_'+piece, { name:label+' '+piece[0].toUpperCase()+piece.slice(1), icon, armorSlot:slot, def:defPerPiece, dur, tier });
}
// spacesuit — endgame armor set that also supplies oxygen off-world (helmet)
tool('spacesuit_helmet',    { name:'Spacesuit Helmet',    icon:'armor_head',  armorSlot:'head',  def:3, dur:360, tier:5, oxygen:true });
tool('spacesuit_chestplate',{ name:'Spacesuit Chestplate',icon:'armor_chest', armorSlot:'chest', def:4, dur:480, tier:5 });
tool('spacesuit_leggings',  { name:'Spacesuit Leggings',  icon:'armor_legs',  armorSlot:'legs',  def:4, dur:440, tier:5 });
tool('spacesuit_boots',     { name:'Spacesuit Boots',     icon:'armor_boots', armorSlot:'feet',  def:3, dur:360, tier:5 });

// ranged weapon — bow fires arrows (see Game.attack()/_shootBow); damages
// mobs via the projectile path in updateDrops (fromPlayer flag)
item('bow',{ name:'Hunting Bow', icon:'bow', stack:1, max:1, shoots:'arrow', dmg:6, dur:200 });
item('arrow',{ name:'Arrow', icon:'arrow' });
item('fishing_rod',{ name:'Fishing Rod', icon:'rod', stack:1, max:1, fishes:true, dur:50 });

// potions — brewed at the bench, drunk like food but grant a timed buff
// instead of stamina (see Game.useItem() / Player effect decay)
item('speed_draught', { name:'Speed Draught',  icon:'potion', potColor:'#5ec4e8', effect:'speed',    effectDur:45 });
item('strength_brew', { name:'Strength Brew',  icon:'potion', potColor:'#c8503a', effect:'strength', effectDur:45 });
item('regen_tonic',   { name:'Regen Tonic',    icon:'potion', potColor:'#7ad65a', effect:'regen',    effectDur:30 });

// build placeable items from blocks
for(let id=1; id<BLOCKS.length; id++){ const b=BLOCKS[id]; if(b && b.give && !ITEMS[b.give]){ const m = (b.render==='cross' ? 99 : 64); item(b.give, { name:b.name, icon:'block', blockId:id, max:m }); } }
// items that double as block placers but have custom icons already (none extra)

// furnace smelting: input item id -> {out, time}
const SMELT = {
  copper_raw:{out:'copper_ingot',t:6}, iron_raw:{out:'iron_ingot',t:8}, gold_raw:{out:'gold_ingot',t:8},
  raw_meat:{out:'cooked_meat',t:5}, raw_fish:{out:'cooked_fish',t:5}, sand:{out:'glass',t:5}, clay:{out:'brick',t:5}, stone:{out:'smoothstone',t:6},
  potato:{out:'baked_potato',t:5}, carrot:{out:'cooked_carrot',t:5},
  wheat:{out:'bread',t:5}, tomato:{out:'cooked_tomato',t:5},
  raw_beef:{out:'cooked_beef',t:5}, raw_chicken:{out:'cooked_chicken',t:5},
  beetroot:{out:'cooked_beetroot',t:5},
  raw_mutton:{out:'cooked_mutton',t:5},
  raw_pork:{out:'cooked_pork',t:5},
  raw_rabbit:{out:'cooked_rabbit',t:5},
  cobble:{out:'stone',t:6}, log:{out:'charcoal',t:8}, mushroom:{out:'charcoal',t:8}, sandstone:{out:'smooth_sandstone',t:7}, netherrack:{out:'nether_brick',t:6},
};
const FUEL = { coal:8, charcoal:8, coal_block:72, log:1.5, planks:1, dark_planks:1, stick:0.5, bookshelf:1.5, fence:1, ladder:1, door:1 };

// ---------- crafting recipes ----------
// need: [[item,count]...]; out:[item,count]; station: null | 'bench'
const RECIPES = [
  { out:['planks',4], need:[['log',1]] },
  { out:['stick',4], need:[['planks',2]] },
  { out:['bench',1], need:[['planks',4]] },
  { out:['torch',4], need:[['stick',1],['coal',1]] },
  { out:['furnace',1], need:[['cobble',8]] },
  { out:['chest',1], need:[['planks',8]] },
  { out:['barrel',1], need:[['planks',6],['iron_ingot',1]], station:'bench' },
  { out:['rubble',2], need:[['cobble',2]], station:'bench' },
  { out:['wood_pickaxe',1], need:[['planks',3],['stick',2]], station:'bench' },
  { out:['wood_axe',1], need:[['planks',3],['stick',2]], station:'bench' },
  { out:['wood_shovel',1], need:[['planks',1],['stick',2]], station:'bench' },
  { out:['wood_sword',1], need:[['planks',2],['stick',1]], station:'bench' },
  { out:['stone_pickaxe',1], need:[['cobble',3],['stick',2]], station:'bench' },
  { out:['stone_axe',1], need:[['cobble',3],['stick',2]], station:'bench' },
  { out:['stone_shovel',1], need:[['cobble',1],['stick',2]], station:'bench' },
  { out:['stone_sword',1], need:[['cobble',2],['stick',1]], station:'bench' },
  { out:['iron_pickaxe',1], need:[['iron_ingot',3],['stick',2]], station:'bench' },
  { out:['iron_axe',1], need:[['iron_ingot',3],['stick',2]], station:'bench' },
  { out:['iron_shovel',1], need:[['iron_ingot',1],['stick',2]], station:'bench' },
  { out:['iron_sword',1], need:[['iron_ingot',2],['stick',1]], station:'bench' },
  { out:['gold_pickaxe',1], need:[['gold_ingot',3],['stick',2]], station:'bench' },
  { out:['crystal_pickaxe',1], need:[['crystal',3],['stick',2]], station:'bench' },
  { out:['crystal_sword',1], need:[['crystal',2],['stick',1]], station:'bench' },
  { out:['bed',1], need:[['wool',3],['planks',3]], station:'bench' },
  { out:['door',1], need:[['planks',6]], station:'bench' },
  { out:['metal_door',1], need:[['iron_ingot',4],['hab_panel',2]], station:'science' },
  { out:['fence',3], need:[['stick',4],['planks',2]], station:'bench' },
  { out:['ladder',3], need:[['stick',7]], station:'bench' },
  { out:['stairs',4], need:[['cobble',6]], station:'bench' },
  { out:['slab',6], need:[['cobble',3]], station:'bench' },
  { out:['lantern',1], need:[['iron_ingot',1],['coal',1]], station:'bench' },
  { out:['campfire',1], need:[['log',3],['stick',1],['coal',1]], station:'bench' },
  { out:['glass',1], need:[['sand',1]], station:'bench' },           // also via furnace
  { out:['stonebrick',4], need:[['cobble',4]], station:'bench' },
  { out:['brick',1], need:[['clay',2]], station:'bench' },
  { out:['rooftile',4], need:[['brick',2]], station:'bench' },
  { out:['bookshelf',1], need:[['planks',6]], station:'bench' },
  { out:['window',2], need:[['glass',2],['stick',2]], station:'bench' },
  { out:['carpet',3], need:[['wool',2]], station:'bench' },
  { out:['potted',1], need:[['clay',2],['stick',1]], station:'bench' },
  { out:['banner',2], need:[['wool',1],['stick',1]], station:'bench' },
  { out:['wool',1], need:[['fiber',4]], station:'bench' },
  { out:['copper_pickaxe',1], need:[['copper_ingot',3],['stick',2]], station:'bench' },
  { out:['copper_axe',1], need:[['copper_ingot',3],['stick',2]], station:'bench' },
  { out:['copper_shovel',1], need:[['copper_ingot',1],['stick',2]], station:'bench' },
  { out:['copper_sword',1], need:[['copper_ingot',2],['stick',1]], station:'bench' },
  { out:['gold_axe',1], need:[['gold_ingot',3],['stick',2]], station:'bench' },
  { out:['gold_shovel',1], need:[['gold_ingot',1],['stick',2]], station:'bench' },
  { out:['gold_sword',1], need:[['gold_ingot',2],['stick',1]], station:'bench' },
  { out:['crystal_axe',1], need:[['crystal',3],['stick',2]], station:'bench' },
  { out:['crystal_shovel',1], need:[['crystal',1],['stick',2]], station:'bench' },
  { out:['copper_block',1], need:[['copper_ingot',9]], station:'bench' },
  { out:['iron_block',1], need:[['iron_ingot',9]], station:'bench' },
  { out:['gold_block',1], need:[['gold_ingot',9]], station:'bench' },
  { out:['crystal_block',1], need:[['crystal',9]], station:'bench' },
  { out:['copper_ingot',9], need:[['copper_block',1]], station:'bench' },
  { out:['iron_ingot',9], need:[['iron_block',1]], station:'bench' },
  { out:['gold_ingot',9], need:[['gold_block',1]], station:'bench' },
  { out:['crystal',9], need:[['crystal_block',1]], station:'bench' },
  { out:['mossstone',1], need:[['cobble',1],['leaves',2]], station:'bench' },
  { out:['basalt',1], need:[['cobble',2],['coal',1]], station:'bench' },
  { out:['obsidian',1], need:[['darkstone',2],['crystal',2]], station:'bench' },
  { out:['wool_red',1], need:[['wool',1],['flower_r',1]], station:'bench' },
  { out:['wool_blue',1], need:[['wool',1],['flower_b',1]], station:'bench' },
  { out:['granite',1], need:[['cobble',1],['gravel',1]], station:'bench' },
  { out:['andesite',1], need:[['cobble',2]], station:'bench' },
  { out:['diorite',1], need:[['cobble',1],['clay',1]], station:'bench' },
  { out:['polished_granite',4], need:[['granite',4]], station:'bench' },
  { out:['polished_andesite',4], need:[['andesite',4]], station:'bench' },
  { out:['polished_diorite',4], need:[['diorite',4]], station:'bench' },
  { out:['sandstone',1], need:[['sand',4]], station:'bench' },
  { out:['chiseled_sandstone',1], need:[['sandstone',2]], station:'bench' },
  { out:['smooth_sandstone',4], need:[['sandstone',4]], station:'bench' },
  { out:['cut_copper',4], need:[['copper_block',1]], station:'bench' },
  { out:['cut_iron',4], need:[['iron_block',1]], station:'bench' },
  { out:['cut_gold',4], need:[['gold_block',1]], station:'bench' },
  { out:['coal_block',1], need:[['coal',9]], station:'bench' },
  { out:['coal',9], need:[['coal_block',1]], station:'bench' },
  { out:['terracotta',1], need:[['clay',4]], station:'bench' },
  { out:['packed_ice',1], need:[['ice',4]], station:'bench' },
  { out:['tide_charm',1], need:[['abyss_pearl',2],['gel',3]], station:'bench' },
  { out:['tide_charm',1], need:[['ocean_crystal',1],['abyss_pearl',1]], station:'bench' },   // cheaper path with the rare city crystal
  { out:['iron_ingot',2], need:[['deep_scale',1]], station:'bench' },                          // refine abyssal scale into metal
  { out:['boat',1], need:[['planks',5],['stick',2]], station:'bench' },
  { out:['diving_pod',1], need:[['iron_ingot',6],['glass',3],['gel',2]], station:'bench' },
  { out:['tide_spear',1], need:[['tide_heart',1],['stick',2],['iron_ingot',2]], station:'bench' },
  { out:['void_blade',1], need:[['void_heart',1],['alien_alloy',2],['stick',1]], station:'science' },
  { out:['frosted_glass',1], need:[['glass',1],['snow',1]], station:'bench' },
  { out:['polished_basalt',4], need:[['basalt',4]], station:'bench' },
  { out:['dark_planks',1], need:[['planks',2],['coal',1]], station:'bench' },
  { out:['chiseled_stonebrick',1], need:[['stonebrick',2]], station:'bench' },
  { out:['mossy_stonebrick',1], need:[['stonebrick',1],['leaves',2]], station:'bench' },
  { out:['cracked_stonebrick',1], need:[['stonebrick',1],['gravel',1]], station:'bench' },
  { out:['polished_deepstone',4], need:[['deepstone',4]], station:'bench' },
  { out:['polished_darkstone',4], need:[['darkstone',4]], station:'bench' },
  { out:['torch',4], need:[['stick',1],['charcoal',1]] },
  { out:['torch',4], need:[['stick',1],['gel',1]] },   // glow-gel torch — gives gelcube drops a crafting use
  { out:['shears',1], need:[['copper_ingot',2]], station:'bench' },
  { out:['cobble',1], need:[['stone',1]] },
  { out:['pumpkin_pie',1], need:[['pumpkin',1],['wheat',1],['egg',1]], station:'bench' },
  // armor — wool is the cheap starter tier, crystal the endgame tier
  { out:['wool_helmet',1],    need:[['wool',5]],                station:'bench' },
  { out:['wool_chestplate',1],need:[['wool',8]],                station:'bench' },
  { out:['wool_leggings',1],  need:[['wool',7]],                station:'bench' },
  { out:['wool_boots',1],     need:[['wool',4]],                station:'bench' },
  { out:['iron_helmet',1],    need:[['iron_ingot',5]],           station:'bench' },
  { out:['iron_chestplate',1],need:[['iron_ingot',8]],           station:'bench' },
  { out:['iron_leggings',1],  need:[['iron_ingot',7]],           station:'bench' },
  { out:['iron_boots',1],     need:[['iron_ingot',4]],           station:'bench' },
  { out:['gold_helmet',1],    need:[['gold_ingot',5]],           station:'bench' },
  { out:['gold_chestplate',1],need:[['gold_ingot',8]],           station:'bench' },
  { out:['gold_leggings',1],  need:[['gold_ingot',7]],           station:'bench' },
  { out:['gold_boots',1],     need:[['gold_ingot',4]],           station:'bench' },
  { out:['crystal_helmet',1],    need:[['crystal',5]],           station:'bench' },
  { out:['crystal_chestplate',1],need:[['crystal',8]],           station:'bench' },
  { out:['crystal_leggings',1],  need:[['crystal',7]],           station:'bench' },
  { out:['crystal_boots',1],     need:[['crystal',4]],           station:'bench' },
  // ranged
  { out:['bow',1], need:[['stick',3],['fiber',3]], station:'bench' },
  { out:['arrow',4], need:[['stick',1],['fiber',1],['stone',1]], station:'bench' },
  { out:['fishing_rod',1], need:[['stick',3],['fiber',2]], station:'bench' },
  // potions
  { out:['speed_draught',1], need:[['egg',1],['fiber',3]],       station:'bench' },
  { out:['strength_brew',1], need:[['raw_meat',2],['coal',1]],   station:'bench' },
  { out:['regen_tonic',1],   need:[['apple',2],['gel',1]],       station:'bench' },
  // more minecraft-like crafting
  { out:['cookie',4], need:[['wheat',2]], station:'bench' },
  { out:['melon',1], need:[['melon_slice',9]], station:'bench' },
  { out:['glowstone',1], need:[['glowstone_dust',4]], station:'bench' },
  { out:['nether_brick',1], need:[['netherrack',1]], station:'bench' },
  // continue adding more Minecraft elements
  { out:['sugar',1], need:[['sugarcane',1]], station:'bench' },
  { out:['paper',3], need:[['sugar',1],['sugarcane',3]], station:'bench' },
  { out:['book',1], need:[['paper',3],['leather',1]], station:'bench' },
  { out:['quartz',1], need:[['netherrack',4]], station:'bench' },
  { out:['netherbrick',1], need:[['nether_brick',1]], station:'bench' },
  { out:['beetroot_seeds',1], need:[['beetroot',1]], station:'bench' },
  { out:['cake',1], need:[['wheat',3],['sugar',1],['egg',1]], station:'bench' },
  { out:['bowl',1], need:[['planks',3]], station:'bench' },
  { out:['mushroom_stew',1], need:[['bowl',1],['mushroom',2]], station:'bench' },
  { out:['beetroot_soup',1], need:[['bowl',1],['beetroot',6]], station:'bench' },
  { out:['golden_carrot',1], need:[['carrot',1],['gold_ingot',4]], station:'bench' },
  { out:['golden_apple',1], need:[['apple',1],['gold_ingot',4]], station:'bench' },
  { out:['flint_and_steel',1], need:[['iron_ingot',1],['flint',1]], station:'bench' },
  { out:['emerald_block',1], need:[['emerald',9]], station:'bench' },
  { out:['diamond_block',1], need:[['diamond',9]], station:'bench' },
  { out:['rabbit_stew',1], need:[['bowl',1],['cooked_rabbit',1],['carrot',1],['baked_potato',1]], station:'bench' },
  { out:['garden_salad',1], need:[['bowl',1],['carrot',1],['tomato',1],['mushroom',1]], station:'bench' },
  { out:['veggie_stew',1], need:[['bowl',1],['baked_potato',1],['cooked_carrot',1],['cooked_tomato',1]], station:'bench' },
  { out:['apple_pie',1], need:[['apple',2],['wheat',1],['sugar',1]], station:'bench' },
  { out:['hearty_breakfast',1], need:[['bowl',1],['egg',1],['bread',1],['cooked_meat',1]], station:'bench' },
  { out:['launchpad',1], need:[['iron_ingot',8],['quartz',4]], station:'bench' },
  { out:['starship',1], need:[['iron_ingot',20],['diamond',5],['quartz',10],['battery',4]], station:'bench' },
  { out:['solar_panel',1], need:[['glass',4],['iron_ingot',2],['quartz',2]], station:'bench' },
  { out:['battery',1], need:[['iron_ingot',4],['gold_ingot',2],['crystal',4]], station:'bench' },
  { out:['cybertruck',1], need:[['iron_ingot',10],['glass',4],['wool',4]], station:'bench' },
  { out:['neuralink',1], need:[['crystal',8],['gold_ingot',4],['leather',2]], station:'bench' },
  // ---- space age: tech tree ----
  // Tier 1: circuit unlocks the science lab (built at the bench)
  { out:['circuit',1], need:[['copper_ingot',2],['crystal',1],['gold_ingot',1]], station:'bench' },
  { out:['science_bench',1], need:[['iron_ingot',4],['circuit',2],['quartz',2]], station:'bench' },
  // Habitat / station building blocks
  { out:['hab_panel',4], need:[['iron_ingot',2],['quartz',1]], station:'bench' },
  { out:['hab_floor',4], need:[['iron_ingot',1],['stone',2]], station:'bench' },
  { out:['glass_dome',4], need:[['glass',4],['iron_ingot',1]], station:'bench' },
  { out:['star_beacon',1], need:[['glowstone',1],['crystal',2]], station:'bench' },
  // Tier 2: science lab recipes (need the SCIENCE_BENCH open)
  { out:['alien_alloy',1], need:[['iron_ingot',1],['space_shard',1]], station:'science' },
  { out:['oxygen_tank',1], need:[['iron_ingot',2],['glass',1],['circuit',1]], station:'science' },
  { out:['rocket_fuel',1], need:[['coal',4],['crystal',2],['copper_ingot',1]], station:'science' },
  { out:['rocket_hull',4], need:[['iron_ingot',3],['alien_alloy',1]], station:'science' },
  { out:['rocket_nose',1], need:[['iron_ingot',2],['glass',1],['alien_alloy',1]], station:'science' },
  { out:['rocket_fin',2], need:[['iron_ingot',2]], station:'science' },
  { out:['fuel_tank',1], need:[['iron_ingot',4],['copper_ingot',2],['glass',1]], station:'science' },
  // Spacesuit set (science lab)
  // The first oxygen helmet must be obtainable before Aethon. Alien alloy is
  // reserved for the stronger suit pieces and post-landing progression.
  { out:['spacesuit_helmet',1],     need:[['iron_ingot',3],['circuit',1],['glass',2]], station:'science' },
  { out:['spacesuit_chestplate',1], need:[['alien_alloy',4],['circuit',1],['wool',2]], station:'science' },
  { out:['spacesuit_leggings',1],   need:[['alien_alloy',3],['circuit',1],['wool',2]], station:'science' },
  { out:['spacesuit_boots',1],      need:[['alien_alloy',2],['wool',2]], station:'science' },
  // installable rocket systems (slot into a rocket from the Launchpad dashboard)
  { out:['engine_core',1],       need:[['iron_ingot',3],['crystal',2],['circuit',1]], station:'science' },
  { out:['guidance_computer',1], need:[['circuit',1],['crystal',1],['gold_ingot',1]], station:'science' },
  { out:['oxidizer_cell',1],     need:[['alien_alloy',1],['glass',2]], station:'science' },
];

// ---------- settler trades (give -> get) ----------
const TRADES = [
  { give:['raw_meat',3], get:['iron_ingot',1] },
  { give:['wool',2], get:['coal',3] },
  { give:['apple',4], get:['gold_ingot',1] },
  { give:['planks',10], get:['stone_pickaxe',1] },
  { give:['coal',5], get:['lantern',1] },
  { give:['fiber',6], get:['wool',2] },
  { give:['gel',4], get:['coal',3] },
];

// ---------- biomes ----------
const BIOMES = {
  plains:  { surface:B.GRASS, filler:B.DIRT, tree:0.007, plant:0.10, color:0x88aa55 },
  forest:  { surface:B.GRASS, filler:B.DIRT, tree:0.045, plant:0.14, color:0x4f7a3a },
  hills:   { surface:B.GRASS, filler:B.DIRT, tree:0.012, plant:0.06, color:0x6f8a4a },
  desert:  { surface:B.SAND,  filler:B.SAND, tree:0,     plant:0.01, cactus:0.02, color:0xd9c48c },
  savanna: { surface:B.GRASS, filler:B.DIRT, tree:0.005, plant:0.04, color:0xc2a84f },
  snow:    { surface:B.SNOW,  filler:B.SNOW, tree:0.012, plant:0.02, color:0xdfe9f0 },
  mountain:{ surface:B.STONE, filler:B.STONE,tree:0.003, plant:0.02, color:0x8a8d92 },
};
for(const k in BIOMES) BIOMES[k]._name=k;   // reverse lookup for the Discovery Journal

/* =====================================================================
   World — deterministic generation + delta storage. A pure function of
   seed; only player modifications, chest and furnace state are saved.
   ===================================================================== */
class World {
  constructor(seed){
    this.seed = seed>>>0;
    this.nHeight = new Noise(seed^0x1111);
    this.nMount  = new Noise(seed^0x2222);
    this.nTemp   = new Noise(seed^0x3333);
    this.nMoist  = new Noise(seed^0x4444);
    this.nCave   = new Noise(seed^0x5555);
    this.nCave2  = new Noise(seed^0x8888);   // low-frequency cavern noise for big domed rooms
    this.nOre    = new Noise(seed^0x6666);
    this.nForest = new Noise(seed^0x7777);   // large-scale patchiness so a "forest" biome has real clearings, not uniform tree cover
    this.chunks  = new Map();          // key -> Uint8Array
    this.deltas  = new Map();          // bkey -> id   (player edits)
    this.meta    = new Map();          // bkey -> {rot,open,...}
    this.chests  = new Map();          // bkey -> [slots]
    this.furnaces= new Map();          // bkey -> state
    this.lights  = new Set();          // bkey of light-emitting blocks (for point-light pool)
    this.villages= [];                 // {x,z} centres discovered
    this.flowQueue=[]; this.flowHead=0;// {x,y,z,level} water cells still spreading
    this.flowSeen =new Set();          // bkeys already queued/placed by flow sim
  }
  ckey(cx,cz){ return cx+','+cz; }
  bkey(x,y,z){ return x+','+y+','+z; }

  // ----- terrain helpers (pure) -----
  heightAt(wx,wz){
    const base = this.nHeight.fbm2(wx*0.010, wz*0.010, 4);          // rolling hills
    const cont = this.nHeight.fbm2(wx*0.0025+99, wz*0.0025-99, 2);  // broad land/sea
    let m = this.nMount.fbm2(wx*0.005+40, wz*0.005-40, 3);
    m = Math.pow(Math.max(0, m-0.55)*2.2, 1.7);                     // sparse peaks
    // centred a few blocks above sea level => land-dominant, with basins & lakes
    let h = SEA_LEVEL + 3 + (base-0.5)*22 + (cont-0.5)*12 + m*34;
    // smoothly blended river channel (no abrupt single-cell pits at the band edge)
    const r = Math.abs(this.nMoist.fbm2(wx*0.0032-200, wz*0.0032+200,2)-0.5);
    if(r<0.05){ const t=1-clamp(r/0.05,0,1); h=lerp(h, SEA_LEVEL-2, t*t); }
    // gen v2 (new worlds only — old saves keep their terrain): real deep oceans.
    // Underwater terrain deepens smoothly the further below sea level it sits,
    // with an extra abyssal-trench band carved into the deepest basins.
    if(this.genVer>=2 && h<SEA_LEVEL-1){
      const d=SEA_LEVEL-1-h;
      h = SEA_LEVEL-1 - d*3.2;
      const tr=this.nMount.fbm2(wx*0.0035-77, wz*0.0035+77, 2);
      if(tr>0.62 && d>2) h -= (tr-0.62)*70;   // trench: down toward the abyss
    }
    return Math.floor(clamp(h,4,WORLD_H-3));
  }
  biomeAt(wx,wz,h){
    const t = this.nTemp.fbm2(wx*0.004+1000, wz*0.004, 3);
    const mo= this.nMoist.fbm2(wx*0.004-1000, wz*0.004+500, 3);
    if(h>=SEA_LEVEL+18) return BIOMES.mountain;
    if(t<0.34) return BIOMES.snow;
    if(t>0.66 && mo<0.42) return BIOMES.desert;
    if(t>0.55 && mo<0.5) return BIOMES.savanna;
    if(h>=SEA_LEVEL+9) return BIOMES.hills;
    if(mo>0.58) return BIOMES.forest;
    return BIOMES.plains;
  }
  biomeName(wx,wz){ const h=this.heightAt(wx,wz); const b=this.biomeAt(wx,wz,h); for(const k in BIOMES) if(BIOMES[k]===b) return k; return 'plains'; }

  // ----- chunk data access -----
  getChunk(cx,cz){
    const k=this.ckey(cx,cz); let c=this.chunks.get(k);
    if(c) return c;
    c = new Uint8Array(CHUNK_X*WORLD_H*CHUNK_Z);
    this.chunks.set(k,c);
    this._genBase(c,cx,cz);
    this._genFeatures(c,cx,cz);
    this._applyDeltas(c,cx,cz);
    return c;
  }
  _set(c, lx,y,lz, id){ if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z||y<0||y>=WORLD_H) return; c[vIndex(lx,y,lz)]=id; }
  _get(c, lx,y,lz){ if(y<0) return B.STONE; if(y>=WORLD_H) return B.AIR; if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z) return B.AIR; return c[vIndex(lx,y,lz)]; }

  _genBase(c,cx,cz){
    const ox=cx*CHUNK_X, oz=cz*CHUNK_Z;
    for(let lz=0;lz<CHUNK_Z;lz++) for(let lx=0;lx<CHUNK_X;lx++){
      const wx=ox+lx, wz=oz+lz;
      const h=this.heightAt(wx,wz); const biome=this.biomeAt(wx,wz,h);
      const beach = h<=SEA_LEVEL+1 && h>=SEA_LEVEL-1;
      // local slope: how far this column's surface sits above its lowest
      // immediate neighbour. A cave margin sized only off this column's OWN
      // height still lets a tunnel pop straight out a steep cliff face —
      // gate by slope too, not just absolute height/biome.
      const hMinN=Math.min(h,this.heightAt(wx+1,wz),this.heightAt(wx-1,wz),this.heightAt(wx,wz+1),this.heightAt(wx,wz-1));
      const slope=h-hMinN;
      const guarded=h>=SEA_LEVEL+18 || slope>4 || h<=SEA_LEVEL-2;   // also guard seabeds — a cave popping out under a lake/ocean floor is exactly what "x-rays" through translucent water/ice above it
      const caveMargin=guarded?Math.max(14,slope+8):5;
      for(let y=0;y<=h && y<WORLD_H;y++){
        let id=B.STONE;
        const seabed = h<=SEA_LEVEL-2;   // clearly underwater (below the beach band) → real seabed, not grass
        if(y>h-4 && y<h) id = (beach||seabed) ? B.SAND : biome.filler;
        if(y===h){
          if(seabed){ const r=hashRand(wx,wz,this.seed^0x5EAB); id = r<0.84?B.SAND : B.GRAVEL; }  // clean sandy bed, subtle gravel — no brown checker from above
          else { id = beach? B.SAND : biome.surface; if(biome===BIOMES.snow && y>SEA_LEVEL) id=B.SNOW; }
        }
        if(y<8 && y<=h-6) id=B.DEEPSTONE;
        // ore replacement in stone
        if(id===B.STONE){ const o=this._oreAt(wx,y,wz,h); if(o) id=o; }
        // depth-banded layered rock (only un-mineralised stone): gray stone -> dark band -> deepstone
        if(id===B.STONE){
          const band = SEA_LEVEL*0.28 + this.nCave.fbm3(wx*0.03,wz*0.03,2)*8; // undulating ~Y18 boundary
          if(y<band-5) id=B.DEEPSTONE; else if(y<band) id=B.DARKSTONE;
        }
        // caves — steep slopes/cliffs and tall peaks get a much deeper margin
        // and lose the long connected "ridge" tunnels entirely (only sparse
        // blob pockets), since those tunnels are what poke holes in exposed rock
        if(y>2 && y<h-caveMargin){
          const cv=this.nCave.fbm3(wx*0.05,y*0.07,wz*0.05,2);
          const cv2=this.nCave.fbm3(wx*0.05+9,y*0.07,wz*0.05+9,2);
          const big=this.nCave2.fbm3(wx*0.018,y*0.03,wz*0.018,3); // occasional medium pockets (not vast rooms)
          const deep = y<SEA_LEVEL ? clamp((SEA_LEVEL-y)/SEA_LEVEL,0,1) : 0;
          const deepBonus = deep*0.07; // modest depth scaling (was 0.14 — made huge caverns + FPS drops)
          if(guarded){ if(cv>0.84-deepBonus) id=B.AIR; } // sparse pockets under mountains
          else {
            // explorable = winding tunnels + moderate pockets; smaller volume = better framerate
            if(cv>0.78-deepBonus || Math.abs(cv2-0.5)<0.025 || big>0.74-deepBonus*0.15) id=B.AIR;
          }
        }
        if(this.genVer>=4 && id===B.STONE && y<h-3){
          const vr=hashRand(wx+y*13,wz-y*7,this.seed^0x4A11);
          if(y<SEA_LEVEL*0.34 && vr<0.035) id=B.BASALT;
          else if((biome===BIOMES.forest||biome===BIOMES.hills) && y>SEA_LEVEL-15 && vr<0.026) id=B.MOSSSTONE;
        }
        if(this.genVer>=4 && y===h-1 && slope>1 && (biome===BIOMES.forest||biome===BIOMES.hills) && id===biome.filler && hashRand(wx,wz,this.seed^0x4A12)<0.28) id=B.MOSSSTONE;
        if(this.genVer>=4 && biome===BIOMES.snow && y===h-1 && id===biome.filler && hashRand(wx,wz,this.seed^0x4A13)<0.22) id=B.PACKED_ICE;
        this._set(c,lx,y,lz,id);
      }
      // water fill + ice cap
      for(let y=h+1;y<=SEA_LEVEL;y++) this._set(c,lx,y,lz, (biome===BIOMES.snow && y===SEA_LEVEL)?B.ICE:B.WATER);
      // underwater life: tall kelp, shorter kelp, seagrass tufts, small rock props —
      // clustered into real kelp-forest patches with open sand between (reuses the
      // same large-scale patchiness noise that breaks up land forests) instead of a
      // uniform independent scatter, which read as a flat random speckle from above
      if(h<=SEA_LEVEL-2 && h>3){
        // kept shorter/sparser than earlier — tall, dense clusters of the same
        // 2px cross-quad read as a "pillar forest" rather than wispy kelp once
        // clustered; capping height and thinning density fixes that without
        // giving up the forest-vs-clearing clustering
        const cluster=clamp(this.nForest.fbm2(wx*0.05+500,wz*0.05+500,3)*1.6,0,1.6);
        if(hashRand(wx,wz,this.seed^0x5EA9) < 0.065*cluster){
          const type=hashRand(wx,wz,this.seed^0x5EAD);
          if(type<0.25){ const kh=Math.min(SEA_LEVEL-h-1, 2+((hashRand(wx,wz,this.seed^0x5EAA)*2)|0));   // tall kelp: 2-3
            for(let i=1;i<=kh;i++) this._set(c,lx,h+i,lz,B.KELP); }
          else if(type<0.65){ this._set(c,lx,h+1,lz,B.KELP); }                                           // short kelp: single segment
          else if(type<0.92) this._set(c,lx,h+1,lz,B.TALLGRASS);                                         // seagrass tuft
          else this._set(c,lx,h+1,lz,B.SEAROCK);                                                         // small rock prop
        }
      }
      // surface plants
      if(h>=SEA_LEVEL && h<WORLD_H-1){
        const top=this._get(c,lx,h,lz);
        if(top===B.GRASS){
          const r=hashRand(wx,wz,this.seed^77);
          const plantChance=Math.min(0.26,biome.plant*(this.genVer>=3?1.45:1));
          if(r<plantChance){ const r2=hashRand(wx,wz,this.seed^88);
            this._set(c,lx,h+1,lz, r2<0.6?B.TALLGRASS : r2<0.78?B.FLOWER_R : r2<0.9?B.FLOWER_B : B.MUSHROOM); }
          if(this.genVer>=4 && this._get(c,lx,h+1,lz)===B.AIR){
            const dress=hashRand(wx,wz,this.seed^0x4D45);
            if((biome===BIOMES.forest||biome===BIOMES.plains) && dress<0.018) this._set(c,lx,h+1,lz,B.SHRUB);
            else if((biome===BIOMES.hills||biome===BIOMES.mountain) && dress<0.032) this._set(c,lx,h+1,lz,B.RUBBLE);
          }
        } else if(top===B.SAND && biome===BIOMES.desert){
          if(hashRand(wx,wz,this.seed^99)< (biome.cactus||0)) for(let k=1;k<=2;k++) this._set(c,lx,h+k,lz,B.CACTUS);
        }
      }
    }
  }
  _oreAt(wx,y,wz,h){
    if(y>h-2) return 0;
    const vein=this.nOre.fbm3(wx*0.08,y*0.08,wz*0.08,2);
    const r=hashRand(wx,wz,(this.seed^55)+y*131);
    // rarer / more competitive: higher vein thresholds (smaller pockets) and
    // lower in-vein fill (sparser within a pocket). Crystal & gold hit hardest.
    // ---- space-age ores: the legit, mine-it-yourself start of the tech tree ----
    // Voidcrystal is the deepest & rarest find — its shards begin the rocket
    // path. Quartz (deep crystalline mineral) feeds science labs & launchpads.
    if(y<24 && vein>0.84 && r<0.30) return B.ALIEN_CRYSTAL;   // -> space_shard (rare, deep, but reliably findable)
    if(y<32 && vein>0.84 && r<0.28) return B.QUARTZ;          // -> quartz
    if(y<22 && vein>0.88 && r<0.28) return B.CRYSTAL;
    if(y<38 && vein>0.84 && r<0.36) return B.GOLD;
    if(y<SEA_LEVEL-2 && vein>0.78 && r<0.40) return B.IRON;
    if(y<SEA_LEVEL+3 && vein>0.73 && r<0.42) return B.COPPER;
    if(vein>0.66 && r<0.30) return B.COAL;
    return 0;
  }

  _stampTreeV4(wx,h,wz,biome,stamp){
    const r=hashRand(wx,wz,this.seed^0x4EAF), tall=6+((hashRand(wx,wz,this.seed^124)*4)|0);
    if(biome===BIOMES.snow||biome===BIOMES.mountain){
      for(let i=1;i<=tall;i++) stamp(wx,h+i,wz,B.LOG,true);
      for(let level=2;level<tall;level+=2){ const radius=Math.max(1,Math.min(3,Math.ceil((tall-level)*0.48)));
        for(let dx=-radius;dx<=radius;dx++) for(let dz=-radius;dz<=radius;dz++) if(Math.abs(dx)+Math.abs(dz)<=radius+1) stamp(wx+dx,h+level,wz+dz,B.LEAVES,false); }
      stamp(wx,h+tall+1,wz,B.LEAVES,false); return;
    }
    if(biome===BIOMES.savanna){
      const sx=r<0.5?-1:1; for(let i=1;i<=tall-1;i++) stamp(wx+(i>3?sx:0),h+i,wz,B.LOG,true);
      for(let i=1;i<=2;i++) stamp(wx+sx*i,h+tall-2,wz,B.LOG,true);
      const cx=wx+sx*2; for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++) if(dx*dx+dz*dz<=8) stamp(cx+dx,h+tall-1,wz+dz,B.LEAVES,false);
      return;
    }
    const willow=biome===BIOMES.forest&&r<0.28, th=willow?6:tall;
    for(let i=1;i<=th;i++) stamp(wx,h+i,wz,B.LOG,true);
    for(let dy=-2;dy<=1;dy++) for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++){
      const d=dx*dx+dz*dz+dy*dy*1.7; if(d>11.5 || (d>8.5&&hashRand(wx+dx*7,wz+dz*11,this.seed^127+dy*17)<0.3)) continue;
      if(dx===0&&dz===0&&dy<=0) continue; stamp(wx+dx,h+th+dy,wz+dz,B.LEAVES,false);
    }
    if(willow) for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++) if(Math.abs(dx)+Math.abs(dz)>=4&&Math.abs(dx)+Math.abs(dz)<=5){
      stamp(wx+dx,h+th-2,wz+dz,B.LEAVES,false); stamp(wx+dx,h+th-3,wz+dz,B.LEAVES,false);
    }
    stamp(wx,h+th+2,wz,B.LEAVES,false);
  }

  // trees + villages, clipped to this chunk
  _genFeatures(c,cx,cz){
    const ox=cx*CHUNK_X, oz=cz*CHUNK_Z;
    const stamp=(wx,y,wz,id,force)=>{ const lx=wx-ox, lz=wz-oz; if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z) return; if(!force){ const cur=this._get(c,lx,y,lz); if(cur!==B.AIR && cur!==B.LEAVES && cur!==B.WATER) return; } this._set(c,lx,y,lz,id); };
    // trees: examine trunk candidates in a margin so canopy crosses borders
    for(let wz=oz-3; wz<oz+CHUNK_Z+3; wz++) for(let wx=ox-3; wx<ox+CHUNK_X+3; wx++){
      const h=this.heightAt(wx,wz); if(h<SEA_LEVEL || h>=WORLD_H-8) continue;
      const biome=this.biomeAt(wx,wz,h); if(!biome.tree) continue;
      // large-scale patchiness — without this every tile in a "forest" biome
      // independently rolls the same flat odds, which reads as uniform wall-
      // to-wall canopy instead of actual stands of trees with clearings
      const patch=clamp(this.nForest.fbm2(wx*0.015,wz*0.015,3)*2.0,0,2.0);
      if(hashRand(wx,wz,this.seed^123) >= biome.tree*patch*(this.genVer>=4?0.68:1)) continue;
      const th=(this.genVer>=3?5:4)+((hashRand(wx,wz,this.seed^124)*(this.genVer>=3?4:3))|0);
      if(this.genVer>=4) this._stampTreeV4(wx,h,wz,biome,stamp);
      else { for(let i=1;i<=th;i++) stamp(wx,h+i,wz,B.LOG,true); }
      if(this.genVer>=3&&this.genVer<4){
        // Layered crowns and short boughs give forests a readable silhouette
        // without introducing model assets or changing existing saved terrain.
        const axis=hashRand(wx,wz,this.seed^125)>0.5;
        const sign=hashRand(wx,wz,this.seed^126)>0.5?1:-1;
        for(let i=1;i<=2;i++) stamp(wx+(axis?sign*i:0),h+th-2,wz+(axis?0:sign*i),B.LOG,true);
        for(let dy=-2;dy<=2;dy++) for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++){
          if(dx===0&&dz===0&&dy<=0) continue;
          const shape=dx*dx+dz*dz+dy*dy*1.7;
          const edge=hashRand(wx+dx*7,wz+dz*11,this.seed^127+dy*17);
          if(shape>11.5 || (shape>8.2&&edge<0.32)) continue;
          stamp(wx+dx,h+th+dy,wz+dz,B.LEAVES,false);
        }
        stamp(wx,h+th+2,wz,B.LEAVES,false);
      }else if(this.genVer<3){
        for(let dy=th-2;dy<=th+1;dy++) for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++){
          if(dx*dx+dz*dz+(dy-th)*(dy-th)>5) continue;
          if(dx===0&&dz===0&&dy<=th) continue;
          stamp(wx+dx,h+dy,wz+dz,B.LEAVES,false);
        }
      }
    }
    if(this.genVer>=4){
      for(let lz=1;lz<CHUNK_Z-1;lz++) for(let lx=1;lx<CHUNK_X-1;lx++){
        const wx=ox+lx,wz=oz+lz,h=this.heightAt(wx,wz),biome=this.biomeAt(wx,wz,h);
        if(biome!==BIOMES.forest || this._get(c,lx,h+1,lz)!==B.AIR || hashRand(wx,wz,this.seed^0xFA11)>0.006) continue;
        const len=2+((hashRand(wx,wz,this.seed^0xFA12)*3)|0); for(let n=0;n<len&&lz+n<CHUNK_Z-1;n++) if(this._get(c,lx,h+1,lz+n)===B.AIR) this._set(c,lx,h+1,lz+n,B.FALLEN_LOG);
      }
    }
    // villages: any village origin whose footprint covers this chunk
    for(let vcz=cz-2; vcz<=cz+2; vcz++) for(let vcx=cx-2; vcx<=cx+2; vcx++){
      const v=this._villageAt(vcx,vcz); if(v) this._stampVillage(v,ox,oz,c);
    }
    // underground caches: any cave-room origin whose pocket clips into this chunk
    for(let rcz=cz-1; rcz<=cz+1; rcz++) for(let rcx=cx-1; rcx<=cx+1; rcx++){
      const s=this._caveRoomAt(rcx,rcz); if(s) this._stampCaveRoom(s,ox,oz,c);
    }
    // rare surface ruins: any ruin origin whose footprint clips this chunk
    for(let rcz=cz-1; rcz<=cz+1; rcz++) for(let rcx=cx-1; rcx<=cx+1; rcx++){
      const ru=this._ruinAt(rcx,rcz); if(ru) this._stampRuin(ru,ox,oz,c);
      const wk=this._wreckAt(rcx,rcz); if(wk) this._stampWreck(wk,ox,oz,c);
      const cp=this._campAt(rcx,rcz); if(cp) this._stampCamp(cp,ox,oz,c);
    }
    // rare deep-sea lairs: domed air-pocket shrines on the seabed, home of the
    // Tide Lord. The anchor drifts up to 40 blocks from its grid origin toward
    // the deepest water, so scan a wide chunk margin (cheap: grid+roll exit first)
    for(let rcz=cz-4; rcz<=cz+4; rcz++) for(let rcx=cx-4; rcx<=cx+4; rcx++){
      const sl=this._seaLairAt(rcx,rcz); if(sl) this._stampSeaLair(sl,ox,oz,c);
    }
    // Aetheria — the rare sunken city (huge footprint → wide scan margin)
    for(let rcz=cz-6; rcz<=cz+6; rcz++) for(let rcx=cx-6; rcx<=cx+6; rcx++){
      const sc=this._seaCityAt(rcx,rcz); if(sc) this._stampSeaCity(sc,ox,oz,c);
    }
    if(this.genVer>=3) this._stampSpawnShrine(ox,oz,c);
    // cave decoration: stalactites / stalagmites / rubble in carved pockets
    this._genCaveDecor(c,cx,cz);
  }

  // A fixed, original landmark near spawn: an open observatory ring around a
  // recovered star beacon. Versioned so existing worlds keep their terrain.
  _stampSpawnShrine(ox,oz,c){
    const sx=8,sz=0,R=5;
    if(ox>sx+R||ox+CHUNK_X-1<sx-R||oz>sz+R||oz+CHUNK_Z-1<sz-R) return;
    const set=(wx,y,wz,id)=>{ const lx=wx-ox,lz=wz-oz; if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z||y<0||y>=WORLD_H) return; this._set(c,lx,y,lz,id); };
    let plat=SEA_LEVEL+1;
    for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) if(dx*dx+dz*dz<=20) plat=Math.max(plat,this.heightAt(sx+dx,sz+dz));
    plat=Math.min(plat,WORLD_H-9);
    for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++){
      const d2=dx*dx+dz*dz; if(d2>20) continue;
      const wx=sx+dx,wz=sz+dz,ground=this.heightAt(wx,wz);
      for(let y=ground+1;y<plat;y++) set(wx,y,wz,d2>13?B.MOSSSTONE:B.COBBLE);
      set(wx,plat,wz,d2>13?B.MOSSY_STONEBRICK:B.STONEBRICK);
      for(let y=plat+1;y<=plat+7;y++) set(wx,y,wz,B.AIR);
    }
    const pillars=[[-3,-2],[-3,2],[3,-2],[3,2]];
    for(const [dx,dz] of pillars){
      set(sx+dx,plat+1,sz+dz,B.CHISELED_STONEBRICK);
      set(sx+dx,plat+2,sz+dz,B.STONEBRICK); set(sx+dx,plat+3,sz+dz,B.STONEBRICK);
      set(sx+dx,plat+4,sz+dz,B.CHISELED_STONEBRICK);
    }
    // Broken roof ring: deliberately open to the sky, with an uneven ancient edge.
    for(let dx=-3;dx<=3;dx++) for(let dz=-2;dz<=2;dz++){
      if(Math.abs(dx)!==3&&Math.abs(dz)!==2) continue;
      if((dx===-3&&Math.abs(dz)<2)||hashRand(dx,dz,this.seed^0x57A4)<0.16) continue;
      set(sx+dx,plat+5,sz+dz,hashRand(dx,dz,this.seed^0x57A5)<0.24?B.CRACKED_STONEBRICK:B.SLAB);
    }
    set(sx,plat+1,sz,B.STAR_BEACON); this.lights.add(this.bkey(sx,plat+1,sz));
    set(sx,plat+1,sz-2,B.BENCH); set(sx,plat+1,sz+2,B.BENCH);
    for(const z of [-2,2]){ set(sx,plat+4,sz+z,B.LANTERN); this.lights.add(this.bkey(sx,plat+4,sz+z)); }
    // A short surface path points the player toward the sanctuary without
    // flattening the surrounding landscape.
    for(let x=1;x<=3;x++){ const y=this.heightAt(x,sz); set(x,y,sz,B.PATH); set(x,y+1,sz,B.AIR); set(x,y+2,sz,B.AIR); }
  }

  // deterministic village origin test for a chunk (returns {x,z,plat,seed} or null)
  _villageAt(vcx,vcz){
    // grid spacing — every 8 chunks (128 blocks) gives a hard minimum gap
    // between any two villages, so finding a new one means actual travel
    // instead of stumbling into the next one a stone's throw away
    if(((vcx%8)+8)%8!==0 || ((vcz%8)+8)%8!==0) return null;
    const r=hashRand(vcx,vcz,this.seed^4242); if(r>0.3) return null;
    const wx=vcx*CHUNK_X+8, wz=vcz*CHUNK_Z+8;
    const h=this.heightAt(wx,wz); if(h<SEA_LEVEL+1 || h>SEA_LEVEL+14) return null; // not in water/mountains
    // flatness check across the WHOLE building footprint (houses sit out to ~r22),
    // so no house ends up carved into an unchecked hill / half-buried
    let mn=999,mx=-999; for(let dx=-20;dx<=20;dx+=5)for(let dz=-20;dz<=20;dz+=5){const hh=this.heightAt(wx+dx,wz+dz); if(hh<mn)mn=hh; if(hh>mx)mx=hh;}
    if(mx-mn>6) return null;
    if(mn<SEA_LEVEL+1) return null;   // the range check alone lets part of the footprint dip into a nearby lake — plaza/paths would generate underwater and show through as a submerged maze pattern; require the WHOLE footprint on dry land
    return { x:wx, z:wz, plat:h, vseed:(hashRand(vcx,vcz,this.seed^999)*1e9)|0, vcx, vcz };
  }
  _stampVillage(v, ox, oz, c){
    const plat=v.plat;
    const stamp=(wx,y,wz,id)=>{ const lx=wx-ox, lz=wz-oz; if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z||y<0||y>=WORLD_H) return; this._set(c,lx,y,lz,id); };
    const ground=(wx,wz,id)=>{ // flatten column to platform
      for(let y=plat+1;y<plat+10;y++) stamp(wx,y,wz,B.AIR);
      stamp(wx,plat,wz,id);
      // pour a solid foundation all the way to bedrock regardless of what
      // was originally there (a dip, chasm, cave, or open ocean) — a fixed
      // shallow fill isn't enough since dips between flatness-check sample
      // points can be deeper than expected; this guarantees no floating
      for(let y=plat-1;y>2;y--) stamp(wx,y,wz,B.DIRT);
    };
    if(this.villages.findIndex(p=>p.x===v.x&&p.z===v.z)<0) this.villages.push({x:v.x,z:v.z});
    // central well + path cross
    for(let dx=-24;dx<=24;dx++){ ground(v.x+dx,v.z,B.PATH); ground(v.x,v.z+dx,B.PATH); }
    // well
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){ ground(v.x+dx,v.z+dz, (dx===0&&dz===0)?B.WATER:B.STONEBRICK); }
    stamp(v.x,plat+1,v.z,B.WATER);
    // houses around centre — offsets scaled ~1.7x from the original layout,
    // which packed several houses only 6-9 blocks apart center-to-center
    // (less than one house-width), leaving them overlapping or wall-to-wall
    const spots=[[-17,-14,0],[14,-15,1],[-15,14,2],[15,12,3],[0,-22,4],[-22,0,5],[22,3,6],[3,22,7]];
    const count=3+((hashRand(v.vcx,v.vcz,v.vseed)*5)|0);
    v.settlers=[]; v.beds=[];
    for(let i=0;i<count && i<spots.length;i++){
      const s=spots[i]; this._house(v.x+s[0], v.z+s[1], plat, v.vseed+i*17, stamp, ground, v);
    }
    v._done=true;
  }
  _house(hx,hz,plat,seed, stamp, ground, v){
    const w=5+((hashRand(hx,hz,seed)*2)|0), d=5+((hashRand(hx,hz,seed+1)*2)|0), wall=3;
    const wallMat = hashRand(hx,hz,seed+2)<0.5?B.PLANKS:B.STONEBRICK;
    // foundation / floor
    for(let x=-1;x<=w;x++)for(let z=-1;z<=d;z++) ground(hx+x,hz+z, x<0||z<0||x>w||z>d?B.PATH:B.PLANKS);
    // walls
    for(let y=1;y<=wall;y++) for(let x=0;x<=w;x++) for(let z=0;z<=d;z++){
      const edge = (x===0||x===w||z===0||z===d);
      if(!edge){ stamp(hx+x,plat+y,hz+z,B.AIR); continue; }
      let id=wallMat;
      // window holes — must carry a rot meta matching which wall axis it
      // sits on, same convention place() uses, or the pane defaults to
      // rot 0 regardless of wall and looks misaligned from inside the house
      if(y===2 && ((x===((w/2)|0)&&(z===0||z===d)) || (z===((d/2)|0)&&(x===0||x===w)))){
        id=B.WINDOW;
        this.meta.set(this.bkey(hx+x,plat+y,hz+z), { rot: (x===0||x===w)?Math.PI/2:0 });
      }
      stamp(hx+x,plat+y,hz+z,id);
    }
    // door on +z wall middle
    const dxm=(w/2)|0;
    stamp(hx+dxm,plat+1,hz+d,B.AIR); stamp(hx+dxm,plat+2,hz+d,B.AIR);
    this.meta.set(this.bkey(hx+dxm,plat+1,hz+d),{rot:0});
    stamp(hx+dxm,plat+1,hz+d,B.DOOR);
    // roof (pitched)
    for(let y=0;y<=Math.max(w,d)/2;y++) for(let x=-1;x<=w+1;x++) for(let z=-1;z<=d+1;z++){
      const inset=y;
      if(x>=-1+inset && x<=w+1-inset && z>=-1+inset && z<=d+1-inset && (x===-1+inset||x===w+1-inset||z===-1+inset||z===d+1-inset))
        stamp(hx+x,plat+wall+y,hz+z,B.ROOFTILE);
    }
    for(let x=inset0(w);x<=w-inset0(w);x++)for(let z=0;z<=d;z++){} // (noop guard)
    // interior furniture
    // link both halves via meta exactly like player-placed beds (place() sets
    // foot/head pointers) — without this, breaking one half leaves the other
    // standing, and breaking THAT separately drops a second bed item
    stamp(hx+1,plat+1,hz+1,B.BED); this.meta.set(this.bkey(hx+1,plat+1,hz+1),{rot:0, foot:[hx+1,plat+1,hz+2]});
    stamp(hx+1,plat+1,hz+2,B.BED_FOOT); this.meta.set(this.bkey(hx+1,plat+1,hz+2),{rot:0, head:[hx+1,plat+1,hz+1]});
    if(v) v.beds.push([hx+1,plat+1,hz+1]);
    stamp(hx+w-1,plat+1,hz+1,B.CHEST);
    this._fillVillageChest(hx+w-1,plat+1,hz+1,seed);
    stamp(hx+w-1,plat+1,hz+d-1,B.BENCH);
    if(hashRand(hx,hz,seed+5)<0.5) stamp(hx+1,plat+1,hz+d-1,B.FURNACE);
    // lantern light
    stamp(hx+dxm,plat+wall-1,hz+1,B.LANTERN); this.lights.add(this.bkey(hx+dxm,plat+wall-1,hz+1));
    // settler spawn
    if(v) v.settlers.push([hx+dxm,plat+1,hz+1]);
    // small fenced farm beside house
    if(hashRand(hx,hz,seed+6)<0.6){
      for(let x=0;x<3;x++)for(let z=0;z<3;z++) ground(hx+x, hz-3+z, B.DIRT);
    }
  }
  _fillVillageChest(x,y,z,seed){
    const k=this.bkey(x,y,z); if(this.chests.has(k)) return;
    const slots=new Array(27).fill(null);
    const loot=[['planks',6],['stick',8],['coal',4],['apple',3],['seeds',5],['wood_pickaxe',1],['iron_raw',2],['bread_none',0]];
    let n=2+((hashRand(x,z,seed)*3)|0);
    for(let i=0;i<n;i++){ const l=loot[(hashRand(x+i,z,seed+i)*7)|0]; if(l&&ITEMS[l[0]]) slots[i]={item:l[0],count:l[1]||1}; }
    this.chests.set(k,slots);
  }

  // ----- underground "miner's cache" (reuses the village gate/stamp/chest pattern) -----
  // deterministic chunk-grid origin test (returns {x,z,vseed} or null)
  _caveRoomAt(rcx,rcz){
    // grid spacing every 4 chunks + a rare roll keeps caches spread out
    if(((rcx%4)+4)%4!==0 || ((rcz%4)+4)%4!==0) return null;
    const r=hashRand(rcx,rcz,this.seed^7373); if(r>0.30) return null; // rare; tunable
    return { x:rcx*CHUNK_X+8, z:rcz*CHUNK_Z+8, vseed:(hashRand(rcx,rcz,this.seed^2626)*1e9)|0 };
  }
  _stampCaveRoom(s, ox, oz, c){
    const stamp=(wx,y,wz,id,force)=>{ const lx=wx-ox, lz=wz-oz; if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z||y<0||y>=WORLD_H) return; if(!force){ const cur=this._get(c,lx,y,lz); if(cur!==B.AIR && cur!==B.LEAVES && cur!==B.WATER) return; } this._set(c,lx,y,lz,id); };
    const cx=s.x, cz=s.z, R=2; // 5x5 footprint, 3-tall headroom
    const solid=id=> id!==B.AIR && id!==B.WATER && id!==B.LEAVES;
    const h=this.heightAt(cx,cz);
    // find a valid carved pocket: solid floor, air interior, mostly-solid ceiling
    let floorY=-1;
    for(let y=6; y<Math.min(h-3,30); y++){
      let fOk=0,aOk=0,cOk=0,tot=0;
      for(let dx=-R;dx<=R;dx++) for(let dz=-R;dz<=R;dz++){
        tot++;
        if(solid(this._get(c,cx+dx-ox,y-1,cz+dz-oz))) fOk++;
        if(this._get(c,cx+dx-ox,y,cz+dz-oz)===B.AIR && this._get(c,cx+dx-ox,y+1,cz+dz-oz)===B.AIR && this._get(c,cx+dx-ox,y+2,cz+dz-oz)===B.AIR) aOk++;
        if(solid(this._get(c,cx+dx-ox,y+3,cz+dz-oz))) cOk++;
      }
      if(fOk>=tot*0.8 && aOk>=tot*0.8 && cOk>=tot*0.6){ floorY=y; break; }
    }
    if(floorY<0) return; // no valid pocket this chunk — silent, rare anyway
    if(!this.caveRooms) this.caveRooms=[];
    if(this.caveRooms.findIndex(p=>p.x===cx&&p.z===cz)<0) this.caveRooms.push({x:cx,z:cz,y:floorY});   // the Gravemaw sleeps near these
    // floor (force over the air pocket), corner beams only where air, furniture non-force
    for(let dx=-R;dx<=R;dx++) for(let dz=-R;dz<=R;dz++) stamp(cx+dx,floorY,cz+dz,B.PLANKS,true);
    for(const [dx,dz] of [[-R,-R],[R,-R],[-R,R],[R,R]])
      for(let y=floorY+1;y<=floorY+3;y++) stamp(cx+dx,y,cz+dz,B.FENCE,false);
    stamp(cx,floorY+1,cz,B.CHEST,false);
    this._fillCaveChest(cx,floorY+1,cz,s.vseed);
    // light + discovery cue — lantern (proven by villages), lit automatically by _applyDeltas
    stamp(cx,floorY+2,cz,B.LANTERN,false);
    if(hashRand(cx,cz,s.vseed+11)<0.5) stamp(cx-R+1,floorY+1,cz-R+1,B.FURNACE,false);
  }
  _fillCaveChest(x,y,z,seed){
    const k=this.bkey(x,y,z); if(this.chests.has(k)) return;
    const slots=new Array(27).fill(null);
    // underground-weighted: common coal/stick/planks repeated, iron + pickaxe the rarer rolls
    const loot=[['coal',6],['coal',6],['stick',10],['stick',10],['planks',6],['iron_raw',3],['iron_raw',3],['wood_pickaxe',1],['apple',3],['bread_none',0],['seeds',4]];
    let n=2+((hashRand(x,z,seed)*3)|0);
    for(let i=0;i<n;i++){ const l=loot[(hashRand(x+i,z,seed+i)*loot.length)|0]; if(l&&ITEMS[l[0]]) slots[i]={item:l[0],count:l[1]||1}; }
    this.chests.set(k,slots);
  }

  // ----- rare SURFACE RUIN: broken stone-brick landmark with a loot chest -----
  // deterministic sea-lair origin: sparse 7-chunk grid; anchors on the deepest
  // water near the grid point (oceans are shallow — the stamp digs the rest)
  _seaLairAt(rcx,rcz){
    if(((rcx%7)+7)%7!==0 || ((rcz%7)+7)%7!==0) return null;
    if(hashRand(rcx,rcz,this.seed^0x5EA11)>0.5) return null;
    if(!this._lairCache) this._lairCache=new Map();
    const ck=rcx+','+rcz; if(this._lairCache.has(ck)) return this._lairCache.get(ck);
    const gx=rcx*CHUNK_X+8, gz=rcz*CHUNK_Z+8;
    let bx=0,bz=0,bh=999;
    for(let dx=-40;dx<=40;dx+=8) for(let dz=-40;dz<=40;dz+=8){
      const h=this.heightAt(gx+dx,gz+dz); if(h<bh){ bh=h; bx=gx+dx; bz=gz+dz; }
    }
    const out = bh>SEA_LEVEL-3 ? null : { x:bx, z:bz, y:bh-6, top:bh, vseed:(hashRand(rcx,rcz,this.seed^0x5EA22)*1e9)|0 };
    this._lairCache.set(ck,out); return out;
  }
  _stampSeaLair(s, ox, oz, c){
    const set=(wx,y,wz,id)=>{ const lx=wx-ox, lz=wz-oz; if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z||y<0||y>=WORLD_H) return; this._set(c,lx,y,lz,id); };
    if(!this.seaLairs) this.seaLairs=[];
    if(this.seaLairs.findIndex(p=>p.x===s.x&&p.z===s.z)<0) this.seaLairs.push({x:s.x,z:s.z,y:s.y});
    const R=5, BR=10, cx=s.x, cz=s.z, fy=s.y;
    // carve a deep basin into the seabed — a real dark trench around the dome.
    // Only underwater columns are touched, taper keeps the rim natural.
    for(let dx=-BR;dx<=BR;dx++) for(let dz=-BR;dz<=BR;dz++){
      const dd=Math.sqrt(dx*dx+dz*dz); if(dd>BR) continue;
      const wx=cx+dx, wz=cz+dz, colH=this.heightAt(wx,wz);
      if(colH>=SEA_LEVEL) continue;                              // never carve land
      const floorY=fy+Math.round((dd/BR)*(dd/BR)*6);
      // fill water up to the surface AND clear any kelp/rock props _genBase rooted
      // at the old seabed (colH+1..), so nothing floats above the carved basin
      for(let y=floorY+1;y<=SEA_LEVEL-1;y++) set(wx,y,wz,B.WATER);
      set(wx,floorY,wz, hashRand(wx,wz,s.vseed^9)<0.15?B.GRAVEL:B.SAND);
    }
    // domed shell with a glowing crown; hollow interior is a breathable AIR pocket
    for(let dx=-R;dx<=R;dx++) for(let dz=-R;dz<=R;dz++) for(let dy=0;dy<=R;dy++){
      const dd=Math.sqrt(dx*dx+dz*dz+dy*dy*1.6);
      if(dd>R) continue;
      const wx=cx+dx, wy=fy+1+dy, wz=cz+dz;
      if(dd>R-1.2){ set(wx,wy,wz, (dy>=3 && hashRand(wx,wz,s.vseed+dy)<0.22)?B.GLOWSTONE:B.STONEBRICK); }
      else set(wx,wy,wz,B.AIR);
    }
    // floor + a flooded entrance arch facing −z so creatures/players swim in
    for(let dx=-R;dx<=R;dx++) for(let dz=-R;dz<=R;dz++){ if(dx*dx+dz*dz<=R*R) set(cx+dx,fy,cz+dz, hashRand(cx+dx,cz+dz,s.vseed)<0.3?B.MOSSY_STONEBRICK:B.STONEBRICK); }
    for(let dx=-1;dx<=1;dx++) for(let dy=1;dy<=2;dy++) set(cx+dx,fy+dy,cz-R,B.WATER);
    // pearl altar: chest of the deep on a small plinth
    set(cx,fy+1,cz,B.STONEBRICK); set(cx,fy+2,cz,B.CHEST); this._fillSeaChest(cx,fy+2,cz,s.vseed);
    if(this.lights) this.lights.add(this.bkey(cx,fy+5,cz));
  }
  _fillSeaChest(x,y,z,seed){
    const k=this.bkey(x,y,z); if(this.chests.has(k)) return;
    const slots=new Array(27).fill(null);
    const loot=[['abyss_pearl',2],['gel',4],['crystal',2],['gold_ingot',2],['raw_fish',3],['emerald',1],['diamond',1]];
    let n=3+((hashRand(x,z,seed)*3)|0);
    for(let i=0;i<n;i++){ const l=loot[(hashRand(x+i,z,seed+i)*loot.length)|0]; if(l&&ITEMS[l[0]]) slots[i]={item:l[0],count:l[1]||1}; }
    this.chests.set(k,slots);
  }
  // ===== Aetheria — the rare sunken city, seat of the Drowned King =====
  // Much rarer than a lair (13-chunk grid, low roll) and only in genuinely deep
  // ocean. A pale quartz metropolis with domed halls, a walled plaza, glowing
  // crystal lights, and a central breathable palace with the throne + royal vault.
  _seaCityAt(rcx,rcz){
    if(((rcx%13)+13)%13!==5 || ((rcz%13)+13)%13!==5) return null;
    if(hashRand(rcx,rcz,this.seed^0xC17A)>0.5) return null;
    if(!this._cityCache) this._cityCache=new Map();
    const ck=rcx+','+rcz; if(this._cityCache.has(ck)) return this._cityCache.get(ck);
    const gx=rcx*CHUNK_X+8, gz=rcz*CHUNK_Z+8;
    let bx=0,bz=0,bh=999;
    for(let dx=-48;dx<=48;dx+=8) for(let dz=-48;dz<=48;dz+=8){ const h=this.heightAt(gx+dx,gz+dz); if(h<bh){ bh=h; bx=gx+dx; bz=gz+dz; } }
    const out = bh>SEA_LEVEL-5 ? null : { x:bx, z:bz, y:bh-3, vseed:(hashRand(rcx,rcz,this.seed^0xC18B)*1e9)|0 };
    this._cityCache.set(ck,out); return out;
  }
  _stampSeaCity(s, ox, oz, c){
    const set=(wx,y,wz,id)=>{ const lx=wx-ox, lz=wz-oz; if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z||y<0||y>=WORLD_H) return; this._set(c,lx,y,lz,id); };
    const get=(wx,y,wz)=>{ const lx=wx-ox, lz=wz-oz; if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z||y<0||y>=WORLD_H) return -1; return this._get(c,lx,y,lz); };
    const hr=(a,b)=>hashRand(a,b,s.vseed);
    if(!this.seaCities) this.seaCities=[];
    if(this.seaCities.findIndex(p=>p.x===s.x&&p.z===s.z)<0) this.seaCities.push({x:s.x,z:s.z,y:s.y});
    const cx=s.x, cz=s.z, fy=s.y, CR=22;   // big plaza radius
    const lite=(wx,wy,wz)=>{ set(wx,wy,wz,B.GLOWSTONE); if(this.lights&&this.lights.size<4096) this.lights.add(this.bkey(wx,wy,wz)); };
    // 1) carve a broad flat plaza basin into the seabed; clear any floating props
    for(let dx=-CR;dx<=CR;dx++) for(let dz=-CR;dz<=CR;dz++){ const dd=Math.sqrt(dx*dx+dz*dz); if(dd>CR) continue;
      const wx=cx+dx, wz=cz+dz, colH=this.heightAt(wx,wz); if(colH>=SEA_LEVEL) continue;
      const floorY = fy + Math.round(Math.max(0,(dd-13)/(CR-13))*(dd-13>0?5:0));   // flat centre, terraced rim
      for(let y=floorY+1;y<=SEA_LEVEL-1;y++) set(wx,y,wz,B.WATER);
      set(wx,floorY,wz, hr(wx,wz)<0.25?B.QUARTZ:B.SMOOTH_SANDSTONE);              // paved plaza floor
    }
    // 2) outer wall ring with a glowing gate to the −z (a real discoverable silhouette)
    for(let a=0;a<64;a++){ const ang=a/64*6.283, wx=Math.round(cx+Math.cos(ang)*18), wz=Math.round(cz+Math.sin(ang)*18);
      const gate = (Math.cos(ang) < -0.82);   // opening on the −z face
      for(let y=1;y<=4;y++){ if(gate){ if(y>=3) lite(wx,fy+y,wz); }
        else set(wx,fy+y,wz, (y===4&&(a&1))?B.QUARTZ : B.STONEBRICK); }
      if(!gate && (a%8===0)) lite(wx,fy+5,wz);   // wall-top beacons
    }
    // 3) ring of domed halls around the plaza (breathable air pockets + loot)
    const domes=[[-11,-4],[11,-4],[-8,10],[8,10],[0,-13],[-13,4],[13,4]];
    for(let i=0;i<domes.length;i++){ const hx=cx+domes[i][0], hz=cz+domes[i][1];
      this._seaDome(hx,fy,hz,4, set,lite,hr, i===4);   // dome #4 (front) holds a chest
      if(i===4){ set(hx+1,fy+1,hz,B.CHEST); this._fillCityChest(hx+1,fy+1,hz,s.vseed+i); }   // offset from the bridge column
    }
    // 4) connecting bridges: raised quartz walkways from the gate to the palace
    for(let d=0;d<=13;d++){ set(cx,fy+1,cz-d,B.QUARTZ); if(d%3===0) lite(cx,fy+2,cz-d); }
    // 5) CENTRAL PALACE: two-tier hall, breathable, throne dais + royal vault
    this._seaPalace(cx,fy,cz,s.vseed, set,get,lite,hr);
    // 6) scattered rare kelp + glow around the outskirts (rooted to the new floor)
    for(let k=0;k<10;k++){ const wx=cx+((hr(k,1)*2-1)*CR)|0, wz=cz+((hr(k,2)*2-1)*CR)|0;
      const colH=this.heightAt(wx,wz); if(colH>=SEA_LEVEL) continue;
      const bY=Math.min(fy, colH); if(get(wx,bY+1,wz)===B.WATER){ const kh=1+((hr(k,3)*3)|0); for(let j=1;j<=kh;j++) set(wx,bY+j,wz,B.KELP); } }
  }
  // one domed hall: quartz ring wall, glass band, glowstone crown, hollow inside
  _seaDome(hx,fy,hz,R, set,lite,hr, withDoor){
    for(let dx=-R;dx<=R;dx++) for(let dz=-R;dz<=R;dz++) for(let dy=0;dy<=R;dy++){
      const dd=Math.sqrt(dx*dx+dz*dz+dy*dy*1.4); if(dd>R) continue;
      const wx=hx+dx, wy=fy+1+dy, wz=hz+dz;
      if(dd>R-1.15){ const glass=(dy===2 && (dx===0||dz===0));
        set(wx,wy,wz, glass?B.GLASS_DOME : (dy>=3 && hr(wx,wz+dy)<0.3)?B.GLOWSTONE : B.QUARTZ);
        if(dy>=3 && hr(wx,wz+dy)<0.3 && this.lights&&this.lights.size<4096) this.lights.add(this.bkey(wx,wy,wz));
      } else set(wx,wy,wz,B.AIR); }
    for(let dx=-R;dx<=R;dx++) for(let dz=-R;dz<=R;dz++){ if(dx*dx+dz*dz<=R*R) set(hx+dx,fy,hz+dz,B.SMOOTH_SANDSTONE); }
    if(withDoor){ set(hx,fy+1,hz-R,B.WATER); set(hx,fy+2,hz-R,B.WATER); }   // flooded doorway
    set(hx,fy+3,hz,B.GLOWSTONE);
  }
  // central palace: tall breathable throne hall with a royal vault chest
  _seaPalace(cx,fy,cz,vseed, set,get,lite,hr){
    const R=8, H=9;
    for(let dx=-R;dx<=R;dx++) for(let dz=-R;dz<=R;dz++){
      const dd=Math.sqrt(dx*dx+dz*dz); if(dd>R) continue;
      set(cx+dx,fy,cz+dz, hr(cx+dx,cz+dz)<0.2?B.QUARTZ:B.SMOOTH_SANDSTONE);   // grand floor
      for(let y=1;y<=H;y++){                                                  // walls (ring) hollow interior
        const wall = dd>R-1.1;
        if(wall){ const glass=(y>=3&&y<=6&&((dx===0)||(dz===0)));
          set(cx+dx,fy+y,cz+dz, glass?B.GLASS_DOME:B.QUARTZ);
        } else set(cx+dx,fy+y,cz+dz,B.AIR);
      }
    }
    // domed cap + glowing spire (the city's landmark silhouette)
    for(let dx=-R;dx<=R;dx++) for(let dz=-R;dz<=R;dz++){ const dd=Math.sqrt(dx*dx+dz*dz);
      if(dd<=R) set(cx+dx,fy+H,cz+dz, dd>R-2?B.QUARTZ:B.SMOOTH_SANDSTONE); }
    for(let y=1;y<=4;y++) lite(cx,fy+H+y,cz);
    // flooded grand entrance on −z (swim in), then it's a breathable hall
    for(let dx=-1;dx<=1;dx++) for(let y=1;y<=3;y++) set(cx+dx,fy+y,cz-R,B.WATER);
    // throne dais at the back + the royal vault chest
    for(let dx=-2;dx<=2;dx++) for(let dz=0;dz<=2;dz++) set(cx+dx,fy+1,cz+R-3+dz,B.SMOOTH_SANDSTONE);
    set(cx,fy+2,cz+R-2,B.QUARTZ); set(cx,fy+3,cz+R-2,B.GLASS_DOME);           // the throne
    lite(cx-2,fy+2,cz+R-2); lite(cx+2,fy+2,cz+R-2);
    set(cx,fy+2,cz+R-4,B.CHEST); this._fillVaultChest(cx,fy+2,cz+R-4,vseed);   // royal vault
    // interior pillars for scale
    for(const [px,pz] of [[-4,-3],[4,-3],[-4,3],[4,3]]) for(let y=1;y<=H-1;y++) set(cx+px,fy+y,cz+pz,B.QUARTZ);
  }
  _fillCityChest(x,y,z,seed){
    const k=this.bkey(x,y,z); if(this.chests.has(k)) return;
    const slots=new Array(27).fill(null);
    const loot=[['abyss_pearl',3],['ocean_crystal',1],['gold_ingot',3],['crystal',2],['diamond',1],['emerald',2],['gel',4]];
    let n=3+((hashRand(x,z,seed)*3)|0);
    for(let i=0;i<n;i++){ const l=loot[(hashRand(x+i,z,seed+i)*loot.length)|0]; if(l&&ITEMS[l[0]]) slots[i]={item:l[0],count:l[1]||1}; }
    this.chests.set(k,slots);
  }
  _fillVaultChest(x,y,z,seed){   // the Drowned King's treasury — the best loot in the sea
    const k=this.bkey(x,y,z); if(this.chests.has(k)) return;
    const slots=new Array(27).fill(null);
    const fixed=[['ocean_crystal',2],['abyss_pearl',4],['diamond',2],['tide_charm',1]];
    fixed.forEach((l,i)=>{ if(ITEMS[l[0]]) slots[i]={item:l[0],count:l[1]}; });
    const extra=[['gold_ingot',5],['emerald',3],['crystal',3],['deep_scale',2]];
    for(let i=0;i<3;i++){ const l=extra[(hashRand(x+i,z,seed+i)*extra.length)|0]; if(ITEMS[l[0]]) slots[4+i]={item:l[0],count:l[1]}; }
    this.chests.set(k,slots);
  }
  _ruinAt(rcx,rcz){
    if(((rcx%5)+5)%5!==0 || ((rcz%5)+5)%5!==0) return null;            // sparse 5-chunk grid
    if(hashRand(rcx,rcz,this.seed^0x51111)>0.22) return null;           // rare roll
    return { x:rcx*CHUNK_X+8, z:rcz*CHUNK_Z+8, vseed:(hashRand(rcx,rcz,this.seed^0x52222)*1e9)|0 };
  }
  // shipwreck: broken dark-plank hull half-sunk in the shallows, nautical loot
  _wreckAt(rcx,rcz){
    if(((rcx%6)+6)%6!==2 || ((rcz%6)+6)%6!==2) return null;             // offset grid — never collides with ruins/lairs
    if(hashRand(rcx,rcz,this.seed^0x77EC4)>0.30) return null;
    const wx=rcx*CHUNK_X+8, wz=rcz*CHUNK_Z+8, h=this.heightAt(wx,wz);
    if(h>SEA_LEVEL-1 || h<SEA_LEVEL-4) return null;                     // shallow water only (visible from shore)
    return { x:wx, z:wz, y:h, vseed:(hashRand(rcx,rcz,this.seed^0x77EC5)*1e9)|0 };
  }
  _stampWreck(s, ox, oz, c){
    const set=(wx,y,wz,id)=>{ const lx=wx-ox, lz=wz-oz; if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z||y<0||y>=WORLD_H) return; this._set(c,lx,y,lz,id); };
    const hr=(a,b)=>hashRand(a,b,s.vseed);
    const cx=s.x, cz=s.z, fy=s.y;
    // keel + hull floor along x, tapered bow/stern; ribs stick up, storm-broken
    for(let dx=-4;dx<=4;dx++){
      const w = Math.abs(dx)>=4?0 : Math.abs(dx)===3?1 : 2;
      for(let dz=-w;dz<=w;dz++){ set(cx+dx,fy,cz+dz, hr(dx,dz)<0.2?B.PLANKS:B.DARK_PLANKS); }
      if(Math.abs(dx)===4||dx===0){ const rh=1+((hr(dx,9)*3)|0);        // rib frames (some snapped off)
        for(let y=1;y<=rh;y++){ if(hr(dx,y)<0.8){ set(cx+dx,fy+y,cz-Math.min(2,w||1),B.LOG); set(cx+dx,fy+y,cz+Math.min(2,w||1),B.LOG); } } }
    }
    for(let y=1;y<=3;y++) if(hr(7,y)<0.85) set(cx-1,fy+y,cz,B.LOG);     // broken mast stump
    set(cx+1,fy+1,cz,B.CHEST); this._fillWreckChest(cx+1,fy+1,cz,s.vseed);
  }
  _fillWreckChest(x,y,z,seed){
    const k=this.bkey(x,y,z); if(this.chests.has(k)) return;
    const slots=new Array(27).fill(null);
    const loot=[['abyss_pearl',1],['gold_ingot',3],['iron_ingot',3],['string',4],['arrow',10],['boat',1],['emerald',1],['raw_fish',3],['gel',3],['lantern',2]];
    let n=3+((hashRand(x,z,seed)*3)|0);
    for(let i=0;i<n;i++){ const l=loot[(hashRand(x+i,z,seed+i)*loot.length)|0]; if(l&&ITEMS[l[0]]) slots[i]={item:l[0],count:l[1]||1}; }
    this.chests.set(k,slots);
  }
  // abandoned camp: cold campfire, log seats, torn wool lean-to, explorer's cache
  _campAt(rcx,rcz){
    if(((rcx%5)+5)%5!==2 || ((rcz%5)+5)%5!==3) return null;             // offset grid
    if(hashRand(rcx,rcz,this.seed^0xCA3B)>0.26) return null;
    const wx=rcx*CHUNK_X+8, wz=rcz*CHUNK_Z+8, h=this.heightAt(wx,wz);
    if(h<SEA_LEVEL+1 || h>WORLD_H-10) return null;
    if(this.biomeAt(wx,wz,h)!==BIOMES.forest) return null;              // deep-woods find
    return { x:wx, z:wz, vseed:(hashRand(rcx,rcz,this.seed^0xCA3C)*1e9)|0 };
  }
  _stampCamp(s, ox, oz, c){
    const set=(wx,y,wz,id)=>{ const lx=wx-ox, lz=wz-oz; if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z||y<0||y>=WORLD_H) return; this._set(c,lx,y,lz,id); };
    const hr=(a,b)=>hashRand(a,b,s.vseed);
    const cx=s.x, cz=s.z;
    // clear a small glade at each column's own height, then furnish
    for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++){
      const h=this.heightAt(cx+dx,cz+dz);
      for(let y=h+1;y<=h+5;y++) set(cx+dx,y,cz+dz,B.AIR);
    }
    const fy=this.heightAt(cx,cz);
    set(cx,fy+1,cz,B.CAMPFIRE); this.lights.add(this.bkey(cx,fy+1,cz));
    set(cx-2,this.heightAt(cx-2,cz)+1,cz,B.LOG); set(cx+2,this.heightAt(cx+2,cz)+1,cz,B.LOG);   // log seats
    // torn lean-to: wool back wall + plank roof, one corner collapsed
    const tz=cz-3, th=this.heightAt(cx,tz);
    for(let dx=-1;dx<=1;dx++){ if(hr(dx,1)<0.85) set(cx+dx,th+1,tz,B.WOOL); if(hr(dx,2)<0.7) set(cx+dx,th+2,tz,B.WOOL); }
    for(let dx=-1;dx<=1;dx++) if(hr(dx,3)<0.8) set(cx+dx,th+2,tz+1,B.PLANKS);
    set(cx+1,th+1,tz+1,B.CHEST); this._fillCampChest(cx+1,th+1,tz+1,s.vseed);
  }
  _fillCampChest(x,y,z,seed){
    const k=this.bkey(x,y,z); if(this.chests.has(k)) return;
    const slots=new Array(27).fill(null);
    const loot=[['bread',2],['torch',6],['arrow',8],['coal',5],['apple',2],['book',1],['quartz',1],['iron_ingot',2],['leather',2],['cooked_meat',2]];
    let n=3+((hashRand(x,z,seed)*3)|0);
    for(let i=0;i<n;i++){ const l=loot[(hashRand(x+i,z,seed+i)*loot.length)|0]; if(l&&ITEMS[l[0]]) slots[i]={item:l[0],count:l[1]||1}; }
    this.chests.set(k,slots);
  }
  _stampRuin(s, ox, oz, c){
    const stamp=(wx,y,wz,id,force)=>{ const lx=wx-ox, lz=wz-oz; if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z||y<0||y>=WORLD_H) return;
      if(!force){ const cur=this._get(c,lx,y,lz); if(cur!==B.AIR && cur!==B.LEAVES && cur!==B.WATER && cur!==B.SNOW && cur!==B.TALLGRASS) return; } this._set(c,lx,y,lz,id); };
    const cx=s.x, cz=s.z, R=3;
    const baseH=this.heightAt(cx,cz); if(baseH<SEA_LEVEL+2 || baseH>WORLD_H-8) return;   // skip ocean / shoreline (small margin so the floor stamp can't force itself into water) / too high
    const hr=(a,b)=>hashRand(a,b,s.vseed);
    // stone-brick floor (mossy patches), clear the interior above
    for(let dx=-R;dx<=R;dx++) for(let dz=-R;dz<=R;dz++){ const wx=cx+dx, wz=cz+dz, fy=this.heightAt(wx,wz);
      stamp(wx,fy,wz, hr(wx,wz)<0.3?B.MOSSY_STONEBRICK:B.STONEBRICK, true);
      for(let y=fy+1;y<=fy+4;y++) stamp(wx,y,wz,B.AIR,true); }
    // broken perimeter walls (random gaps, 1-2 tall), cracked patches
    for(let dx=-R;dx<=R;dx++) for(let dz=-R;dz<=R;dz++){ if(Math.abs(dx)!==R && Math.abs(dz)!==R) continue;
      const wx=cx+dx, wz=cz+dz, fy=this.heightAt(wx,wz), ht=1+((hr(wx*3,wz*5)*2)|0);
      for(let y=1;y<=ht;y++){ if(hr(wx+y,wz)<0.78) stamp(wx,fy+y,wz, hr(wx,wz+y)<0.4?B.CRACKED_STONEBRICK:B.STONEBRICK, true); } }
    // taller corner pillars
    for(const [dx,dz] of [[-R,-R],[R,-R],[-R,R],[R,R]]){ const wx=cx+dx, wz=cz+dz, fy=this.heightAt(wx,wz), ph=2+((hr(wx,wz+7)*2)|0);
      for(let y=1;y<=ph;y++) stamp(wx,fy+y,wz, hr(wx,wz+y*3)<0.3?B.CRACKED_STONEBRICK:B.STONEBRICK, true); }
    // central loot chest + scattered rubble
    const fyc=this.heightAt(cx,cz);
    stamp(cx,fyc+1,cz,B.CHEST,true); this._fillRuinChest(cx,fyc+1,cz,s.vseed);
    for(const [dx,dz] of [[-1,1],[1,-1],[2,0],[-2,1]]) stamp(cx+dx,fyc+1,cz+dz,B.COBBLE,false);
  }
  _fillRuinChest(x,y,z,seed){
    const k=this.bkey(x,y,z); if(this.chests.has(k)) return;
    const slots=new Array(27).fill(null);
    const loot=[['iron_raw',4],['gold_raw',2],['emerald',1],['crystal',2],['coal',6],['book',1],['iron_ingot',3],['diamond',1],['arrow',8],['gold_ingot',2],
                ['quartz',2],['space_shard',1],['circuit',1],['sunstone',1]];   // ruins can seed the space-age chain — or hold a relic
    let n=3+((hashRand(x,z,seed)*3)|0);
    for(let i=0;i<n;i++){ const l=loot[(hashRand(x+i,z,seed+i)*loot.length)|0]; if(l&&ITEMS[l[0]]) slots[i]={item:l[0],count:l[1]||1}; }
    this.chests.set(k,slots);
  }

  // cave decoration: stalactites / stalagmites / rubble inside carved pockets (existing blocks only)
  _genCaveDecor(c,cx,cz){
    const ox=cx*CHUNK_X, oz=cz*CHUNK_Z;
    const set=(wx,y,wz,id)=>{ const lx=wx-ox, lz=wz-oz;
      if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z||y<0||y>=WORLD_H) return;
      if(this._get(c,lx,y,lz)!==B.AIR) return;            // never overwrite solid
      this._set(c,lx,y,lz,id); };
    for(let lz=0;lz<CHUNK_Z;lz++) for(let lx=0;lx<CHUNK_X;lx++){
      const wx=ox+lx, wz=oz+lz, h=this.heightAt(wx,wz);
      for(let y=4;y<h-2;y++){
        const here=this._get(c,lx,y,lz); if(here!==B.AIR) continue;
        const below=this._get(c,lx,y-1,lz), above=this._get(c,lx,y+1,lz);
        const solidB = below!==B.AIR && below!==B.WATER;
        const solidA = above!==B.AIR && above!==B.WATER;
        const r=hashRand(wx+y*257, wz+y*131, (this.seed^13579));
        if(solidB && !solidA && r<0.007){                                      // stalagmite up from floor (sparser — fewer faces)
          set(wx,y,wz,B.STONE); if(hashRand(wx,wz,(this.seed^2468)+y)<0.3) set(wx,y+1,wz,B.STONE);
        } else if(solidA && !solidB && r>0.993){                                // stalactite from ceiling (sparser)
          set(wx,y,wz,B.DARKSTONE);
        } else if(solidB && !solidA && y<SEA_LEVEL && hashRand(wx,wz,(this.seed^1122)+y*7)<0.006){ // rubble
          set(wx,y,wz, r<0.5?B.GRAVEL:B.DIRT);
        }
      }
    }
  }

  _applyDeltas(c,cx,cz){
    const ox=cx*CHUNK_X, oz=cz*CHUNK_Z;
    for(const [k,id] of this.deltas){
      const p=k.split(','); const wx=+p[0],y=+p[1],wz=+p[2];
      if(wx>=ox&&wx<ox+CHUNK_X&&wz>=oz&&wz<oz+CHUNK_Z){ this._set(c,wx-ox,y,wz-oz,id); }
    }
    // register lights present in this chunk
    for(let lz=0;lz<CHUNK_Z;lz++)for(let lx=0;lx<CHUNK_X;lx++)for(let y=0;y<WORLD_H;y++){
      const id=c[vIndex(lx,y,lz)]; if(id && BLOCKS[id].light>0) this.lights.add(this.bkey(ox+lx,y,oz+lz));
    }
  }

  // ----- public block API -----
  getBlock(wx,wy,wz){
    if(wy<0) return B.STONE; if(wy>=WORLD_H) return B.AIR;
    const cx=floorDiv(wx,CHUNK_X), cz=floorDiv(wz,CHUNK_Z);
    const c=this.getChunk(cx,cz);
    return c[vIndex(mod(wx,CHUNK_X), wy, mod(wz,CHUNK_Z))];
  }
  isSolid(wx,wy,wz){ const id=this.getBlock(wx,wy,wz); if(!BLOCKS[id]||!BLOCKS[id].solid) return false; if(isDoorId(id)){ const m=this.meta.get(this.bkey(wx,wy,wz)); if(m&&m.open) return false; } return true; }
  setBlock(wx,wy,wz,id, metaObj){
    if(wy<0||wy>=WORLD_H) return;
    const cx=floorDiv(wx,CHUNK_X), cz=floorDiv(wz,CHUNK_Z);
    const c=this.getChunk(cx,cz);
    c[vIndex(mod(wx,CHUNK_X),wy,mod(wz,CHUNK_Z))]=id;
    const k=this.bkey(wx,wy,wz); this.deltas.set(k,id);
    if(metaObj) this.meta.set(k,metaObj); else this.meta.delete(k);
    if(BLOCKS[id] && BLOCKS[id].light>0) this.lights.add(k); else this.lights.delete(k);
  }
  getMeta(wx,wy,wz){ return this.meta.get(this.bkey(wx,wy,wz)); }
  getChest(wx,wy,wz){ const k=this.bkey(wx,wy,wz); if(!this.chests.has(k)) this.chests.set(k,new Array(27).fill(null)); return this.chests.get(k); }
  getFurnace(wx,wy,wz){ const k=this.bkey(wx,wy,wz); if(!this.furnaces.has(k)) this.furnaces.set(k,{input:null,fuel:null,output:null,prog:0,burn:0,burnMax:0}); return this.furnaces.get(k); }

  // highest non-air/non-water block, for safe spawning
  surfaceY(wx,wz){
    for(let y=WORLD_H-1;y>=0;y--){ const id=this.getBlock(wx,y,wz); if(id && id!==B.WATER && id!==B.LEAVES && BLOCKS[id].solid) return y; }
    return SEA_LEVEL;
  }
}
function inset0(w){ return 0; } // tiny helper used above

/* =====================================================================
   Player — first person controller with AABB voxel collision.
   ===================================================================== */
// Exact, allocation-free predicate used by both safe spawning and the timber
// compass. It mirrors World._genFeatures without forcing chunks to generate.
function proceduralTreeAt(world,tx,tz){
  const ty=world.heightAt(tx,tz); if(ty<SEA_LEVEL||ty>=WORLD_H-8) return false;
  const biome=world.biomeAt(tx,tz,ty); if(!biome.tree) return false;
  const patch=clamp(world.nForest.fbm2(tx*0.015,tz*0.015,3)*2,0,2);
  return hashRand(tx,tz,world.seed^123)<biome.tree*patch*(world.genVer>=4?0.68:1);
}

class Player {
  constructor(world){
    this.world=world;
    this.pos=new THREE.Vector3(0,0,0);
    this.vel=new THREE.Vector3();
    this.yaw=0; this.pitch=0;
    this.onGround=false; this.inWater=false; this.onLadder=false;
    this.flying=true;          // creative-only toggle (spectator always flies)
    this.HW=0.3; this.H=1.8; this.eye=1.62; this.viewEye=1.62;
    this.crouched=false;
    this.health=20; this.maxHealth=20; this.hunger=20; this.maxHunger=20;
    this.warmth=20; this.maxWarmth=20;   // survival: drops in snow/cold nights, restored by heat & sun
    this.saturation=5;                   // hidden buffer that depletes before hunger
    this.frozen=false;                   // set by warmth logic; slows movement when cold
    this.armor={head:null,chest:null,legs:null,feet:null};   // each holds a {item,count,dur} slot like inventory
    this.effects={};                     // effectId -> {t:remainingSeconds} from drinking a potion
    this.stamina=100; this.maxStamina=100;   // drains while sprinting; sprint locks out at 0 and hunger drains faster while empty
    this.autoJump=true;
    this.gravScale=1;                    // <1 on low-gravity worlds (the planet) — floatier jumps & slower falls
    this.spawn=null;
    this._jumpWasDown=false; this._jumpBuffer=0; this._coyote=0;
  }
  _decayEffects(dt){ for(const k in this.effects){ this.effects[k].t-=dt; if(this.effects[k].t<=0) delete this.effects[k]; } }
  setPos(x,y,z){ this.pos.set(x,y,z); this.vel.set(0,0,0); }
  feetY(){ return this.pos.y; }
  collides(x,y,z){
    const hw=this.HW;
    const x0=Math.floor(x-hw), x1=Math.floor(x+hw);
    const y0=Math.floor(y), y1=Math.floor(y+this.H-0.001);
    const z0=Math.floor(z-hw), z1=Math.floor(z+hw);
    for(let yy=y0;yy<=y1;yy++) for(let xx=x0;xx<=x1;xx++) for(let zz=z0;zz<=z1;zz++){
      const id=this.world.getBlock(xx,yy,zz), def=BLOCKS[id]; if(!def||!def.solid) continue;
      const needsMeta=isDoorId(id)||!!MODEL_COLLIDER_CACHE[def.model], meta=needsMeta?this.world.meta.get(this.world.bkey(xx,yy,zz)):null;
      if(isDoorId(id)&&meta&&meta.open) continue;
      for(const c of blockCollisionBoxes(id,meta)){
        const [cx,cy,cz,sx,sy,sz]=c, bx=xx+.5+cx, by=yy+cy, bz=zz+.5+cz;
        if(x+hw>bx-sx/2 && x-hw<bx+sx/2 && y+this.H>by-sy/2 && y<by+sy/2 && z+hw>bz-sz/2 && z-hw<bz+sz/2) return true;
      }
    }
    return false;
  }
  update(dt, ctl, mode){
    mode=mode||'survival';
    this._decayEffects(dt);
    let sprintNoise=false;
    const wasGround=this.onGround, jumpPressed=!!ctl.jump&&!this._jumpWasDown;
    this._jumpWasDown=!!ctl.jump;
    this._jumpBuffer=jumpPressed?0.12:Math.max(0,(this._jumpBuffer||0)-dt);
    this._coyote=this.onGround?0.10:Math.max(0,(this._coyote||0)-dt);
    // _tryGrowCrops is a Game method; crop timer now handled in Game.update()
    const flying=mode==='spectator' || (mode==='creative' && this.flying), noclip=mode==='spectator';
    // environment sampling at eye / feet
    const eb=this.world.getBlock(Math.floor(this.pos.x),Math.floor(this.pos.y+this.eye),Math.floor(this.pos.z));
    const fb=this.world.getBlock(Math.floor(this.pos.x),Math.floor(this.pos.y+0.2),Math.floor(this.pos.z));
    this.inWater = !noclip && (isWet(eb)||isWet(fb));
    const lcx=Math.floor(this.pos.x), lcz=Math.floor(this.pos.z);
    // sample mid-body AND feet so you can top-out onto the ledge a ladder serves
    this.onLadder = !flying && (this.world.getBlock(lcx,Math.floor(this.pos.y+0.9),lcz)===B.LADDER || this.world.getBlock(lcx,Math.floor(this.pos.y+0.1),lcz)===B.LADDER);
    // Real crouch collider: shrink under low ceilings, but never stand up into
    // solid geometry. Swimming, ladders, and flight retain the standing hull.
    const canCrouch=!flying&&!this.inWater&&!this.onLadder;
    if(canCrouch&&ctl.crouch) this.crouched=true;
    else if(this.crouched){ this.H=1.8; if(!this.collides(this.pos.x,this.pos.y,this.pos.z)) this.crouched=false; }
    this.H=this.crouched?1.35:1.8; this.eye=this.crouched?1.16:1.62;
    this.viewEye+= (this.eye-this.viewEye)*Math.min(1,12*dt);

    // wish direction
    const sin=Math.sin(this.yaw), cos=Math.cos(this.yaw);
    let wx=0,wz=0;
    if(ctl.f) { wx-=sin; wz-=cos; }
    if(ctl.b) { wx+=sin; wz+=cos; }
    if(ctl.l) { wx-=cos; wz+=sin; }
    if(ctl.r) { wx+=cos; wz-=sin; }
    const len=Math.hypot(wx,wz); if(len>0){ wx/=len; wz/=len; }
    const moving=ctl.f||ctl.b||ctl.l||ctl.r;
    const sprinting = ctl.sprint && this.hunger>1 && this.stamina>0 && !this.crouched;
    let speed = flying ? (ctl.sprint?16:8) : (sprinting ? 7.0 : this.crouched?2.0:4.3);
    if(this.inWater) speed*=this.pod?2.8:this.boat?2.4:0.6;   // pod > boat > swimming
    if(this.frozen && !flying) speed*=0.7;   // stiff, cold limbs
    if(this.effects.speed && !flying) speed*=1.3;
    // stamina: drains while actually sprinting, regenerates otherwise (faster
    // when standing still than just walking, like catching your breath)
    if(!flying && mode!=='spectator'){
      if(sprinting && moving) this.stamina=Math.max(0,this.stamina-dt*10);
      else this.stamina=Math.min(this.maxStamina, this.stamina+(moving?dt*6:dt*12));
    }
    // sprint = loud footfalls; emit a small noise every ~1.4s of sustained sprint so
    // hostiles without LOS still hear you (crouch/walk to stay quiet). Throttled, not per-frame.
    if(sprinting && moving){
      this._sprintNoiseT=(this._sprintNoiseT||0)+dt;
      if(this._sprintNoiseT>=1.4){ this._sprintNoiseT=0; sprintNoise=true; }
    } else this._sprintNoiseT=0;

    const accel = flying?22:(this.onGround?40:8);
    this.vel.x += (wx*speed - this.vel.x)*Math.min(1,accel*dt);
    this.vel.z += (wz*speed - this.vel.z)*Math.min(1,accel*dt);

    // vertical
    if(flying){
      const vsp=ctl.sprint?16:8;
      const vy=ctl.jump?vsp:ctl.crouch?-vsp:0;
      this.vel.y += (vy-this.vel.y)*Math.min(1,22*dt);
      this.onGround=false;
    } else if(this.inWater){
      if(this.pod){
        // diving pod: full 3D control — Space rises, crouch dives, neutral hovers
        const wantY = ctl.jump?3.2 : ctl.crouch?-3.2 : 0;
        this.vel.y += (wantY - this.vel.y)*Math.min(1,8*dt);
      } else if(this.boat){
        // boat buoyancy: rise while the hull is submerged, settle at the surface
        const hullWet=isWet(this.world.getBlock(Math.floor(this.pos.x),Math.floor(this.pos.y+0.55),Math.floor(this.pos.z)));
        this.vel.y += ((hullWet?3.0:-1.4) - this.vel.y)*Math.min(1,8*dt);
      } else {
        this.vel.y += (-2 - this.vel.y)*Math.min(1,4*dt);   // sink slowly
        if(ctl.jump) this.vel.y = 3.2;                       // swim up
      }
    } else if(this.onLadder){
      this.vel.y = ctl.jump?3: ctl.crouch?-3: (ctl.f||ctl.b?1.6:-0.6);
    } else {
      this.vel.y -= 26*this.gravScale*dt;
      if(this._jumpBuffer>0 && this._coyote>0){ this.vel.y=8.2; this.onGround=false; this._jumpBuffer=0; this._coyote=0; Audio.play('jump'); }
    }
    this.vel.y=clamp(this.vel.y,-40,40);

    if(noclip){
      this.pos.x+=this.vel.x*dt; this.pos.y+=this.vel.y*dt; this.pos.z+=this.vel.z*dt;
      return { fellHard:0, landed:false };
    }

    // integrate with substeps to avoid tunnelling
    const steps=Math.max(1, Math.ceil(Math.max(Math.abs(this.vel.x),Math.abs(this.vel.y),Math.abs(this.vel.z))*dt/0.4));
    const sdt=dt/steps; let fellHard=0;
    for(let s=0;s<steps;s++){
      // X
      let nx=this.pos.x+this.vel.x*sdt;
      if(!this.collides(nx,this.pos.y,this.pos.z)){
        // crouch edge-guard: sneaking never walks off a ledge
        if(!flying && ctl.crouch && this.onGround && !this.collides(nx,this.pos.y-0.1,this.pos.z)) this.vel.x=0;
        else this.pos.x=nx;
      }
      else if(!this._tryStep('x',nx)){
        // auto-jump: a 1-block step is already handled smoothly by _tryStep
        // above with no jump needed — this only fires for a TALLER obstacle
        // (can't step) that a jump arc could still clear, so walking into a
        // ledge hops you up it instead of just stopping dead
        if(this.autoJump && this.onGround && (wx||wz) && !this.collides(nx,this.pos.y+1.2,this.pos.z)) this.vel.y=8.2;
        else this.vel.x=0;
      }
      // Z
      let nz=this.pos.z+this.vel.z*sdt;
      if(!this.collides(this.pos.x,this.pos.y,nz)){
        if(!flying && ctl.crouch && this.onGround && !this.collides(this.pos.x,this.pos.y-0.1,nz)) this.vel.z=0;
        else this.pos.z=nz;
      }
      else if(!this._tryStep('z',nz)){
        if(this.autoJump && this.onGround && (wx||wz) && !this.collides(this.pos.x,this.pos.y+1.2,nz)) this.vel.y=8.2;
        else this.vel.z=0;
      }
      // Y
      let ny=this.pos.y+this.vel.y*sdt;
      if(!this.collides(this.pos.x,ny,this.pos.z)){ this.pos.y=ny; this.onGround=false; }
      else {
        if(this.vel.y<0){ this.onGround=true; if(this.vel.y<-16) fellHard=-this.vel.y; }
        this.vel.y=0;
      }
    }
    return { fellHard, sprintNoise, landed:!wasGround&&this.onGround };
  }
  _tryStep(axis, target){
    // auto step-up over 1 block when grounded; a second, taller try handles
    // consecutive stair treads (standing on a half-block, next tread 1.0 higher)
    if(!this.onGround) return false;
    for(const rise of [0.6, 1.02]){
      if(rise>0.7){
        const fr=this.pos.y-Math.floor(this.pos.y);
        if(fr<0.4||fr>0.6) break;   // only when standing on a half-height top (stair/slab)
      }
      const up=this.pos.y+rise;
      if(this.collides(this.pos.x,up,this.pos.z)) continue;
      if(axis==='x' && !this.collides(target,up,this.pos.z)){ this.pos.x=target; this.pos.y=up; return true; }
      if(axis==='z' && !this.collides(this.pos.x,up,target)){ this.pos.z=target; this.pos.y=up; return true; }
    }
    return false;
  }
}

/* =====================================================================
   Mob — simple FSM critter built from boxes.
   ===================================================================== */
const MOB_DEF = {
  grazer:{hp:10,speed:1.4,hostile:false,warm:true,drop:[['raw_meat',1],['wool',1]],sense:6},
  clucker:{hp:5,speed:1.6,hostile:false,warm:true,drop:[['raw_meat',1],['egg',1]],sense:6},
  snuffler:{hp:8,speed:1.5,hostile:false,warm:true,drop:[['raw_meat',2]],sense:6},
  shade:{hp:14,speed:2.4,hostile:true,dmg:4,drop:[['fiber',1]],sense:16,burns:true,nocturnal:true},
  spitter:{hp:10,speed:1.6,hostile:true,dmg:3,ranged:true,drop:[['fiber',1]],sense:14},
  burrower:{hp:6,speed:3.0,hostile:true,dmg:2,drop:[['coal',1]],sense:12},
  brute:{hp:40,speed:1.5,hostile:true,dmg:8,drop:[['iron_raw',2],['crystal',1]],sense:14,collisionRadius:0.48},
  settler:{hp:20,speed:1.3,hostile:false,settler:true,sense:8},
  fish:{hp:3,speed:1.2,hostile:false,aquatic:true,drop:[['raw_fish',1]],sense:5},
  gelcube:{hp:12,speed:1.1,hostile:true,dmg:5,drop:[['gel',2]],sense:12},
  frostling:{hp:8,speed:1.6,hostile:false,drop:[['raw_meat',1],['wool',1]],sense:6,biome:'snow'},
  sandskink:{hp:6,speed:2.2,hostile:false,drop:[['raw_meat',1]],sense:6,biome:'desert'},
  hopper:{hp:4,speed:1.9,hostile:false,warm:true,drop:[['raw_meat',1],['leather',1]],sense:7},
  crawler:{hp:12,speed:2.0,hostile:true,dmg:4,drop:[['fiber',1],['gel',1]],sense:14,nocturnal:true,burns:true},
  dog:{hp:10,speed:2.0,hostile:false,warm:true,pet:true,drop:[],sense:10},
  cat:{hp:6,speed:1.8,hostile:false,warm:true,pet:true,drop:[],sense:10},
  wisp:{hp:10,speed:1.8,hostile:true,dmg:4,drop:[['crystal',1],['gel',1]],sense:20,teleport:true,nocturnal:true},
  bomber:{hp:8,speed:1.6,hostile:true,dmg:10,drop:[['gel',2]],sense:10,explode:true},
  guard:{hp:30,speed:1.9,hostile:false,dmg:6,drop:[],sense:14,guardian:true},
  // Aethon natives — spawn only in the planet dimension (see spawnMobs)
  skitter:{hp:6,speed:2.1,hostile:false,drop:[['alien_alloy',1]],sense:8,alien:true},
  alien_scout:{hp:14,speed:2.5,hostile:true,dmg:4,drop:[['space_shard',1]],sense:16,alien:true},
  alien_brute:{hp:34,speed:1.6,hostile:true,dmg:8,drop:[['space_shard',2],['alien_alloy',1]],sense:13,alien:true,collisionRadius:0.58},
  // Aethon civilization — nobles live at outposts; the ruler is neutral until any alien is harmed
  alien_noble:{hp:24,speed:1.3,hostile:false,alien:true,noble:true,drop:[['alien_alloy',1]],sense:8},
  alien_ruler:{hp:140,speed:2.0,hostile:false,alien:true,ruler:'alien',dmg:10,drop:[['void_heart',1],['alien_alloy',3],['space_shard',2]],sense:20,collisionRadius:0.62},
  // the deep — serpents guard the sea lair; the Tide Lord rules them, neutral until provoked
  sea_serpent:{hp:22,speed:2.8,hostile:true,aquatic:true,seaCreature:true,dmg:5,drop:[['gel',2],['abyss_pearl',1]],sense:15},
  // humanoid fish warrior — the Drowned King's city guard; neutral until the deep is provoked
  tide_guard:{hp:26,speed:2.4,aquatic:true,seaCreature:true,dmg:6,drop:[['deep_scale',1],['abyss_pearl',1]],sense:16},
  tide_lord:{hp:160,speed:2.4,aquatic:true,seaCreature:true,ruler:'sea',dmg:11,drop:[['tide_heart',1],['ocean_crystal',2],['abyss_pearl',4]],sense:20,collisionRadius:0.58},
  // rideable plains runner — tame with an apple, then F to mount
  strider:{hp:16,speed:2.0,hostile:false,warm:true,mount:true,drop:[['leather',2]],sense:8},
  // sure-footed mountain grazer — only lives on high stone slopes
  craghorn:{hp:12,speed:1.8,hostile:false,biome:'mountain',drop:[['leather',2],['raw_meat',1]],sense:7},
  // the GRAVEMAW — hulking cave horror that wakes near miners' caches deep below
  gravemaw:{hp:80,speed:1.7,hostile:true,dmg:8,drop:[['diamond',1],['emerald',2],['crystal',3],['sunstone',1]],sense:15,collisionRadius:0.72},
};
class Mob {
  constructor(kind, x,y,z){
    const d=MOB_DEF[kind];
    this.kind=kind; this.def=d; this.hp=d.hp; this.maxhp=d.hp;
    this.pos=new THREE.Vector3(x,y,z); this.vel=new THREE.Vector3();
    this.state='idle'; this.yaw=Math.random()*6.28; this.timer=0; this.atkCd=0; this.onGround=false;
    this.group=mobModel(kind); this.height=this.group.userData.h||1.0; this.radius=d.collisionRadius||0.3;
    this._emiMats=[]; const seen=new Set(); this.group.traverse(o=>{ const mats=Array.isArray(o.material)?o.material:[o.material]; for(const mat of mats){ if(!mat||!mat.emissive||seen.has(mat)) continue; seen.add(mat); this._emiMats.push({mat,base:mat.emissive.getHex()}); } });
    this.anim=0; this.home=null; this.fleeT=0; this.lastSeen=null; this.alarmCd=0; this.persistent=!!d.settler||!!d.pet||!!d.guardian;
  }
}

/* =====================================================================
   Game — owns scene, world, player, mobs, drops, particles, and all
   high-level actions (break/place/interact/attack/craft/...).
   ===================================================================== */
// Save format versioning. serialize() stamps the current version; load() runs migrate() to
// upgrade older saves in-place. To change the schema: bump SAVE_VER and add a migration
// `SAVE_MIGRATIONS[OLD] = (save)=>{...}` that transforms an OLD-schema save into the next.
// Unversioned saves are treated as v1 and migrated to the current schema.
const SAVE_VER = 3;
const SAVE_MIGRATIONS = {
  1:s=>{
    const finite=(v,d)=>Number.isFinite(+v)?+v:d;
    s.player=s.player&&typeof s.player==='object'?s.player:{};
    const p=s.player;
    p.x=finite(p.x,0.5); p.y=finite(p.y,SEA_LEVEL+2); p.z=finite(p.z,0.5);
    p.yaw=finite(p.yaw,0); p.pitch=clamp(finite(p.pitch,0),-1.55,1.55);
    p.hp=clamp(finite(p.hp,20),1,20); p.hunger=clamp(finite(p.hunger,20),0,20);
    p.spawn=p.spawn&&Number.isFinite(+p.spawn.x)&&Number.isFinite(+p.spawn.y)&&Number.isFinite(+p.spawn.z)
      ?p.spawn:{x:p.x,y:p.y,z:p.z};
    p.sel=clamp(finite(p.sel,0)|0,0,8);
    p.armor=p.armor&&typeof p.armor==='object'?p.armor:{head:null,chest:null,legs:null,feet:null};
    p.effects=p.effects&&typeof p.effects==='object'?p.effects:{};
    s.seed=finite(s.seed,1)>>>0; s.time=clamp(finite(s.time,0.30),0,1); s.day=Math.max(1,finite(s.day,1)|0);
    if(!['survival','creative','spectator'].includes(s.mode)) s.mode='survival';
    s.inv=Array.isArray(s.inv)?s.inv.slice(0,36):[]; while(s.inv.length<36) s.inv.push(null);
    s.deltas=s.deltas&&typeof s.deltas==='object'?s.deltas:{};
    s.meta=s.meta&&typeof s.meta==='object'?s.meta:{};
    s.chests=s.chests&&typeof s.chests==='object'?s.chests:{};
    s.furnaces=s.furnaces&&typeof s.furnaces==='object'?s.furnaces:{};
    s.milestones=s.milestones&&typeof s.milestones==='object'?s.milestones:{};
    s.journal=s.journal&&typeof s.journal==='object'?s.journal:{mobs:{},kills:{},biomes:{}};
    s.journal.mobs=s.journal.mobs||{}; s.journal.kills=s.journal.kills||{}; s.journal.biomes=s.journal.biomes||{};
    s.mobsP=Array.isArray(s.mobsP)?s.mobsP:[]; s.mobStash=s.mobStash&&typeof s.mobStash==='object'?s.mobStash:{};
    s.deaths=Math.max(0,finite(s.deaths,0)|0);
  },
  2:s=>{
    s.dropStash=s.dropStash&&typeof s.dropStash==='object'?s.dropStash:{};
  },
  // (no migrations yet — v1 is the baseline. Add `1: s=>{...}` then set SAVE_VER=2 when the
  // first real schema change lands, e.g. death-grave or persistent mob-state fields.)
};
class Game {
  constructor(container){
    this.container=container;
    this.renderer=new THREE.WebGLRenderer({antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,VOXHAVEN_VISUALS.renderer.maxPixelRatio));
    if(THREE.sRGBEncoding!==undefined) this.renderer.outputEncoding=THREE.sRGBEncoding;
    if(THREE.ACESFilmicToneMapping!==undefined){ this.renderer.toneMapping=THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure=VOXHAVEN_VISUALS.renderer.exposure; }
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{
      e.preventDefault();
      this._contextWasPaused=this.paused;
      this.paused=true;
      this.input.enabled=false;
      document.dispatchEvent(new CustomEvent('voxhaven:context',{detail:{lost:true}}));
    });
    this.renderer.domElement.addEventListener('webglcontextrestored',()=>{
      this._resize();
      this.paused=!!this._contextWasPaused;
      document.dispatchEvent(new CustomEvent('voxhaven:context',{detail:{lost:false}}));
    });
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.05, 1000);
    this.input=new Input();
    this.renderDist=4; this.sens=1.0; this.gfx='med'; this.fxQuality='med';
    this.chunkMeshes=new Map();        // ckey -> {opaque,cutout,blend, objects:[]}
    this.loadQueue=[]; this.dirty=new Set();
    this.mobs=[]; this.drops=[]; this.particles=[]; this.leafDecayQueue=[]; this.leafDecaySet=new Set(); this.treeFalls=[];
    this.time=0.30; this._clockPrev=this.time; // 0..1 day fraction (0.30 = morning)
    this.dayLen=600;                   // seconds per full day
    this.day=1; this.deaths=0; this.threat=0; this.paused=false; this.dead=false;
    this.selBlock=null;                // {x,y,z,nx,ny,nz}
    this.breakProg=0; this.breakTarget=null;
    this.attackCd=0;
    this.placeRotOverride=null;        // manual rotation for directional placeables (T key) — overrides auto-detect when set
    this.heldSwing=0;
    this.fishing=null;                 // {state:'waiting'|'biting', target:{x,y,z}, t, waitT, biteT, window}
    this.mode='survival';              // 'survival' | 'creative' | 'spectator'
    this.viewMode='first';             // 'first' | 'third'
    this._setupScene();
  }

  // ---------- scene / sky / lights ----------
  _setupScene(){
    // Basic (not Lambert): face brightness is already baked into vertex colors
    // (FACE_SHADE * sky in meshChunk/addFace). Real-time Lambert N·L on top of
    // that double-dims side faces whenever the sun sits near-vertical (N·L~0
    // for east/west normals), crushing every side face to near-black while
    // top faces (N·L~1) look fine — Basic ignores scene lights entirely.
    this.matOpaque=new THREE.MeshBasicMaterial({ map:ATLAS_TEX, vertexColors:true });
    this.matCutout=new THREE.MeshBasicMaterial({ map:ATLAS_TEX, vertexColors:true, alphaTest:0.5, side:THREE.DoubleSide });
    this.windUniform={ value:0 };
    this.matCutout.onBeforeCompile = (shader)=>{
      shader.uniforms.uTime=this.windUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec3 blockPos = floor(position + 0.5);\nvec3 radialUp = normalize(position + vec3(0.0001, 0.0001, 0.0001));\nvec3 windDir = normalize(cross(radialUp, vec3(0.37, 1.0, 0.22)));\nfloat windPhase = dot(blockPos, vec3(1.3, 0.17, 1.7));\nfloat wind = sin(uTime*1.6 + windPhase) * 0.06 * sway;\ntransformed += windDir * wind;');
    };
    this.matCutout.customProgramCacheKey = ()=> 'cutoutWind';
    this.matBlend =new THREE.MeshBasicMaterial({ map:ATLAS_TEX, vertexColors:true, transparent:true, opacity:0.88, depthWrite:false, side:THREE.DoubleSide });
    this.matBlend.onBeforeCompile = (shader)=>{
      shader.uniforms.uTime=this.windUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float water;\nvarying float vWater;\nvarying vec3 vWaterPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWater=water;\nvWaterPos=position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vWater;\nvarying vec3 vWaterPos;')
        .replace('#include <map_fragment>', '#include <map_fragment>\nif(vWater>0.5){\n  float waveA=sin(dot(vWaterPos.xz,vec2(0.42,0.57))+uTime*0.75);\n  float waveB=sin(dot(vWaterPos.xz,vec2(-0.68,0.31))-uTime*0.55);\n  float waveC=sin(dot(vWaterPos.xz,vec2(0.15,-0.20))+uTime*1.1)*0.5;\n  float shimmer=(waveA+waveB+waveC)*0.3;\n  diffuseColor.rgb*=0.92+shimmer*0.07;\n  diffuseColor.rgb+=vec3(0.025,0.06,0.08)*(shimmer*0.5+0.5);\n  float glint=pow(max(0.0,shimmer),8.0);\n  diffuseColor.rgb+=vec3(0.10,0.14,0.18)*glint;\n  diffuseColor.a=min(0.95,diffuseColor.a*1.08);\n}');
      this.matBlend.userData.shader=shader;
    };
    this.matBlend.customProgramCacheKey = ()=> 'blendWaterShimmer4';
    // ice: subtly translucent but NOT the water/glass blend material — that one
    // uses depthWrite:false (needed so water sorts under other transparent
    // things), which is exactly what made ice look like broken see-through
    // glass cubes. depthWrite:true here keeps it reading as a solid frosted
    // slab with just a soft alpha hint, no z-fight/double-layer artifacts.
    // 0.94, not 0.82 — anything beneath ice is DARK (water/caves), so even 18%
    // bleed-through of near-black against a bright frosted tile reads as x-ray.
    // 6% gives a faint depth hint without revealing what's actually down there.
    this.matIce=new THREE.MeshBasicMaterial({ map:ATLAS_TEX, vertexColors:true, transparent:true, opacity:0.94, depthWrite:true });
    // Chunk surfaces use MeshBasicMaterial because directional shade and AO are
    // baked into their vertex colors. PointLights therefore cannot affect them,
    // so feed the existing four-light pool into a tiny additive shader instead.
    // This restores useful torch/cave lighting without the cost or double-shade
    // artifacts of switching every chunk to a realtime-lit material.
    this.localLightPos={value:Array.from({length:4},()=>new THREE.Vector4())};
    this.localLightColor={value:Array.from({length:4},()=>new THREE.Color())};
    const installLocalGlow=(mat,key)=>{
      const prior=mat.onBeforeCompile;
      mat.onBeforeCompile=(shader)=>{
        if(prior) prior(shader);
        shader.uniforms.uVoxLightPos=this.localLightPos;
        shader.uniforms.uVoxLightColor=this.localLightColor;
        shader.vertexShader=shader.vertexShader
          .replace('void main() {','varying vec3 vVoxWorldPos;\nvoid main() {')
          .replace('#include <project_vertex>','#include <project_vertex>\nvVoxWorldPos=(modelMatrix*vec4(transformed,1.0)).xyz;');
        shader.fragmentShader=shader.fragmentShader
          .replace('void main() {','uniform vec4 uVoxLightPos[4];\nuniform vec3 uVoxLightColor[4];\nvarying vec3 vVoxWorldPos;\nvoid main() {')
          .replace('#include <alphamap_fragment>','#include <alphamap_fragment>\nfor(int i=0;i<4;i++){ float radius=uVoxLightPos[i].w; if(radius>0.0){ float glow=max(0.0,1.0-distance(vVoxWorldPos,uVoxLightPos[i].xyz)/radius); diffuseColor.rgb+=uVoxLightColor[i]*glow*glow*0.24; } }');
      };
      const priorKey=mat.customProgramCacheKey;
      mat.customProgramCacheKey=()=>`${priorKey?priorKey.call(mat):''}-${key}`;
    };
    installLocalGlow(this.matOpaque,'localGlow2');
    installLocalGlow(this.matCutout,'localGlow2');
    installLocalGlow(this.matBlend,'localGlow2');
    installLocalGlow(this.matIce,'localGlow2');

    this.hemi=new THREE.HemisphereLight(0xbfd8ff, 0x4a4636, 0.8); this.scene.add(this.hemi);
    this.sun=new THREE.DirectionalLight(0xfff2cc, 1.0); this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.ambient=new THREE.AmbientLight(0x33384a, 0.5); this.scene.add(this.ambient);

    // fog only hazes the LAST stretch before the render edge — starting it at
    // ~24 blocks washed half the visible world to pale blue and made solid
    // terrain look ghostly/see-through. Near/far are kept in sync with render
    // distance every frame in updateSky().
    this.scene.fog=new THREE.Fog(VOXHAVEN_VISUALS.overworld.fogDay, this.renderDist*CHUNK_X*0.62, this.renderDist*CHUNK_X*0.98);
    this.scene.background=new THREE.Color(VOXHAVEN_VISUALS.overworld.fogDay);
    this._skyDay=new THREE.Color(VOXHAVEN_VISUALS.overworld.skyDay);
    this._skyNight=new THREE.Color(VOXHAVEN_VISUALS.overworld.skyNight);
    this._skyDusk=new THREE.Color(VOXHAVEN_VISUALS.overworld.skyDawn);
    this._skyColor=new THREE.Color();
    this._underwaterColor=new THREE.Color(VOXHAVEN_VISUALS.overworld.waterDeep);
    this._underwaterDeepColor=new THREE.Color(0x061822);
    this._underwaterMood=new THREE.Color();
    this._underwaterTint=new THREE.Color(0x78aeb7);
    this._caveColor=new THREE.Color(0x0b1017);
    this._caveTint=new THREE.Color(0x9aa1ad);

    // sun & moon billboards — soft radial-gradient glow discs, immune to fog
    // (they sit ~100 units out, which is past the daytime fog.far, so without
    // fog:false they'd silently blend into a flat fog-colored square)
    const glowTex=(inner,outer)=>{ const c=document.createElement('canvas'); c.width=c.height=64; const ctx=c.getContext('2d');
      const g=ctx.createRadialGradient(32,32,2,32,32,32); g.addColorStop(0,inner); g.addColorStop(0.55,inner); g.addColorStop(1,outer);
      ctx.fillStyle=g; ctx.fillRect(0,0,64,64); return crispTexture(new THREE.CanvasTexture(c)); };
    const sunMat=new THREE.SpriteMaterial({ map:glowTex('rgba(255,248,222,1)','rgba(255,238,180,0)'), transparent:true, depthWrite:false, fog:false });
    this.sunSprite=new THREE.Sprite(sunMat); this.sunSprite.scale.set(22,22,1); this.scene.add(this.sunSprite);
    const moonMat=new THREE.SpriteMaterial({ map:glowTex('rgba(238,242,250,1)','rgba(210,220,235,0)'), transparent:true, depthWrite:false, fog:false });
    this.moonSprite=new THREE.Sprite(moonMat); this.moonSprite.scale.set(15,15,1); this.scene.add(this.moonSprite);
    // stars — full hemisphere of them, faint color variation, so the night sky
    // (where the distant planet hangs) reads as a real starfield, not a few dots
    const sg=new THREE.BufferGeometry(); const sp=[], scol=[];
    for(let i=0;i<1500;i++){ const y=Math.random()*1.0-0.05, theta=Math.random()*Math.PI*2, r=Math.sqrt(Math.max(0,1-y*y));
      sp.push(r*Math.cos(theta)*400, Math.abs(y)*400, r*Math.sin(theta)*400);
      const t=Math.random(); scol.push(0.7+t*0.3, 0.75+t*0.25, 0.85+t*0.15); } // bluish-white twinkle
    sg.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));
    sg.setAttribute('color',new THREE.Float32BufferAttribute(scol,3));
    this.stars=new THREE.Points(sg,new THREE.PointsMaterial({ size:1.8, vertexColors:true, transparent:true, opacity:0 })); this.scene.add(this.stars);

    // torch/lantern point-light pool
    this.lightPool=[]; for(let i=0;i<10;i++){ const L=new THREE.PointLight(0xffb24d,0,9,2); L.visible=false; this.scene.add(L); this.lightPool.push(L); }

    // selection outline
    const eg=new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002,1.002,1.002));
    this.selBox=new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color:VOXHAVEN_VISUALS.effects.selectionOutline })); this.selBox.visible=false; this.scene.add(this.selBox);
    // fishing line (string cast to water target)
    const flg=new THREE.BufferGeometry();
    flg.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0], 3));
    this.fishLine=new THREE.Line(flg, new THREE.LineBasicMaterial({ color:0xc8b88a }));
    this.fishLine.visible=false; this.scene.add(this.fishLine);
    // break progress overlay
    this.crackBox=new THREE.Mesh(new THREE.BoxGeometry(1.01,1.01,1.01), new THREE.MeshBasicMaterial({ map:crackTexture(0), color:0xffffff, transparent:true, opacity:0, depthWrite:false })); this.crackBox.visible=false; this.scene.add(this.crackBox);
    // Hytale-style progressive destruction: dark "bite" chunks appear on the
    // block as it takes damage, each new bite shedding debris that falls off.
    this._biteG=new THREE.Group(); this._biteG.visible=false; this.scene.add(this._biteG);
    const biteGeo=new THREE.BoxGeometry(1,1,1);
    for(let i=0;i<9;i++){ const m=new THREE.Mesh(biteGeo,new THREE.MeshBasicMaterial({color:0x17130e,transparent:true,opacity:0.94,depthWrite:false}));
      m.visible=false; this._biteG.add(m); }
    this._biteStage=0; this._biteKey=null;

    // held item viewmodel (sprite attached to camera)
    // held item viewmodel: a real 3D hand/forearm holding the item icon, not
    // a disembodied HUD sprite — gives it depth/parallax as you move
    this.heldGroup=new THREE.Group(); this.heldGroup.position.set(0.46,-0.46,-1.12); this.heldGroup.scale.setScalar(0.76); this.heldGroup.renderOrder=999; this.camera.add(this.heldGroup); this.scene.add(this.camera);
    // transparent:true (opacity 1) just moves this into the transparent render
    // pass, which always runs AFTER the opaque pass — without it, water's
    // own transparent pass draws over the hand later regardless of
    // renderOrder/depthTest (those only reorder within one pass).
    const handMat=new THREE.MeshLambertMaterial({ color:0xd8b48a, depthTest:false, transparent:true, opacity:1 });
    const sleeveMat=new THREE.MeshLambertMaterial({ color:0xb85f2e, depthTest:false, transparent:true, opacity:1 });
    this.heldHand=new THREE.Group(); this.heldHand.renderOrder=999; this.heldGroup.add(this.heldHand);
    const sleeve=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.14,0.48), sleeveMat); sleeve.position.set(0.02,-0.06,0.08); sleeve.rotation.z=-0.22; sleeve.renderOrder=997; this.heldHand.add(sleeve);
    const hand=new THREE.Mesh(new THREE.BoxGeometry(0.13,0.13,0.16),handMat); hand.position.set(-0.035,-0.045,-0.22); hand.rotation.z=-0.22; hand.renderOrder=998; this.heldHand.add(hand);
    this.heldSprite=new THREE.Sprite(new THREE.SpriteMaterial({ depthTest:false, transparent:true })); this.heldSprite.scale.set(0.34,0.34,1); this.heldSprite.position.set(0,0.1,-0.05); this.heldSprite.renderOrder=1001; this.heldGroup.add(this.heldSprite);
    this.heldModel=new THREE.Group(); this.heldModel.renderOrder=999; this.heldGroup.add(this.heldModel);
    this.heldModelItem=null;
    this.heldSpriteItem=null;
    this.heldIconCache={};

    // third-person player body (hidden while in first-person view)
    this.playerBody=mobModel('player'); ProductionAssets.mount('explorer',this.playerBody,{replace:true,scale:0.6}); this.playerBody.visible=false; this.scene.add(this.playerBody);
    this._profileReady=VoxhavenProfileAssets.load().then((kit)=>{
      window.__voxhavenAssetStatus.loaded=true;
      window.__voxhavenAssetStatus.physics=!!kit.physics?.playerCollider;
      const fallback=()=>{
        if(this.playerBody?.userData?.productionAssetMounted){ window.__voxhavenAssetStatus.attached=true; return; }
        const obj=kit.clone(0.6);
        if(obj&&this.playerBody){ this.playerBody.add(obj); this.playerBody.userData.profileAssetMounted=true; window.__voxhavenAssetStatus.attached=true; window.__voxhavenAssetStatus.fallback=true; }
      };
      setTimeout(fallback,1800);
    }).catch(error=>{ window.__voxhavenAssetStatus.error=String(error?.message||error); });

    // space-age module hook: builds the distant planet / sky bodies, sets up
    // dimension + oxygen state. Defined in js/space.js (optional — guarded).
    if(this._initSpace) this._initSpace();
    if(this._initRocket) this._initRocket();   // js/rocket.js — launch + flight sim

    addEventListener('resize',()=>this._resize()); this._resize();
    this._initBloom();
  }
  _resize(){ this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth,innerHeight); if(this._composer){ try{ this._composer.setSize(innerWidth,innerHeight); }catch(e){} } }
  applyGraphics(gfx){
    this.gfx=['low','med','high'].includes(gfx)?gfx:'med';
    this._pixelCap=this.gfx==='low'?1:this.gfx==='high'?2:1.5;
    this._adaptiveScale=Number.isFinite(this._adaptiveScale)?this._adaptiveScale:1;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,this._pixelCap)*this._adaptiveScale);
    if(this._bloom) this._bloom.strength=this.gfx==='low'?0.08:VOXHAVEN_VISUALS.effects.bloomStrength;
    this._resize();
  }
  setAdaptiveScale(scale){
    scale=clamp(Number.isFinite(+scale)?+scale:1,0.67,1);
    if(Math.abs(scale-(this._adaptiveScale||1))<0.01) return;
    this._adaptiveScale=scale;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,this._pixelCap||1.5)*scale);
    this._resize();
  }

  // ---------- world lifecycle ----------
  newWorld(seed, mode, noStartItems){
    if(this.world) this._clearWorldVisuals();
    this.mode=mode||'survival';
    this.world=new World(seed>>>0);
    this.world.genVer=4;   // biome-shaped trees, terrain transitions, and ground dressing; old saves keep their terrain version
    this.player=new Player(this.world);
    const kitRadius=VoxhavenProfileAssets.physics?.playerCollider?.radius;
    if(Number.isFinite(kitRadius)) this.player.HW=Math.max(0.3,Math.min(0.48,kitRadius*0.42));
    this.milestones={}; this.journal={mobs:{},kills:{},biomes:{}};
    this._initInventory(noStartItems);
    this._spawnPlayerSafely(0,0);
    this.time=0.30; this._clockPrev=this.time; this.day=1; this.deaths=0; this.threat=0; this.dead=false;
    // reset space-age dimension state so a fresh world always starts on the
    // overworld with full oxygen (js/space.js — guarded).
    if(this._resetSpace) this._resetSpace(seed>>>0);
    if(this._resetRocket) this._resetRocket();   // js/rocket.js — clear any rocket/cockpit/flight flow
  }
  _clearWorldVisuals(){
    for(const entry of this.chunkMeshes.values()){
      for(const m of [entry.opaque,entry.cutout,entry.blend,entry.ice]) if(m){ this.scene.remove(m); m.geometry.dispose(); }
      for(const o of entry.objects||[]) this._disposeSpecialObject(o);
    }
    this.chunkMeshes.clear(); this.loadQueue.length=0; this.dirty.clear();
    for(const m of this.mobs){
      this.scene.remove(m.group);
      if(!(m.group.userData&&m.group.userData.productionAssetMounted)){
        const geos=new Set(),mats=new Set();
        m.group.traverse(o=>{ if(o.geometry) geos.add(o.geometry); if(o.material){ const list=Array.isArray(o.material)?o.material:[o.material]; for(const mat of list) if(mat&&!mat._shared) mats.add(mat); } });
        for(const g of geos) g.dispose(); for(const mat of mats) mat.dispose();
      }
    }
    this.mobs.length=0;
    for(const d of this.drops) d.projectile?this._disposeProjectile(d):this._disposeWorldDrop(d);
    this.drops.length=0;
    for(const f of this.treeFalls) this._disposeSpecialObject(f.group);
    this.treeFalls.length=0; this.leafDecayQueue.length=0; this.leafDecaySet.clear();
    for(const p of this.particles){ p.active=false; p.mesh.visible=false; }
    for(const pool of [this._emberPool,this._precip,this._shootPool]) if(pool) for(const p of pool){ p.active=false; p.mesh.visible=false; }
    if(this._boatMesh) this._boatMesh.visible=false;
    if(this._podMesh) this._podMesh.visible=false;
  }
  _initInventory(noStartItems){
    this.player.inv=new Array(36).fill(null);
    if(noStartItems){ this.player.sel=0; return; }
    if(this.mode==='creative'){
      // generous build kit — categorized for creative only
      // Food
      this.giveItem('apple',64); this.giveItem('bread',64); this.giveItem('cooked_meat',64); this.giveItem('cooked_fish',64);
      this.giveItem('baked_potato',64); this.giveItem('cooked_carrot',64); this.giveItem('cooked_tomato',64);
      this.giveItem('cookie',64); this.giveItem('pumpkin_pie',64); this.giveItem('melon_slice',64); this.giveItem('cooked_beetroot',64); this.giveItem('mushroom_stew',64);
      this.giveItem('beetroot_soup',64); this.giveItem('golden_carrot',64); this.giveItem('cooked_mutton',64); this.giveItem('golden_apple',64); this.giveItem('rotten_flesh',64);
      this.giveItem('cooked_pork',64); this.giveItem('cooked_rabbit',64); this.giveItem('rabbit_stew',64);
      // Tools
      for(const id of ['wood_pickaxe','wood_axe','wood_shovel','stone_pickaxe','iron_pickaxe','shears']) this.giveItem(id,1);
      this.giveItem('flint_and_steel',1); this.giveItem('flint',64);
      // Weapons
      for(const id of ['wood_sword','stone_sword','iron_sword','bow','arrow']) this.giveItem(id,64);
      // Blocks - Natural
      for(const id of ['grass','dirt','stone','sand','gravel','log','leaves','tallgrass','netherrack','glowstone','mycelium','soulsand','quartz','netherbrick','emerald','diamond','string']) this.giveItem(id,64);
      // Blocks - Building
      for(const id of ['planks','cobble','brick','stonebrick','sandstone','glass','wool','carpet','pumpkin','melon','emerald_block','diamond_block']) this.giveItem(id,64);
      // Blocks - Housing/Decor
      for(const id of ['chest','bench','furnace','door','ladder','fence','stairs','slab','bed','torch','lantern','bookshelf','cake']) this.giveItem(id,64);
      // Farming extras
      this.giveItem('wheat_seed',64); this.giveItem('potato_seed',64); this.giveItem('carrot_seed',64); this.giveItem('tomato_seed',64);
      this.giveItem('potato',64); this.giveItem('carrot',64); this.giveItem('wheat',64); this.giveItem('tomato',64);
      // Plants
      this.giveItem('sugarcane',64); this.giveItem('beetroot',64); this.giveItem('beetroot_seeds',64);
      this.giveItem('bowl',64);
    } else if(this.mode!=='spectator'){
      // starter kit so the survival loop is reachable
      this.giveItem('wood_pickaxe',1); this.giveItem('wood_axe',1);
      this.giveItem('torch',6);
    }
    this.player.sel=0;
  }
  _spawnPlayerSafely(wx,wz){
    // spiral out for DRY land: surfaceY() returns the solid lakebed even under
    // water, so the spot is only safe if the cell directly above the surface is
    // open air (not water) with headroom. Also require it to sit at/above sea
    // level so we never drop the player into a 1-deep puddle.
    let dryFallback=null, treeChecks=0;
    const hasTreeNearby=(sx,sz)=>{
      for(let dx=-32;dx<=32;dx++) for(let dz=-32;dz<=32;dz++){
        if(dx*dx+dz*dz>1024) continue;
        if(proceduralTreeAt(this.world,sx+dx,sz+dz)) return true;
      }
      return false;
    };
    for(let r=0;r<220;r++){
      const ang=r*2.39, x=Math.round(wx+Math.cos(ang)*r*0.85), z=Math.round(wz+Math.sin(ang)*r*0.85);
      const y=this.world.surfaceY(x,z);
      if(y<SEA_LEVEL) continue;
      const above=this.world.getBlock(x,y+1,z);
      if(above===B.WATER || this.world.isSolid(x,y+1,z) || this.world.isSolid(x,y+2,z)) continue;
      if(!dryFallback) dryFallback={x,y,z};
      // Bound expensive terrain sampling on hostile/ocean-heavy seeds. The
      // first safe dry spot remains a guaranteed fallback after 24 checks.
      if(treeChecks++>=24 || !hasTreeNearby(x,z)) continue;
      this.player.setPos(x+0.5, y+1.02, z+0.5);
      if(!this.player.spawn) this.player.spawn={x:x+0.5,y:y+1.02,z:z+0.5};
      return;
    }
    if(dryFallback){
      const {x,y,z}=dryFallback;
      this.player.setPos(x+0.5,y+1.02,z+0.5);
      this.player.spawn={x:x+0.5,y:y+1.02,z:z+0.5};
      return;
    }
    // last resort (origin is deep ocean for 100+ blocks): lay a tiny dry pad
    const fy=Math.max(SEA_LEVEL, this.world.surfaceY(0,0));
    for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++){
      this.world.setBlock(dx,fy,dz,B.GRASS);
      for(let y=fy+1;y<=SEA_LEVEL+1;y++) if(this.world.getBlock(dx,y,dz)===B.WATER) this.world.setBlock(dx,y,dz,B.AIR);
    }
    this.player.setPos(0.5, fy+1.1, 0.5);
    this.player.spawn={x:0.5,y:fy+1.1,z:0.5};
  }
  respawn(){
    this.dead=false;
    if(this.dimension!=='overworld'&&this.travelTo){ this.travelTo('overworld'); this.oxygen=this.oxygenMax||10; }
    this.player.health=this.player.maxHealth; this.player.hunger=this.player.maxHunger;
    this.player.warmth=this.player.maxWarmth; this.player.saturation=5; this.player.stamina=this.player.maxStamina;
    this.player.effects={}; this.player.frozen=false; this.player.inWater=false; this.player.boat=false; this.player.pod=false; this.player.mount=null;
    this._queasyT=0; this._frostLevel=0; this._airT=0; this._lastAirMax=null; this.fishing=null;
    this._recoveryUntil=performance.now()+45000; this.threat=Math.min(this.threat||0,0.18);

    const s=this.player.spawn;
    this._spawnPlayerSafely(s?Math.floor(s.x):0,s?Math.floor(s.z):0);
  }

  // ---------- inventory helpers ----------
  _sanitizeStack(s,armorSlot=null){
    if(!s||typeof s!=='object'||!ITEMS[s.item]) return null;
    const it=ITEMS[s.item];
    if(armorSlot&&it.armorSlot!==armorSlot) return null;
    const raw=Math.floor(+s.count); if(!Number.isFinite(raw)||raw<=0) return null;
    const clean={item:s.item,count:Math.min(it.max||99,raw)};
    if(it.dur&&s.dur!=null){ const dur=Math.floor(+s.dur); if(!Number.isFinite(dur)||dur<=0) return null; clean.dur=clamp(dur,1,it.dur); }
    return clean;
  }
  giveItem(id,count){
    if(!ITEMS[id]||count<=0) return 0;
    const max=ITEMS[id].max||99; const inv=this.player.inv;
    // merge into existing stacks
    for(let i=0;i<inv.length && count>0;i++){ const s=inv[i]; if(s&&s.item===id&&s.count<max){ const add=Math.min(max-s.count,count); s.count+=add; count-=add; } }
    for(let i=0;i<inv.length && count>0;i++){ if(!inv[i]){ const add=Math.min(max,count); inv[i]={item:id,count:add}; count-=add; } }
    return count; // leftover (0 if all fit)
  }
  countItem(id){ let n=0; for(const s of this.player.inv) if(s&&s.item===id) n+=s.count; return n; }
  takeItem(id,count){ const inv=this.player.inv; for(let i=0;i<inv.length&&count>0;i++){ const s=inv[i]; if(s&&s.item===id){ const t=Math.min(s.count,count); s.count-=t; count-=t; if(s.count<=0) inv[i]=null; } } return count===0; }
  _canFitAfterCost(need,outId,outCount){
    const inv=this.player.inv.map(s=>s?{item:s.item,count:s.count}:null);
    for(const [id,total] of need||[]){ let left=total; for(let i=0;i<inv.length&&left>0;i++){ const s=inv[i]; if(s&&s.item===id){ const n=Math.min(left,s.count); s.count-=n; left-=n; if(s.count<=0) inv[i]=null; } } }
    const max=(ITEMS[outId]&&ITEMS[outId].max)||99; let room=0;
    for(const s of inv) room+=!s?max:s.item===outId?Math.max(0,max-s.count):0;
    return room>=outCount;
  }
  selItem(){ const s=this.player.inv[this.player.sel]; return s?ITEMS[s.item]:null; }

  // ---------- targeting ----------
  _updateTarget(){
    const t=this._targetScratch||(this._targetScratch={dir:new THREE.Vector3(),origin:new THREE.Vector3(),turn:new THREE.Euler(0,0,0,'YXZ'),hit:{}});
    t.turn.set(this.player.pitch,this.player.yaw,0,'YXZ');
    const dir=t.dir.set(0,0,-1).applyEuler(t.turn);
    const origin=t.origin.set(this.player.pos.x,this.player.pos.y+(this.player.viewEye||this.player.eye),this.player.pos.z);
    const w=this.world;
    const select=this._targetSelector||(this._targetSelector=(x,y,z)=>{ const world=this.world, id=world.getBlock(x,y,z); if(id&&id!==B.WATER) return true; return id===B.AIR&&isDoorId(world.getBlock(x,y-1,z)); });
    // doors render a full ~2-tall leaf inside ONE voxel cell, so the upper
    // half (eye-level, the most natural place to aim) is open air over the
    // actual solid cell — let the ray also catch that air and redirect down
    const hit=raycastVoxel(origin,dir,6,select,t.hit);
    if(hit.hit){
      // the face normal still belongs to the air cell we just stepped down
      // from — ny in particular is stale and, left alone, makes place()
      // compute "one cell above this door" as the target, stacking a second
      // door leaf right on top of the first (the warped-tall door bug)
      if(w.getBlock(hit.x,hit.y,hit.z)===B.AIR){ hit.y-=1; hit.ny=0; }
      this.selBlock=hit; this.selBox.visible=true; this.selBox.position.set(hit.x+0.5,hit.y+0.5,hit.z+0.5);
    }
    else { this.selBlock=null; this.selBox.visible=false; this.crackBox.visible=false; this.breakTarget=null; this.breakProg=0; }
  }

  // ---------- break / place / interact ----------
  breakSpeed(blockId, itemDef){
    const b=BLOCKS[blockId];
    // tier-locked blocks barely budge without the right tool tier — matches canHarvest()
    if(this.mode!=='creative' && !this.canHarvest(blockId,itemDef)) return 0.08;   // slow without the right tool, never zero — every block is breakable eventually
    let s=1/Math.max(0.05,b.hardness);
    if(b.tool && itemDef && itemDef.tool===b.tool) s*= (itemDef.speed||1)*1.5;  // Minecraft-like: wood super slow, copper ok, iron fast (some time on wood), crystal instant
    else if(itemDef && itemDef.tool) s*=1.05;
    return s; // blocks per second-ish
  }
  canHarvest(blockId, itemDef){ if(this.mode==='creative') return true; const b=BLOCKS[blockId]; if(b.tier<=0) return true; const tier=itemDef&&itemDef.tool===b.tool?itemDef.tier:0; return tier>=b.tier; }

  holdBreak(dt){
    if(this.mode==='spectator') return;
    if(!this.selBlock) { this.breakTarget=null; this.breakProg=0; this.crackBox.visible=false; return; }
    const {x,y,z}=this.selBlock; const id=this.world.getBlock(x,y,z);
    if(id===B.AIR){ return; }
    if(this.mode==='creative'){
      // holdBreak runs every frame the mouse stays down — without a one-shot
      // lock, holding the button for even 2-3 frames chain-mines straight
      // through several blocks instead of just the one under the crosshair.
      if(this._creativeMined) return;
      this._creativeMined=true;
      this._mine(x,y,z,id,this.selItem()); this.breakProg=0; this.breakTarget=null; this.crackBox.visible=false; return;
    }
    // mob attack takes priority handled in attack(); here purely mining
    const it=this.selItem();
    const b=BLOCKS[id];
    const key=x+','+y+','+z;
    if(this.breakTarget!==key){ this.breakTarget=key; this.breakProg=0; this._breakFxT=0; }
    // instant-break: trivial blocks (plants/torches) or crystal (tier 5) instantly like Minecraft diamond;
    // iron etc fast on wood but takes a little time. gated by canHarvest()
    if(this.canHarvest(id,it) && (b.hardness<=0.1 || (it && (it.tier||0)>=5) || (b.tool && it && it.tool===b.tool && (it.tier||0)>=(b.tier||0)+5))){
      this._mine(x,y,z,id,it);
      this.breakProg=0; this.breakTarget=null; this.crackBox.visible=false; return;
    }
    const t=this.breakSpeed(id,it)*dt;
    this.breakProg+=t;
    this._breakFxT=(this._breakFxT||0)-dt;
    if(this._breakFxT<=0){
      this._breakFxT=0.22+Math.random()*0.08; this.heldSwing=1;
      this._emitMaterialFx(id,x,y,z,'hit',{x:this.selBlock.nx||0,y:this.selBlock.ny||0,z:this.selBlock.nz||0});
    }
    const needed=1.0;
    // subtle crack shading under the bites (kept faint — the chunks carry the look)
    this.crackBox.visible=true; this.crackBox.position.set(x+0.5,y+0.5,z+0.5);
    const cstage=Math.min(7, Math.floor(this.breakProg/needed*8));
    if(this.crackBox.material.map!==crackTexture(cstage)){ this.crackBox.material.map=crackTexture(cstage); this.crackBox.material.needsUpdate=true; }
    this.crackBox.material.opacity=Math.min(0.35, this.breakProg/needed*0.35);
    // progressive chunk loss: each damage stage carves another piece off the
    // block and sheds falling debris of the block's material
    const stage=Math.min(9, Math.floor(this.breakProg/needed*10));
    this._updateBites(x,y,z,stage,id);
    if(this.breakProg>=needed){
      this._mine(x,y,z,id,it);
      this.breakProg=0; this.breakTarget=null; this.crackBox.visible=false; this._hideBites();
    }
  }
  // deterministic bite placement: hash of block coords + bite index picks a
  // corner/edge of the block, so the same block always crumbles the same way
  _updateBites(x,y,z,stage,id){
    const key=x+','+y+','+z;
    if(this._biteKey!==key){ this._biteKey=key; this._biteStage=0; for(const m of this._biteG.children) m.visible=false; }
    this._biteG.visible=stage>0; this._biteG.position.set(x+0.5,y+0.5,z+0.5);
    if(stage<=this._biteStage) return;
    const fx=MATERIAL_FX[blockMaterial(id)]||MATERIAL_FX.stone;
    for(let i=this._biteStage;i<stage&&i<9;i++){
      const h=(Math.imul(x*73856093^y*19349663^z*83492791^(i+1)*2654435761,2654435761)>>>0);
      const r=(n)=>((h>>>(n*5))&31)/31;               // 5-bit hash slices -> [0,1]
      const m=this._biteG.children[i];
      // bites hug corners/edges: snap two axes to a face, jitter the third
      const sx=r(0)<0.5?-1:1, sy=r(1)<0.5?-1:1, sz=r(2)<0.5?-1:1;
      const s=0.18+r(3)*0.2;                           // chunk size 0.18-0.38
      m.scale.set(s,s*(0.7+r(4)*0.6),s);
      m.position.set(sx*(0.51-s*0.35), sy*(0.51-s*0.35), sz*(0.51-s*0.35));
      m.rotation.set(0,r(5)*0.8,0);
      m.visible=true;
      // the newly-lost piece falls off: heavy, short-lived debris with gravity
      this._spawnParticles(x+0.5+m.position.x, y+0.5+m.position.y, z+0.5+m.position.z,
        fx.colors, 5, false, {point:true,spread:0.16,size:[0.05,0.13],speed:1.1,gravity:10,life:1.0,drift:0});
    }
    this._biteStage=stage;
  }
  _hideBites(){ if(this._biteG){ this._biteG.visible=false; for(const m of this._biteG.children) m.visible=false; } this._biteKey=null; this._biteStage=0; }
  cancelBreak(){ this.breakProg=0; this.breakTarget=null; this._breakFxT=0; this._creativeMined=false; if(this.crackBox) this.crackBox.visible=false; this._hideBites(); }
  // survival: physical hovering pickup (matches mob loot); creative: instant,
  // since you already have everything and walking over piles would be noise
  _dropOrGive(item,count,x,y,z){
    if(!item||count<=0) return;
    // creative: blocks just break — no drop on the floor, nothing added to the
    // inventory (you already have infinite blocks). Drops are survival-only.
    if(this.mode==='creative') return;
    for(let i=0;i<count;i++) this._spawnDrop(item,1,x+0.5,y+0.3,z+0.5);
  }
  // chopping the trunk doesn't make the canopy vanish instantly — any leaf
  // cube no longer within reach of ANY log gets queued to crumble a couple
  // seconds later, like a tree actually losing its support
  _scheduleLeafDecay(lx,ly,lz){
    for(let dx=-3;dx<=3;dx++)for(let dy=-2;dy<=3;dy++)for(let dz=-3;dz<=3;dz++){
      if(dx*dx+dy*dy+dz*dz>16) continue;
      const x=lx+dx,y=ly+dy,z=lz+dz;
      if(this.world.getBlock(x,y,z)!==B.LEAVES) continue;
      let supported=false;
      for(let sx=-3;sx<=3 && !supported;sx++)for(let sy=-3;sy<=3 && !supported;sy++)for(let sz=-3;sz<=3 && !supported;sz++){
        if(this.world.getBlock(x+sx,y+sy,z+sz)===B.LOG){ supported=true; }
      }
      if(!supported){ const k=this.world.bkey(x,y,z); if(!this.leafDecaySet.has(k)){ this.leafDecaySet.add(k); this.leafDecayQueue.push({x,y,z,k,t:8+Math.random()*14}); } }
    }
  }
  updateLeafDecay(dt){
    for(let i=this.leafDecayQueue.length-1;i>=0;i--){
      const e=this.leafDecayQueue[i]; e.t-=dt;
      if(e.t<=0){
        if(this.world.getBlock(e.x,e.y,e.z)===B.LEAVES){
          // natural decay is unreliable about drops, unlike a deliberate break
          if(Math.random()<0.06) this._dropOrGive('stick',1,e.x,e.y,e.z);
          if(Math.random()<0.03) this._dropOrGive('apple',1,e.x,e.y,e.z);
          if(Math.random()<0.1) this._dropOrGive('fiber',1,e.x,e.y,e.z);
          this.setBlock(e.x,e.y,e.z,B.AIR);
          this._spawnParticles(e.x,e.y,e.z,'#3f8a3a');
        }
        this.leafDecaySet.delete(e.k||this.world.bkey(e.x,e.y,e.z)); this.leafDecayQueue.splice(i,1);
      }
    }
  }
  _startTreeFall(x,y,z){
    const W=this.world;
    if(W.getBlock(x,y-1,z)===B.LOG || this.treeFalls.length>=3) return false;
    const logs=[]; for(let i=0;i<12&&W.getBlock(x,y+i,z)===B.LOG;i++) logs.push({x,y:y+i,z});
    if(logs.length<3) return false;
    const top=logs[logs.length-1].y, leaves=[];
    for(let dx=-3;dx<=3;dx++) for(let dy=-2;dy<=3;dy++) for(let dz=-3;dz<=3;dz++){
      if(leaves.length>=72 || dx*dx+dz*dz+dy*dy>15) continue;
      if(W.getBlock(x+dx,top+dy,z+dz)===B.LEAVES) leaves.push({x:x+dx,y:top+dy,z:z+dz});
    }
    if(leaves.length<6) return false;
    let dx=x-this.player.pos.x,dz=z-this.player.pos.z;
    if(Math.abs(dx)>=Math.abs(dz)){ dx=dx>=0?1:-1; dz=0; } else { dz=dz>=0?1:-1; dx=0; }
    for(let i=1;i<logs.length;i++) this.setBlock(logs[i].x,logs[i].y,logs[i].z,B.AIR);
    for(const p of leaves) this.setBlock(p.x,p.y,p.z,B.AIR);
    const group=new THREE.Group(), bark=M('#674126'), leaf=M('#426f35');
    for(let i=0;i<logs.length;i++) group.add(box(0.78,0.98,0.78,bark,0,i+0.5,0));
    group.add(box(2.8,1.5,2.8,leaf,0,logs.length-0.2,0)); group.add(box(1.9,1.5,1.9,leaf,0,logs.length+0.8,0));
    group.position.set(x+0.5,y,z+0.5); this.scene.add(group);
    this.treeFalls.push({group,x,y,z,dx,dz,count:logs.length,t:0,landed:false});
    this._spawnParticles(x+0.5,y+0.25,z+0.5,MATERIAL_FX.wood.colors,10,false,{point:true,size:MATERIAL_FX.wood.size,speed:2.5,gravity:8,life:0.9});
    return true;
  }
  _evacuateContainer(x,y,z,id){
    const k=this.world.bkey(x,y,z); let stacks=null;
    if(id===B.CHEST){ stacks=this.world.chests.get(k)||null; this.world.chests.delete(k); }
    else if(id===B.FURNACE){ const f=this.world.furnaces.get(k); stacks=f?[f.input,f.fuel,f.output]:null; this.world.furnaces.delete(k); }
    if(this.mode==='creative'||!stacks) return;
    for(const s of stacks) if(s&&ITEMS[s.item]&&s.count>0) this._spawnDrop(s.item,s.count,x+0.5,y+0.55,z+0.5);
  }
  _recoverOrphanContainers(){
    let recovered=0;
    const give=stacks=>{ for(const s of stacks||[]) if(s&&ITEMS[s.item]&&s.count>0){ this._giveOrDrop(s.item,s.count); recovered+=s.count; } };
    for(const [k,slots] of this.world.chests){ const override=this.world.deltas.get(k); if(override!=null&&override!==B.CHEST){ give(slots); this.world.chests.delete(k); } }
    for(const [k,f] of this.world.furnaces){ const override=this.world.deltas.get(k); if(override!=null&&override!==B.FURNACE){ give(f?[f.input,f.fuel,f.output]:null); this.world.furnaces.delete(k); } }
    if(recovered>0) this.onToast&&this.onToast('Recovered '+recovered+' item'+(recovered===1?'':'s')+' from removed storage');
  }
  updateTreeFalls(dt){
    for(let i=this.treeFalls.length-1;i>=0;i--){ const f=this.treeFalls[i]; f.t+=dt;
      const p=clamp(f.t/1.15,0,1), angle=(1-Math.pow(1-p,3))*Math.PI*0.5;
      f.group.rotation.z=-f.dx*angle; f.group.rotation.x=f.dz*angle;
      if(p<1) continue;
      this._disposeSpecialObject(f.group);
      const placed=Math.min(7,f.count), rot=f.dx?Math.PI*0.5:0;
      for(let n=0;n<placed;n++){
        const tx=f.x+f.dx*n,tz=f.z+f.dz*n,sy=this.world.surfaceY(tx,tz)+1;
        if(this.world.getBlock(tx,sy,tz)===B.AIR) this.setBlock(tx,sy,tz,B.FALLEN_LOG,{rot});
      }
      const ex=f.x+f.dx*(placed-1),ez=f.z+f.dz*(placed-1),ey=this.world.surfaceY(ex,ez)+1;
      this._spawnParticles(ex+0.5,ey+0.5,ez+0.5,MATERIAL_FX.leaves.colors,20,false,{point:true,size:MATERIAL_FX.leaves.size,speed:2.1,gravity:3,life:1.2,drift:1});
      if(Math.hypot(this.player.pos.x-ex,this.player.pos.z-ez)<1.5 && this.mode==='survival') this.hurtPlayer(3,new THREE.Vector3(ex,ey,ez));
      this.treeFalls.splice(i,1);
    }
  }
  _mine(x,y,z,id,it){
    const b=BLOCKS[id];
    // bed: break both halves
    if(id===B.BED || id===B.BED_FOOT){ this._removeBed(x,y,z); this._dropOrGive('bed',1,x,y,z); this._emitMaterialFx(id,x,y,z,'break'); return; }
    if(this.canHarvest(id,it)){
      if(b.drop){
        let n=b.dropCount||1;
        if(id===B.LEAVES) n=0;
        else if(it && it.tool===b.tool && b.tier>0){
          // a tool above the block's required tier yields bonus drops (ores, stone)
          const tierDiff=(it.tier||0)-(b.tier||0);
          if(tierDiff>0) n=Math.min(3, n+Math.floor(tierDiff*0.5));
        }
        this._dropOrGive(b.drop,n,x,y,z);
      }
      if(id===B.LEAVES && it && it.tool==='shears'){
        // shears cleanly harvest the canopy for fiber/wool instead of sticks
        this._dropOrGive('leaves',1,x,y,z);
        if(Math.random()<0.3) this._dropOrGive('fiber',1,x,y,z);
        if(Math.random()<0.15) this._dropOrGive('wool',1,x,y,z);
        if(this.mode!=='creative') this._damageTool();
      } else if(id===B.LEAVES){
        // apples used to be ~independently-rolled per leaf cube, and a tree
        // canopy is dozens of cubes — at 18% that meant almost every tree
        // guaranteed at least one. Dropped hard so apples feel like a find.
        if(Math.random()<0.1) this._dropOrGive('stick',1,x,y,z); if(Math.random()<0.04) this._dropOrGive('apple',1,x,y,z); if(Math.random()<0.25) this._dropOrGive('fiber',1,x,y,z);
      }
      if(id===B.TALLGRASS && Math.random()<0.4) this._dropOrGive('seeds',1,x,y,z);
      if(id===B.TALLGRASS){ if(Math.random()<0.06) this._dropOrGive('potato_seed',1,x,y,z); if(Math.random()<0.06) this._dropOrGive('carrot_seed',1,x,y,z); if(Math.random()<0.06) this._dropOrGive('wheat_seed',1,x,y,z); if(Math.random()<0.06) this._dropOrGive('tomato_seed',1,x,y,z); if(Math.random()<0.06) this._dropOrGive('sugarcane',1,x,y,z); if(Math.random()<0.06) this._dropOrGive('beetroot_seeds',1,x,y,z); }
      if(id===B.POTATO3){ this._dropOrGive('potato',1,x,y,z); if(Math.random()<0.5) this._dropOrGive('potato_seed',1,x,y,z); this._spawnParticles(x,y,z,'#c88a3a'); }
      if(id===B.CARROT3){ this._dropOrGive('carrot',1,x,y,z); if(Math.random()<0.5) this._dropOrGive('carrot_seed',1,x,y,z); this._spawnParticles(x,y,z,'#e07030'); }
      if(id===B.WHEAT3){ this._dropOrGive('wheat',1,x,y,z); if(Math.random()<0.5) this._dropOrGive('wheat_seed',1,x,y,z); this._spawnParticles(x,y,z,'#c9a23a'); }
      if(id===B.TOMATO3){ this._dropOrGive('tomato',1,x,y,z); if(Math.random()<0.5) this._dropOrGive('tomato_seed',1,x,y,z); this._spawnParticles(x,y,z,'#c03030'); }
      if(id===B.BEETROOT){ this._dropOrGive('beetroot',1,x,y,z); if(Math.random()<0.5) this._dropOrGive('beetroot_seeds',1,x,y,z); this._spawnParticles(x,y,z,'#8a2a2a'); }
    }
    // Storage state must leave with its block. Survival spills the contents;
    // creative intentionally clears them, but neither mode leaves an orphan map.
    if(id===B.CHEST||id===B.FURNACE) this._evacuateContainer(x,y,z,id);
    // tool durability (creative tools never wear)
    if(it&&it.tool&&it.tool===b.tool && this.mode!=='creative') this._damageTool();
    const falling=id===B.LOG&&this._startTreeFall(x,y,z);
    this.setBlock(x,y,z,B.AIR);
    if(id===B.LOG&&!falling) this._scheduleLeafDecay(x,y,z);
    this._emitMaterialFx(id,x,y,z,'break');
    this._noise(x+0.5, z+0.5, 12);   // mining is the loudest thing you do — carries through walls
    this._seedWaterFlow(x,y,z);
    this._collapseColumn(x,y,z);
  }
  _collapseColumn(x,y,z){
    // when the support under a stack is removed, the unattached solid blocks
    // directly above fall straight down into the gap (e.g. into a puddle below)
    const W=this.world;
    // ONLY loose blocks fall (sand/gravel/snow) — like Minecraft. Solid blocks
    // (stone, wood, etc.) stay put when you mine out their support.
    const GRAVITY={[B.SAND]:1,[B.GRAVEL]:1,[B.SNOW]:1};
    const stack=[];
    for(let ay=y+1; ay<WORLD_H; ay++){
      const id=W.getBlock(x,ay,z);
      if(!GRAVITY[id]) break;            // first non-loose block stops the fall
      stack.push(id);
    }
    if(!stack.length) return;
    // bottom of the stack is y+1; sink it while the cell below is passable
    // (air OR water — so it drops into a puddle and rests on the lakebed)
    let floorY=y+1;
    while(floorY>0){ const below=W.getBlock(x,floorY-1,z); if(below!==B.AIR && below!==B.WATER) break; floorY--; }
    if(floorY>=y+1) return;              // nothing to fall into
    for(let i=0;i<stack.length;i++) this.setBlock(x,y+1+i,z,B.AIR);
    for(let i=0;i<stack.length;i++) this.setBlock(x,floorY+i,z,stack[i]);
    this._spawnParticles(x,floorY,z,'#9a9a9a');
  }
  _settleNearbyWater(){
    // de-float water around the player: a water cell with AIR below falls one
    // step (water gravity); a lone raised cube (water below, all 4 sides air)
    // spills/merges down so it stops standing proud of the puddle. Bounded to a
    // small box around the player so it's cheap.
    const W=this.world;
    const px=Math.floor(this.player.pos.x), py=Math.floor(this.player.pos.y), pz=Math.floor(this.player.pos.z);
    const flowActive=W.flowHead<W.flowQueue.length||this._waterFlowChanged, key=px+','+py+','+pz;
    if(this._settleWorld===W&&this._settleKey===key&&!flowActive) return;
    this._settleWorld=W; this._settleKey=key; this._waterFlowChanged=false;
    const R=6; let changed=false;
    for(let dz=-R;dz<=R;dz++) for(let dx=-R;dx<=R;dx++){
      const x=px+dx, z=pz+dz;
      for(let y=py+5; y>=py-3; y--){
        if(W.getBlock(x,y,z)!==B.WATER) continue;
        const below=W.getBlock(x,y-1,z);
        if(below===B.AIR){ this.setBlock(x,y,z,B.AIR); this.setBlock(x,y-1,z,B.WATER); changed=true; }
        else if(below===B.WATER && W.getBlock(x+1,y,z)===B.AIR && W.getBlock(x-1,y,z)===B.AIR && W.getBlock(x,y,z+1)===B.AIR && W.getBlock(x,y,z-1)===B.AIR){
          this.setBlock(x,y,z,B.AIR); changed=true;   // isolated raised lump — drop it into the body below
        }
      }
    }
    if(changed) this._waterFlowChanged=true;
  }
  _damageTool(){
    const s=this.player.inv[this.player.sel]; if(!s) return; const it=ITEMS[s.item]; if(!it||!it.dur) return;
    s.dur = (s.dur==null?it.dur:s.dur)-1;
    if(s.dur<=0){ this.player.inv[this.player.sel]=null; Audio.play('break'); }
  }
  _blockColor(id){ const map={[B.GRASS]:'#5f9e44',[B.DIRT]:'#7a5836',[B.STONE]:'#8a8d92',[B.COBBLE]:'#80838a',[B.SAND]:'#dcc48c',[B.LOG]:'#6b4a2a',[B.LEAVES]:'#3f8a3a',[B.PLANKS]:'#b58a52',[B.SNOW]:'#eef3f7'}; return map[id]||'#9a9a9a'; }

  // ---------- water flow physics ----------
  // breaking a block next to existing water seeds a flood-fill so the
  // opening spills/fills over the next few ticks instead of staying static
  _seedWaterFlow(x,y,z){
    const W=this.world, k=W.bkey(x,y,z); if(W.flowSeen.has(k)) return;
    const nbrs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for(const [dx,dy,dz] of nbrs){ if(W.getBlock(x+dx,y+dy,z+dz)===B.WATER){ W.flowSeen.add(k); W.flowQueue.push({x,y,z,level:7}); break; } }
  }
  updateWaterFlow(){
    const W=this.world, dirs=this._waterFlowDirs||(this._waterFlowDirs=[[1,0],[-1,0],[0,1],[0,-1]]); let n=0, changed=false;
    while(W.flowHead<W.flowQueue.length && n<4){
      const {x,y,z,level}=W.flowQueue[W.flowHead++]; n++;
      if(level<1 || W.getBlock(x,y,z)!==B.AIR) continue;
      this.setBlock(x,y,z,B.WATER); changed=true;
      const belowKey=W.bkey(x,y-1,z);
      if(y>0 && W.getBlock(x,y-1,z)===B.AIR && !W.flowSeen.has(belowKey)){ W.flowSeen.add(belowKey); W.flowQueue.push({x,y:y-1,z,level:7}); }
      else if(level>1){
        for(const [dx,dz] of dirs){ const nx=x+dx,nz=z+dz,nk=W.bkey(nx,y,nz);
          if(W.getBlock(nx,y,nz)===B.AIR && !W.flowSeen.has(nk)){ W.flowSeen.add(nk); W.flowQueue.push({x:nx,y,z:nz,level:level-1}); }
        }
      }
    }
    if(W.flowHead>=W.flowQueue.length){ W.flowQueue.length=0; W.flowHead=0; W.flowSeen.clear(); }
    else if(W.flowHead>64&&W.flowHead*2>W.flowQueue.length){ W.flowQueue.splice(0,W.flowHead); W.flowHead=0; }
    if(changed) this._waterFlowChanged=true;
  }

  place(){
    if(this.mode==='spectator') return;
    if(!this.selBlock) return;
    const it=this.selItem(); const s=this.player.inv[this.player.sel];
    if(!it||!it.blockId||!s) return;
    const n=this.selBlock; const px=n.x+n.nx, py=n.y+n.ny, pz=n.z+n.nz;
    if(py<0||py>=WORLD_H) return;
    const target=this.world.getBlock(px,py,pz);
    if(target!==B.AIR && target!==B.WATER && !(BLOCKS[target] && !BLOCKS[target].solid && BLOCKS[target].render==='cross')) return;
    // placing a non-solid prop (kelp/searock) into the SURFACE water cell would
    // punch a permanent hole in the sea surface — require water above to remain
    if(target===B.WATER && it.blockId && BLOCKS[it.blockId] && !BLOCKS[it.blockId].solid && this.world.getBlock(px,py+1,pz)!==B.WATER) return;
    const isCropSeed = s && (s.item==='potato_seed' || s.item==='carrot_seed' || s.item==='wheat_seed' || s.item==='tomato_seed' || s.item==='sugarcane' || s.item==='beetroot_seeds');
    if(isCropSeed){ const below=this.world.getBlock(px,py-1,pz); if(below!==B.DIRT && below!==B.GRASS && below!==B.PATH) return; }
    // don't place inside the player AABB
    if(this._intersectsPlayer(px,py,pz)) return;
    const blockId=it.blockId;
    // bed placement spans two cells in facing direction
    if(blockId===B.BED){
      const dir=this._facingDir(); const fx=px+dir.x, fz=pz+dir.z;
      if(this.world.getBlock(fx,py,fz)!==B.AIR || this._intersectsPlayer(fx,py,fz)) return;
      const rot=this._facingRot();
      this.setBlock(px,py,pz,B.BED,{rot}); this.setBlock(fx,py,fz,B.BED_FOOT,{rot, head:[px,py,pz]});
      this.world.meta.set(this.world.bkey(px,py,pz),{rot, foot:[fx,py,fz]});
    } else if(isDoorId(blockId)){
      // doors are usually placed by clicking the THRESHOLD (the floor tile in
      // a wall gap), where the face normal points straight up and tells you
      // nothing about which way the wall runs. Look at the actual flanking
      // blocks instead of the click angle — robust regardless of where/how
      // the player aimed, unlike _facingRot() which rotated with player yaw
      // and could swing the door's wide face into the side walls.
      let rot;
      if(this.placeRotOverride!=null) rot=this.placeRotOverride;
      else {
        const wallAlongX=this.world.isSolid(px-1,py,pz)||this.world.isSolid(px+1,py,pz);
        const wallAlongZ=this.world.isSolid(px,py,pz-1)||this.world.isSolid(px,py,pz+1);
        if(wallAlongX && !wallAlongZ) rot=0;
        else if(wallAlongZ && !wallAlongX) rot=Math.PI/2;
        // freestanding (no same-level wall on either side, e.g. a doorway
        // framed only above/below) — a FIXED default beats guessing from
        // player yaw, which made the result depend on which way you were
        // facing/standing rather than always landing the same way
        else rot=0;
      }
      // auto-hinge: pick whichever jamb lets the door swing into the room
      // without clipping a solid neighbor — without this every door swings
      // the same fixed way regardless of which side of a doorway it's on,
      // so two doors flanking a window (mirror images of each other) both
      // swung the same direction instead of opening away from each other
      const facing=this._facingDir();
      let hinge=1;
      const wideAxisX = Math.abs(((rot%Math.PI)+Math.PI)%Math.PI) < 0.01;
      const negSolid = wideAxisX ? this.world.isSolid(px-1,py,pz+facing.z) : this.world.isSolid(px+facing.x,py,pz-1);
      const posSolid = wideAxisX ? this.world.isSolid(px+1,py,pz+facing.z) : this.world.isSolid(px+facing.x,py,pz+1);
      if(posSolid && !negSolid) hinge=-1;
      else if(negSolid && !posSolid) hinge=1;
      else {
        const negSideSolid = wideAxisX ? this.world.isSolid(px-1,py,pz) : this.world.isSolid(px,py,pz-1);
        const posSideSolid = wideAxisX ? this.world.isSolid(px+1,py,pz) : this.world.isSolid(px,py,pz+1);
        if(posSideSolid && !negSideSolid) hinge=-1;
        else if(negSideSolid && !posSideSolid) hinge=1;
      }
      this.setBlock(px,py,pz,blockId,{rot, open:false, hinge});
    } else if(blockId===B.WINDOW){
      // a wall pane must align with the WALL's face normal, not the player's
      // view yaw — facingRot() picked the wrong axis whenever you weren't
      // looking dead-on at the wall, leaving the pane's thin edge exposed
      const rot=this.placeRotOverride!=null ? this.placeRotOverride : (Math.abs(n.nx)>Math.abs(n.nz)?Math.PI/2:0);
      this.setBlock(px,py,pz,blockId,{rot});
    } else if(blockId===B.LADDER||blockId===B.STAIRS){
      this.setBlock(px,py,pz,blockId,{rot:this._facingRot()});
    } else {
      this.setBlock(px,py,pz,blockId);   // torch etc. — radially symmetric, no rotation meta
    }
    if(this.mode!=='creative'){ s.count--; if(s.count<=0) this.player.inv[this.player.sel]=null; }
    this.milestones=this.milestones||{}; this.milestones['placed:'+s.item]=1;
    Audio.play('place');
  }
  _facingDir(){ const a=this.player.yaw; const dx=Math.round(-Math.sin(a)), dz=Math.round(-Math.cos(a)); return {x:dx,z:dz}; }
  _facingRot(){ const a=((this.player.yaw%(Math.PI*2))+Math.PI*2)%(Math.PI*2); const q=Math.round(a/(Math.PI/2))%4; return q*Math.PI/2; }
  // manual override for directional placeables (door/window) — auto-detect
  // guesses from flanking wall blocks, but a freestanding gap with no walls
  // on either side at the door's own height has nothing to detect from, so
  // give the player a direct way to just rotate it themselves and try again
  cyclePlaceRot(){
    this.placeRotOverride = ((this.placeRotOverride||0)+Math.PI/2) % (Math.PI*2);
    return this.placeRotOverride;
  }
  _intersectsPlayer(bx,by,bz){
    const p=this.player; const hw=p.HW;
    return (bx+1> p.pos.x-hw && bx< p.pos.x+hw && bz+1> p.pos.z-hw && bz< p.pos.z+hw && by+1> p.pos.y && by< p.pos.y+p.H);
  }
  _removeBed(x,y,z){
    const k=this.world.bkey(x,y,z); const m=this.world.getMeta(x,y,z);
    let other=null;
    if(m&&m.foot) other=m.foot; else if(m&&m.head) other=m.head;
    this.setBlock(x,y,z,B.AIR);
    if(other) this.setBlock(other[0],other[1],other[2],B.AIR);
  }

  interact(){
    if(this.mode==='spectator') return false;
    if(!this.selBlock) return false;
    const {x,y,z}=this.selBlock; const id=this.world.getBlock(x,y,z);
    // space-age interactions (science lab, fuel tank, launch pad). Defined in
    // js/space.js — runs first so it can claim its own blocks.
    if(this._spaceInteract){ const r=this._spaceInteract(id,x,y,z); if(r) return true; }
    if(id===B.CHEST){ this.heldSwing=1; this.setChestOpen(x,y,z,true); Audio.play('chest'); this.onOpenChest&&this.onOpenChest(x,y,z); return true; }
    if(id===B.FURNACE){ this.heldSwing=1; Audio.play('furnace'); this.onOpenFurnace&&this.onOpenFurnace(x,y,z); return true; }
    if(id===B.BENCH){ this.heldSwing=1; this.onOpenCraft&&this.onOpenCraft('bench'); return true; }
    if(isDoorId(id)){ this.heldSwing=1; const m=this.world.getMeta(x,y,z)||{}; m.open=!m.open; this.world.meta.set(this.world.bkey(x,y,z),m); this.world.deltas.set(this.world.bkey(x,y,z),id); this._refreshObject(x,y,z); Audio.play('door'); return true; }
    if(id===B.BED || id===B.BED_FOOT){ this.heldSwing=1; this.trySleep(); return true; }
    return false;
  }
  setChestOpen(x,y,z,open){
    if(this.world.getBlock(x,y,z)!==B.CHEST) return;
    const m=this.world.getMeta(x,y,z)||{};
    if(!!m.open===!!open) return;
    m.open=!!open;
    this.world.meta.set(this.world.bkey(x,y,z),m);
    this.world.deltas.set(this.world.bkey(x,y,z),B.CHEST);
    this._refreshObject(x,y,z);
    if(open) Audio.play('door');
  }

  // ---------- npc / trading ----------
  _mobAimDistance(m,origin,dir,maxDist,radius){
    const h=Math.max(.35,m.height||1), r2=radius*radius; let best=Infinity;
    for(let i=0;i<3;i++){ const f=i===0?.18:i===1?.55:1;
      const dx=m.pos.x-origin.x, dy=m.pos.y+h*f-origin.y, dz=m.pos.z-origin.z;
      const proj=dx*dir.x+dy*dir.y+dz*dir.z; if(proj<0||proj>maxDist) continue;
      const px=dx-dir.x*proj, py=dy-dir.y*proj, pz=dz-dir.z*proj;
      if(px*px+py*py+pz*pz<r2&&proj<best) best=proj;
    }
    return best;
  }
  _mobAimLimit(origin,dir,maxDist){
    const q=this._mobBlockAim||(this._mobBlockAim={hit:{},ox:0,oy:0,oz:0,solid:(x,y,z)=>(x!==q.ox||y!==q.oy||z!==q.oz)&&this.world.isSolid(x,y,z)});
    q.ox=Math.floor(origin.x); q.oy=Math.floor(origin.y); q.oz=Math.floor(origin.z);
    const hit=raycastVoxel(origin,dir,maxDist,q.solid,q.hit);
    return hit.hit?Math.min(maxDist,Math.max(0,hit.t+.12)):maxDist;
  }
  _aimRay(){
    const q=this._aimScratch||(this._aimScratch={dir:new THREE.Vector3(),origin:new THREE.Vector3(),look:new THREE.Vector3(),turn:new THREE.Euler(0,0,0,'YXZ')});
    q.turn.set(this.player.pitch,this.player.yaw,0,'YXZ'); q.dir.set(0,0,-1).applyEuler(q.turn); q.origin.set(this.player.pos.x,this.player.pos.y+this.player.eye,this.player.pos.z);
    return q;
  }
  findLookMob(settlerOnly){
    const q=this._aimRay(), dir=q.dir, origin=q.origin;
    let best=null,bd=this._mobAimLimit(origin,dir,4);
    for(const m of this.mobs){ if(settlerOnly && !m.def.settler) continue;
      const proj=this._mobAimDistance(m,origin,dir,bd,1.05); if(proj<bd){ bd=proj; best=m; }
    }
    return best;
  }
  getTrades(){ return TRADES.map(t=>({ t, can:this.countItem(t.give[0])>=t.give[1] })); }
  doTrade(i){ const t=TRADES[i]; if(!t) return false;
    if(this.countItem(t.give[0])<t.give[1]){ this.onFlash&&this.onFlash('You do not have enough to trade'); return false; }
    if(!this._canFitAfterCost([t.give],t.get[0],t.get[1])){ this.onFlash&&this.onFlash('Inventory full — make room for the trade'); return false; }
    this.takeItem(t.give[0],t.give[1]); this.giveItem(t.get[0],t.get[1]); Audio.play('craft'); this.onFlash&&this.onFlash('Trade complete: '+ITEMS[t.get[0]].name); return true; }

  // ---------- combat ----------
  // read-only peek: distance to the nearest attackable mob in the crosshair
  // cone, or Infinity if none — lets the caller decide attack vs interact
  // priority when a mob stands right next to furniture
  peekMobDist(){
    const q=this._aimRay(), dir=q.dir, origin=q.origin;
    let bd=this._mobAimLimit(origin,dir,3.2);
    for(const m of this.mobs){
      const proj=this._mobAimDistance(m,origin,dir,3.2,1); if(proj<bd) bd=proj;
    }
    return bd;
  }
  attack(){
    if(this.mode==='spectator') return false;
    if(this.attackCd>0) return false;
    const heldIt=this.selItem();
    if(heldIt && heldIt.shoots) return this._shootBow(heldIt);
    // try mob first
    const q=this._aimRay(), dir=q.dir, origin=q.origin;
    let best=null,bd=this._mobAimLimit(origin,dir,3.2);
    for(const m of this.mobs){
      const proj=this._mobAimDistance(m,origin,dir,bd,1); if(proj<bd){ bd=proj; best=m; }
    }
    this.heldSwing=1;
    this.attackCd=heldIt&&heldIt.tool==='sword'?0.34:(heldIt&&heldIt.tool?0.46:0.4);
    Audio.play('swing');
    if(best){
      const it=this.selItem(); let dmg=(it&&it.dmg?it.dmg:1);
      if(this.player.effects.strength) dmg*=1.5;
      best.hp-=dmg;
      const kx=best.pos.x-this.player.pos.x, kz=best.pos.z-this.player.pos.z, kl=Math.hypot(kx,kz)||1;
      best.vel.x+=kx/kl*6; best.vel.z+=kz/kl*6; best.vel.y=4; best.hurtT=0.2; if(best.def.hostile) this._pushAlarm(best.pos.x,best.pos.z);
      this._spawnParticles(best.pos.x, best.pos.y+best.height*0.5, best.pos.z, '#ffe9b0');   // hit spark
      this._noise(best.pos.x, best.pos.z, 10);   // combat is loud — draws hostiles that lack LOS
      if(it&&it.dur && this.mode!=='creative') this._damageTool();   // any durable tool wears when used in combat
      Audio.play('hit'); Audio.play('mobhurt'); this.onHit&&this.onHit();
      if(!best.def.hostile && !best.def.settler){ best.state='flee'; best.fleeT=6; }
      if(best.def.settler){ best.state='flee'; best.fleeT=4; this.villageAngerT=30; } // anger->flee, and call the guard
      if(best.def.alien){ this.alienAngerT=45; if(best.def.noble){ best.state='flee'; best.fleeT=5; } }   // the ruler answers harm to any alien
      if(best.def.seaCreature){ this.seaAngerT=45; }                                                      // the Tide Lord answers harm to the deep
      if(best.hp<=0) this._killMob(best);
      return true;
    }
    return false;
  }
  _shootBow(bowIt){
    if(this.mode!=='creative' && this.countItem('arrow')<1) return false;
    this.attackCd=0.56;
    if(this.mode!=='creative'){ this.takeItem('arrow',1); const s=this.player.inv[this.player.sel]; if(s){ s.dur=(s.dur==null?bowIt.dur:s.dur)-1; if(s.dur<=0) this.player.inv[this.player.sel]=null; } }
    this.heldSwing=1;
    const q=this._aimRay(), dir=q.dir, origin=q.origin;
    const proj=this._acquireProjectile('arrow',0x8a6638);
    proj.rotation.set(0,0,0);
    proj.position.copy(origin); proj.lookAt(q.look.copy(origin).add(dir)); proj.rotation.x+=Math.PI/2;
    this.scene.add(proj);
    let dmg=bowIt.dmg; if(this.player.effects.strength) dmg*=1.5;
    const vel=proj.userData.velocity; vel.copy(dir).multiplyScalar(24);
    this.drops.push({ projectile:true, fromPlayer:true, dmg, pos:proj.position, vel, spr:proj, life:0 });
    Audio.play('place');
    this._noise(origin.x, origin.z, 10);   // bowshot snaps loud — alerts nearby hostiles
    return true;
  }
  _acquireProjectile(kind,color){
    this._projectilePool=this._projectilePool||[];
    const at=this._projectilePool.findIndex(m=>m.userData.projectileKind===kind);
    let mesh;
    if(at>=0){ mesh=this._projectilePool[at]; this._projectilePool[at]=this._projectilePool[this._projectilePool.length-1]; this._projectilePool.pop(); }
    else {
      const geos=this._projectileGeos||(this._projectileGeos={});
      const geometry=geos[kind]||(geos[kind]=kind==='arrow'?new THREE.CylinderGeometry(0.04,0.04,0.5,5):new THREE.SphereGeometry(kind==='orbLarge'?0.24:0.18,6,6));
      geometry.userData.voxSharedProjectile=true;
      mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial()); mesh.userData.projectileKind=kind;
    }
    if(!mesh.userData.velocity) mesh.userData.velocity=new THREE.Vector3();
    mesh.visible=true; mesh.material.color.set(color); mesh.material.emissive.set(kind==='arrow'?0x000000:color); mesh.material.emissiveIntensity=kind==='arrow'?0:0.4;
    this.scene.add(mesh); return mesh;
  }
  _killMob(m){
    if(m._net){ this._removeMob(m); return; }   // co-op ghost: host owns drops/milestones — just clear the visual
    if(m.def.drop) for(const [it,ct] of m.def.drop){ if(Math.random()<(m.def.ruler?1:0.85)){ if(this._lootSink) this._lootSink(it,ct); else this._spawnDrop(it,ct,m.pos.x,m.pos.y+0.4,m.pos.z); } }
    this._spawnParticles(Math.floor(m.pos.x),Math.floor(m.pos.y),Math.floor(m.pos.z),'#aa3030');
    if(this.journal) this.journal.kills[m.kind]=(this.journal.kills[m.kind]|0)+1;
    if(m.kind==='gravemaw') this._milestone('slayMaw','You slew the Gravemaw. The caves breathe easier.');
    if(m.kind==='tide_lord') this._milestone('slayTide','You defeated '+(m._king?'the Drowned King. Aetheria':'the Tide Lord. The deep')+' is yours.');
    if(m.kind==='alien_ruler') this._milestone('slayRuler','You defeated the Alien Ruler of Aethon.');
    this._removeMob(m);
  }
  // one-time progression cues — saved with the world, flashed once
  _milestone(key,msg){
    if(!this.milestones) this.milestones={};
    if(this.milestones[key]) return;
    this.milestones[key]=1;
    this.onFlash&&this.onFlash('★ '+msg);
    this.onToast&&this.onToast('★ '+msg);
    if(Audio.sting) Audio.sting(/^slay/.test(key)?'boss':'rise'); else Audio.play('craft');
    if(!this._rocketActive) this._fovPulseT=0.8;   // brief lens-widen beat sells the discovery on camera
  }
  _removeMob(m){ this.scene.remove(m.group);
    // raid bookkeeping counts EVERY exit (killed, burned at dawn, despawned)
    if(m._raider && this._raidLive>0){ this._raidLive--; if(this._raidLive<=0){ this._milestone&&this._milestone('raid','You defended the village from a night raid.'); this._giveOrDrop&&this._giveOrDrop('emerald',2); } }
    // dispose geometries/materials — the spawn/despawn cycle runs forever
    m.group.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material&&!o.material._shared) o.material.dispose(); });
    const i=this.mobs.indexOf(m); if(i>=0) this.mobs.splice(i,1); }

  hurtPlayer(dmg, src, deathCause){
    if(this.dead || this.mode!=='survival') return;
    const incoming=Math.max(0,Number.isFinite(+dmg)?+dmg:0), wear=Math.max(1,Math.ceil(incoming*0.5));
    const arm=this.player.armor; let def=0;
    for(const k in arm){ const s=arm[k]; if(s) def+=(ITEMS[s.item].def||0); }
    dmg=Math.max(1, incoming*(1-Math.min(0.7,def*0.05)));
    const broke=[];
    for(const k in arm){ const s=arm[k]; if(s){ const it=ITEMS[s.item]; if(it.dur){ s.dur=(s.dur==null?it.dur:s.dur)-wear; if(s.dur<=0){ broke.push(it.name||'Armor piece'); arm[k]=null; } } } }
    if(broke.length){ Audio.play('break'); this.onToast&&this.onToast(broke.length===1?(broke[0]+' broke!'):(broke.length+' armor pieces broke!')); }
    this.player.health-=dmg; Audio.play('hurt');
    this._hitShakeT=0.3;   // impact feedback: brief camera judder (applied in render, flight excluded)
    if(src){ const kx=this.player.pos.x-src.x, kz=this.player.pos.z-src.z, kl=Math.hypot(kx,kz)||1; this.player.vel.x+=kx/kl*4; this.player.vel.z+=kz/kl*4; this.player.vel.y=3; }
    this.onDamage&&this.onDamage();
    if(this.player.health<=0) this._die(deathCause||'You were slain');
  }
  _die(msg){ if(this.dead) return; this.dead=true; this.deaths=(this.deaths||0)+1; this.deathMsg=msg; this.fishing=null; this.onDeath&&this.onDeath(msg); }

  _tryGrowCrops(){
    const p=this.player.pos; const r=5;
    for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)for(let dy=-1;dy<=2;dy++){
      const x=Math.floor(p.x+dx), y=Math.floor(p.y+dy), z=Math.floor(p.z+dz);
      const id=this.world.getBlock(x,y,z);
      if(id===B.POTATO0 && Math.random()<0.25) this.setBlock(x,y,z,B.POTATO1);
      else if(id===B.POTATO1 && Math.random()<0.25) this.setBlock(x,y,z,B.POTATO2);
      else if(id===B.POTATO2 && Math.random()<0.25) this.setBlock(x,y,z,B.POTATO3);
      if(id===B.CARROT0 && Math.random()<0.25) this.setBlock(x,y,z,B.CARROT1);
      else if(id===B.CARROT1 && Math.random()<0.25) this.setBlock(x,y,z,B.CARROT2);
      else if(id===B.CARROT2 && Math.random()<0.25) this.setBlock(x,y,z,B.CARROT3);
      if(id===B.WHEAT0 && Math.random()<0.25) this.setBlock(x,y,z,B.WHEAT1);
      else if(id===B.WHEAT1 && Math.random()<0.25) this.setBlock(x,y,z,B.WHEAT2);
      else if(id===B.WHEAT2 && Math.random()<0.25) this.setBlock(x,y,z,B.WHEAT3);
      if(id===B.TOMATO0 && Math.random()<0.25) this.setBlock(x,y,z,B.TOMATO1);
      else if(id===B.TOMATO1 && Math.random()<0.25) this.setBlock(x,y,z,B.TOMATO2);
      else if(id===B.TOMATO2 && Math.random()<0.25) this.setBlock(x,y,z,B.TOMATO3);
    }
  }

  // ---------- warmth / cold survival ----------
  _lightCoord(k){
    if(this._lightCoordWorld!==this.world){ this._lightCoordWorld=this.world; this._lightCoords=new Map(); }
    let c=this._lightCoords.get(k);
    if(!c){ const p=k.split(','); c={x:+p[0],y:+p[1],z:+p[2],d2:0}; this._lightCoords.set(k,c); }
    return c;
  }
  _updateWarmth(dt, moved){
    const p=this.player;
    this._coldT=(this._coldT||0)+dt;
    if(this._coldT>1.5){ this._coldT=0;
      if(this.countItem('sunstone')>0){ p.warmth=p.maxWarmth; return; }   // the Sunstone never lets you freeze
      const px=Math.floor(p.pos.x), pz=Math.floor(p.pos.z);
      const t=this.time, isDay=t>0.25 && t<0.75;
      const snow=this.world.biomeAt(px,pz,this.world.heightAt(px,pz))===BIOMES.snow;
      // near a heat source? any light-emitting block (torch/lantern/kiln) within ~6 blocks
      let nearHeat=false;
      for(const k of this.world.lights){ const c=this._lightCoord(k); const dx=c.x-px, dy=c.y-p.pos.y, dz=c.z-pz; if(dx*dx+dy*dy+dz*dz<36){ nearHeat=true; break; } }
      let warm;
      if(nearHeat) warm=2.0;          // heat source: warm up fast
      else if(snow) warm=-1.4;        // frozen biome always saps warmth
      else if(!isDay) warm=-0.7;      // exposed night chill (mild)
      else warm=1.5;                  // daytime sun in a temperate biome
      p.warmth=clamp(p.warmth+warm,0,p.maxWarmth);
    }
    // continuous effects derived from current warmth
    p.frozen = p.warmth<5;
    this._frostLevel = p.warmth<8 ? clamp(1-p.warmth/8,0,1) : 0;
    if(p.warmth<=0){ this._freezeT=(this._freezeT||0)+dt; if(this._freezeT>2){ this._freezeT=0; this._freezeHurt(1); } }
    else this._freezeT=0;
  }
  _updateSurvivalWarnings(){
    const p=this.player, w=this._survivalWarn||(this._survivalWarn={hunger:false,hungerCritical:false,cold:false,coldCritical:false});
    const warn=msg=>{ this.onToast&&this.onToast(msg); this.onFlash&&this.onFlash(msg); };
    if(p.hunger<=2){ if(!w.hungerCritical){ w.hungerCritical=true; warn('Starving — eat now!'); } }
    else if(p.hunger<=6){ if(!w.hunger){ w.hunger=true; warn('Food is running low — forage or cook before you starve.'); } }
    if(p.hunger>8) w.hunger=false;
    if(p.hunger>4) w.hungerCritical=false;
    if(p.warmth<=3){ if(!w.coldCritical){ w.coldCritical=true; warn('Freezing — reach a torch, lantern, or sunlight now!'); } }
    else if(p.warmth<=8){ if(!w.cold){ w.cold=true; warn('Temperature dropping — find shelter or a heat source.'); } }
    if(p.warmth>10) w.cold=false;
    if(p.warmth>5) w.coldCritical=false;
  }
  _freezeHurt(dmg){
    if(this.dead) return;
    this.player.health-=dmg;          // frost vignette + draining warmth pips are the feedback (no red flash)
    if(this.player.health<=0) this._die('You froze to death');
  }

  // ---------- drops & particles ----------
  _spawnDrop(item,count,x,y,z){
    if(!ITEMS[item]||count<=0) return null;
    let remaining=count;
    let worldDrops=0,old=-1;
    for(let i=0;i<this.drops.length;i++){ const d=this.drops[i]; if(d.projectile) continue; worldDrops++; if(old<0) old=i; const dx=d.pos.x-x,dy=d.pos.y-y,dz=d.pos.z-z;
      if(d.item===item&&d.count<99&&dx*dx+dy*dy+dz*dz<1.33){ const moved=Math.min(99-d.count,remaining); d.count+=moved; remaining-=moved; d.life=0; d.vel.y=Math.max(d.vel.y,1.2); if(remaining<=0) return d; } }
    if(worldDrops>=160&&old>=0){ this._disposeWorldDrop(this.drops[old]); this.drops.splice(old,1); }
    const spr=this._makeItemObject(item,false);
    spr.position.set(x,y,z); this.scene.add(spr);
    const bid=ITEMS[item].blockId, material=bid!=null?blockMaterial(bid):(/log|plank|stick|wood|barrel/.test(item)?'wood':/leaf|fiber|seed|flower|food|apple|crop/.test(item)?'plant':/iron|copper|gold|metal|alloy/.test(item)?'metal':'stone');
    const stack=Math.min(99,remaining);
    const created={ item,count:stack,material,floaty:['wood','plant','leaves','ice'].includes(material),settled:false,pos:new THREE.Vector3(x,y,z),vel:new THREE.Vector3((Math.random()-0.5)*2,3,(Math.random()-0.5)*2),spr,life:0,bob:Math.random()*6 };
    this.drops.push(created);
    if(remaining>stack) this._spawnDrop(item,remaining-stack,x,y,z);
    return created;
  }
  _iconTexture(itemId){
    if(!this.heldIconCache[itemId]){
      const cv=this.iconCanvas(itemId);
      const t=crispTexture(new THREE.CanvasTexture(cv)); this.heldIconCache[itemId]=t;
    }
    return this.heldIconCache[itemId];
  }
  iconCanvas(itemId){ const it=ITEMS[itemId];
    if(it.icon==='block'){ const b=BLOCKS[it.blockId]; if(b.render==='model'&&b.model&&SpecialModels[b.model]) return modelIcon(b.model); return blockIcon(b); }
    return itemIcon(it);
  }
  _gearMaterial(itemId, held=false){
    const mat=(itemId||'').split('_')[0];
    const cols={wood:0x9a6b3a,stone:0x9a9da2,copper:0xc87f4a,iron:0xcfd2d6,gold:0xf4d35e,crystal:0x9ce6ef,wool:0xe8e2d4};
    return new THREE.MeshLambertMaterial({ color:cols[mat]||0xcfd2d6, depthTest:!held, transparent:held, opacity:1 });
  }
  _gearKind(item){
    if(!item) return null;
    if(['pickaxe','axe','shovel','sword','stick','shears','bow','arrow','rod','potion','flint_steel'].includes(item.icon)) return item.icon;
    if(item.armorSlot) return item.icon;
    return null;
  }
  _tintToolAsset(obj,itemId,materialsCloned=false){
    const tier=(itemId||'').split('_')[0], palettes={
      wood:[0x8a6038,0xc18a4d], stone:[0x686b68,0x9ba09a], copper:[0xb96a3d,0xe29a62],
      iron:[0xaeb4bc,0xe7ebee], gold:[0xd6a72e,0xffe275], crystal:[0x39cbd3,0xb8ffff]
    }, pal=palettes[tier];
    if(!pal||!obj) return obj;
    obj.traverse(o=>{ if(!o.isMesh||!o.material) return; const list=Array.isArray(o.material)?o.material:[o.material];
      const tinted=list.map(src=>{ const m=materialsCloned?src:src.clone(), name=(m.name||'').toLowerCase();
        if(name.includes('tool steel')) m.color.setHex(pal[0]);
        else if(name.includes('steel edge')||name.includes('void crystal')) m.color.setHex(pal[1]);
        if(m.emissive){ const glow=tier==='crystal'&&name.includes('void crystal'); m.emissive.setHex(glow?0x17676d:0x000000); if('emissiveIntensity' in m) m.emissiveIntensity=glow?0.85:0; }
        return m; });
      o.material=Array.isArray(o.material)?tinted:tinted[0];
    });
    return obj;
  }
  _addBox(parent,w,h,d,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); m.rotation.set(rx,ry,rz); parent.add(m); return m;
  }
  _makeItemObject(itemId, held=false){
    const it=ITEMS[itemId], kind=this._gearKind(it);
    const productionName=kind==='pickaxe'||kind==='axe' ? kind : it&&it.blockId===B.GRASS ? 'grass' : it&&it.blockId===B.CRYSTAL ? 'crystal' : null;
    if(productionName){
      const prod=ProductionAssets.clone(productionName,{held,scale:held?0.42:(productionName==='grass'||productionName==='crystal'?0.28:0.34)});
      if(prod){ if(kind==='pickaxe'||kind==='axe') this._tintToolAsset(prod,itemId,held); prod.rotation.set(held?-0.2:0.35,held?0.15:0.5,held?-0.55:0.25); return prod; }
    }
    if(!kind){
      const spr=new THREE.Sprite(new THREE.SpriteMaterial({ map:this._iconTexture(itemId), depthTest:!held, transparent:true }));
      spr.scale.set(held?0.32:0.4,held?0.32:0.4,1); return spr;
    }
    const g=new THREE.Group();
    const head=this._gearMaterial(itemId,held), wood=new THREE.MeshLambertMaterial({ color:0x8a6638, depthTest:!held, transparent:held, opacity:1 });
    const dark=new THREE.MeshLambertMaterial({ color:0x303238, depthTest:!held, transparent:held, opacity:1 });
    const accent=new THREE.MeshLambertMaterial({ color:0x9ce6ef, emissive:kind==='potion'?0x123333:0x000000, depthTest:!held, transparent:held, opacity:1 });
    const A=(w,h,d,mat,x,y,z,rx=0,ry=0,rz=0)=>this._addBox(g,w,h,d,mat,x,y,z,rx,ry,rz);
    if(['pickaxe','axe','shovel','sword','stick','rod'].includes(kind)) A(0.055,0.055,0.62,wood,0,0,0,0,0,0.72);
    if(kind==='pickaxe'){ A(0.46,0.07,0.08,head,0.11,0.18,0,0,0,0.25); A(0.1,0.1,0.1,head,-0.04,0.11,0); }
    else if(kind==='axe'){ A(0.23,0.22,0.08,head,0.16,0.18,0,0,0,0.25); A(0.09,0.12,0.09,dark,0.05,0.08,0); }
    else if(kind==='shovel'){ A(0.2,0.22,0.07,head,0.17,0.18,0,0,0,0.7); }
    else if(kind==='sword'){ A(0.08,0.62,0.07,head,0.12,0.11,0,0,0,-0.72); A(0.26,0.06,0.08,wood,-0.04,-0.2,0,0,0,-0.72); }
    else if(kind==='stick'){ A(0.045,0.045,0.18,wood,-0.08,-0.12,0,0,0,0.72); }
    else if(kind==='shears'){ A(0.05,0.5,0.05,head,-0.08,0.05,0,0,0,-0.65); A(0.05,0.5,0.05,head,0.08,0.05,0,0,0,0.65); A(0.1,0.06,0.06,dark,0,-0.06,0); }
    else if(kind==='bow'){ A(0.06,0.62,0.06,wood,0.02,0,0,0,0,0.24); A(0.025,0.58,0.025,accent,0.13,0,0); }
    else if(kind==='arrow'){ A(0.04,0.62,0.04,wood,0,0,0,0,0,0.8); A(0.14,0.1,0.08,head,0.19,0.2,0,0,0,0.8); A(0.12,0.04,0.08,accent,-0.17,-0.2,0,0,0,0.8); }
    else if(kind==='rod'){ A(0.02,0.5,0.02,accent,0.18,0.1,0,0,0,-0.25); A(0.1,0.08,0.08,dark,0.2,-0.17,0); }
    else if(kind==='potion'){ A(0.16,0.22,0.16,accent,0,0,0); A(0.09,0.1,0.09,wood,0,0.17,0); }
    else if(kind==='flint_steel'){ A(0.28,0.08,0.07,dark,-0.04,0,0,0,0,0.75); A(0.18,0.12,0.07,head,0.13,0.08,0,0,0,0.2); }
    else if(kind.startsWith('armor_')){
      A(0.24,0.22,0.08,head,0,0.06,0);
      if(kind==='armor_head'){ A(0.18,0.07,0.09,dark,0,-0.03,0); }
      if(kind==='armor_chest'){ A(0.16,0.22,0.08,head,0,-0.14,0); A(0.08,0.18,0.07,head,-0.18,-0.08,0); A(0.08,0.18,0.07,head,0.18,-0.08,0); }
      if(kind==='armor_legs'){ A(0.09,0.28,0.07,head,-0.07,-0.16,0); A(0.09,0.28,0.07,head,0.07,-0.16,0); }
      if(kind==='armor_boots'){ A(0.12,0.11,0.12,head,-0.08,-0.1,0.03); A(0.12,0.11,0.12,head,0.08,-0.1,0.03); }
    }
    g.scale.setScalar(held?0.82:0.8); g.rotation.set(held?-0.25:0.4,held?0.3:0.5,held?-0.35:0.2);
    g.traverse(o=>{ if(o.isMesh){ o.renderOrder=held?1000:0; } });
    return g;
  }

  _spawnParticles(x,y,z,color,count=6,ground=false,opts=null){
    if(this.fxQuality==='off') return;
    opts=opts||{};
    const cap=this.fxQuality==='low'?36:this.fxQuality==='high'?108:72;
    const colors=Array.isArray(color)?color:[color];
    if(!this._particleGeo) this._particleGeo=new THREE.BoxGeometry(1,1,1);
    for(let i=0;i<count;i++){
      let p=this.particles.find(q=>!q.active);
      if(!p){ if(this.particles.length>=cap) break; const mat=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false}); const mesh=new THREE.Mesh(this._particleGeo,mat); this.scene.add(mesh); p={mesh,vel:new THREE.Vector3(),active:false}; this.particles.push(p); }
      const size=opts.size?lerp(opts.size[0],opts.size[1],Math.random()):(ground?0.075:0.12);
      p.active=true; p.mesh.visible=true; p.mesh.material.opacity=1; p.mesh.material.color.set(colors[(Math.random()*colors.length)|0]); p.mesh.scale.setScalar(size);
      const point=!!opts.point, spread=opts.spread==null?(ground?0.45:0.6):opts.spread;
      p.mesh.position.set(point?x+(Math.random()-0.5)*spread:(ground?x+(Math.random()-0.5)*spread:x+0.2+Math.random()*spread), point?y+(Math.random()-0.5)*spread:(ground?y+0.04:y+0.2+Math.random()*spread), point?z+(Math.random()-0.5)*spread:(ground?z+(Math.random()-0.5)*spread:z+0.2+Math.random()*spread));
      const speed=opts.speed==null?(ground?0.7:3):opts.speed, n=opts.normal;
      if(ground) p.vel.set((Math.random()-0.5)*speed,Math.random()*0.4+0.15,(Math.random()-0.5)*speed);
      else p.vel.set((Math.random()-0.5)*speed,(Math.random()*0.8+0.25)*speed,(Math.random()-0.5)*speed);
      if(n){ p.vel.x+=n.x*speed*0.65; p.vel.y+=n.y*speed*0.65; p.vel.z+=n.z*speed*0.65; }
      p.life=p.maxLife=opts.life==null?(ground?0.3:0.6):opts.life; p.gravity=opts.gravity==null?12:opts.gravity; p.drag=opts.drag==null?1.5:opts.drag; p.drift=opts.drift||0; p.fade=opts.fade!==false;
    }
  }
  _emitMaterialFx(id,x,y,z,phase='hit',normal=null){
    const kind=blockMaterial(id), fx=MATERIAL_FX[kind]||MATERIAL_FX.stone;
    const q=this.fxQuality==='low'?0.55:this.fxQuality==='high'?1.25:1;
    const count=Math.max(1,Math.round((phase==='break'?fx.brk:fx.hit)*q));
    const n=normal||{x:0,y:1,z:0};
    this._spawnParticles(x+0.5+n.x*0.48,y+0.5+n.y*0.48,z+0.5+n.z*0.48,fx.colors,count,false,{point:true,spread:phase==='break'?0.72:0.24,size:fx.size,speed:fx.speed*(phase==='break'?1:0.7),gravity:fx.gravity,life:fx.life,drift:fx.drift||0,normal:n});
    Audio.material(kind,phase==='break',false);
  }

  // ---------- chunk meshing ----------
  setBlock(x,y,z,id,meta){
    const old=this.world.getBlock(x,y,z);
    this.world.setBlock(x,y,z,id,meta);
    // a solid block placed over/next to a spot the flow-fill already
    // claimed must forget it, otherwise breaking that block later won't
    // re-seed the flood-fill (flowSeen thinks this cell is already "done")
    if(id!==B.WATER && id!==B.AIR) this.world.flowSeen.delete(this.world.bkey(x,y,z));
    this._refreshObject(x,y,z, old);
    this._markDirtyAround(x,y,z);
  }
  _markDirtyAround(x,y,z){
    const cx=floorDiv(x,CHUNK_X), cz=floorDiv(z,CHUNK_Z);
    const lx=mod(x,CHUNK_X), lz=mod(z,CHUNK_Z);
    const edgeX=lx===0?-1:lx===CHUNK_X-1?1:0, edgeZ=lz===0?-1:lz===CHUNK_Z-1?1:0;
    this.dirty.add(cx+','+cz);
    if(edgeX) this.dirty.add((cx+edgeX)+','+cz);
    if(edgeZ) this.dirty.add(cx+','+(cz+edgeZ));
    if(edgeX&&edgeZ) this.dirty.add((cx+edgeX)+','+(cz+edgeZ)); // AO diagonal dependency
  }
  _buildChunk(cx,cz){
    const k=cx+','+cz;
    let entry=this.chunkMeshes.get(k);
    if(entry){ for(const m of [entry.opaque,entry.cutout,entry.blend,entry.ice]) if(m){ this.scene.remove(m); m.geometry.dispose(); } for(const o of entry.objects) this._disposeSpecialObject(o); }
    else entry={objects:[]};
    entry.cx=cx; entry.cz=cz;
    const geos=meshChunk(cx,cz,(x,y,z)=>this.world.getBlock(x,y,z),(x,z)=>this.world.heightAt(x,z),this.world);
    entry.opaque=geos.opaque?new THREE.Mesh(geos.opaque,this.matOpaque):null;
    entry.cutout=geos.cutout?new THREE.Mesh(geos.cutout,this.matCutout):null;
    entry.blend =geos.blend ?new THREE.Mesh(geos.blend ,this.matBlend ):null;
    entry.ice   =geos.ice   ?new THREE.Mesh(geos.ice   ,this.matIce  ):null;
    for(const m of [entry.opaque,entry.cutout,entry.blend,entry.ice]) if(m) this.scene.add(m);
    // special block objects
    entry.objects=[]; this._spawnChunkObjects(cx,cz,entry,geos.models);
    this.chunkMeshes.set(k,entry);
  }
  _spawnChunkObjects(cx,cz,entry,models){
    for(const m of models||[]){
      const b=BLOCKS[m.id], meta=this.world.getMeta(m.x,m.y,m.z);
      const o=b&&SpecialModels[b.model]&&SpecialModels[b.model](meta);
      if(o){ o.position.set(m.x+0.5,m.y,m.z+0.5); o.userData.bcoord=[m.x,m.y,m.z]; this.scene.add(o); entry.objects.push(o); }
    }
  }
  _disposeSpecialObject(o){
    if(!o) return; o.userData.disposed=true; this.scene.remove(o);
    if(o.userData.productionAssetMounted) return;   // cloned GLBs share cached geometry/materials
    const geos=new Set(), mats=new Set(); o.traverse(n=>{ if(n.geometry) geos.add(n.geometry); if(n.material){ const list=Array.isArray(n.material)?n.material:[n.material]; for(const m of list) if(m&&!m._shared) mats.add(m); } });
    for(const g of geos) g.dispose(); for(const m of mats) m.dispose();
  }
  _refreshObject(x,y,z, oldId){
    // remove existing object at coord, then rebuild that chunk's objects lazily via dirty mark (cheap enough)
    const cx=floorDiv(x,CHUNK_X), cz=floorDiv(z,CHUNK_Z); const k=cx+','+cz;
    const entry=this.chunkMeshes.get(k); if(!entry) return;
    for(let i=entry.objects.length-1;i>=0;i--){ const o=entry.objects[i]; const c=o.userData.bcoord; if(c[0]===x&&c[1]===y&&c[2]===z){ this._disposeSpecialObject(o); entry.objects.splice(i,1); } }
    const id=this.world.getBlock(x,y,z); const b=BLOCKS[id];
    if(b&&b.render==='model'&&b.model){ const meta=this.world.getMeta(x,y,z); const o=SpecialModels[b.model](meta); if(o){ o.position.set(x+0.5,y,z+0.5); o.userData.bcoord=[x,y,z]; this.scene.add(o); entry.objects.push(o); } }
  }

  maintainChunks(){
    if(!this.player) return;
    if(this._rocketSuspendChunks) return;   // frozen during the space-flight phase (js/rocket.js)
    const pcx=floorDiv(this.player.pos.x,CHUNK_X), pcz=floorDiv(this.player.pos.z,CHUNK_Z);
    const R=this.renderDist;
    const maintainKey=pcx+','+pcz+','+R, expected=(R*2+1)*(R*2+1);
    if(this._maintKey===maintainKey && (this.loadQueue.length||this.chunkMeshes.size>=expected)) return;
    this._maintKey=maintainKey;
    // unload far
    for(const [k,entry] of this.chunkMeshes){
      if(Math.abs(entry.cx-pcx)>R+1 || Math.abs(entry.cz-pcz)>R+1){
        for(const m of [entry.opaque,entry.cutout,entry.blend,entry.ice]) if(m){ this.scene.remove(m); m.geometry.dispose(); }
        for(const o of entry.objects) this._disposeSpecialObject(o);
        this.chunkMeshes.delete(k);
      }
    }
    // queue near, nearest first
    const want=[];
    for(let dz=-R;dz<=R;dz++) for(let dx=-R;dx<=R;dx++){ const cx=pcx+dx, cz=pcz+dz; const k=cx+','+cz; if(!this.chunkMeshes.has(k)) want.push([dx*dx+dz*dz,cx,cz]); }
    want.sort((a,b)=>b[0]-a[0]);
    this.loadQueue=want;
  }
  processLoad(budget){
    let n=0;
    while(this.loadQueue.length && n<budget){ const [,cx,cz]=this.loadQueue.pop(); if(!this.chunkMeshes.has(cx+','+cz)){ this._buildChunk(cx,cz); n++; } }
    // rebuild dirty — bounded per frame so a large dirty set can't spike a frame (the rest carry to next frames)
    if(this.dirty.size){
      const pcx=this.player?floorDiv(this.player.pos.x,CHUNK_X):0, pcz=this.player?floorDiv(this.player.pos.z,CHUNK_Z):0;
      const best=this._dirtyBest||(this._dirtyBest=[{d:Infinity},{d:Infinity},{d:Infinity}]);
      for(const b of best){ b.d=Infinity; b.k=null; }
      for(const k of this.dirty){
        if(!this.chunkMeshes.has(k)){ this.dirty.delete(k); continue; }
        const comma=k.indexOf(','), cx=+k.slice(0,comma), cz=+k.slice(comma+1), d=Math.abs(cx-pcx)+Math.abs(cz-pcz);
        if(d>=best[2].d) continue;
        let at=2;
        while(at>0&&d<best[at-1].d){ best[at].d=best[at-1].d; best[at].k=best[at-1].k; best[at].cx=best[at-1].cx; best[at].cz=best[at-1].cz; at--; }
        best[at].d=d; best[at].k=k; best[at].cx=cx; best[at].cz=cz;
      }
      for(const b of best) if(b.k){ this.dirty.delete(b.k); this._buildChunk(b.cx,b.cz); }
    }
  }

  // ---------- sleeping ----------
  trySleep(){
    if(this.time>0.25 && this.time<0.75){
      // daytime: can't sleep, but touching the bed still sets your respawn point
      this.player.spawn={x:this.player.pos.x,y:this.player.pos.y,z:this.player.pos.z};
      this.onToast&&this.onToast('You can only sleep at night — respawn point set');
      return;
    }
    // only block sleep for a hostile actually hunting you nearby, not any
    // hostile that merely exists somewhere in the loaded area
    for(const m of this.mobs){ if(m.def.hostile && m.state==='chase' && m.pos.distanceTo(this.player.pos)<6){ this.onToast&&this.onToast('Too dangerous to sleep'); return; } }
    // set spawn at bed
    this.player.spawn={x:this.player.pos.x,y:this.player.pos.y,z:this.player.pos.z};
    this.onSleep&&this.onSleep();
  }
  finishSleep(){ this.time=0.27; this._clockPrev=this.time; this.day++; this.player.health=Math.min(this.player.maxHealth,this.player.health+6); if(this.day===2) this._milestone('night1','You survived your first night.'); }

  // ---------- mobs ----------
  _directorPressure(){
    if(this.mode!=='survival'||!this.player) return 0;
    if(this._recoveryUntil&&performance.now()<this._recoveryUntil) return 0.05;
    let armor=0, tier=0;
    for(const k in this.player.armor){ const s=this.player.armor[k]; if(s&&ITEMS[s.item]) armor+=ITEMS[s.item].def||0; }
    for(const s of this.player.inv){ const it=s&&ITEMS[s.item]; if(it&&(it.tool||it.shoots)) tier=Math.max(tier,it.tier||1); }
    const ms=this.milestones||{};
    const progress=(ms.village1?0.08:0)+(ms.slayMaw?0.10:0)+(ms.foundCity?0.08:0)+(ms.space?0.12:0)+(ms.aethon?0.14:0);
    const capability=clamp(armor/36,0,0.28)+clamp(tier/5,0,0.25);
    const stress=(1-this.player.health/this.player.maxHealth)*0.30+(1-this.player.hunger/this.player.maxHunger)*0.18;
    const target=clamp(0.08+Math.min(0.46,(this.day-1)*0.065)+progress+capability-stress-Math.min(0.16,(this.deaths||0)*0.04),0.05,1);
    this.threat=lerp(this.threat==null?target:this.threat,target,0.3);
    return this.threat;
  }
  spawnMobs(){
    if(!this.player) return;
    if(this.dimension==='planet'){ this._spawnAliens(); return; }   // Aethon has its own natives
    if(this.inSpace) return;   // nothing spawns in raw space
    const night = this.time<0.24||this.time>0.78;
    let hostiles=0,passives=0,fishCount=0;
    for(const m of this.mobs){ if(m.def.hostile) hostiles++; else if(!m.def.settler) passives++; if(m.kind==='fish') fishCount++; }
    const px=this.player.pos.x, pz=this.player.pos.z;
    const tryAt=(kind,underground)=>{
      const ang=Math.random()*6.28, dist=14+Math.random()*16;
      const x=Math.floor(px+Math.cos(ang)*dist), z=Math.floor(pz+Math.sin(ang)*dist);
      const d=MOB_DEF[kind];
      if(d.aquatic){
        const y=SEA_LEVEL-1;
        if(this.world.getBlock(x,y,z)!==B.WATER || this.world.getBlock(x,y+1,z)!==B.WATER) return;
        let extent=0; for(const [ox,oz] of [[6,0],[-6,0],[0,6],[0,-6],[5,5],[-5,-5],[5,-5],[-5,5]]) if(this.world.getBlock(x+ox,y,z+oz)===B.WATER) extent++;
        const localCap=2+extent*2; // ponds stay sparse, oceans/lakes get crowded with fish
        let nearby=0; for(const mm of this.mobs) if(mm.kind==='fish' && Math.hypot(mm.pos.x-x,mm.pos.z-z)<24) nearby++;
        if(nearby>=localCap) return;
        const m=new Mob(kind,x+0.5,y+0.5,z+0.5); this.scene.add(m.group); this.mobs.push(m);
        return;
      }
      let y;
      if(underground){
        // cave pocket near the player's depth, well below the surface — deep
        // spawns actually happen IN the caves, not teleported to the surface
        y=null; const py0=Math.floor(this.player.pos.y);
        for(let dy=-4;dy<=4;dy++){ const yy=py0+dy;
          if(yy>2 && !this.world.isSolid(x,yy+1,z) && !this.world.isSolid(x,yy+2,z) && this.world.isSolid(x,yy,z) && yy<this.world.surfaceY(x,z)-3){ y=yy; break; } }
        if(y===null) return;
      } else y=this.world.surfaceY(x,z);
      if(this.world.getBlock(x,y+1,z)===B.WATER) return;   // submerged lakebed
      if(this.world.isSolid(x,y+1,z)) return;
      if(d.biome && this.world.biomeAt(x,z,y)!==BIOMES[d.biome]) return;
      // ecology: warm-blooded animals don't live in the cold — keep them out of
      // snow biomes (the cold-adapted frostling has that range to itself)
      if(d.warm && this.world.biomeAt(x,z,y)===BIOMES.snow) return;
      // never pop into existence in plain view: reject spots in the camera cone
      // with a clear sight line (mirrors _mobLOS's DDA)
      const p=this.player, ddx=x+0.5-p.pos.x, ddy=y+1.5-(p.pos.y+p.eye), ddz=z+0.5-p.pos.z;
      const dl=Math.hypot(ddx,ddy,ddz)||1;
      if((ddx/dl)*-Math.sin(p.yaw)+(ddz/dl)*-Math.cos(p.yaw)>0.2){
        if(!raycastVoxel({x:p.pos.x,y:p.pos.y+p.eye,z:p.pos.z},{x:ddx/dl,y:ddy/dl,z:ddz/dl},dl,(bx,by,bz)=>this.world.isSolid(bx,by,bz))) return;
      }
      const m=new Mob(kind,x+0.5,y+1,z+0.5); this.scene.add(m.group); this.mobs.push(m);
    };
    if(!night && passives<7 && Math.random()<0.4){ const k=['grazer','clucker','snuffler','hopper','strider'][(Math.random()*5)|0]; tryAt(k); }
    if(!night && passives<7 && Math.random()<0.22) tryAt('frostling');
    if(!night && passives<7 && Math.random()<0.22) tryAt('sandskink');
    if(!night && passives<7 && Math.random()<0.22) tryAt('craghorn');
    // night pressure ramps with the day count: day 2 is mostly shades, the heavy
    // hitters (brute/wisp/bomber) weigh in more each night until ~day 9
    const ramp=this._directorPressure();
    // First night teaches shelter and weapon use without dumping the full mob
    // roster on a new player: at most two basic shades, only after deep dusk.
    if(night && this.day===1 && this.time>0.84 && hostiles<2 && Math.random()<0.16) tryAt('shade');
    if(night && this.day>1 && hostiles<4+((7*ramp)|0) && Math.random()<0.28+0.38*ramp){
      const r=Math.random()*(0.7+0.3*ramp);
      const k=r<0.30?'shade':r<0.42?'spitter':r<0.52?'burrower':r<0.62?'crawler':r<0.72?'gelcube':r<0.82?'brute':r<0.92?'wisp':'bomber';
      tryAt(k);
    }
    // underground burrowers regardless of time when player is deep
    if(this.player.pos.y<SEA_LEVEL-6 && hostiles<14 && Math.random()<0.4) tryAt('burrower',true);
    if(fishCount<20 && Math.random()<0.45) tryAt('fish');
    // deep-ocean worlds: wild serpents prowl open water (rarer than lair guards)
    if(this.world.genVer>=2 && hostiles<10 && Math.random()<0.10) tryAt('sea_serpent');
  }
  // Aethon wildlife: skittering passives, hostile scouts, and a rare brute —
  // the planet is alive and dangerous at all hours
  _spawnAliens(){
    let hostiles=0,passives=0;
    for(const m of this.mobs){ if(m.def.hostile) hostiles++; else passives++; }
    const px=this.player.pos.x, pz=this.player.pos.z;
    const tryAt=(kind)=>{
      const ang=Math.random()*6.28, dist=14+Math.random()*16;
      const x=Math.floor(px+Math.cos(ang)*dist), z=Math.floor(pz+Math.sin(ang)*dist);
      const y=this.world.surfaceY(x,z);
      if(this.world.isSolid(x,y+1,z) || this.world.isSolid(x,y+2,z)) return;
      const p=this.player, ddx=x+0.5-p.pos.x, ddy=y+1.5-(p.pos.y+p.eye), ddz=z+0.5-p.pos.z, dl=Math.hypot(ddx,ddy,ddz)||1;
      if((ddx/dl)*-Math.sin(p.yaw)+(ddz/dl)*-Math.cos(p.yaw)>0.2 &&
        !raycastVoxel({x:p.pos.x,y:p.pos.y+p.eye,z:p.pos.z},{x:ddx/dl,y:ddy/dl,z:ddz/dl},dl,(bx,by,bz)=>this.world.isSolid(bx,by,bz))) return;
      const m=new Mob(kind,x+0.5,y+1,z+0.5); this.scene.add(m.group); this.mobs.push(m);
    };
    if(passives<5 && Math.random()<0.35) tryAt('skitter');
    if(hostiles<6 && Math.random()<0.4) tryAt(Math.random()<0.75?'alien_scout':'alien_brute');
    // the outpost court: nobles + the Alien Ruler take their places when you arrive
    if(this.world.outposts) for(const O of this.world.outposts){
      if(O._spawned) continue;
      if(Math.hypot(O.x-px, O.z-pz)>40) continue;
      if(this.mobs.some(m=>m.kind==='alien_ruler'&&m.home&&m.home.x===O.x&&m.home.z===O.z)){ O._spawned=true; continue; }
      O._spawned=true;
      this._milestone('outpost','You found an alien outpost.');
      if(this.milestones && this.milestones.slayRuler) continue;
      const oy=this.world.surfaceY(O.x,O.z);
      const ruler=new Mob('alien_ruler', O.x+0.5, oy+1, O.z-3.5); ruler.home={x:O.x,z:O.z}; ruler.persistent=true;
      this.scene.add(ruler.group); this.mobs.push(ruler);
      for(let i=0;i<3;i++){ const nx=O.x-8+i*8, nz=O.z+(i%2?5:-1); const ny=this.world.surfaceY(nx,nz);
        const n=new Mob('alien_noble', nx+0.5, ny+1, nz+0.5); n.home={x:O.x,z:O.z}; n.persistent=true;
        this.scene.add(n.group); this.mobs.push(n); }
    }
  }
  // a daytime destination for a villager, derived from the village centre it remembers
  // (farmers favour the farm plot; everyone else mills around the well + nearby spots)
  // scan the village farm plot (origin v.x-3,v.z+9, 7×7) for a mature crop to harvest.
  // Only runs on goal-repick (every ~4-9s per farmer), never per-frame — 49 block reads max.
  _villagerFarmTask(m){
    const h=m.home; if(!h) return null;
    const fx=h.x-3, fz=h.z+9;
    for(let dx=0;dx<7;dx++) for(let dz=0;dz<7;dz++){
      const wx=fx+dx, wz=fz+dz;
      const yy=this.world.surfaceY(wx,wz)+1;
      const id=this.world.getBlock(wx,yy,wz);
      // the plot self-ticks on this scan cadence so village crops grow even when
      // the player is far away (player-proximity growth only covers ~5 blocks)
      if(Math.random()<0.15){
        if(id===B.WHEAT0||id===B.WHEAT1||id===B.WHEAT2) this.setBlock(wx,yy,wz,id+1);
        else if(id===B.CARROT0||id===B.CARROT1||id===B.CARROT2) this.setBlock(wx,yy,wz,id+1);
        else if(id===B.POTATO0||id===B.POTATO1||id===B.POTATO2) this.setBlock(wx,yy,wz,id+1);
      }
      if(id===B.WHEAT3||id===B.CARROT3||id===B.POTATO3) return { x:wx+0.5, z:wz+0.5, harvest:[wx,yy,wz,id] };
    }
    return null;
  }
  // nearest village chest to this villager's home (house/market/blacksmith chests
  // are registered in world.chests at gen time)
  _villagerChest(m){
    const h=m.home; if(!h) return null;
    let best=null, bd=26*26;
    for(const k of this.world.chests.keys()){
      const c=k.split(',').map(Number);
      const d2=(c[0]-h.x)*(c[0]-h.x)+(c[2]-h.z)*(c[2]-h.z);
      if(d2<bd){ bd=d2; best={ x:c[0]+0.5, z:c[2]+0.5, deposit:k }; }
    }
    return best;
  }
  _villagerGoal(m){
    const h=m.home; if(!h) return null;
    const farm={x:h.x-3, z:h.z+12}, well={x:h.x+2, z:h.z};   // stand BESIDE the well (its centre is water)
    const wander={x:h.x+((Math.random()*18-9)|0), z:h.z+((Math.random()*18-9)|0)};
    const pois = m.role==='farmer' ? [farm, farm, well, wander] : [well, wander, wander, farm];
    return pois[(Math.random()*pois.length)|0];
  }
  updateMobs(dt){
    const localP=this.player;
    const remote=(typeof LAN!=='undefined'&&LAN.connected&&LAN.isHost&&LAN._remotePos&&LAN._remotePos.dim===(this.dimension||'overworld'))?LAN._remotePos:null;
    let remoteP=null;
    if(remote){
      remoteP=this._remoteMobTarget||(this._remoteMobTarget={pos:new THREE.Vector3(),eye:1.62,inWater:false});
      remoteP.pos.set(remote.x,remote.y,remote.z); remoteP.inWater=!!remote.wet;
    }
    const day = this.time>0.25 && this.time<0.75; const night=!day;
    if(this.villageAngerT>0) this.villageAngerT=Math.max(0,this.villageAngerT-dt);
    if(this.alienAngerT>0) this.alienAngerT=Math.max(0,this.alienAngerT-dt);
    if(this.seaAngerT>0) this.seaAngerT=Math.max(0,this.seaAngerT-dt);
    if(!this.alarms) this.alarms=[]; else for(let i=this.alarms.length-1;i>=0;i--) if((this.alarms[i].t-=dt)<=0) this.alarms.splice(i,1);
    for(let i=this.mobs.length-1;i>=0;i--){
      const m=this.mobs[i]; const d=m.def;
      // co-op ghost (host's mob mirrored on the guest): position driven by LAN, no local AI
      if(m._net){ m.anim+=dt*6; this._animateMob(m,!!m._netMoving); m.group.position.set(m.pos.x,m.pos.y,m.pos.z); m.group.rotation.y=m.yaw; if(m.hurtT>0) m.hurtT-=dt; this._setMobFlash(m,m.hurtT>0); continue; }
      const localDist=m.pos.distanceTo(localP.pos), remoteDist=remoteP?m.pos.distanceTo(remoteP.pos):Infinity;
      const targetRemote=remoteDist<localDist, p=targetRemote?remoteP:localP, dist=Math.min(localDist,remoteDist);
      // Discovery Journal: first close sighting of each creature kind
      if(dist<14 && this.journal && !this.journal.mobs[m.kind]){
        this.journal.mobs[m.kind]=1;
        this.onToast&&this.onToast('✦ Discovered: '+m.kind.replace(/_/g,' ').replace(/\b\w/g,ch=>ch.toUpperCase()));
      }
      // despawn far non-persistent; persistent settlers unload but allow respawn
      if(!m.persistent && dist>56){ this._removeMob(m); continue; }
      if(m.persistent && !m.tamed && dist>84){   // keep tamed mounts loaded so they survive & serialize
        if(m.home){ for(const arr of [this.world.villages,this.world.seaLairs,this.world.outposts,this.world.seaCities]) if(arr){ const h=arr.find(o=>o.x===m.home.x&&o.z===m.home.z); if(h) h._spawned=false; } }
        this._removeMob(m); continue; }
      // bad mobs can't survive open daylight — any hostile exposed to the sky
      // burns to death after dawn (fresh ones respawn at night). Burrowers etc.
      // underground are spared by the surface check.
      const _inWater = this.world.getBlock(Math.floor(m.pos.x),Math.floor(m.pos.y),Math.floor(m.pos.z))===B.WATER;
      if(d.hostile && !d.aquatic && !_inWater && day && this.world.surfaceY(Math.floor(m.pos.x),Math.floor(m.pos.z))<=Math.floor(m.pos.y)+1){ m.hp-=dt*4; m.burning=true; if(m.hp<=0){ this._spawnParticles(m.pos.x,m.pos.y,m.pos.z,'#ff6a2a'); this._removeMob(m); continue; } }
      // drowning: non-aquatic creatures (animals, villagers, hostiles) suffocate
      // when their head is underwater. Fish/aquatic mobs are immune.
      if(!d.aquatic){
        const headWet=isWet(this.world.getBlock(Math.floor(m.pos.x),Math.floor(m.pos.y+Math.min(1.4,(m.height||1)*0.85)),Math.floor(m.pos.z)));
        m._airT = headWet ? (m._airT||0)+dt : 0;
        if(m._airT>9){ m.hp-=dt*2; if(m.hp<=0){ this._spawnParticles(m.pos.x,m.pos.y+0.5,m.pos.z,'#4a90d9'); this._removeMob(m); continue; } }
      }
      if(m.state==='ridden') continue;   // the mount is driven by _rideTick, not the AI
      m.timer-=dt; m.atkCd-=dt; if(m.hurtT) m.hurtT-=dt; if(m.fleeT>0) m.fleeT-=dt; if(m.alarmCd>0) m.alarmCd-=dt;
      if(m.lastSeen){ m.lastSeen.t-=dt; if(m.lastSeen.t<=0) m.lastSeen=null; }
      // nocturnal stalkers recoil from light — torches/lanterns within ~6 blocks push them back,
      // so a lit base is a safe haven (mirrors the nearHeat scan in updateWarmth)
      if(d.nocturnal && m.fleeT<=0){ for(const k of this.world.lights){ const c=this._lightCoord(k), lx=c.x+0.5, lz=c.z+0.5, dx=lx-m.pos.x, dy=c.y+0.6-m.pos.y, dz=lz-m.pos.z; if(dx*dx+dy*dy+dz*dz<36){ m.fleeT=2.5; m.fleeFrom={x:lx,z:lz}; break; } } }
      if(m.fleeT<=0) m.fleeFrom=null;

      if(d.aquatic){ if(d.seaCreature) this._updateSeaCreature(m,dt,dist,targetRemote); else this._updateFish(m,dt); continue; }

      // bombers self-detonate on approach instead of melee-attacking
      if(d.explode && this.mode==='survival' && dist<2.2){
        if(targetRemote) LAN.send({t:'hurt',dmg:d.dmg,src:{x:m.pos.x,y:m.pos.y,z:m.pos.z}}); else this.hurtPlayer(d.dmg, m.pos);
        this._spawnParticles(Math.floor(m.pos.x),Math.floor(m.pos.y),Math.floor(m.pos.z),'#e8a05a');
        Audio.play('break'); this._removeMob(m); continue;
      }
      // wisps blink toward the player instead of walking when chasing —
      // makes them feel genuinely dangerous since you can't simply outrun one
      if(d.teleport && this.mode==='survival' && dist<d.sense && dist>3 && m.fleeT<=0 && Math.random()<dt*0.6){
        let spot=null;
        for(let n=0;n<6&&!spot;n++){
          const ang=Math.random()*6.28, nx=p.pos.x+Math.cos(ang)*(3+Math.random()*2), nz=p.pos.z+Math.sin(ang)*(3+Math.random()*2);
          const bx=Math.floor(nx), bz=Math.floor(nz), ny=this.world.surfaceY(bx,bz)+1;
          if(this.world.isSolid(bx,ny,bz)||this.world.isSolid(bx,ny+1,bz)) continue;
          let lit=false; for(const k of this.world.lights){ const c=this._lightCoord(k); if((c.x+0.5-nx)**2+(c.y+0.5-ny)**2+(c.z+0.5-nz)**2<25){ lit=true; break; } }
          if(!lit) spot={x:nx,y:ny,z:nz};
        }
        if(spot){ m.pos.set(spot.x,spot.y,spot.z); m.group.position.copy(m.pos); this._spawnParticles(Math.floor(spot.x),Math.floor(spot.y),Math.floor(spot.z),'#7a3fb0'); }
      }

      // ---- state selection ----
      if(d.ruler==='alien'){
        // the Alien Ruler: holds his throne dais, WATCHES intruders, wrathful once any alien is harmed
        if(this.mode==='survival' && this.alienAngerT>0 && dist<d.sense){ m.state='chase';
          // boss: void bolts at range + summon scouts when wounded
          if(dist>3.5 && dist<15 && (m._boltCd=(m._boltCd||0)-dt)<=0){ m._boltCd=2.4; this._mobShoot(m,'#c84aff',targetRemote); }
          if(m.hp<m.maxhp*0.5 && !m._summoned){ m._summoned=true;
            for(let i=0;i<2;i++){ const s2=new Mob('alien_scout', m.pos.x+(i?2.5:-2.5), m.pos.y, m.pos.z-2); s2.home=m.home; this.scene.add(s2.group); this.mobs.push(s2); }
            this.onFlash&&this.onFlash('The Ruler of Aethon summons his hunters!'); }
        }
        else if(m.home && Math.hypot(m.home.x-m.pos.x,m.home.z-m.pos.z)>7){ m.state='home'; }
        else if(dist<12){ m.state='idle';   // face the visitor — deliberate, regal, no pacing
          const wy=Math.atan2(p.pos.x-m.pos.x, p.pos.z-m.pos.z); let dy2=wy-m.yaw; while(dy2>Math.PI)dy2-=6.283; while(dy2<-Math.PI)dy2+=6.283; m.yaw+=clamp(dy2,-2*dt,2*dt);
          if(dist<5 && !m._warned && !(this.milestones&&this.milestones.friendRuler)){ m._warned=true; this.onFlash&&this.onFlash('The Ruler of Aethon studies you coldly. Kneel (F) — or keep your blade sheathed.'); } }
        else { m._warned=false; if(m.timer<=0){ m.state='idle'; m.timer=3+Math.random()*4;
          const wy=m.yaw+(Math.random()-0.5)*1.4; let dy2=wy-m.yaw; m._scan=wy; } if(m._scan!=null){ let dy2=m._scan-m.yaw; while(dy2>Math.PI)dy2-=6.283; while(dy2<-Math.PI)dy2+=6.283; m.yaw+=clamp(dy2,-1.2*dt,1.2*dt); } }
      } else if(d.noble){
        // nobles keep to the outpost, flee when the player turns violent; face visitors politely
        if(m.fleeT>0 || (this.alienAngerT>0&&dist<10)) m.state='flee';
        else if(dist<6){ m.state='idle'; const wy=Math.atan2(p.pos.x-m.pos.x, p.pos.z-m.pos.z); let dy2=wy-m.yaw; while(dy2>Math.PI)dy2-=6.283; while(dy2<-Math.PI)dy2+=6.283; m.yaw+=clamp(dy2,-2*dt,2*dt); }
        else if(m.timer<=0){ m.state=Math.random()<0.5?'wander':'idle'; m.timer=2+Math.random()*4; m.yaw=Math.random()*6.28;
          if(m.home && Math.hypot(m.home.x-m.pos.x,m.home.z-m.pos.z)>9) m.state='home'; }
      } else if(d.guardian){
        // peaceful until any settler gets hit anywhere (villageAngerT, set in
        // attack()) — then every guard in sense range turns on the player
        if(this.mode==='survival' && this.villageAngerT>0 && dist<d.sense) m.state='chase';
        else if(m.timer<=0){ m.state=Math.random()<0.5?'wander':'idle'; m.timer=2+Math.random()*4; m.yaw=Math.random()*6.28; }
      } else if(d.hostile){
        // fleeing light takes priority; otherwise hostiles stalk harder after dark —
        // nocturnal shade/wisp get a much wider sense radius at night. Aggro is LOS-gated
        // so a wall/closed door blocks it; wisp teleports so it ignores LOS, dist<2 always senses
        if(m.fleeT>0) m.state='flee';
        else if(this.mode==='survival' && dist<d.sense*(night?(d.nocturnal?1.3:1.15):1) && (d.teleport||dist<2||this._mobLOS(m,p.pos))){ m.state='chase'; m.lastSeen={x:p.pos.x,z:p.pos.z,t:2.5}; if(m.alarmCd<=0){ this._pushAlarm(p.pos.x,p.pos.z); m.alarmCd=1.5; } }
        else if(m.lastSeen && m.lastSeen.t>0) m.state='investigate';
        else if(this._alarmInvestigate(m,dist)) m.state='investigate';
        else if(m.timer<=0){ m.state=Math.random()<0.6?'wander':'idle'; m.timer=2+Math.random()*3; }
      } else if(d.settler){
        // daily life: by day walk to a purposeful spot (farmers→farm, others→well/wander)
        // and pause there; at night walk HOME to their OWN house (m.bed) and turn in
        if(m.role==null) m.role = Math.random()<0.45?'farmer':'villager';
        if(m.fleeT>0) m.state='flee';
        else if(night){                                        // go to bed at night
          m.goal = m.bed || m.home;
          const bd=m.goal?Math.hypot(m.goal.x-m.pos.x,m.goal.z-m.pos.z):0;
          m.state = bd>1.3?'goGoal':'idle';
        } else {
          if(!m.goal || m.timer<=0 || m._wasNight){
            // task priority: carrying a full load → store it; farmer + mature crop → harvest it; else social/wander goal
            m.goal = ((m.carry||0)>=4 && this._villagerChest(m))
                  || (m.role==='farmer' && this._villagerFarmTask(m))
                  || this._villagerGoal(m);
            m.timer=4+Math.random()*5;
          }
          const gd=m.goal?Math.hypot(m.goal.x-m.pos.x,m.goal.z-m.pos.z):0;
          if(gd>1.7) m.state='goGoal';
          else {
            m.state='idle'; m.yaw+=(Math.random()-0.5)*0.4;   // arrived → look around / work
            if(m.goal && m.goal.harvest){                     // harvest the mature crop + replant
              const [hx2,hy2,hz2,hid]=m.goal.harvest;
              if(this.world.getBlock(hx2,hy2,hz2)===hid){
                this.setBlock(hx2,hy2,hz2, hid===B.WHEAT3?B.WHEAT0: hid===B.CARROT3?B.CARROT0:B.POTATO0);
                m.carry=(m.carry||0)+1;
                this._spawnParticles(hx2,hy2,hz2,'#c9a23a');
              }
              m.goal=null; m.timer=1.5+Math.random()*2;       // brief pause, then next task
            } else if(m.goal && m.goal.deposit){              // put the harvest into the village chest
              const slots=this.world.chests.get(m.goal.deposit);
              if(slots){ const kinds=['wheat','carrot','potato'];
                while((m.carry||0)>0){ const it=kinds[(Math.random()*3)|0];
                  let s=slots.find(s=>s&&s.item===it&&s.count<64);
                  if(s) s.count++; else { const i=slots.findIndex(s=>!s); if(i<0) break; slots[i]={item:it,count:1}; }
                  m.carry--; }
              }
              m.carry=0; m.goal=null; m.timer=2+Math.random()*2;
            }
          }
        }
        m._wasNight=night;
        if(m.timer<=0) m.timer=2+Math.random()*3;
      } else {
        if(m.fleeT>0) m.state='flee'; else if(m.timer<=0){ m.state=Math.random()<0.5?'wander':'idle'; m.timer=2+Math.random()*4; m.yaw=Math.random()*6.28; }
      }

      // ---- desired movement ----
      let mvx=0,mvz=0, sp=d.speed;
      if(m.state==='chase'){ const a=Math.atan2(p.pos.x-m.pos.x,p.pos.z-m.pos.z); m.yaw=a; mvx=Math.sin(a); mvz=Math.cos(a); if(night && !d.teleport) sp*=d.nocturnal?1.25:1.12;
        if(d.ranged){
          const hasShot=this._mobLOS(m,p.pos), near=5.5, far=9.5;
          if(m.strafeSign==null) m.strafeSign=Math.random()<0.5?-1:1;
          m.strafeT=(m.strafeT||0)-dt;
          if(m.strafeT<=0){ m.strafeT=1.1+Math.random()*1.5; if(Math.random()<0.45) m.strafeSign*=-1; }
          if(dist<near){ mvx=-Math.sin(a); mvz=-Math.cos(a); sp*=0.82; }
          else if(dist>far){ mvx=Math.sin(a); mvz=Math.cos(a); sp*=0.78; }
          else { mvx=Math.cos(a)*m.strafeSign; mvz=-Math.sin(a)*m.strafeSign; sp*=0.62; }
          if(hasShot && dist<13 && m.atkCd<=0){ this._mobShoot(m,null,targetRemote); m.atkCd=1.9+Math.random()*0.55; }
        }
        if(dist<1.6 && m.atkCd<=0 && !d.ranged && this._mobLOS(m,p.pos)){ if(targetRemote) LAN.send({t:'hurt',dmg:d.dmg,src:{x:m.pos.x,y:m.pos.y,z:m.pos.z}}); else this.hurtPlayer(d.dmg,m.pos); m.atkCd=1.0; this._mobAttackAnim(m); }
      } else if(m.state==='flee'){ const q=m.fleeFrom||p.pos, a=Math.atan2(m.pos.x-q.x,m.pos.z-q.z); m.yaw=a; mvx=Math.sin(a); mvz=Math.cos(a); sp*=1.4; }
      else if(m.state==='investigate' && m.lastSeen){ const lx=m.lastSeen.x-m.pos.x, lz=m.lastSeen.z-m.pos.z; m.yaw=Math.atan2(lx,lz); mvx=Math.sin(m.yaw); mvz=Math.cos(m.yaw); sp*=0.8; if(lx*lx+lz*lz<1.44) m.lastSeen=null; }
      else if(m.state==='wander'){ mvx=Math.sin(m.yaw); mvz=Math.cos(m.yaw); sp*=0.5; }
      else if(m.state==='home' && m.home){ if(m._avoidT>0){ m._avoidT-=dt; mvx=Math.sin(m.yaw); mvz=Math.cos(m.yaw); sp*=0.7; } else { const a=Math.atan2(m.home.x-m.pos.x,m.home.z-m.pos.z); const hd=Math.hypot(m.home.x-m.pos.x,m.home.z-m.pos.z); if(hd>1.2){ m.yaw=a; mvx=Math.sin(a); mvz=Math.cos(a); sp*=0.7; } } }
      else if(m.state==='goGoal' && m.goal){ if(m._avoidT>0){ m._avoidT-=dt; mvx=Math.sin(m.yaw); mvz=Math.cos(m.yaw); sp*=0.6; } else { const a=Math.atan2(m.goal.x-m.pos.x,m.goal.z-m.pos.z); m.yaw=a; mvx=Math.sin(a); mvz=Math.cos(a); sp*=0.6; } }

      // ---- physics (simple) ----
      m.vel.y-=26*dt;
      // horizontal with obstacle hop / cliff avoid (resolve target cell first)
      // fold hit knockback impulse into the move, then damp it out
      let nx=m.pos.x+(mvx*sp+m.vel.x)*dt, nz=m.pos.z+(mvz*sp+m.vel.z)*dt;
      m.vel.x*=Math.max(0,1-6*dt); m.vel.z*=Math.max(0,1-6*dt);
      // settlers/pets/guards may pass through doorways so a closed door never traps
      // them out of (or inside) a house — closed doors aren't an obstacle for them
      const footAhead=this._mobBodyBlocked(m,nx,m.pos.y,nz);
      if(footAhead){ if(m.onGround && !this._mobBodyBlocked(m,nx,m.pos.y+1,nz)) m.vel.y=7; else { nx=m.pos.x; nz=m.pos.z; m.yaw+=1.5; m._avoidT=0.7; if(d.ranged) m.strafeSign=(m.strafeSign||1)*-1; } }
      else {
        // cliff avoidance for passive/settler
        if((!d.hostile) && m.state!=='flee'){ const below=this.world.isSolid(Math.floor(nx),Math.floor(m.pos.y)-2,Math.floor(nz)); if(!below){ nx=m.pos.x; nz=m.pos.z; m.yaw+=2.1; m._avoidT=0.7; } }
      }
      // avoid water
      if(this.world.getBlock(Math.floor(nx),Math.floor(m.pos.y),Math.floor(nz))===B.WATER){ nx=m.pos.x; nz=m.pos.z; m.yaw+=2.0; m._avoidT=0.7; }
      m.pos.x=nx; m.pos.z=nz; m.pos.y+=m.vel.y*dt;
      if(m.pos.y<-10){ this._removeMob(m); continue; }
      // ground snap — sample at the mob's NEW x/z (post-move) and hard-clamp
      // so it can never render sunk into solid ground even for one frame
      const gy=Math.floor(m.pos.y-0.05);
      if(this.world.isSolid(Math.floor(m.pos.x),gy,Math.floor(m.pos.z)) && m.pos.y<gy+1.02){ m.pos.y=gy+1; m.vel.y=Math.max(0,m.vel.y); m.onGround=true; }
      else m.onGround=false;

      // ---- animation ----
      const moving=(mvx||mvz)&&m.state!=='idle';
      m.anim+= dt*(moving?8:2);
      this._animateMob(m,moving);
      m.group.position.set(m.pos.x,m.pos.y,m.pos.z);
      m.group.rotation.y=m.yaw;
      this._setMobFlash(m,m.hurtT>0);
    }
  }
  _updateFish(m,dt){
    // when hit, attack() sets fleeT/hurtT — dart away from the player and flash red
    if(m.fleeT>0){ const p=this.player; m.yaw=Math.atan2(m.pos.x-p.pos.x, m.pos.z-p.pos.z); }
    else if(m.timer<=0){ m.timer=1.5+Math.random()*2; m.yaw+=(Math.random()-0.5)*2.4; m._vy=(Math.random()-0.5)*0.5; }
    const sp=m.def.speed*(m.fleeT>0?1.1:0.5);
    let nx=m.pos.x+Math.sin(m.yaw)*sp*dt, nz=m.pos.z+Math.cos(m.yaw)*sp*dt, ny=m.pos.y+(m._vy||0)*dt;
    if(this.world.getBlock(Math.floor(nx),Math.floor(ny),Math.floor(nz))!==B.WATER){ m.yaw+=2.4; m._vy=-(m._vy||0); nx=m.pos.x; nz=m.pos.z; ny=m.pos.y; }
    m.pos.x=nx; m.pos.z=nz; m.pos.y=clamp(ny, SEA_LEVEL-4, SEA_LEVEL-0.6);
    m.anim+=dt*6;
    const parts=m.group.userData.parts; if(parts.tail) parts.tail.rotation.y=Math.sin(m.anim)*0.5;
    m.group.position.set(m.pos.x,m.pos.y,m.pos.z); m.group.rotation.y=m.yaw;
    this._setMobFlash(m,m.hurtT>0);
  }
  // deep-sea creatures (serpents + the Tide Lord): free 3D swim, neutral-until-
  // provoked for the lord; serpents are territorial unless the lord befriended you
  _updateSeaCreature(m,dt,dist,targetRemote=false){
    const p=targetRemote&&this._remoteMobTarget?this._remoteMobTarget:this.player, d=m.def;
    const angered=this.seaAngerT>0;
    const friendly=this.milestones && this.milestones.friendTide && !angered;
    // they fight if you're in the water — or anywhere inside their own territory
    // (the palace/lair air pockets are THEIR halls; hiding there won't save you)
    const inTerritory = m.home && Math.hypot(p.pos.x-m.home.x, p.pos.z-m.home.z)<26;
    const wantChase = this.mode==='survival' && dist<d.sense && (p.inWater || inTerritory || dist<6) &&
      (angered || (d.hostile && !friendly));
    // anchor: the ruler holds his throne, guards hold their posts, serpents patrol home
    const anchor = m._post || m.home || {x:m.pos.x,z:m.pos.z};
    const adx=anchor.x-m.pos.x, adz=anchor.z-m.pos.z, adist=Math.hypot(adx,adz);
    // ---- pick DESIRED heading + speed by state (yaw only eases toward it, below) ----
    let wantYaw=m.yaw, spMul=0, wantVy=0;
    if(wantChase){
      wantYaw=Math.atan2(p.pos.x-m.pos.x, p.pos.z-m.pos.z);
      wantVy=clamp((p.pos.y+1.0)-m.pos.y, -2, 2); spMul=1.0;
      if(dist<1.9 && m.atkCd<=0){ if(targetRemote) LAN.send({t:'hurt',dmg:d.dmg,src:{x:m.pos.x,y:m.pos.y,z:m.pos.z}}); else this.hurtPlayer(d.dmg,m.pos); m.atkCd=1.1; this._spawnParticles(p.pos.x,p.pos.y+1,p.pos.z,'#4a90d9'); }
      // BOSS mechanics for the ruler: water bolt volley at range + summon the guard when wounded
      if(d.ruler){
        if(dist>3.5 && dist<15 && (m._boltCd=(m._boltCd||0)-dt)<=0){ m._boltCd=2.6; this._mobShoot(m,'#3ae0ff',targetRemote); }
        if(m.hp<m.maxhp*0.5 && !m._summoned){ m._summoned=true;
          for(let i=0;i<2;i++){ const g2=new Mob('tide_guard', m.pos.x+(i?2:-2), m.pos.y, m.pos.z-2); g2.home=m.home; g2._post={x:m.pos.x+(i?4:-4),z:m.pos.z-3}; this.scene.add(g2.group); this.mobs.push(g2); }
          this.onFlash&&this.onFlash('The Drowned King calls the deep to arms!'); Audio.play('mobhurt'); }
      }
    } else if(m.fleeT>0){ wantYaw=Math.atan2(m.pos.x-p.pos.x, m.pos.z-p.pos.z); wantVy=(Math.random()-0.5); spMul=1.1; }
    else if(d.ruler || m._post){
      // COURT AI: hold near the anchor. Watch the player when close; drift back when far.
      if(adist>3){ wantYaw=Math.atan2(adx,adz); spMul=0.5; wantVy=clamp(((anchor.y!=null?anchor.y:m.pos.y))-m.pos.y,-1,1); }
      else if(dist<12){ wantYaw=Math.atan2(p.pos.x-m.pos.x, p.pos.z-m.pos.z); spMul=0;   // face the intruder, hold ground
        if(d.ruler && dist<5 && !m._warned && !friendly){ m._warned=true; this.onFlash&&this.onFlash((m._king?'The Drowned King':'The Tide Lord')+' watches you. Tread carefully — or kneel (F).'); } }
      else { if(m.timer<=0){ m.timer=3+Math.random()*3; m._scanYaw=m.yaw+(Math.random()-0.5)*1.6; } wantYaw=m._scanYaw!=null?m._scanYaw:m.yaw; spMul=0; wantVy=Math.sin(m.anim*0.5)*0.12; }
      if(dist>=12) m._warned=false;
    }
    else {
      // serpents: wide, slow patrol arcs around home — deliberate, not jittery
      if(m.timer<=0){ m.timer=3+Math.random()*3; m._arcDir=(Math.random()<0.5?1:-1); }
      if(adist>16) wantYaw=Math.atan2(adx,adz);
      else wantYaw=m.yaw+(m._arcDir||1)*0.35;
      spMul=0.45; wantVy=Math.sin(m.anim*0.4)*0.3;
    }
    // ---- smooth clamped turn (no snapping, no per-frame flips) ----
    let dyaw=wantYaw-m.yaw; while(dyaw>Math.PI) dyaw-=6.283; while(dyaw<-Math.PI) dyaw+=6.283;
    m.yaw+=clamp(dyaw, -2.6*dt, 2.6*dt);
    // ---- move through any NON-SOLID cell (water OR the palace air pockets) ----
    const sp=d.speed*spMul;
    let nx=m.pos.x+Math.sin(m.yaw)*sp*dt, nz=m.pos.z+Math.cos(m.yaw)*sp*dt, ny=m.pos.y+(wantVy||0)*dt;
    const blockedCell=this.world.isSolid(Math.floor(nx),Math.floor(ny),Math.floor(nz)) || this.world.isSolid(Math.floor(nx),Math.floor(ny+1),Math.floor(nz));
    if(blockedCell && sp>0){
      m._stuckT=(m._stuckT||0)+dt;
      // steer along the wall first; after 1.2s truly stuck, turn around + nudge vertically
      if(m._stuckT>1.2){ m._stuckT=0; m._scanYaw=m.yaw+Math.PI+(Math.random()-0.5); m.timer=0.5; wantVy=0.8; }
      nx=m.pos.x; nz=m.pos.z; ny=m.pos.y+0.4*dt;
    } else m._stuckT=0;
    m.pos.x=nx; m.pos.z=nz; m.pos.y=clamp(ny, 2, SEA_LEVEL-0.6);
    m.anim+=dt*(spMul>0.6?6:2.5);
    const parts=m.group.userData.parts; if(parts&&parts.tail) parts.tail.rotation.y=Math.sin(m.anim)*0.5;
    m.group.position.set(m.pos.x,m.pos.y,m.pos.z); m.group.rotation.y=m.yaw;
    this._setMobFlash(m,m.hurtT>0);
  }
  // gift that can never be lost: overflow drops at the player's feet
  _giveOrDrop(id,n){ const left=this.giveItem(id,n); if(left>0) this._spawnDrop(id,left,this.player.pos.x,this.player.pos.y+0.5,this.player.pos.z); }
  // interact (F) with a nearby ruler while unprovoked → one-time friendship gift
  interactRuler(){
    let best=null,bd=4.5;
    for(const m of this.mobs){ if(!m.def.ruler) continue; const dd=Math.hypot(m.pos.x-this.player.pos.x,m.pos.z-this.player.pos.z); if(dd<bd){ bd=dd; best=m; } }
    if(!best) return false;
    if(!this.milestones) this.milestones={};
    if(best.kind==='tide_lord'){
      const title=best._king?'The Drowned King':'The Tide Lord';
      if(this.seaAngerT>0){ this.onFlash&&this.onFlash(title+' seethes — the deep remembers.'); return true; }
      if(!this.milestones.friendTide){ this._giveOrDrop('abyss_pearl',2); if(best._king) this._giveOrDrop('ocean_crystal',1); this._milestone('friendTide',title+' accepts you. The deep will not hunt you unprovoked.'); }
      else this.onFlash&&this.onFlash(title+' regards you calmly.');
      return true;
    }
    if(best.kind==='alien_ruler'){
      if(this.alienAngerT>0){ this.onFlash&&this.onFlash('The Ruler of Aethon turns away in fury.'); return true; }
      if(!this.milestones.friendRuler){ this._giveOrDrop('alien_alloy',4); this._giveOrDrop('space_shard',2); this._milestone('friendRuler','The Alien Ruler acknowledges you as a friend of Aethon.'); }
      else this.onFlash&&this.onFlash('The Alien Ruler inclines its crown toward you.');
      return true;
    }
    return false;
  }
  // spawn the deep's court at any generated sea lair the player nears
  spawnSeaCourt(){
    if(this.dimension!=='overworld') return;
    // small lair shrines: serpent guards only (the lesser deep)
    if(this.world.seaLairs) for(const L of this.world.seaLairs){
      if(L._spawned) continue;
      if(Math.hypot(L.x-this.player.pos.x, L.z-this.player.pos.z)>44) continue;
      if(this.mobs.some(m=>m._home2&&m._home2.x===L.x&&m._home2.z===L.z)){ L._spawned=true; continue; }
      L._spawned=true;
      const y=Math.max(3, L.y+2);
      for(let i=0;i<3;i++){ const s=new Mob('sea_serpent', L.x+3+i*2, y+1, L.z-3+i*5); s.home={x:L.x,z:L.z}; s._home2={x:L.x,z:L.z}; this.scene.add(s.group); this.mobs.push(s); }
      this._milestone('foundLair','Something ancient stirs in the deep…');
    }
    // Aetheria — the sunken city: the DROWNED KING on his throne + guard patrol
    if(this.world.seaCities) for(const C of this.world.seaCities){
      if(C._spawned) continue;
      const cityDistance=Math.hypot(C.x-this.player.pos.x, C.z-this.player.pos.z);
      const spawn=this.player.spawn||{x:0,z:0};
      const travelled=Math.hypot(this.player.pos.x-spawn.x,this.player.pos.z-spawn.z);
      if(cityDistance>42 || travelled<96 || !this.milestones.foundLair || this.dead) continue;
      if(this.mobs.some(m=>m.kind==='tide_lord'&&m.home&&m.home.x===C.x&&m.home.z===C.z)){ C._spawned=true; continue; }
      C._spawned=true;
      this._milestone('foundCity','You have found Aetheria, the sunken city of the Drowned King.');
      if(this.milestones && this.milestones.slayTide) continue;   // the king is dead — the city is quiet
      const y=Math.max(3, C.y+3);
      const king=new Mob('tide_lord', C.x+0.5, y, C.z+5.5); king.home={x:C.x,z:C.z}; king.persistent=true; king._king=true;
      king._post={x:C.x+0.5, y:y, z:C.z+5.5};   // the throne — he holds court here
      this.scene.add(king.group); this.mobs.push(king);
      // guard posts: gate (−z), palace door, two plaza flanks — held, not wandered
      const posts=[[0,-16],[0,-9],[-8,2],[8,2]];
      for(let i=0;i<4;i++){ const gx=C.x+posts[i][0], gz=C.z+posts[i][1];
        const g=new Mob('tide_guard', gx+0.5, y, gz+0.5); g.home={x:C.x,z:C.z}; g.persistent=true;
        g._post={x:gx+0.5, y:y, z:gz+0.5};
        this.scene.add(g.group); this.mobs.push(g); }
      for(let i=0;i<2;i++){ const s=new Mob('sea_serpent', C.x-6+i*12, y, C.z-8); s.home={x:C.x,z:C.z}; this.scene.add(s.group); this.mobs.push(s); }
    }
  }
  _animateMob(m,moving){
    if(m.kind==='gelcube'){ const s=1+Math.sin(m.anim*4)*0.1; m.group.scale.set(1/s,s,1/s); return; }
    const parts=m.group.userData.parts; if(!parts) return;
    const sw=Math.sin(m.anim)*(moving?0.5:0.05);
    if(parts.legFL) parts.legFL.rotation.x=sw;
    if(parts.legFR) parts.legFR.rotation.x=-sw;
    if(parts.legBL) parts.legBL.rotation.x=-sw;
    if(parts.legBR) parts.legBR.rotation.x=sw;
    if(parts.head) parts.head.rotation.y=Math.sin(m.anim*0.3)*0.2;
    if(m.atkAnim>0){ m.atkAnim-=0.1; if(parts.armL) parts.armL.rotation.x=-m.atkAnim*2; if(parts.armR) parts.armR.rotation.x=-m.atkAnim*2; }
  }
  _mobCellBlocked(m,bx,by,bz){
    if(!this.world.isSolid(bx,by,bz)) return false;
    const id=this.world.getBlock(bx,by,bz);
    if(m.persistent&&isDoorId(id)){
      const meta=this.world.getMeta(bx,by,bz)||{};
      if(!meta.open){ meta.open=true; this.world.meta.set(this.world.bkey(bx,by,bz),meta); this._refreshObject(bx,by,bz); }
      return false;
    }
    return true;
  }
  _mobBodyBlocked(m,x,y,z){
    const x0=Math.floor(x-m.radius), x1=Math.floor(x+m.radius), z0=Math.floor(z-m.radius), z1=Math.floor(z+m.radius);
    const y0=Math.floor(y), y1=Math.floor(y+Math.max(0.2,m.height-0.05));
    for(let xx=x0;xx<=x1;xx++) for(let zz=z0;zz<=z1;zz++) for(let yy=y0;yy<=y1;yy++) if(this._mobCellBlocked(m,xx,yy,zz)) return true;
    return false;
  }
  _setMobFlash(m,flash){
    if(m._flashState===flash) return;
    m._flashState=flash;
    for(const e of m._emiMats||[]) e.mat.emissive.setHex(flash?0x771515:e.base);
  }
  _mobAttackAnim(m){ m.atkAnim=1; }
  // line-of-sight from mob eye to player eye via the shared voxel DDA — gates hostile
  // aggro so a wall or closed door (world.isSolid treats a closed door as solid) blocks the
  // chase. Pure query; small per-call alloc is fine (per hostile per 0.12s AI tick, not/frame).
  _mobLOS(m,target){
    const ex=m.pos.x, ey=m.pos.y+(m.height||1)*0.8, ez=m.pos.z;
    const tp=target||this.player.pos, tx=tp.x, ty=tp.y+1.5, tz=tp.z;
    const dx=tx-ex, dy=ty-ey, dz=tz-ez;
    const dist=Math.sqrt(dx*dx+dy*dy+dz*dz);
    if(dist<0.001) return true;
    const inv=1/dist;
    const q=this._mobLOSScratch||(this._mobLOSScratch={origin:{x:0,y:0,z:0},dir:{x:0,y:0,z:0},hit:{},ox:0,oy:0,oz:0,solid:(x,y,z)=>(x!==q.ox||y!==q.oy||z!==q.oz)&&this.world.isSolid(x,y,z)});
    q.origin.x=ex; q.origin.y=ey; q.origin.z=ez;
    q.ox=Math.floor(ex); q.oy=Math.floor(ey); q.oz=Math.floor(ez);
    q.dir.x=dx*inv; q.dir.y=dy*inv; q.dir.z=dz*inv;
    const h=raycastVoxel(q.origin,q.dir,dist,q.solid,q.hit);
    return !h.hit;
  }
  // pack-call: a hostile that spots/hurts the player drops an "alarm" here; idle hostiles within
  // sense*1.5 of an alarm (and outside sense range, so chase isn't already handling them) switch to
  // investigate that point — kill one shade next to two others and all three converge. Capped at 6,
  // decays in ~8s; hostile-only and range-limited so it never becomes map-wide omniscience, and kept
  // separate from villageAngerT so guard-rally rules are untouched.
  _pushAlarm(x,z){ if(!this.alarms) this.alarms=[]; this.alarms.push({x,z,t:8}); if(this.alarms.length>6) this.alarms.shift(); }
  // hearing: a loud player action (break/attack/shoot/sprint) drops a noise alarm with its own
  // radius. Unlike the LOS-gated chase (R1), sound passes walls — a hostile with no line of sight
  // still turns to investigate the thunk, so crouch-walking to sneak past actually matters.
  // Reuses the alarms list (capped, decayed in updateMobs); matched only in the hostile state
  // branch, so settlers/guards are unaffected. Event-driven — never called per-frame.
  _noise(x,z,r){ if(!this.alarms) this.alarms=[]; this.alarms.push({x,z,t:6,r,noise:true}); if(this.alarms.length>6) this.alarms.shift(); }
  _alarmInvestigate(m,dist){
    if(!this.alarms) return false;
    let best=null, bd=Infinity;
    for(const a of this.alarms){
      if(a.t<=0) continue;
      const R = a.noise ? a.r : m.def.sense*1.5;     // noise carries its own radius; pack-call reaches sense*1.5
      if(!a.noise && dist<m.def.sense) continue;       // pack-call in sense range → chase path owns it; noise still applies (walls block LOS, not sound)
      const dx=a.x-m.pos.x, dz=a.z-m.pos.z, dd=dx*dx+dz*dz;
      if(dd<=R*R && dd<bd){ bd=dd; best=a; }
    }
    if(best){ m.lastSeen={x:best.x,z:best.z,t:2.5}; return true; }
    return false;
  }
  _mobShoot(m,col,targetRemote=false){
    const tp=targetRemote&&typeof LAN!=='undefined'&&LAN._remotePos?LAN._remotePos:this.player.pos;
    const color=col||0x88cc55;
    const proj=this._acquireProjectile(col?'orbLarge':'orbSmall',color);
    const vel=proj.userData.velocity, dx=tp.x-m.pos.x, dy=tp.y-m.pos.y, dz=tp.z-m.pos.z, len=Math.hypot(dx,dy,dz)||1; vel.set(dx/len*12,dy/len*12,dz/len*12);
    proj.position.set(m.pos.x,m.pos.y+1,m.pos.z);
    this.drops.push({ projectile:true, targetRemote, dmg:m.def.dmg, pos:proj.position, vel, spr:proj, life:0 });
    Audio.play('place');
  }

  spawnVillageSettlers(){
    // for each loaded village, ensure its settlers exist
    for(const v of this.world.villages){
      if(v._spawned) continue;
      const cx=floorDiv(v.x,CHUNK_X), cz=floorDiv(v.z,CHUNK_Z);
      if(!this.chunkMeshes.has(cx+','+cz)) continue;     // only when nearby/loaded
      // villagers restored from the save already live here — don't double-spawn
      if(this.mobs.some(m=>m.def.settler&&m.home&&m.home.x===v.x&&m.home.z===v.z)){ v._spawned=true; continue; }
      v._spawned=true;
      this._milestone('village1','You discovered a village.');
      const n=2+((hashRand(v.x,v.z,this.world.seed^7)*3)|0);
      // each settler is tied to one of the village's houses (fixed house spots) so at
      // night they walk to THEIR house, not the communal water well
      const houseSpots=[[-13,-7],[13,8]];   // spots 0 & 3 are always houses (1=market, 2=blacksmith); spot 4 only on a 5-building roll
      for(let i=0;i<n;i++){ const x=v.x+(i*3-3), z=v.z+2; const y=this.world.surfaceY(x,z); const m=new Mob('settler',x+0.5,y+1,z+0.5); m.home={x:v.x,z:v.z}; const hs=houseSpots[i%houseSpots.length]; m.bed={x:v.x+hs[0]+1, z:v.z+hs[1]+1}; this.scene.add(m.group); this.mobs.push(m); }
      const pn=1+((hashRand(v.x+5,v.z+5,this.world.seed^13)*2)|0);
      for(let i=0;i<pn;i++){ const kind=hashRand(v.x+i,v.z-i,this.world.seed^17)<0.5?'dog':'cat'; const x=v.x+(i*2-1), z=v.z-2; const y=this.world.surfaceY(x,z); const m=new Mob(kind,x+0.5,y+1,z+0.5); m.home={x:v.x,z:v.z}; this.scene.add(m.group); this.mobs.push(m); }
      // a lone guard stands watch — harmless until you hit a settler (see attack())
      { const x=v.x-2, z=v.z+5; const y=this.world.surfaceY(x,z); const m=new Mob('guard',x+0.5,y+1,z+0.5); m.home={x:v.x,z:v.z}; this.scene.add(m.group); this.mobs.push(m); }
    }
  }

  // ---------- per-frame updates ----------
  _disposeWorldDrop(d){
    if(!d||!d.spr) return;
    this.scene.remove(d.spr);
    const sharedProduction=!!(d.spr.userData&&d.spr.userData.productionAsset), geos=new Set(), mats=new Set();
    d.spr.traverse(o=>{ if(!sharedProduction&&o.geometry) geos.add(o.geometry); if(!sharedProduction&&o.material){ const list=Array.isArray(o.material)?o.material:[o.material]; for(const m of list) if(m&&!m._shared) mats.add(m); } });
    for(const g of geos) g.dispose(); for(const m of mats) m.dispose();
  }
  _disposeProjectile(d){
    if(!d||!d.spr) return;
    this.scene.remove(d.spr);
    d.spr.visible=false; this._projectilePool=this._projectilePool||[];
    if(this._projectilePool.length<48) this._projectilePool.push(d.spr);
    else d.spr.traverse(o=>{ if(o.geometry&&!o.geometry.userData.voxSharedProjectile) o.geometry.dispose(); if(o.material){ const list=Array.isArray(o.material)?o.material:[o.material]; for(const m of list) m.dispose(); } });
  }
  updateDrops(dt){
    for(let i=this.drops.length-1;i>=0;i--){ const d=this.drops[i];
      if(d.projectile){
        d.vel.y-=20*dt; d.pos.addScaledVector(d.vel,dt);
        d.life+=dt; d.spr.position.copy(d.pos);
        if(d.fromPlayer){
          let hit=false;
          for(const m of this.mobs){
            const hx=d.pos.x-m.pos.x, hy=d.pos.y-(m.pos.y+m.height*0.5), hz=d.pos.z-m.pos.z;
            if(hx*hx+hy*hy+hz*hz<0.49){
              if(m._net&&typeof LAN!=='undefined'&&LAN.connected&&!LAN.isHost){ LAN.send({t:'hit',id:m._netId,dmg:d.dmg}); m.hurtT=0.2; Audio.play('mobhurt'); hit=true; break; }
              m.hp-=d.dmg; m.hurtT=0.2; Audio.play('mobhurt'); if(m.def.hostile) this._pushAlarm(m.pos.x,m.pos.z);
              const kx=m.pos.x-this.player.pos.x, kz=m.pos.z-this.player.pos.z, kl=Math.hypot(kx,kz)||1;
              m.vel.x+=kx/kl*3; m.vel.z+=kz/kl*3; m.vel.y=3;
              if(!m.def.hostile && !m.def.settler){ m.state='flee'; m.fleeT=6; }
              if(m.def.settler){ m.state='flee'; m.fleeT=4; this.villageAngerT=30; }   // guards answer bow-fire like melee
              if(m.hp<=0) this._killMob(m);
              hit=true; break;
            }
          }
          if(hit){ this._disposeProjectile(d); this.drops.splice(i,1); continue; }
        } else {
          const tp=d.targetRemote&&typeof LAN!=='undefined'&&LAN._remotePos?LAN._remotePos:this.player.pos;
          const hx=d.pos.x-tp.x, hy=d.pos.y-(tp.y+1), hz=d.pos.z-tp.z;
          if(hx*hx+hy*hy+hz*hz<0.64){
            if(d.targetRemote) LAN.send({t:'hurt',dmg:d.dmg,src:{x:d.pos.x,y:d.pos.y,z:d.pos.z}}); else this.hurtPlayer(d.dmg,d.pos);
            this._disposeProjectile(d); this.drops.splice(i,1); continue;
          }
        }
        if(d.life>4 || this.world.isSolid(Math.floor(d.pos.x),Math.floor(d.pos.y),Math.floor(d.pos.z))){ this._disposeProjectile(d); this.drops.splice(i,1); }
        continue;
      }
      const wet=isWet(this.world.getBlock(Math.floor(d.pos.x),Math.floor(d.pos.y),Math.floor(d.pos.z)));
      if(wet){ d.vel.y+=(d.floaty?11:-3)*dt; d.vel.multiplyScalar(Math.max(0,1-2.6*dt)); d.settled=false; }
      else if(!d.settled) d.vel.y-=20*dt;
      if(d.life>0.35){
        const dx=this.player.pos.x-d.pos.x,dy=this.player.pos.y+0.75-d.pos.y,dz=this.player.pos.z-d.pos.z,dist=Math.hypot(dx,dy,dz);
        if(dist<3.2&&dist>0.001){ const speed=5.5+(3.2-dist)*2.2,blend=Math.min(1,dt*8); d.settled=false; d.vel.x=lerp(d.vel.x,dx/dist*speed,blend); d.vel.y=lerp(d.vel.y,dy/dist*speed,blend); d.vel.z=lerp(d.vel.z,dz/dist*speed,blend); }
      }
      // Shape-aware item physics: integrate per axis so drops bounce off prop
      // sides and settle on their real collision proxy instead of clipping.
      const restitution=(d.material==='metal'||d.material==='crystal') ? 0.28 : 0.16;
      const nx=d.pos.x+d.vel.x*dt;
      if(sphereHitsWorld(this.world,nx,d.pos.y,d.pos.z)){ d.vel.x*=-restitution; } else d.pos.x=nx;
      const nz=d.pos.z+d.vel.z*dt;
      if(sphereHitsWorld(this.world,d.pos.x,d.pos.y,nz)){ d.vel.z*=-restitution; } else d.pos.z=nz;
      const ny=d.pos.y+d.vel.y*dt;
      if(sphereHitsWorld(this.world,d.pos.x,ny,d.pos.z)){
        if(d.vel.y<0 && Math.abs(d.vel.y)<1.2){ d.vel.set(0,0,0); d.settled=true; }
        else { d.vel.y*=-restitution; d.vel.x*=.62; d.vel.z*=.62; }
      } else d.pos.y=ny;
      d.life+=dt; d.bob+=dt*3;
      d.spr.position.set(d.pos.x, d.pos.y+0.2+Math.sin(d.bob)*0.08, d.pos.z);
      if(d.spr.isGroup){ d.spr.rotation.y+=dt*1.6; d.spr.rotation.x=0.25+Math.sin(d.bob*0.5)*0.08; }
      // pickup
      const pdx=d.pos.x-this.player.pos.x, pdy=d.pos.y-this.player.pos.y, pdz=d.pos.z-this.player.pos.z;
      if(d.life>0.45 && pdx*pdx+pdy*pdy+pdz*pdz<0.9025){
        const left=this.giveItem(d.item,d.count);
        if(left<d.count){
          Audio.play('pickup');
          if(left>0) d.count=left;
          else { this._disposeWorldDrop(d); this.drops.splice(i,1); continue; }
        }
      }
      if(d.life>180){ this._disposeWorldDrop(d); this.drops.splice(i,1); }
    }
  }
  updateParticles(dt){
    if(this._biteG && this._biteG.visible && !this.breakTarget) this._hideBites();
    for(const p of this.particles){ if(!p.active) continue;
      p.vel.y-=(p.gravity||0)*dt; const drag=Math.max(0,1-(p.drag||0)*dt); p.vel.multiplyScalar(drag);
      if(p.drift){ p.vel.x+=Math.sin(p.life*8+p.mesh.position.z)*p.drift*dt; p.vel.z+=Math.cos(p.life*7+p.mesh.position.x)*p.drift*dt; }
      p.mesh.position.addScaledVector(p.vel,dt); p.life-=dt;
      if(p.fade) p.mesh.material.opacity=clamp(p.life/Math.max(0.01,p.maxLife),0,1);
      if(p.life<=0){ p.active=false; p.mesh.visible=false; }
    }
  }
  updateFurnaces(dt){
    for(const [k,f] of this.world.furnaces){
      if(!f.input) { f.prog=0; }
      const sm = f.input && SMELT[f.input.item];
      if(sm && (!f.output || (f.output.item===sm.out && f.output.count<99))){
        if(f.burn<=0 && f.fuel && FUEL[f.fuel.item]){ f.burnMax=FUEL[f.fuel.item]; f.burn=f.burnMax; f.fuel.count--; if(f.fuel.count<=0) f.fuel=null; }
        if(f.burn>0){ f.burn-=dt; f.prog+=dt; if(f.prog>=sm.t){ f.prog=0; f.input.count--; if(f.input.count<=0) f.input=null; if(f.output&&f.output.item===sm.out) f.output.count++; else f.output={item:sm.out,count:1}; Audio.play('craft'); } }
      } else { if(f.burn>0) f.burn-=dt*0.5; f.prog=Math.max(0,f.prog-dt); }
    }
  }

  // ---------- sky / lighting ----------
  _hasSkyAccess(x,y,z){
    const key=Math.floor(x)+','+Math.floor(y)+','+Math.floor(z), now=performance.now();
    if(this._skyAccessCache&&this._skyAccessCache.key===key&&now-this._skyAccessCache.at<400) return this._skyAccessCache.open;
    let open=true; for(let yy=Math.floor(y)+1;yy<WORLD_H;yy++) if(this.world.isSolid(Math.floor(x),yy,Math.floor(z))){ open=false; break; }
    this._skyAccessCache={key,at:now,open}; return open;
  }
  updateSky(dt){
    const prev=this._clockPrev==null?this.time:this._clockPrev;
    this.time=(this.time+dt/this.dayLen)%1;
    if(this.time<prev-0.5){ this.day=Math.max(1,(this.day||1)+1); if(this.day===2) this._milestone('night1','You survived your first night.'); }
    this._clockPrev=this.time;
    if(this.mode==='survival' && this.day===1 && this.time>=0.68 && this.time<0.78 && !(this.milestones&&this.milestones.duskWarn)) this._milestone('duskWarn','Sunset approaches — craft a light and secure shelter.');
    const t=this.time;
    // sun angle: t=0 midnight (sun down), t=0.5 noon
    const ang=(t-0.25)*Math.PI*2; // 0.25 -> sunrise
    const sx=Math.cos(ang), sy=Math.sin(ang);
    const camp=this.player ? this.player.pos : this.camera.position;
    this.sun.position.set(camp.x+sx*100, camp.y+sy*100, camp.z+30); this.sun.target.position.copy(camp); this.sun.target.updateMatrixWorld();
    this.sunSprite.position.copy(this.sun.position);
    this.moonSprite.position.set(camp.x-sx*100, camp.y-sy*100, camp.z+30);
    this.stars.position.copy(camp);
    // daylight 0..1
    const day=clamp(sy*1.4+0.25,0,1);
    // orange band near horizon, but only while there's still some daylight —
    // without the *day gate this blended navy night-color with orange deep
    // into full night (any |sy|<0.33), which mixes to a muddy brown instead
    // of black.
    const dusk=clamp(1-Math.abs(sy)*3,0,1) * clamp(day*3,0,1);
    this.sun.intensity=0.08+day*0.5;
    this.hemi.intensity=0.58+day*0.32;
    this.ambient.intensity=0.36+day*0.14;
    // colors
    const sky=this._skyColor.copy(this._skyNight).lerp(this._skyDay,day).lerp(this._skyDusk,dusk*0.5);
    this.scene.background=sky; this.scene.fog.color.copy(sky);
    // Chunk terrain uses MeshBasicMaterial because directional shade + AO are
    // already baked into vertex colors. Tint those materials explicitly so
    // terrain follows the day/night cycle instead of staying noon-bright.
    const terrainLight=0.30+day*0.70, night=1-day;
    const tr=terrainLight*(1-night*0.08+dusk*0.12);
    const tg=terrainLight*(1-night*0.03);
    const tb=terrainLight*(1+night*0.08-dusk*0.16);
    this.matOpaque.color.setRGB(tr,tg,tb);
    this.matCutout.color.setRGB(tr,tg,tb);
    this.matBlend.color.setRGB(tr,tg,tb);
    this.matIce.color.setRGB(tr,tg,tb);
    this.sun.color.setHex(dusk>0.4?VOXHAVEN_VISUALS.overworld.skyDawn:VOXHAVEN_VISUALS.overworld.sunlight);
    this.stars.material.opacity=clamp(1-day*1.6,0,1);
    this.sunSprite.visible=sy>-0.1; this.moonSprite.visible=sy<0.1;
    // fog only fades the chunk-pop edge during the day; at night it's pushed
    // past the render distance so nothing within view ever fades to black —
    // only the sky itself goes dark.
    const fogNear=day>0.5?0.8:2.5, fogFar=day>0.5?1.3:3;
    this.scene.fog.near=this.renderDist*CHUNK_X*fogNear; this.scene.fog.far=this.renderDist*CHUNK_X*fogFar;
    const eyeWet=this.player && isWet(this.world.getBlock(Math.floor(camp.x),Math.floor(camp.y+this.player.eye),Math.floor(camp.z)));
    if(eyeWet){
      const depth=clamp((SEA_LEVEL+2-(camp.y+this.player.eye))/20,0,1);
      const waterMood=this._underwaterMood.copy(this._underwaterColor).lerp(this._underwaterDeepColor,depth);
      this.scene.background=waterMood; this.scene.fog.color.copy(waterMood);
      this.scene.fog.near=1.4; this.scene.fog.far=24-depth*15;
      this.matOpaque.color.multiply(this._underwaterTint); this.matCutout.color.multiply(this._underwaterTint);
      this.matBlend.color.multiply(this._underwaterTint); this.matIce.color.multiply(this._underwaterTint);
      this.stars.material.opacity=0; this.sunSprite.visible=false; this.moonSprite.visible=false;
    } else if(camp.y<SEA_LEVEL-8 && !this._hasSkyAccess(camp.x,camp.y+(this.player?this.player.eye:0),camp.z)){
      const cave=clamp((SEA_LEVEL-8-camp.y)/28,0,1);
      this.scene.background=this._caveColor; this.scene.fog.color.copy(this._caveColor);
      this.scene.fog.near=18-cave*8; this.scene.fog.far=Math.max(34,54-cave*25);
      this.matOpaque.color.multiply(this._caveTint); this.matCutout.color.multiply(this._caveTint);
      this.matBlend.color.multiply(this._caveTint); this.matIce.color.multiply(this._caveTint);
      this.stars.material.opacity=0; this.sunSprite.visible=false; this.moonSprite.visible=false;
    }
    // torch light pool: assign nearest lights to nearest emitting blocks
    const pe=this.player.pos, near=this._nearLights||(this._nearLights=[]);
    if(this._lightCoordWorld!==this.world){ this._lightCoordWorld=this.world; this._lightCoords=new Map(); this._lightScanT=0; }
    const coordCache=this._lightCoords;
    this._lightScanT=(this._lightScanT||0)-dt;
    if(this._lightScanT<=0){
      this._lightScanT=0.12; near.length=0;
      for(const k of this.world.lights){ const c=this._lightCoord(k); const dx=c.x+0.5-pe.x, dy=c.y+0.6-pe.y, dz=c.z+0.5-pe.z; c.d2=dx*dx+dy*dy+dz*dz; if(c.d2<400) near.push(c); }
      if(coordCache.size>this.world.lights.size+64) for(const k of coordCache.keys()) if(!this.world.lights.has(k)) coordCache.delete(k);
      near.sort((a,b)=>a.d2-b.d2);
      for(let i=0;i<this.lightPool.length;i++){ const L=this.lightPool[i];
        if(i<near.length){ const c=near[i]; const id=this.world.getBlock(c.x,c.y,c.z), lb=BLOCKS[id]; if(lb&&lb.light>0){ const cool=id===B.ALIEN_CRYSTAL||id===B.CRYSTAL_BLOCK||id===B.STAR_BEACON; L.visible=true; L.userData.blockId=id; L.position.set(c.x+0.5,c.y+0.6,c.z+0.5); L.color.setHex(cool?0x45e2dc:(id===B.LANTERN?0xffd47a:0xffb24d)); L.distance=lb.light; } else L.visible=false; }
        else L.visible=false;
      }
    }
    // Smooth flame shimmer without random intensity changes or a world scan.
    for(let i=0;i<this.lightPool.length;i++){ const L=this.lightPool[i]; if(L.visible) L.intensity=1.18+Math.sin(t*900+i*2.17)*0.12;
    }
    // Mirror the four closest pooled lights into the lightweight chunk shader.
    // Updating four vectors/colors is bounded and allocation-free.
    for(let i=0;i<4;i++){ const L=this.lightPool[i], p=this.localLightPos.value[i], c=this.localLightColor.value[i];
      if(L&&L.visible){ p.set(L.position.x,L.position.y,L.position.z,L.distance); c.copy(L.color).multiplyScalar(L.intensity); }
      else { p.set(0,0,0,0); c.setRGB(0,0,0); }
    }
    // ---- flame embers rising from the nearest torch/lantern flames ----
    if(!this._rocketActive&&this.fxQuality!=='off'){ this._emberPool=this._emberPool||[];
      for(const p of this._emberPool){ if(!p.active) continue; p.life-=dt; p.mesh.position.addScaledVector(p.vel,dt); p.vel.y+=dt*0.4; p.mesh.material.opacity=clamp(p.life/0.5,0,1)*0.85; if(p.life<=0){ p.active=false; p.mesh.visible=false; } }
      for(let i=0;i<Math.min(4,near.length);i++){ if(near[i].d2>120) break; const c=near[i]; const id=this.world.getBlock(c.x,c.y,c.z); const lb=BLOCKS[id]; if(!(lb&&lb.light>0)) continue;
        if(Math.random()<dt*7){ let p=this._emberPool.find(q=>!q.active);
          if(!p && this._emberPool.length<40){ const m=new THREE.Mesh(new THREE.SphereGeometry(0.055,5,4), new THREE.MeshBasicMaterial({color:0xff8a2a,transparent:true,fog:false})); m.frustumCulled=false; this.scene.add(m); p={mesh:m,vel:new THREE.Vector3(),active:false}; this._emberPool.push(p); }
          if(p){ p.active=true; p.mesh.visible=true; p.life=0.4+Math.random()*0.4; p.mesh.material.color.setHex(id===B.LANTERN?0xffd06a:0xff8a2a);
            p.mesh.position.set(c.x+0.5+(Math.random()-0.5)*0.3, c.y+0.7, c.z+0.5+(Math.random()-0.5)*0.3);
            p.vel.set((Math.random()-0.5)*0.3, 0.5+Math.random()*0.4, (Math.random()-0.5)*0.3); } } }
    } else if(this._emberPool){ for(const p of this._emberPool){ p.active=false; p.mesh.visible=false; } }
    // ---- occasional shooting stars at night (cheap pool, gated off during rocket flight) ----
    if(!this._rocketActive){
      const nightf=clamp(1-day*1.6,0,1);
      const audioEnvironment=this.dimension==='planet'?'aethon':'overworld';
      Audio.ambientTick(dt, nightf, audioEnvironment);   // world-specific day/night drone
      // underground: birdsong gives way to drips, rumbles, and distant growls
      const caveDepth=this.player ? (this.world.surfaceY(Math.floor(this.player.pos.x),Math.floor(this.player.pos.z)) - this.player.pos.y) : 0;
      Audio.wildlifeTick(dt, nightf, caveDepth>6, audioEnvironment);
      this._weatherTick(dt);           // drifting clouds + occasional rain/snow
      this._firefliesTick(dt, nightf); // glowing motes near the ground at night
      this._ambientDetailsTick(dt,nightf,caveDepth);
      this._shootPool=this._shootPool||[];
      for(const s of this._shootPool){ if(!s.active) continue; s.life-=dt; s.mesh.position.addScaledVector(s.vel,dt); s.mesh.material.opacity=clamp(s.life,0,1)*0.9; if(s.life<=0){ s.active=false; s.mesh.visible=false; } }
      // rare night event: VILLAGE RAID — hostiles descend on a nearby village
      if(this.day>2 && nightf>0.5 && this._raidDay!==this.day && !(this._raidLive>0) && this.mode==='survival' && Math.random()<dt*0.01){
        const v=this.world.villages && this.world.villages.find(vv=>Math.hypot(vv.x-this.player.pos.x,vv.z-this.player.pos.z)<48);
        if(v){ this._raidDay=this.day; this._raidLive=0;
          for(let i=0;i<4;i++){ const a2=Math.random()*6.283; const rx2=v.x+Math.cos(a2)*18, rz2=v.z+Math.sin(a2)*18;
            const ry2=this.world.surfaceY(Math.floor(rx2),Math.floor(rz2));
            const rm=new Mob(i<2?'crawler':'shade', rx2, ry2+1, rz2); rm._raider=true; this.scene.add(rm.group); this.mobs.push(rm); this._raidLive++; }
          for(const s2 of this.mobs) if(s2.def.settler && Math.hypot(s2.pos.x-v.x,s2.pos.z-v.z)<30){ s2.state='flee'; s2.fleeT=8; }
          this.onFlash&&this.onFlash('⚔ Raiders descend on the village — defend it!');
          if(Audio.sting) Audio.sting('boss');
        }
      }
      // rare night event (after you have walked Aethon): an ALIEN SCOUT SHIP lands
      if(nightf>0.5 && this.milestones && this.milestones.aethon && !this.milestones.scoutShip && Math.random()<dt*0.008){
        const a3=Math.random()*6.283, d3=20+Math.random()*20;
        const sx=Math.floor(this.player.pos.x+Math.cos(a3)*d3), sz=Math.floor(this.player.pos.z+Math.sin(a3)*d3);
        const sy=this.world.surfaceY(sx,sz);
        if(sy>SEA_LEVEL){
          for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) this.setBlock(sx+dx,sy+1,sz+dz,B.ALIEN_ROCK);
          this.setBlock(sx,sy+2,sz,B.ALIEN_CRYSTAL); this.setBlock(sx,sy+3,sz,B.STAR_BEACON);
          for(let i=0;i<2;i++){ const am=new Mob('alien_scout', sx+2-i*4, sy+2, sz+1); this.scene.add(am.group); this.mobs.push(am); }
          this._milestone('scoutShip','An alien scout ship has landed nearby — they followed you home!');
        }
      }
      // rare night event: METEOR FALL — a burst of streaks, then something lands nearby
      if(nightf>0.5 && this._meteorDay!==this.day && Math.random()<dt*0.012){
        this._meteorDay=this.day; this._meteorT=8;
        this.onFlash&&this.onFlash('☄ Meteors streak across the sky…'); if(Audio.sting) Audio.sting('rise');
      }
      if(this._meteorT>0){
        this._meteorT-=dt;
        if(this._meteorT<=0){
          const a=Math.random()*6.283, d0=25+Math.random()*35;
          const mx=Math.floor(this.player.pos.x+Math.cos(a)*d0), mz=Math.floor(this.player.pos.z+Math.sin(a)*d0);
          const my=this.world.surfaceY(mx,mz);
          if(my>SEA_LEVEL){
            for(const [dx,dz] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]) this.setBlock(mx+dx,my,mz+dz,B.STONE);
            this.setBlock(mx,my+1,mz,B.GLOWSTONE);   // the still-glowing core marks the crater in the dark
            for(let i=0;i<2;i++) this._spawnDrop('space_shard',1,mx+0.5,my+2,mz+0.5);
            this._spawnDrop('star_core',1,mx+0.5,my+2,mz+0.5);   // the prize: a Fallen Star Core (rocket upgrade relic)
            this._spawnParticles(mx,my+1,mz,'#9ad6ff');
            const dirN=Math.abs(Math.cos(a))>Math.abs(Math.sin(a))?(Math.cos(a)>0?'east':'west'):(Math.sin(a)>0?'south':'north');
            this.onFlash&&this.onFlash('☄ Something fell to the '+dirN+' — find the glow!');
            this._milestone&&this._milestone('meteor','A star fell from the sky.');
          }
        }
      }
      if(nightf>0.45 && Math.random()<dt*(this._meteorT>0?6:0.5)){
        let s=this._shootPool.find(q=>!q.active);
        if(!s && this._shootPool.length<(this._meteorT>0?7:3)){ const m=new THREE.Mesh(new THREE.SphereGeometry(0.5,6,5), new THREE.MeshBasicMaterial({color:0xeaf3ff,transparent:true,fog:false})); m.scale.set(1,1,9); m.frustumCulled=false; this.scene.add(m); s={mesh:m,active:false}; this._shootPool.push(s); }
        if(s){ const cam=this.player.pos, ang=Math.random()*6.283, dir=new THREE.Vector3((Math.random()-0.5),-0.35,(Math.random()-0.5)).normalize();
          s.active=true; s.mesh.visible=true; s.life=0.9;
          s.mesh.position.set(cam.x+Math.cos(ang)*70, cam.y+45+Math.random()*25, cam.z+Math.sin(ang)*70);
          s.mesh.lookAt(s.mesh.position.x+dir.x, s.mesh.position.y+dir.y, s.mesh.position.z+dir.z);
          s.vel=dir.multiplyScalar(110); s.mesh.material.opacity=0.9; }
      }
    }
  }

  // ---------- fireflies: glowing motes near the ground at night (overworld only) ----------
  _firefliesTick(dt, night){
    const on = this.fxQuality!=='off' && this.dimension==='overworld' && night>0.4;
    if(!on){ if(this._flies) this._flies.visible=false; return; }
    const cam=this.player.pos;
    if(!this._flies){ const g=new THREE.Group(); g.frustumCulled=false; this._flyList=[];
      for(let i=0;i<14;i++){ const m=new THREE.Mesh(new THREE.SphereGeometry(0.05,5,4), new THREE.MeshBasicMaterial({color:0x9fd34a, transparent:true, opacity:0}));
        m.userData={ph:Math.random()*6.28, sp:0.5+Math.random()*0.6}; g.add(m); this._flyList.push(m); }
      this.scene.add(g); this._flies=g; this._flyAnchor=null; }
    // motes live in WORLD space (NOT parented to the camera) so they stay put as you walk;
    // only re-seed the swarm near you once you wander out of range
    if(!this._flyAnchor || Math.abs(cam.x-this._flyAnchor.x)>20 || Math.abs(cam.z-this._flyAnchor.z)>20){
      this._flyAnchor={x:Math.round(cam.x), y:cam.y, z:Math.round(cam.z)};
      for(const m of this._flyList) m.position.set(this._flyAnchor.x+(Math.random()-0.5)*26, this._flyAnchor.y+0.4+Math.random()*1.6, this._flyAnchor.z+(Math.random()-0.5)*26);
    }
    this._flies.visible=true; this._flies.position.set(0,0,0);
    const fade=clamp((night-0.4)/0.4,0,1);
    for(const m of this._flyList){ const u=m.userData; u.ph+=dt*u.sp;
      m.position.x += Math.sin(u.ph)*dt*0.35; m.position.z += Math.cos(u.ph*0.8)*dt*0.35; m.position.y += Math.sin(u.ph*1.3)*dt*0.28;
      m.material.opacity = fade*(0.22+0.4*(0.5+0.5*Math.sin(u.ph*2.5)));   // dimmer twinkle
    }
  }

  _ambientDetailsTick(dt,night,caveDepth){
    if(this.fxQuality==='off'||this.dimension!=='overworld') return;
    this._ambientFxT=(this._ambientFxT||0)-dt; if(this._ambientFxT>0) return;
    this._ambientFxT=this.fxQuality==='low'?0.75:0.42;
    const p=this.player.pos, bx=Math.floor(p.x),bz=Math.floor(p.z), biome=this.world.biomeAt(bx,bz,this.world.heightAt(bx,bz));
    if(caveDepth>6){
      this._spawnParticles(p.x+(Math.random()-0.5)*8,p.y+1+Math.random()*3,p.z+(Math.random()-0.5)*8,['#72706a','#9a9385'],1,false,{point:true,spread:0.1,size:[0.02,0.055],speed:0.12,gravity:0,life:2.4,drift:0.35});
    }else if(night<0.35&&(biome===BIOMES.forest||biome===BIOMES.plains)){
      const leaf=Math.random()<0.68, sy=this.world.surfaceY(bx,bz)+1.2;
      this._spawnParticles(p.x+(Math.random()-0.5)*10,sy+Math.random()*3,p.z+(Math.random()-0.5)*10,leaf?['#456f32','#799c45']:['#e5c44f','#d97855','#8fcbe0'],leaf?1:2,false,{point:true,spread:0.12,size:leaf?[0.035,0.09]:[0.025,0.055],speed:0.18,gravity:leaf?0.35:0,life:2.2,drift:leaf?0.9:0.5});
    }
    if(this.raining&&Math.random()<0.75){ const sx=bx+((Math.random()-0.5)*10|0),sz=bz+((Math.random()-0.5)*10|0),sy=this.world.surfaceY(sx,sz)+1; this._spawnParticles(sx+0.5,sy,sz+0.5,['#8fc9e5','#d7f1fa'],3,true,{size:[0.02,0.05],gravity:9,life:0.24,speed:0.9}); }
    if(Math.random()<0.35) for(const k of this.world.lights){ const c=this._lightCoord(k); if(Math.hypot(c.x-p.x,c.z-p.z)>15||this.world.getBlock(c.x,c.y,c.z)!==B.CAMPFIRE) continue;
      this._spawnParticles(c.x+0.5,c.y+1,c.z+0.5,['#6c6963','#99958c'],1,false,{point:true,spread:0.2,size:[0.08,0.18],speed:0.25,gravity:-0.25,life:2.2,drift:0.5}); break; }
  }

  // ---------- weather: drifting clouds + occasional rain/snow (overworld only) ----------
  _weatherTick(dt){
    const overworld = this.dimension==='overworld' && this.fxQuality!=='off';
    if(!overworld){ if(this._clouds) this._clouds.visible=false; if(this._precip) for(const p of this._precip){ p.active=false; p.mesh.visible=false; } return; }
    const cam=this.player.pos;
    // high drifting cloud layer (lazy)
    if(!this._clouds){ const g=new THREE.Group();
      const c=document.createElement('canvas'); c.width=64; c.height=32; const ctx=c.getContext('2d');
      ctx.fillStyle='#eef3f7'; ctx.fillRect(8,13,48,11); ctx.fillRect(16,8,31,16); ctx.fillRect(25,4,15,20); ctx.fillRect(4,17,14,7); ctx.fillRect(49,16,11,8);
      ctx.fillStyle='#dce8ee'; ctx.fillRect(13,21,39,4); ctx.fillRect(19,9,9,4); ctx.fillRect(41,13,10,5);
      const cloudTex=crispTexture(new THREE.CanvasTexture(c));
      for(let i=0;i<7;i++){ const m=new THREE.Mesh(new THREE.PlaneGeometry(40+Math.random()*46, 24+Math.random()*30),
        new THREE.MeshBasicMaterial({map:cloudTex, transparent:true, opacity:0.18+Math.random()*0.12, alphaTest:0.02, depthWrite:false, fog:false}));
        m.rotation.x=Math.PI/2; m.position.set((Math.random()-0.5)*260, 0, (Math.random()-0.5)*260); g.add(m); }
      g.frustumCulled=false; this.scene.add(g); this._clouds=g; }
    this._clouds.visible=true; this._clouds.position.set(cam.x, cam.y+72, cam.z);
    const cloudCount=this.fxQuality==='low'?4:this.fxQuality==='high'?7:6;
    for(let i=0;i<this._clouds.children.length;i++){ const m=this._clouds.children[i]; m.visible=i<cloudCount; if(m.visible){ m.position.x += dt*2.0; if(m.position.x>150) m.position.x-=300; } }
    // weather state machine: dry stretches, then a shower
    this._wTmr = (this._wTmr==null) ? 30+Math.random()*40 : this._wTmr-dt;
    if(this._wTmr<=0){ this.raining=!this.raining; this._wTmr = this.raining ? (18+Math.random()*26) : (60+Math.random()*100); }
    if(this.raining){
      const snow = /snow|tundra|ice|frozen|taiga|peak/i.test(this.world.biomeName(Math.floor(cam.x),Math.floor(cam.z))||'');
      this._precip=this._precip||[];
      const spawnCount=this.fxQuality==='low'?1:this.fxQuality==='high'?3:2, cap=this.fxQuality==='low'?40:this.fxQuality==='high'?120:80;
      for(let i=0;i<spawnCount;i++){ let p=null; for(let j=0;j<Math.min(this._precip.length,cap);j++) if(!this._precip[j].active){ p=this._precip[j]; break; }
        if(!p && this._precip.length<cap){ const m=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.09,0.09), new THREE.MeshBasicMaterial({transparent:true, opacity:0.8, fog:false})); m.frustumCulled=false; this.scene.add(m); p={mesh:m,active:false}; this._precip.push(p); }
        if(p){ p.active=true; p.mesh.visible=true; p.snow=snow;
          p.mesh.material.color.setHex(snow?0xffffff:0x7fb0e0); p.mesh.scale.set(1, snow?1:4.5, 1);
          p.mesh.position.set(cam.x+(Math.random()-0.5)*34, cam.y+20, cam.z+(Math.random()-0.5)*34); p.vy = snow?-3.2:-17; } }
    }
    if(this._precip) for(const p of this._precip){ if(!p.active) continue;
      p.mesh.position.y += p.vy*dt; if(p.snow) p.mesh.position.x += Math.sin(p.mesh.position.y*0.6)*dt*0.7;
      if(p.mesh.position.y < cam.y-7){ p.active=false; p.mesh.visible=false; } }
  }

  // ---------- main step ----------
  setMode(mode){ this.mode=mode; this.breakProg=0; this.breakTarget=null; this.crackBox.visible=false; if(mode==='creative'||mode==='spectator') this.player.flying=true; }
  toggleFly(){ if(this.mode!=='creative') return; this.player.flying=!this.player.flying; if(!this.player.flying) this.player.vel.y=0; }
  toggleView(){
    // cycle: first -> thirdBehind (standard, non-inverted) -> third (face cam,
    // looks at you; mirror-style so controls feel reversed by nature) -> first
    this.viewMode = this.viewMode==='first' ? 'thirdBehind'
                  : this.viewMode==='thirdBehind' ? 'third'
                  : 'first';
  }
  update(dt, ctl){
    if(!this.player||this.paused||this.dead) return;
    dt=Math.min(dt,0.05);
    this.windUniform.value += dt;   // advance foliage sway in lockstep with the rest of the world (freezes on pause/death)
    const survival=this.mode==='survival', spectator=this.mode==='spectator';
    // mouse look
    const md=this.input.consumeMouse();
    this.player.yaw -= md.x*0.0022*this.sens;
    this.player.pitch += md.y*0.0022*this.sens*(this.invertY?1:-1);
    this.player.pitch=clamp(this.player.pitch,-1.54,1.54);

    // hop out of the boat on crouch (returns the boat item)
    if(this.player.boat && ctl.crouch){ this.player.boat=false; this._giveOrDrop('boat',1); this.onFlash&&this.onFlash('You hop ashore — boat stowed'); }
    let res;
    if(this.player.mount){
      if(this.mobs.indexOf(this.player.mount)<0) this.player.mount=null;   // mount died/despawned
      else res=this._rideTick(dt,ctl);
    }
    if(!this.player.mount) res=this.player.update(dt,ctl,this.mode);
    // boat visual: a simple hull skims under the player while afloat
    if(this.player.boat && this.player.inWater){
      if(!this._boatMesh){ const bm=new THREE.Group(); bm.add(box(1.2,0.35,2.1,M('#7a5230'),0,0,0)); bm.add(box(0.9,0.25,1.6,M('#4a3018'),0,0.14,0)); this._boatMesh=bm; this.scene.add(bm); }
      this._boatMesh.visible=true;
      this._boatMesh.position.set(this.player.pos.x, this.player.pos.y-0.15, this.player.pos.z);
      this._boatMesh.rotation.y=this.player.yaw;
    } else if(this._boatMesh) this._boatMesh.visible=false;
    // diving pod visual: a glassy teal capsule around the diver
    if(this.player.pod){
      if(!this._podMesh){ const pm=new THREE.Group();
        pm.add(box(1.1,1.5,1.4,new THREE.MeshLambertMaterial({color:0x2a7a86,transparent:true,opacity:0.35}),0,0.8,0));
        pm.add(box(1.25,0.3,1.55,M('#1d5560'),0,0.05,0)); pm.add(box(1.25,0.22,1.55,M('#1d5560'),0,1.6,0));
        const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.12,6,6), ME('#aef0ff','#aef0ff',1.8)); lamp.position.set(0,1.75,0.5); pm.add(lamp);
        this._podMesh=pm; this.scene.add(pm); }
      this._podMesh.visible=this.viewMode!=='first';
      this._podMesh.position.set(this.player.pos.x, this.player.pos.y-0.1, this.player.pos.z);
      this._podMesh.rotation.y=this.player.yaw;
    } else if(this._podMesh) this._podMesh.visible=false;
    if(survival && res.fellHard>18){ this.hurtPlayer(Math.floor((res.fellHard-16)*0.9)); }
    if(res.landed){
      const gy=Math.floor(this.player.pos.y-0.05), gid=this.world.getBlock(Math.floor(this.player.pos.x),gy,Math.floor(this.player.pos.z));
      Audio.material(blockMaterial(gid),false,true); this._landDip=Math.min(0.07,0.025+(res.fellHard||0)*0.002);
    }
    if(res.sprintNoise) this._noise(this.player.pos.x, this.player.pos.z, 7);
    if(!this._gT) this._gT=0; this._gT+=dt; if(this._gT>4){ this._gT=0; this._tryGrowCrops(); }

    const moved=ctl.f||ctl.b||ctl.l||ctl.r;
    if(survival){
      // drowning
      const head=this.world.getBlock(Math.floor(this.player.pos.x),Math.floor(this.player.pos.y+this.player.eye),Math.floor(this.player.pos.z));
      this._airT=(isWet(head)&&!this.player.pod)?(this._airT||0)+dt:0;   // the pod carries its own air
      const airMax=this.countItem('tide_charm')>0?16:8;   // the Tide Charm doubles your breath
      if(this._lastAirMax!=null && airMax<this._lastAirMax) this._airT=Math.min(this._airT,airMax-2);
      this._lastAirMax=airMax;
      if(this._airT>airMax){ this._airT=airMax-2; this.hurtPlayer(1,null,'You drowned'); }
      // queasy timer (from eating raw food) — decays and blocks regen while active
      if(this._queasyT>0) this._queasyT=Math.max(0,this._queasyT-dt);
      // hunger drain — saturation buffer absorbs it first, then real hunger
      this._hungerT=(this._hungerT||0)+dt;
      if(this._hungerT>4){ this._hungerT=0; const drain=(ctl.sprint&&moved?0.6:0.3)+(this._queasyT>0?0.3:0)+(this.player.stamina<=0?0.2:0);
        if(this.player.saturation>0) this.player.saturation=Math.max(0,this.player.saturation-drain);
        else this.player.hunger=Math.max(0,this.player.hunger-drain); }
      this._regenT=(this._regenT||0)+dt;
      if(this._regenT>3){ this._regenT=0;
        if(this.player.hunger>16 && this._queasyT<=0 && this.player.health<this.player.maxHealth) this.player.health++;
        if(this.player.hunger<=0) this.hurtPlayer(1); }
      if(this.player.effects.regen) this.player.health=Math.min(this.player.maxHealth, this.player.health+dt*1.5);
      // warmth / cold — runs on its own ~1.5s tick
      this._updateWarmth(dt, moved);
      this._updateSurvivalWarnings();
    } else {
      // non-survival: keep survival meters neutral so the HUD stays clean
      this.player.warmth=this.player.maxWarmth; this._frostLevel=0; this._airT=0; this._queasyT=0; this.player.frozen=false; this._survivalWarn=null;
    }
    // Pooled, surface-colored footstep dust gives movement weight in both
    // survival and creative without adding any idle-frame work.
    if(moved && this.player.onGround && !spectator){
      this._stepT=(this._stepT||0)+dt;
      if(this._stepT>(ctl.sprint?0.28:0.4)){
        this._stepT=0;
        const fx=Math.floor(this.player.pos.x), fy=Math.floor(this.player.pos.y)-1, fz=Math.floor(this.player.pos.z);   // the block BELOW the feet (was checking the air at feet level)
        const footBlock=this.world.getBlock(fx,fy,fz);
        if(footBlock!==B.AIR && footBlock!==B.WATER){
          const kind=blockMaterial(footBlock), fxDef=MATERIAL_FX[kind]||MATERIAL_FX.stone;
          Audio.material(kind,false,true); this._spawnParticles(this.player.pos.x,this.player.pos.y,this.player.pos.z,fxDef.colors,kind==='snow'?6:3,true,{size:fxDef.size,gravity:fxDef.gravity*0.35,life:kind==='snow'?0.55:0.3,drift:fxDef.drift||0});
        }
      }
    } else if(!moved) this._stepT=0;   // only reset when stopped — a momentary airborne frame (auto-step jitter) must not keep zeroing the timer
    // Water entry and surface strokes get short pooled splashes. Suppress the
    // repeating effect while the player's head is underwater.
    if(this.player.inWater && !spectator){
      const wx=Math.floor(this.player.pos.x), wy=Math.floor(this.player.pos.y+0.2), wz=Math.floor(this.player.pos.z);
      const surfaceY=wy+0.82;
      if(!this._wasInWater){ this._spawnParticles(this.player.pos.x,surfaceY,this.player.pos.z,'#bfeaff',10); Audio.play('splash'); }
      const submerged=isWet(this.world.getBlock(wx,Math.floor(this.player.pos.y+this.player.eye),wz));
      if(moved && !submerged){
        this._splashT=(this._splashT||0)+dt;
        if(this._splashT>0.45){ this._splashT=0; this._spawnParticles(this.player.pos.x,surfaceY,this.player.pos.z,'#77bfe5',3,true); Audio.play('splash'); }
      } else this._splashT=0;
    } else this._splashT=0;
    this._wasInWater=this.player.inWater;

    // fishing state (active only while rod selected)
    if(this.fishing){
      const it=this.selItem();
      if(!it || !it.fishes){ this.fishing=null; if(this.fishLine) this.fishLine.visible=false; }
      else { this._updateFishing(dt); }
    }
    if(this.fishLine){
      if(!this.fishing){ this.fishLine.visible=false; }
      else { this._updateFishLine(); }
    }

    // camera: first-person at eye, third-person pulled back (wall-clamped)
    this._landDip=Math.max(0,(this._landDip||0)-dt*0.22);
    const walkPhase=this._bobT||0, viewBob=moved&&this.player.onGround?Math.sin(walkPhase*2)*0.018:0;
    const eyeY=this.player.pos.y+(this.player.viewEye||this.player.eye)+viewBob-(this._landDip||0);
    if(this.viewMode==='first'){
      this.camera.position.set(this.player.pos.x, eyeY, this.player.pos.z);
      this.camera.rotation.set(this.player.pitch,this.player.yaw,0,'YXZ');
      this.playerBody.visible=false;
    } else {
      const faceCam = this.viewMode==='third';   // 'third' = see his face; 'thirdBehind' = over the head
      // ALWAYS keep the camera in the same proven, non-inverted orientation
      // (look along the aim direction). The two third-person modes differ ONLY
      // in which way the body faces — toward the camera (face) or away (behind).
      // Using lookAt here flipped left/right; rotation.set never inverts.
      const back=this._thirdBack||(this._thirdBack=new THREE.Vector3());
      const turn=this._thirdTurn||(this._thirdTurn=new THREE.Euler(0,0,0,'YXZ'));
      const origin=this._thirdOrigin||(this._thirdOrigin=new THREE.Vector3());
      turn.set(this.player.pitch,this.player.yaw,0,'YXZ'); back.set(0,0,1).applyEuler(turn);
      let dist=4.2;
      origin.set(this.player.pos.x,eyeY,this.player.pos.z);
      const solid=this._solidQuery||(this._solidQuery=(x,y,z)=>this.world.isSolid(x,y,z));
      const hit=raycastVoxel(origin,back,dist,solid,this._thirdHit||(this._thirdHit={}));
      if(hit.hit) dist=Math.max(0.6, Math.hypot(hit.x+0.5-this.player.pos.x,hit.z+0.5-this.player.pos.z)-0.4);
      this.camera.position.set(this.player.pos.x+back.x*dist, eyeY+back.y*dist, this.player.pos.z+back.z*dist);
      this.camera.rotation.set(this.player.pitch,this.player.yaw,0,'YXZ');
      this.playerBody.visible=true;
      this._updatePlayerBody(moved, ctl, faceCam, dt);
    }

    if(!spectator) this._updateTarget(); else { this.selBlock=null; this.selBox.visible=false; this.crackBox.visible=false; }
    // held item bob/swing
    if(this.heldSwing>0) this.heldSwing-=dt*5;
    if(this.attackCd>0) this.attackCd=Math.max(0,this.attackCd-dt);
    const bob=Math.sin((this._bobT=(this._bobT||0)+(moved&&this.player.onGround?dt*10:0)))*0.03;
    this.heldGroup.position.set(0.42, -0.42+bob - Math.max(0,this.heldSwing)*0.15, -0.9);
    this.heldGroup.rotation.x=-Math.max(0,this.heldSwing)*0.9;
    this.heldGroup.visible=this.viewMode==='first'; this._updateHeld();

    this.updateSky(dt);
    this.updateDrops(dt);
    this.updateTreeFalls(dt);
    this.updateLeafDecay(dt);
    this.updateParticles(dt);

    // throttled systems
    this._aiT=(this._aiT||0)+dt; if(this._aiT>0.12){ this.updateMobs(this._aiT); this._aiT=0; }
    this._spawnT=(this._spawnT||0)+dt; if(this._spawnT>2){ this._spawnT=0; if(!(typeof LAN!=='undefined'&&LAN.connected&&!LAN.isHost)){ this.spawnMobs(); this.spawnVillageSettlers(); this.spawnSeaCourt(); }
      // journal: record the biome underfoot (2s cadence, zero per-frame cost)
      if(this.journal&&this.player){ const b=this.world.biomeAt(Math.floor(this.player.pos.x),Math.floor(this.player.pos.z),Math.floor(this.player.pos.y)); if(b&&b._name) this.journal.biomes[b._name]=1; if(this.dimension==='planet') this.journal.biomes.aethon=1; }
      // the GRAVEMAW wakes when you linger deep near a miner's cache
      if(this.world.caveRooms && this.dimension==='overworld' && this.mode==='survival'){
        for(const CR of this.world.caveRooms){
          if(CR._boss) continue;
          const dd=Math.hypot(CR.x-this.player.pos.x, CR.z-this.player.pos.z);
          if(dd>18 || this.player.pos.y > this.world.surfaceY(Math.floor(this.player.pos.x),Math.floor(this.player.pos.z))-6) continue;
          CR._boss=true;
          const m=new Mob('gravemaw', CR.x+0.5, CR.y+1, CR.z-3.5); this.scene.add(m.group); this.mobs.push(m);
          this.onFlash&&this.onFlash('⚠ The dark below stirs — something enormous wakes.');
          if(Audio.sting) Audio.sting('boss');
          break;
        }
      }
    }
    this._furnT=(this._furnT||0)+dt; if(this._furnT>0.5){ this.updateFurnaces(this._furnT); this._furnT=0; }
    this._waterT=(this._waterT||0)+dt; if(this._waterT>0.3){ this._waterT=0; this.updateWaterFlow(); this._settleNearbyWater(); }
    this._maintT=(this._maintT||0)+dt; if(this._maintT>0.3){ this._maintT=0; this.maintainChunks(); }
    this.processLoad(1); // was 2 — building 2 fresh chunks/frame spiked frames after the world got taller

    // space-age module: distant planet rotation/visibility, oxygen drain,
    // launch FX, low-gravity bookkeeping. Defined in js/space.js (guarded).
    if(this._spaceTick) this._spaceTick(dt, ctl);
    if(this._rocketTick) this._rocketTick(dt, ctl);   // js/rocket.js — countdown/flight
  }
  _updatePlayerBody(moved, ctl, faceCam, dt){
    const pb=this.playerBody, parts=pb.userData.parts;
    this._syncPlayerArmorVisuals();
    pb.position.set(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    // camera always sits on the +back side looking along the aim direction.
    // face cam: body faces the camera (yaw) so we see his face and his forward
    // chop swings toward us. behind cam: body turned away (yaw+PI) so we see the
    // back of his head while he faces where he's going.
    pb.rotation.y = faceCam ? this.player.yaw : this.player.yaw+Math.PI;
    // crouch: squish the whole body vertically (feet stay planted at the group
    // origin) so the model visibly sneaks instead of only the camera dropping
    pb.scale.y += ((this.player.crouched?0.75:1)-pb.scale.y)*Math.min(1,12*dt);
    this._bodyAnim=(this._bodyAnim||0)+dt*(moved&&this.player.onGround?9.6:1.2);
    const sw=Math.sin(this._bodyAnim)*(moved?0.5:0.05);
    if(parts.legFL) parts.legFL.rotation.x=sw; if(parts.legFR) parts.legFR.rotation.x=-sw;
    if(parts.armL) parts.armL.rotation.x=-sw*0.8; if(parts.armR) parts.armR.rotation.x=sw*0.8;
    // attack/mine swing: heldSwing (set on every hit) drives the right arm
    // forward+down in third person, mirroring the first-person hand swing
    if(this.heldSwing>0 && parts.armR){
      const s=Math.max(0,Math.min(1,this.heldSwing));
      parts.armR.rotation.x=-s*1.9;          // big forward chop, overrides walk swing
      parts.armR.rotation.z=Math.sin(s*Math.PI)*0.25;
    } else if(parts.armR){ parts.armR.rotation.z=0; }
    // face cam: aim the head straight at the camera ("hyper focus") — track it
    // vertically too so the eyes stay locked on you as you look up/down;
    // otherwise the head just follows the look pitch normally
    if(parts.head){
      if(faceCam){
        pb.updateMatrixWorld();
        const hp=this._faceHeadPos||(this._faceHeadPos=new THREE.Vector3()); parts.head.getWorldPosition(hp);
        const cp=this.camera.position;
        const pitchToCam=Math.atan2(cp.y-hp.y, Math.hypot(cp.x-hp.x, cp.z-hp.z));
        parts.head.rotation.x = clamp(-pitchToCam, -0.9, 0.9);
        parts.head.rotation.y = 0;
      } else {
        parts.head.rotation.x = clamp(this.player.pitch,-0.9,0.9);
        parts.head.rotation.y = 0;
      }
    }
  }
  _armorColor(itemId){
    const mat=(itemId||'').split('_')[0];
    return {wool:0xe8e2d4,iron:0xcfd2d6,gold:0xf4d35e,crystal:0x9ce6ef}[mat] || 0xcfd2d6;
  }
  _armorOverlay(part,w,h,d,color){
    if(!part) return null;
    const mat=new THREE.MeshLambertMaterial({ color });
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    part.add(mesh);
    return mesh;
  }
  _armorTrim(part,w,h,d,x,y,z,color=0x111827){
    if(!part) return null;
    const mat=new THREE.MeshLambertMaterial({ color });
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    mesh.position.set(x,y,z);
    part.add(mesh);
    return mesh;
  }
  _syncPlayerArmorVisuals(){
    const pb=this.playerBody; if(!pb) return;
    const arm=this.player.armor||{};
    const head=arm.head&&arm.head.item||'', chest=arm.chest&&arm.chest.item||'', legs=arm.legs&&arm.legs.item||'', feet=arm.feet&&arm.feet.item||'';
    const prev=pb.userData.armorState;
    if(prev&&prev.head===head&&prev.chest===chest&&prev.legs===legs&&prev.feet===feet) return;
    pb.userData.armorState={head,chest,legs,feet};
    if(pb.userData.armorMeshes){
      for(const m of pb.userData.armorMeshes){ if(m.parent) m.parent.remove(m); if(m.geometry) m.geometry.dispose(); if(m.material) m.material.dispose(); }
    }
    const made=pb.userData.armorMeshes=[];
    const p=pb.userData.parts||{};
    // armor = a clean "outfit" layer: each piece is a shell slightly larger than
    // the body part it wraps (margin so it reads as a second layer, no z-fight),
    // with small darker trims for detail. Sizes track the CURRENT player-model
    // part dimensions; the helmet deliberately leaves the face open.
    const TRIM=0x2b2b33;
    const at=(part,w,h,d,x,y,z,col)=>{ const m=this._armorTrim(part,w,h,d,x,y,z,col); if(m) made.push(m); return m; };
    if(arm.head){
      const c=this._armorColor(arm.head.item);
      at(p.head,0.5,0.24,0.5, 0,0.13,0, c);      // top cap (sits on top of the head)
      at(p.head,0.5,0.46,0.09, 0,0,-0.205, c);   // back plate
      at(p.head,0.5,0.1,0.06, 0,0.17,0.225, c);  // brow band across the forehead (above the eyes)
    }
    if(arm.chest){
      const c=this._armorColor(arm.chest.item);
      at(p.body,0.54,0.66,0.3, 0,0,0, c);        // chestplate shell over the torso
      at(p.body,0.56,0.06,0.32, 0,-0.3,0, TRIM); // belt at the waist
      at(p.armL,0.19,0.66,0.19, 0,0,0, c);       // shoulder/sleeve shells
      at(p.armR,0.19,0.66,0.19, 0,0,0, c);
    }
    if(arm.legs){
      const c=this._armorColor(arm.legs.item);
      at(p.legFL,0.22,0.47,0.22, 0,0,0, c);
      at(p.legFR,0.22,0.47,0.22, 0,0,0, c);
      at(p.legFL,0.23,0.05,0.23, 0,-0.21,0, TRIM); // knee/cuff trim
      at(p.legFR,0.23,0.05,0.23, 0,-0.21,0, TRIM);
    }
    if(arm.feet){
      const c=this._armorColor(arm.feet.item);
      at(p.footL,0.18,0.14,0.26, 0,0,0.02, c);   // boots (narrow so they stay split, not one block)
      at(p.footR,0.18,0.14,0.26, 0,0,0.02, c);
    }
    pb.userData.armorMeshes=made.filter(Boolean);
  }
  _updateHeld(){
    const s=this.player.inv[this.player.sel];
    // empty hand: still show the arm (just no item icon/model)
    if(!s){ this.heldHand.visible=true; this.heldSprite.visible=false; this.heldModel.visible=false; this.heldModelItem=null; this.heldSpriteItem=null; return; }
    this.heldHand.visible=true;
    const it=ITEMS[s.item], kind=this._gearKind(it);
    const productionName=kind==='pickaxe'||kind==='axe' ? kind : null;
    if(productionName&&ProductionAssets.cache[productionName]){
      if(this.heldModelItem!==s.item){
        while(this.heldModel.children.length){ const old=this.heldModel.children[0]; old.traverse(n=>{ if(n.material){ const list=Array.isArray(n.material)?n.material:[n.material]; for(const m of list) if(m&&m.depthTest===false) m.dispose(); } }); this.heldModel.remove(old); }
        const obj=ProductionAssets.clone(productionName,{held:true,scale:0.31,position:[-0.04,-0.2,-0.08],rotation:[-0.18,0.1,-0.62]});
        if(obj){ this._tintToolAsset(obj,s.item,true); this.heldModel.add(obj); } this.heldModelItem=s.item;
      }
      this.heldSprite.visible=false; this.heldSpriteItem=null; this.heldModel.visible=true; return;
    }
    if(this.heldSpriteItem===s.item){ this.heldModel.visible=false; this.heldModelItem=null; this.heldSprite.visible=true; return; }
    if(kind){
      this.heldModel.visible=false; this.heldModelItem=null;
      this.heldSprite.visible=true;
      this.heldSprite.material.map=this._iconTexture(s.item); this.heldSprite.material.needsUpdate=true;
      this.heldSprite.scale.set(0.46,0.46,1);
      this.heldSprite.position.set(-0.015,0.11,-0.12);
      // long tools/weapons/arrows are drawn on a diagonal — stand them UPRIGHT
      // (blade/point up, handle/nock down at the hand). Round items (potion,
      // armor) stay unrotated.
      const upright=['pickaxe','axe','shovel','sword','stick','shears','arrow','rod','flint_steel'].includes(it.icon);
      this.heldSprite.material.rotation = upright ? Math.PI/4 : 0;
    } else {
      this.heldModel.visible=false; this.heldModelItem=null; this.heldSprite.visible=true;
      this.heldSprite.material.map=this._iconTexture(s.item); this.heldSprite.material.needsUpdate=true;
      this.heldSprite.scale.set(0.34,0.34,1);
      this.heldSprite.position.set(0,0.1,-0.05);
      this.heldSprite.material.rotation=0;
    }
    this.heldSpriteItem=s.item;
  }
  render(dt=1/60){
    dt=Math.min(Math.max(dt,0),0.05);
    // impact judder + discovery lens-pulse — applied just before draw so the
    // camera block's own positioning is never fought (flight excluded)
    if(!this._rocketActive){
      if(this._hitShakeT>0){ this._hitShakeT=Math.max(0,this._hitShakeT-dt); const s=this._hitShakeT*0.4;
        this.camera.position.x+=(Math.random()-0.5)*s; this.camera.position.y+=(Math.random()-0.5)*s*0.6; }
      if(this._fovPulseT>0){ this._fovPulseT-=dt;
        const t=Math.max(0,this._fovPulseT/0.8);
        this.camera.fov=72+6*Math.sin((1-t)*Math.PI); this.camera.updateProjectionMatrix();
        if(this._fovPulseT<=0){ this.camera.fov=72; this.camera.updateProjectionMatrix(); } }
    }
    if(this._composer&&this.gfx!=='low'){ try{ this._composer.render(); return; }catch(e){ this._composer=null; } } this.renderer.render(this.scene,this.camera); }
  // optional bloom post-pass; entirely guarded — falls back to plain render if the
  // postprocessing libs aren't present or anything throws
  _initBloom(){
    try{
      if(this.gfx==='low' || typeof THREE.EffectComposer!=='function' || typeof THREE.UnrealBloomPass!=='function' || typeof THREE.RenderPass!=='function') return;
      const comp=new THREE.EffectComposer(this.renderer);
      comp.addPass(new THREE.RenderPass(this.scene,this.camera));
      const bloom=new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight), VOXHAVEN_VISUALS.effects.bloomStrength, VOXHAVEN_VISUALS.effects.bloomRadius, VOXHAVEN_VISUALS.effects.bloomThreshold);
      comp.addPass(bloom);
      comp.setSize(innerWidth,innerHeight);
      this._composer=comp; this._bloom=bloom;
    }catch(e){ this._composer=null; }
  }

  // ---------- crafting ----------
  recipesFor(station){
    if(station==='science') return RECIPES.filter(r=>r.station==='science');
    if(station==='bench') return RECIPES.filter(r=>!r.station||r.station==='bench');
    return RECIPES.filter(r=>!r.station);
  }
  canCraft(r){ for(const [it,ct] of r.need) if(this.countItem(it)<ct) return false; return true; }
  craft(r){
    if(!this.canCraft(r)){ this.onFlash&&this.onFlash('Missing crafting materials'); return false; }
    if(!this._canFitAfterCost(r.need,r.out[0],r.out[1])){ this.onFlash&&this.onFlash('Inventory full — make room first'); return false; }
    for(const [it,ct] of r.need) this.takeItem(it,ct); this.giveItem(r.out[0],r.out[1]);
    this.milestones=this.milestones||{}; this.milestones['crafted:'+r.out[0]]=1; Audio.play('craft'); this.onFlash&&this.onFlash('Crafted '+ITEMS[r.out[0]].name); return true; }

  // ---------- fishing ----------
  // launch the boat onto aimed water — consumes the item; hopping out returns it
  _useBoat(){
    if(this.player.boat) return false;
    const t=this._getWaterTarget();
    if(!t){ this.onFlash&&this.onFlash('Aim at water to launch the boat'); return false; }
    if(this.mode!=='creative') this.takeItem('boat',1);
    this.player.boat=true; this.player.flying=false;
    this.player.pos.set(t.x+0.5, t.y+0.9, t.z+0.5); this.player.vel.set(0,0,0);
    Audio.play('splash');
    const k=a=>this.controlHint?this.controlHint(a):a;
    this.onFlash&&this.onFlash(`Boarded — ${k('forward')}/${k('left')}/${k('back')}/${k('right')} to paddle, ${k('crouch')} to hop out`);
    return true;
  }
  // Diving Pod: submerge and explore the deep — fast 3D swim, no breath drain.
  // Space rises, crouch dives, F surfaces you and stows the pod.
  _usePod(){
    if(this.player.pod||this.player.boat) return false;
    const t=this._getWaterTarget();
    if(!t){ this.onFlash&&this.onFlash('Aim at water to launch the diving pod'); return false; }
    if(this.mode!=='creative') this.takeItem('diving_pod',1);
    this.player.pod=true; this.player.flying=false;
    this.player.pos.set(t.x+0.5, t.y+0.4, t.z+0.5); this.player.vel.set(0,0,0);
    Audio.play('splash');
    const k=a=>this.controlHint?this.controlHint(a):a;
    this.onFlash&&this.onFlash(`Pod sealed — ${k('jump')} rises · ${k('crouch')} dives · ${k('interact')} surfaces`);
    return true;
  }
  _exitPod(){
    if(!this.player.pod) return false;
    this.player.pod=false; this._giveOrDrop('diving_pod',1);
    // pop to the surface so you never exit into a drowning trap
    const px=Math.floor(this.player.pos.x), pz=Math.floor(this.player.pos.z);
    let y=Math.floor(this.player.pos.y); while(y<SEA_LEVEL+1 && isWet(this.world.getBlock(px,y,pz))) y++;
    this.player.pos.y=Math.max(this.player.pos.y, y+0.2); this.player.vel.set(0,0,0);
    this.onFlash&&this.onFlash('Pod stowed');
    return true;
  }
  // ride a tamed strider: F mounts/dismounts; an apple tames a wild one
  interactMount(){
    if(this.player.mount){ this._dismount(); return true; }
    const m=this.findLookMob(); if(!m||!m.def.mount) return false;
    const held=this.selItem();
    if(!m.tamed){
      if(held && held.id==='apple'){ if(this.mode!=='creative') this.takeItem('apple',1); m.tamed=true; m.persistent=true; this._spawnParticles(m.pos.x,m.pos.y+1,m.pos.z,'#ff6a8a'); this.onFlash&&this.onFlash('The strider nuzzles you — tamed! Press F to ride.'); }
      else this.onFlash&&this.onFlash('The strider eyes your hands. It wants an apple.');
      return true;
    }
    this.player.mount=m; m.state='ridden';
    const k=a=>this.controlHint?this.controlHint(a):a;
    this.onFlash&&this.onFlash(`Riding — ${k('forward')}/${k('left')}/${k('back')}/${k('right')} to run, ${k('jump')} to jump, ${k('crouch')} to dismount`);
    return true;
  }
  _dismount(){ const m=this.player.mount; this.player.mount=null; if(!m) return; m.state='idle'; const p=this.player;
    for(const [ox,oz] of [[1.1,0],[-1.1,0],[0,1.1],[0,-1.1],[0,0]]){ const x=m.pos.x+ox, z=m.pos.z+oz; if(!p.collides(x,m.pos.y+0.6,z)){ p.pos.set(x,m.pos.y+0.6,z); p.vel.set(0,0,0); return; } }
    p.pos.set(m.pos.x,m.pos.y+1.2,m.pos.z); p.vel.set(0,0,0); }
  // riding physics: the strider carries the player — gallop, 1-block hop, jump
  _rideTick(dt,ctl){
    const m=this.player.mount, p=this.player;
    if(ctl.crouch){ this._dismount(); return {fellHard:0}; }
    const sin=Math.sin(p.yaw), cos=Math.cos(p.yaw);
    let wx=0,wz=0;
    if(ctl.f){wx-=sin;wz-=cos;} if(ctl.b){wx+=sin;wz+=cos;} if(ctl.l){wx-=cos;wz+=sin;} if(ctl.r){wx+=cos;wz-=sin;}
    const len=Math.hypot(wx,wz)||1; wx/=len; wz/=len;
    const moving=ctl.f||ctl.b||ctl.l||ctl.r, sp=moving?7.5:0;
    m.vel.y-=26*dt;
    if(isWet(this.world.getBlock(Math.floor(m.pos.x),Math.floor(m.pos.y),Math.floor(m.pos.z)))) m.vel.y=Math.max(m.vel.y,3.0);   // buoyancy: swim back out, never drown under the rider
    let nx=m.pos.x+wx*sp*dt, nz=m.pos.z+wz*sp*dt;
    if(this.world.isSolid(Math.floor(nx),Math.floor(m.pos.y),Math.floor(nz))){
      if(m.onGround && !this.world.isSolid(Math.floor(nx),Math.floor(m.pos.y)+1,Math.floor(nz))) m.vel.y=7.5;
      else { nx=m.pos.x; nz=m.pos.z; }
    }
    if(m.onGround && this.world.getBlock(Math.floor(nx),Math.floor(m.pos.y),Math.floor(nz))===B.WATER){ nx=m.pos.x; nz=m.pos.z; }   // won't walk INTO water from dry land, but can swim out if pushed in
    if(ctl.jump && m.onGround){ m.vel.y=8.6; m.onGround=false; }
    m.pos.x=nx; m.pos.z=nz; m.pos.y+=m.vel.y*dt;
    const gy=Math.floor(m.pos.y-0.05);
    if(this.world.isSolid(Math.floor(m.pos.x),gy,Math.floor(m.pos.z)) && m.pos.y<gy+1.02){ m.pos.y=gy+1; m.vel.y=Math.max(0,m.vel.y); m.onGround=true; } else m.onGround=false;
    if(moving){ m.yaw=Math.atan2(wx,wz); }
    m.anim+=dt*(moving?10:2); this._animateMob(m,moving);
    m.group.position.set(m.pos.x,m.pos.y,m.pos.z); m.group.rotation.y=m.yaw;
    p.pos.set(m.pos.x, m.pos.y+1.15, m.pos.z); p.vel.set(0,0,0); p.onGround=true;
    return {fellHard:0};
  }
  _getWaterTarget(){
    const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(this.player.pitch,this.player.yaw,0,'YXZ'));
    const origin=new THREE.Vector3(this.player.pos.x,this.player.pos.y+this.player.eye,this.player.pos.z);
    const hit=raycastVoxel(origin,dir,7,(x,y,z)=>this.world.getBlock(x,y,z)===B.WATER);
    return (hit&&hit.hit)?{x:hit.x,y:hit.y,z:hit.z}:null;
  }
  _updateFishing(dt){
    const f=this.fishing; if(!f) return;
    f.t=(f.t||0)+dt;
    if(f.state==='waiting'){
      if(f.t>=f.waitT){
        f.state='biting'; f.biteT=0; f.window=1.1+Math.random()*0.4;
        const t=f.target; this._spawnParticles(t.x+0.5,t.y+0.75+Math.random()*0.2,t.z+0.5,'#a0d0ff');
        Audio.play('place');
        this.onToast&&this.onToast('Bite!');
      }
    }else if(f.state==='biting'){
      f.biteT=(f.biteT||0)+dt;
      const d=f.target; const dist=Math.hypot(this.player.pos.x-(d.x+0.5), this.player.pos.z-(d.z+0.5));
      if(dist>6.5 || f.biteT>f.window){
        this.onToast&&this.onToast('Fish got away');
        this.fishing=null;
        if(this.fishLine) this.fishLine.visible=false;
      }
    }else if(f.state==='hooked'){
      // optional: auto unhook if too far
      const hp = f.hooked && f.hooked.pos ? f.hooked.pos : (f.target ? {x:f.target.x+0.5,y:f.target.y+0.5,z:f.target.z+0.5} : this.player.pos);
      const hx=Number.isFinite(hp.x)?hp.x:this.player.pos.x, hy=Number.isFinite(hp.y)?hp.y:this.player.pos.y, hz=Number.isFinite(hp.z)?hp.z:this.player.pos.z;
      const dist = Math.hypot(this.player.pos.x-hx,this.player.pos.y-hy,this.player.pos.z-hz);
      if(dist > 12){
        this.onToast&&this.onToast('Lost grip');
        this.fishing=null;
        if(this.fishLine) this.fishLine.visible=false;
      }
    }
  }
  _rollFishLoot(){
    const t=this.time; const isNight=(t<0.25||t>0.75);
    const px=Math.floor(this.player.pos.x),pz=Math.floor(this.player.pos.z);
    const biome=this.world.biomeAt(px,pz,this.world.heightAt(px,pz));
    let opts=[
      {id:'raw_fish',w:72},
      {id:'stick',w:16},{id:'fiber',w:7},
      {id:'crystal',w:3},{id:'cooked_fish',w:2}
    ];
    if(isNight){ opts[0].w+=12; opts[4].w+=1; }
    if(biome===BIOMES.forest||biome===BIOMES.savanna){ opts[0].w+=8; }
    if(biome===BIOMES.snow){ opts[0].w-=8; opts[1].w+=5; }
    let tot=0; for(const o of opts) tot+=o.w;
    let r=Math.random()*tot;
    for(const o of opts){ r-=o.w; if(r<=0) return o.id; }
    return 'raw_fish';
  }
  _useFishingRod(rodIt, s){
    if(this.fishing){
      if(this.fishing.state==='hooked'){
        this._pullHooked(this.fishing);
        this.fishing=null;
        if(this.fishLine) this.fishLine.visible=false;
        return true;
      }
      if(this.fishing.state!=='biting'){ this.onToast&&this.onToast('Too early'); this.fishing=null; if(this.fishLine)this.fishLine.visible=false; return false; }
      return this._reel(rodIt,s);
    }
    const waterTgt = this._getWaterTarget();
    if(waterTgt){
      // water fishing as normal
      const wait=1.3 + Math.random()*2.6;
      this.fishing={state:'waiting', target:waterTgt, waitT:wait, t:0};
      this.heldSwing=1;
      Audio.play('place');
      this.onToast&&this.onToast('Casting...');
      return true;
    }
    // land: hook mobs or items (not water fishing)
    const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(this.player.pitch,this.player.yaw,0,'YXZ'));
    const dist=6;
    const tgt={x:Math.floor(this.player.pos.x+dir.x*dist), y:Math.floor(this.player.pos.y+this.player.eye+dir.y*dist), z:Math.floor(this.player.pos.z+dir.z*dist)};
    let hooked=null, htype=null;
    let minD = 2.5;
    for(const m of this.mobs){
      const d = Math.hypot(m.pos.x - (tgt.x+0.5), m.pos.z - (tgt.z+0.5));
      if(d < minD){ minD=d; hooked=m; htype='mob'; }
    }
    if(!hooked){
      for(const d of this.drops){
        if(!d || !d.item || d.projectile) continue;
        const dd = Math.hypot(d.pos.x - (tgt.x+0.5), d.pos.z - (tgt.z+0.5));
        if(dd < minD){ minD=dd; hooked=d; htype='drop'; }
      }
    }
    if(hooked){
      this.fishing={state:'hooked', hooked:hooked, hookedType:htype, target:tgt};
      this.heldSwing=1;
      Audio.play('place');
      this.onToast&&this.onToast(htype==='mob' ? 'Hooked!' : 'Hooked item!');
      return true;
    }
    this.onToast&&this.onToast('Nothing hooked');
    return false;
  }
  _reel(rodIt, s){
    const tgt=this.fishing.target;
    this._spawnParticles(tgt.x+0.5, tgt.y+0.85, tgt.z+0.5, '#7fb8e6');
    this.heldSwing=1;
    Audio.play('pickup');
    const caught=this._rollFishLoot();
    const left=this.giveItem(caught,1);
    const nm=ITEMS[caught]?ITEMS[caught].name:caught;
    if(left>0){ this._spawnDrop(caught,left,this.player.pos.x,this.player.pos.y+0.5,this.player.pos.z); this.onToast&&this.onToast('Caught '+nm+' â€” dropped nearby (inventory full)'); }
    else { this.onToast&&this.onToast('Caught '+nm+'!'); }
    if(this.mode!=='creative' && rodIt.dur){
      s.dur=(s.dur==null?rodIt.dur:s.dur)-1;
      if(s.dur<=0) this.player.inv[this.player.sel]=null;
    }
    this.fishing=null;
    if(this.fishLine) this.fishLine.visible=false;
    return true;
  }

  _pullHooked(f){
    const h = f.hooked;
    if(!h) return;
    const p = this.player.pos;
    if(f.hookedType === 'mob' && h.pos){
      const dx = p.x - h.pos.x;
      const dz = p.z - h.pos.z;
      const dist = Math.hypot(dx, dz) || 0.1;
      if(dist > 1.5){
        const pull = 0.4;
        h.pos.x += dx / dist * pull;
        h.pos.z += dz / dist * pull;
        if(h.vel){
          h.vel.x += dx / dist * 1.5;
          h.vel.z += dz / dist * 1.5;
          h.vel.y = Math.max(h.vel.y || 0, 1);
        }
      }
    } else if(f.hookedType === 'drop' && h.pos && h.item){
      const dx = p.x + 0.5 - h.pos.x;
      const dz = p.z + 0.5 - h.pos.z;
      const dist = Math.hypot(dx, dz) || 0.1;
      if(dist > 1.5){
        const pull = 0.6;
        h.pos.x += dx / dist * pull;
        h.pos.z += dz / dist * pull;
        if(h.vel){
          h.vel.x += dx / dist * 2;
          h.vel.z += dz / dist * 2;
        }
      } else {
        const before=h.count||1, left=this.giveItem(h.item,before);
        if(left<before){
          if(left>0) h.count=left;
          else {
            this._disposeWorldDrop(h);
            const i = this.drops.indexOf(h);
            if(i >= 0) this.drops.splice(i,1);
          }
        }
      }
    }
  }

  _updateFishLine(){
    if(!this.fishLine || !this.fishing) return;
    const f=this.fishing, q=this._fishLineScratch||(this._fishLineScratch={origin:new THREE.Vector3(),dir:new THREE.Vector3(),start:new THREE.Vector3(),right:new THREE.Vector3(),end:new THREE.Vector3(),lineEnd:new THREE.Vector3(),turn:new THREE.Euler(0,0,0,'YXZ')});
    q.turn.set(this.player.pitch,this.player.yaw,0,'YXZ');
    const origin=q.origin.set(this.player.pos.x,this.player.pos.y+this.player.eye,this.player.pos.z);
    const dir=q.dir.set(0,0,-1).applyEuler(q.turn);
    const start=q.start.copy(origin).addScaledVector(dir,0.52);
    const rgt=q.right.set(1,0,0).applyEuler(q.turn);
    start.addScaledVector(rgt,0.22); start.y-=0.08;
    const end=q.end;
    if(f.hooked && f.hooked.pos){
      const hp = f.hooked.pos;
      end.set(hp.x,hp.y+0.5,hp.z);
    } else {
      const t=f.target;
      end.set(t.x+0.5,t.y+0.92,t.z+0.5);
    }
    // string "goes out" on cast (short lerp at beginning)
    let p=1;
    if(f.state==='waiting' && (f.t||0)<0.4) p=Math.min(1, (f.t||0)/0.32);
    const lineEnd=q.lineEnd.copy(start).lerp(end,p);
    const pos=this.fishLine.geometry.attributes.position;
    pos.setXYZ(0, start.x, start.y, start.z);
    pos.setXYZ(1, lineEnd.x, lineEnd.y, lineEnd.z);
    pos.needsUpdate=true;
    this.fishLine.visible=true;
    // subtle twitch on bite for "alive" feedback
    if(f.state==='biting'){
      const wobble=Math.sin((f.biteT||0)*18)*0.03;
      pos.setY(1, lineEnd.y + wobble);
      pos.needsUpdate=true;
    }
  }

  // ---------- eat ----------
  useItem(){ const s=this.player.inv[this.player.sel]; if(!s) return; const it=ITEMS[s.item];
    if(s.item==='egg' && this.mode==='creative'){ return this._spawnEggMob(); }   // crack an egg → spawn a mob (cycles types)
    if(it && it.fishes){ return this._useFishingRod(it,s); }
    if(it && it.boats){ return this._useBoat(); }
    if(it && it.pods){ return this._usePod(); }
    if(it&&it.effect){
      this.player.effects[it.effect]={ t:it.effectDur };
      s.count--; if(s.count<=0) this.player.inv[this.player.sel]=null; Audio.play('eat');
      this.onToast&&this.onToast(it.name+' active ('+it.effectDur+'s)'); return true;
    }
    if(it&&it.food && this.player.hunger<this.player.maxHunger){
      const p=this.player;
      p.hunger=Math.min(p.maxHunger,p.hunger+it.food);
      p.saturation=Math.min(p.hunger, p.saturation + it.food*0.6);   // refill the hidden buffer, capped at current hunger
      // raw meat/fish can turn your stomach — cook it to be safe
      if(it.raw && Math.random()<0.35){ this._queasyT=10; this.onToast&&this.onToast('That raw food made you queasy'); }
      s.count--; if(s.count<=0) this.player.inv[this.player.sel]=null; Audio.play('eat'); return true;
    }
    // otherwise placing handled by place()
    return false;
  }
  // creative spawn-egg: each crack spawns the NEXT mob kind in front of you (cycles through all)
  _spawnEggMob(){
    try{
      const kinds=Object.keys(MOB_DEF).filter(k=>k!=='settler'&&k!=='guard'&&k!=='player');
      this._eggIdx=((this._eggIdx==null?-1:this._eggIdx)+1)%kinds.length;
      const kind=kinds[this._eggIdx];
      const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(0,this.player.yaw,0,'YXZ'));
      const x=this.player.pos.x+dir.x*3, z=this.player.pos.z+dir.z*3;
      const y=this.world.surfaceY(Math.floor(x),Math.floor(z))+1;
      const m=new Mob(kind, x, y, z); this.scene.add(m.group); this.mobs.push(m);
      Audio.play('pickup'); this.onToast&&this.onToast('Spawned: '+kind+'  (crack again to cycle mobs)');
      return true;
    }catch(e){ return false; }
  }
  dropSelected(){ const s=this.player.inv[this.player.sel]; if(!s) return; const q=this._dropThrowScratch||(this._dropThrowScratch={dir:new THREE.Vector3(),turn:new THREE.Euler(0,0,0,'YXZ')});
    const dir=q.dir.set(0,0,-1).applyEuler(q.turn.set(this.player.pitch,this.player.yaw,0,'YXZ'));
    const d=this._spawnDrop(s.item,1,this.player.pos.x+dir.x,this.player.pos.y+1+dir.y,this.player.pos.z+dir.z);
    if(d){ d.vel.set(dir.x*5,dir.y*5+2,dir.z*5); d.life=-0.5; d.settled=false; }
    s.count--; if(s.count<=0) this.player.inv[this.player.sel]=null;
  }

  // ---------- tamed-mount persistence across dimensions ----------
  // Tamed mounts have no world-gen source, so leaving a dimension must STASH
  // them (not destroy them) and re-entering must restore them. Villagers/courts
  // instead respawn from their village/lair/outpost, so they aren't stashed.
  _serMob(m){ return {k:m.kind,x:+m.pos.x.toFixed(2),y:+m.pos.y.toFixed(2),z:+m.pos.z.toFixed(2),hp:m.hp,home:m.home||null,bed:m.bed||null,role:m.role||null,carry:m.carry||0,tamed:!!m.tamed,king:!!m._king,post:m._post||null}; }
  _spawnSavedMob(o){
    if(!o||!MOB_DEF[o.k]||![o.x,o.y,o.z].every(v=>Number.isFinite(+v))) return null;
    const m=new Mob(o.k,+o.x,+o.y,+o.z), hp=Number.isFinite(+o.hp)?+o.hp:m.maxhp;
    m.hp=clamp(hp,1,m.maxhp);
    const point=v=>v&&Number.isFinite(+v.x)&&Number.isFinite(+v.z)?{x:+v.x,z:+v.z,...(Number.isFinite(+v.y)?{y:+v.y}:{})}:null;
    m.home=point(o.home); m.bed=point(o.bed); if(o.role==='farmer'||o.role==='villager') m.role=o.role;
    m.carry=clamp(Number.isFinite(+o.carry)?(+o.carry|0):0,0,64); m.tamed=!!o.tamed;
    if(o.king) m._king=true; m._post=point(o.post); m.persistent=true;
    this.scene.add(m.group); this.mobs.push(m); return m;
  }
  // call BEFORE this.mobs is cleared on a dimension change (this.dimension = departing dim)
  _stashTamed(){ this._mobStash=this._mobStash||{}; const t=this.mobs.filter(m=>m.tamed).map(m=>this._serMob(m)); if(t.length) this._mobStash[this.dimension]=t; }
  // call AFTER the new dimension/world is active
  _restoreTamed(dim){ if(this._mobStash&&this._mobStash[dim]){ for(const o of this._mobStash[dim]) this._spawnSavedMob(o); this._mobStash[dim]=null; } }
  _serDrop(d){ return {item:d.item,count:d.count,x:+d.pos.x.toFixed(2),y:+d.pos.y.toFixed(2),z:+d.pos.z.toFixed(2),life:Math.max(0,Math.min(179,d.life||0))}; }
  _validWorldDrop(d){ return !!(d&&!d.projectile&&ITEMS[d.item]&&d.pos&&[d.pos.x,d.pos.y,d.pos.z,d.count].every(v=>Number.isFinite(+v))&&+d.count>0); }
  _stashDrops(){ this._dropStash=this._dropStash||{}; this._dropStash[this.dimension]=(this.drops||[]).filter(d=>this._validWorldDrop(d)).slice(0,160).map(d=>this._serDrop(d)); }
  _restoreDrops(dim){
    const saved=this._dropStash&&this._dropStash[dim]; if(!Array.isArray(saved)) return;
    this._dropStash[dim]=null;
    for(const o of saved.slice(0,160)){
      if(!o||!ITEMS[o.item]||![o.x,o.y,o.z,o.count].every(v=>Number.isFinite(+v))||+o.count<=0) continue;
      const d=this._spawnDrop(o.item,Math.min(99,Math.floor(+o.count)),+o.x,+o.y,+o.z);
      if(d) d.life=clamp(Number.isFinite(+o.life)?+o.life:0,0,179);
    }
  }

  // ---------- save / load ----------
  serialize(){
    // always persist the OVERWORLD as the main world — even if the player is
    // currently in the cockpit room or on the planet (those are transient/regenerable)
    const W = (this.dimension && this.dimension!=='overworld' && this.overworld) ? this.overworld : this.world;
    // transient states (cockpit room, in-flight, mid-landing) must never be the live save pos
    const transient = !!(this._rocketActive || this._inCockpit || this.dimension==='cockpit');
    const ov = (W===this.world && !transient) ? this.player : null;   // only trust live player pos on the stable overworld
    const deltas={}; for(const [k,v] of W.deltas) deltas[k]=v;
    const meta={}; for(const [k,v] of W.meta) meta[k]=v;
    const chests={}; for(const [k,v] of W.chests) chests[k]=v;
    const furn={}; for(const [k,v] of W.furnaces) furn[k]=v;
    const sp=this.player.spawn||{x:this.player.pos.x,y:this.player.pos.y,z:this.player.pos.z};
    const pp= ov ? this.player.pos : sp;   // off-overworld: save the spawn point so load never drops you in a dead dimension
    const dropStash={};
    for(const dim of ['overworld','planet']) if(this._dropStash&&Array.isArray(this._dropStash[dim])) dropStash[dim]=this._dropStash[dim];
    if(!transient&&this.dimension!=='cockpit') dropStash[this.dimension]=(this.drops||[]).filter(d=>this._validWorldDrop(d)).slice(0,160).map(d=>this._serDrop(d));
    return {
      v:SAVE_VER, gen:this.overworld?(this.overworld.genVer||1):(this.world.genVer||1),
      seed:W.seed, time:this.time, day:this.day, deaths:this.deaths||0, mode:this.mode,
      player:{ x:pp.x,y:pp.y,z:pp.z, yaw:this.player.yaw, pitch:this.player.pitch,
        hp:this.player.health, hunger:this.player.hunger, warmth:this.player.warmth, saturation:this.player.saturation, stamina:this.player.stamina, spawn:this.player.spawn, sel:this.player.sel, armor:this.player.armor, effects:this.player.effects, boat:!!(ov&&this.player.boat), pod:!!(ov&&this.player.pod) },
      inv:this.player.inv, deltas, meta, chests, furnaces:furn,
      raining:!!this.raining, wTmr:this._wTmr||0, milestones:this.milestones||{}, journal:this.journal||{},
      // named characters persist: villagers (role/carry), pets, guards, rulers, tamed mounts
      mobsP: transient?[]:this.mobs.filter(m=>m.persistent&&!m._net).map(m=>this._serMob(m)),
      mobsDim: transient?'overworld':this.dimension,
      mobStash: this._mobStash||{},   // tamed mounts stashed in OTHER dimensions
      dropStash,
      ...(this._serializeSpace ? this._serializeSpace() : {}),
      ...((this.dimension==='cockpit'||transient) ? {dimension:'overworld'} : {}),   // cockpit/flight are transient — never load into them
    };
  }
  load(save){
    if(!save) return;
    save=this.migrate(save);
    this._mobStash={};
    if(save.mobStash&&typeof save.mobStash==='object') for(const dim of ['overworld','planet']) if(Array.isArray(save.mobStash[dim])) this._mobStash[dim]=save.mobStash[dim].slice(0,32);
    const finite=(v,d)=>Number.isFinite(+v)?+v:d, seed=finite(save.seed,1)>>>0;
    const validKey=k=>typeof k==='string'&&/^-?\d+,-?\d+,-?\d+$/.test(k);
    this.newWorld(seed);
    this._dropStash={}; if(save.dropStash&&typeof save.dropStash==='object') for(const dim of ['overworld','planet']) if(Array.isArray(save.dropStash[dim])) this._dropStash[dim]=save.dropStash[dim].slice(0,160);
    this.world.genVer=Math.max(1,finite(save.gen,1)|0);   // pre-deep-ocean worlds keep their original terrain
    this.world.deltas=new Map(Object.entries(save.deltas&&typeof save.deltas==='object'?save.deltas:{}).filter(([k,v])=>validKey(k)&&Number.isInteger(+v)&&(+v===B.AIR||!!BLOCKS[+v])).map(([k,v])=>[k,+v]));
    this.world.meta=new Map(Object.entries(save.meta&&typeof save.meta==='object'?save.meta:{}).filter(([k,v])=>validKey(k)&&v&&typeof v==='object'&&!Array.isArray(v)));
    this.world.chests=new Map(Object.entries(save.chests&&typeof save.chests==='object'?save.chests:{}).filter(([k])=>validKey(k)).map(([k,v])=>[k,(Array.isArray(v)?v:[]).slice(0,27).map(s=>this._sanitizeStack(s))]));
    for(const slots of this.world.chests.values()) while(slots.length<27) slots.push(null);
    this.world.furnaces=new Map(Object.entries(save.furnaces&&typeof save.furnaces==='object'?save.furnaces:{}).filter(([k])=>validKey(k)).map(([k,v])=>{ const f=v&&typeof v==='object'?v:{}; return [k,{input:this._sanitizeStack(f.input),fuel:this._sanitizeStack(f.fuel),output:this._sanitizeStack(f.output),prog:Math.max(0,finite(f.prog,0)),burn:Math.max(0,finite(f.burn,0)),burnMax:Math.max(0,finite(f.burnMax,0))}]; }));
    // newWorld() already generated & cached the spawn chunks without these
    // deltas — drop the data cache so chunks regenerate with edits applied.
    this.world.chunks.clear(); this.world.lights.clear(); this.world.villages=[];
    this.player.inv=Array.isArray(save.inv)?save.inv.slice(0,36).map(s=>this._sanitizeStack(s)):this.player.inv; while(this.player.inv.length<36) this.player.inv.push(null);
    const p=save.player&&typeof save.player==='object'?save.player:{};
    this.player.setPos(finite(p.x,0.5),finite(p.y,SEA_LEVEL+2),finite(p.z,0.5)); this.player.yaw=finite(p.yaw,0); this.player.pitch=clamp(finite(p.pitch,0),-1.55,1.55);
    this.player.health=clamp(finite(p.hp,this.player.maxHealth),1,this.player.maxHealth); this.player.hunger=clamp(finite(p.hunger,this.player.maxHunger),0,this.player.maxHunger);
    this.player.spawn=p.spawn&&Number.isFinite(+p.spawn.x)&&Number.isFinite(+p.spawn.y)&&Number.isFinite(+p.spawn.z)?p.spawn:{x:this.player.pos.x,y:this.player.pos.y,z:this.player.pos.z}; this.player.sel=clamp(finite(p.sel,0)|0,0,8);
    this.player.warmth=clamp(finite(p.warmth,this.player.maxWarmth),0,this.player.maxWarmth);
    this.player.saturation=clamp(finite(p.saturation,5),0,this.player.maxHunger);
    const armor=p.armor&&typeof p.armor==='object'?p.armor:{};
    this.player.armor={head:this._sanitizeStack(armor.head,'head'),chest:this._sanitizeStack(armor.chest,'chest'),legs:this._sanitizeStack(armor.legs,'legs'),feet:this._sanitizeStack(armor.feet,'feet')};
    this.player.stamina=clamp(finite(p.stamina,this.player.maxStamina),0,this.player.maxStamina);
    this.player.effects={}; if(p.effects&&typeof p.effects==='object'&&!Array.isArray(p.effects)) for(const k of ['speed','strength','regen']){ const t=p.effects[k]&&+p.effects[k].t; if(Number.isFinite(t)&&t>0) this.player.effects[k]={t:Math.min(t,3600)}; } this.player.boat=!!p.boat; this.player.pod=!!p.pod;
    this._recoverOrphanContainers();
    this.raining=!!save.raining; this._wTmr=Math.max(0,finite(save.wTmr,0));
    this.milestones=save.milestones&&typeof save.milestones==='object'&&!Array.isArray(save.milestones)?save.milestones:{};
    this.journal=save.journal&&typeof save.journal==='object'&&!Array.isArray(save.journal)?save.journal:{mobs:{},kills:{},biomes:{}};
    for(const k of ['mobs','kills','biomes']) if(!this.journal[k]||typeof this.journal[k]!=='object'||Array.isArray(this.journal[k])) this.journal[k]={};
    this.time=clamp(finite(save.time,0.30),0,1); this._clockPrev=this.time; this.day=Math.max(1,finite(save.day,1)|0); this.deaths=Math.max(0,finite(save.deaths,0)|0); this.mode=['survival','creative','spectator'].includes(save.mode)?save.mode:'survival';
    // restore space-age state (dimension, oxygen, planet edits). Guarded.
    if(this._loadSpace) this._loadSpace(save);
    // restore named characters into whichever dimension they were saved in
    if(Array.isArray(save.mobsP) && save.mobsP.length && (save.mobsDim||'overworld')===this.dimension){
      for(const o of save.mobsP.slice(0,128)) this._spawnSavedMob(o);
    }
    this._restoreTamed(this.dimension);   // tamed mount stashed in the dimension we loaded into (covers transient/cockpit saves)
    this._restoreDrops(this.dimension);
    this._loadSafetyClamp();   // never load embedded in a block, floating, or in the void
  }
  // after load, guarantee the player stands on solid ground in the CURRENT dimension —
  // recovers any save that would otherwise drop you inside a planet, in a wall, or stranded
  _loadSafetyClamp(){
    try{
      const p=this.player; if(!p) return;
      const px=Math.floor(p.pos.x), pz=Math.floor(p.pos.z);
      const sy=this.world.surfaceY(px,pz);
      const inSolid = p.collides(p.pos.x,p.pos.y,p.pos.z);
      const offSurface = (sy<=0) || (p.pos.y > sy+48) || (p.pos.y < sy-3);
      if(inSolid || offSurface){
        if(sy>0) p.setPos(px+0.5, sy+1.05, pz+0.5);
        else this._spawnPlayerSafely(0,0);
      }
    }catch(e){}
  }
  // Fast, read-only release audit. It validates the shared registries, the
  // survival-to-space dependency chain, live entity state, and save encoding.
  shipAudit(log=true){
    const errors=[], warnings=[], add=(list,msg)=>{ if(!list.includes(msg)) list.push(msg); };
    const itemOK=id=>!!(id&&ITEMS[id]);
    const tileNames=t=>typeof t==='string'?[t]:t&&typeof t==='object'?Object.values(t):[];
    for(let id=1;id<BLOCKS.length;id++){
      const b=BLOCKS[id]; if(!b) continue;
      for(const n of tileNames(b.tiles)) if(!TILES[n]) add(errors,'Block '+id+' ('+b.name+') uses missing tile '+n);
      if(b.render==='model'&&b.model&&!SpecialModels[b.model]) add(errors,'Block '+id+' ('+b.name+') uses missing model '+b.model);
      if(b.render==='model'&&!b.model&&id!==B.BED_FOOT) add(errors,'Block '+id+' ('+b.name+') has no model');
      if(b.drop&&!itemOK(b.drop)) add(errors,'Block '+b.name+' drops missing item '+b.drop);
      if(b.give&&!itemOK(b.give)) add(errors,'Block '+b.name+' gives missing item '+b.give);
    }
    for(const [id,it] of Object.entries(ITEMS)){
      if(it.blockId!=null&&!BLOCKS[it.blockId]) add(errors,'Item '+id+' places missing block '+it.blockId);
      if(it.smelt&&!itemOK(it.smelt)) add(errors,'Item '+id+' smelts to missing item '+it.smelt);
      if(it.armorSlot&&!['head','chest','legs','feet'].includes(it.armorSlot)) add(errors,'Item '+id+' has invalid armor slot '+it.armorSlot);
    }
    const recipeSig=new Set();
    for(let i=0;i<RECIPES.length;i++){
      const r=RECIPES[i], out=r&&r.out;
      if(!out||!itemOK(out[0])||!(out[1]>0)){ add(errors,'Recipe '+i+' has invalid output'); continue; }
      if(r.station&&r.station!=='bench'&&r.station!=='science') add(errors,'Recipe '+i+' has invalid station '+r.station);
      for(const n of r.need||[]) if(!itemOK(n[0])||!(n[1]>0)) add(errors,'Recipe '+i+' for '+out[0]+' has invalid input '+n[0]);
      const sig=JSON.stringify([out,r.need,r.station||null]); if(recipeSig.has(sig)) add(warnings,'Duplicate recipe for '+out[0]); recipeSig.add(sig);
      if((r.need||[]).length===1&&r.need[0][0]===out[0]&&r.need[0][1]===out[1]) add(warnings,'No-op recipe for '+out[0]);
    }
    for(const [id,s] of Object.entries(SMELT)){ if(!itemOK(id)||!s||!itemOK(s.out)||!(s.t>0)) add(errors,'Invalid smelting entry '+id); }
    for(const id of Object.keys(FUEL)) if(!itemOK(id)||!(FUEL[id]>0)) add(errors,'Invalid fuel entry '+id);
    for(const [kind,d] of Object.entries(MOB_DEF)) for(const drop of d.drop||[]) if(!itemOK(drop[0])||!(drop[1]>0)) add(errors,'Mob '+kind+' has invalid drop '+drop[0]);
    for(let i=0;i<TRADES.length;i++) for(const s of [TRADES[i].give,TRADES[i].get]) if(!s||!itemOK(s[0])||!(s[1]>0)) add(errors,'Trade '+i+' has invalid item');

    // Natural overworld drops plus smelting and crafting should unlock every
    // first-expedition part without requiring an item from Aethon.
    const available=new Set(['log','cobble','stone','coal','copper_raw','iron_raw','gold_raw','crystal','quartz','space_shard','sand','clay','fiber','wool','leather','raw_meat','apple','gel']);
    let changed=true, guard=0;
    while(changed&&guard++<RECIPES.length+8){ changed=false;
      for(const [id,s] of Object.entries(SMELT)) if(available.has(id)&&!available.has(s.out)){ available.add(s.out); changed=true; }
      for(const r of RECIPES){ const stationOK=!r.station||(r.station==='bench'&&available.has('bench'))||(r.station==='science'&&available.has('science_bench'));
        if(stationOK&&(r.need||[]).every(n=>available.has(n[0]))&&!available.has(r.out[0])){ available.add(r.out[0]); changed=true; } }
    }
    const campaign=['bench','stone_pickaxe','furnace','circuit','science_bench','launchpad','spacesuit_helmet','engine_core','guidance_computer','battery','oxygen_tank','rocket_fuel','oxidizer_cell'];
    for(const id of campaign) if(!available.has(id)) add(errors,'Campaign item is unreachable before Aethon: '+id);
    for(const fn of ['_rkReady','_rocketBoard','travelTo']) if(typeof this[fn]!=='function') add(errors,'Campaign system missing '+fn+'()');

    const finite=(v)=>Number.isFinite(+v);
    if(this.player){ const p=this.player;
      for(const k of ['x','y','z']) if(!finite(p.pos[k])) add(errors,'Player '+k+' is not finite');
      if(!finite(p.yaw)||!finite(p.pitch)||Math.abs(p.pitch)>1.56) add(errors,'Player camera angles are invalid');
      for(const k of ['health','hunger','warmth','saturation','stamina']) if(!finite(p[k])) add(errors,'Player '+k+' is not finite');
      if(!Array.isArray(p.inv)||p.inv.length!==36) add(errors,'Inventory must contain 36 slots');
      for(let i=0;i<(p.inv||[]).length;i++){ const s=p.inv[i]; if(s&&(!itemOK(s.item)||!finite(s.count)||s.count<=0)) add(errors,'Invalid inventory stack at slot '+i); }
      for(const [slot,s] of Object.entries(p.armor||{})) if(s&&(!itemOK(s.item)||ITEMS[s.item].armorSlot!==slot)) add(errors,'Invalid armor in '+slot+' slot');
    }
    for(const m of this.mobs||[]) if(!MOB_DEF[m.kind]||!finite(m.pos.x)||!finite(m.pos.y)||!finite(m.pos.z)) add(errors,'Invalid live mob '+(m.kind||'?'));
    let saveBytes=0;
    try{ const json=JSON.stringify(this.serialize()); saveBytes=json.length; const saved=JSON.parse(json); if(saved.v!==SAVE_VER||!saved.player||!Array.isArray(saved.inv)) add(errors,'Save round-trip lost required fields'); }
    catch(e){ add(errors,'Save is not serializable: '+e.message); }
    const report={ok:errors.length===0,errors,warnings,campaign:{reachable:campaign.filter(id=>available.has(id)),required:campaign},stats:{blocks:BLOCKS.filter(Boolean).length,items:Object.keys(ITEMS).length,recipes:RECIPES.length,mobs:Object.keys(MOB_DEF).length,saveBytes,saveVersion:SAVE_VER}};
    if(log) (report.ok?console.info:console.error)('[Voxhaven ship audit]',report);
    return report;
  }
  // upgrade an older save in-place to SAVE_VER. Unversioned saves become v1 (current schema).
  migrate(save){
    if(!save) return save;
    if(save.v==null) save.v=1;
    if(!Number.isInteger(save.v)||save.v<1||save.v>SAVE_VER) throw new Error('Unsupported save version: '+save.v);
    while(save.v<SAVE_VER){ const fn=SAVE_MIGRATIONS[save.v]; if(!fn) throw new Error('Missing save migration from version '+save.v); fn(save); save.v++; }
    return save;
  }
}

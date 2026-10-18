/* =====================================================================
   Voxhaven — game.js
   Data tables (blocks/items/recipes/mobs), world generation, player,
   inventory, crafting, combat, mob AI, villages, interactions, and the
   Game orchestrator that owns the THREE scene.
   ===================================================================== */

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
  METAL_DOOR:137, CAMPFIRE:138, SEAROCK:139
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
BLOCKS[B.ICE]      = blk('Ice', { tiles:'ice', transparent:true, hardness:0.5, drop:null, give:'ice' });
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
BLOCKS[B.PACKED_ICE]  = blk('Packed Ice', { tiles:'packed_ice', transparent:true, hardness:0.6, drop:'packed_ice', give:'packed_ice' });
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
item('wool',{ name:'Soft Wool', icon:'wool' });
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
  { out:['pumpkin_pie',1], need:[['pumpkin',1],['wheat',1],['egg',1]], station:'bench' },
  { out:['cookie',4], need:[['wheat',2]], station:'bench' },
  { out:['melon_block',1], need:[['melon_slice',9]], station:'bench' },
  { out:['glowstone',1], need:[['glowstone_dust',4]], station:'bench' },
  { out:['nether_brick',1], need:[['netherrack',1]], station:'bench' },
  { out:['jack_o_lantern',1], need:[['pumpkin',1],['torch',1]], station:'bench' },
  // continue adding more Minecraft elements
  { out:['sugar',1], need:[['sugarcane',1]], station:'bench' },
  { out:['paper',3], need:[['sugar',1],['sugarcane',3]], station:'bench' },
  { out:['book',1], need:[['paper',3],['leather',1]], station:'bench' },
  { out:['quartz',1], need:[['netherrack',4]], station:'bench' },
  { out:['netherbrick',1], need:[['nether_brick',1]], station:'bench' },
  { out:['beetroot_seeds',1], need:[['beetroot',1]], station:'bench' },
  { out:['sugarcane',1], need:[['sugarcane',1]], station:'bench' },
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
  { out:['spacesuit_helmet',1],     need:[['alien_alloy',2],['circuit',1],['glass',2]], station:'science' },
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
    this.flowQueue=[];                 // {x,y,z,level} water cells still spreading
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
      const guarded=h>=SEA_LEVEL+18 || slope>4;
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
        this._set(c,lx,y,lz,id);
      }
      // water fill + ice cap
      for(let y=h+1;y<=SEA_LEVEL;y++) this._set(c,lx,y,lz, (biome===BIOMES.snow && y===SEA_LEVEL)?B.ICE:B.WATER);
      // underwater life: leafy kelp strands, seagrass tufts, scattered small rock props
      // (all PROP-shaped — crosses & a rock model — so nothing reads as a chunky cube
      //  patch from above; kelp is capped below the surface so it never breaches)
      if(h<=SEA_LEVEL-2 && h>3){
        const r=hashRand(wx,wz,this.seed^0x5EA9);
        if(r<0.11){ const kh=Math.min(SEA_LEVEL-h-1, 2+((hashRand(wx,wz,this.seed^0x5EAA)*4)|0));   // kelp column
          for(let i=1;i<=kh;i++) this._set(c,lx,h+i,lz,B.SUGARCANE); }
        else if(r<0.27) this._set(c,lx,h+1,lz,B.TALLGRASS);                                          // seagrass tuft
        else if(r<0.31) this._set(c,lx,h+1,lz,B.SEAROCK);                                            // small rock prop (not a full cube)
      }
      // surface plants
      if(h>=SEA_LEVEL && h<WORLD_H-1){
        const top=this._get(c,lx,h,lz);
        if(top===B.GRASS){
          const r=hashRand(wx,wz,this.seed^77);
          if(r<biome.plant){ const r2=hashRand(wx,wz,this.seed^88);
            this._set(c,lx,h+1,lz, r2<0.6?B.TALLGRASS : r2<0.78?B.FLOWER_R : r2<0.9?B.FLOWER_B : B.MUSHROOM); }
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
      if(hashRand(wx,wz,this.seed^123) >= biome.tree*patch) continue;
      const th=4+((hashRand(wx,wz,this.seed^124)*3)|0);
      for(let i=1;i<=th;i++) stamp(wx,h+i,wz,B.LOG,true);
      for(let dy=th-2; dy<=th+1; dy++) for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++){
        if(dx*dx+dz*dz+(dy-th)*(dy-th) > 5) continue;
        if(dx===0&&dz===0&&dy<=th) continue;
        stamp(wx+dx,h+dy,wz+dz,B.LEAVES,false);
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
    }
    // cave decoration: stalactites / stalagmites / rubble in carved pockets
    this._genCaveDecor(c,cx,cz);
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
  _ruinAt(rcx,rcz){
    if(((rcx%5)+5)%5!==0 || ((rcz%5)+5)%5!==0) return null;            // sparse 5-chunk grid
    if(hashRand(rcx,rcz,this.seed^0x51111)>0.22) return null;           // rare roll
    return { x:rcx*CHUNK_X+8, z:rcz*CHUNK_Z+8, vseed:(hashRand(rcx,rcz,this.seed^0x52222)*1e9)|0 };
  }
  _stampRuin(s, ox, oz, c){
    const stamp=(wx,y,wz,id,force)=>{ const lx=wx-ox, lz=wz-oz; if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z||y<0||y>=WORLD_H) return;
      if(!force){ const cur=this._get(c,lx,y,lz); if(cur!==B.AIR && cur!==B.LEAVES && cur!==B.WATER && cur!==B.SNOW && cur!==B.TALLGRASS) return; } this._set(c,lx,y,lz,id); };
    const cx=s.x, cz=s.z, R=3;
    const baseH=this.heightAt(cx,cz); if(baseH<SEA_LEVEL || baseH>WORLD_H-8) return;   // skip ocean / too high
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
    const loot=[['iron_raw',4],['gold_raw',2],['emerald',1],['crystal',2],['coal',6],['book',1],['iron_ingot',3],['diamond',1],['arrow',8],['gold_ingot',2]];
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
class Player {
  constructor(world){
    this.world=world;
    this.pos=new THREE.Vector3(0,0,0);
    this.vel=new THREE.Vector3();
    this.yaw=0; this.pitch=0;
    this.onGround=false; this.inWater=false; this.onLadder=false;
    this.flying=true;          // creative-only toggle (spectator always flies)
    this.HW=0.3; this.H=1.8; this.eye=1.62;
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
      if(!this.world.isSolid(xx,yy,zz)) continue;
      const bd=BLOCKS[this.world.getBlock(xx,yy,zz)];
      // half-height colliders (stairs/slabs): you can stand ON TOP of them, so a
      // 0.6 auto-step clears them smoothly with no jump — Minecraft-style stepping
      if(bd && bd.colH && y >= yy+bd.colH) continue;
      return true;
    }
    return false;
  }
  update(dt, ctl, mode){
    mode=mode||'survival';
    this._decayEffects(dt);
    let sprintNoise=false;
    // _tryGrowCrops is a Game method; crop timer now handled in Game.update()
    const flying=mode==='spectator' || (mode==='creative' && this.flying), noclip=mode==='spectator';
    // environment sampling at eye / feet
    const eb=this.world.getBlock(Math.floor(this.pos.x),Math.floor(this.pos.y+this.eye),Math.floor(this.pos.z));
    const fb=this.world.getBlock(Math.floor(this.pos.x),Math.floor(this.pos.y+0.2),Math.floor(this.pos.z));
    this.inWater = !noclip && (eb===B.WATER||fb===B.WATER);
    this.onLadder = !flying && this.world.getBlock(Math.floor(this.pos.x),Math.floor(this.pos.y+0.9),Math.floor(this.pos.z))===B.LADDER;

    // wish direction
    const sin=Math.sin(this.yaw), cos=Math.cos(this.yaw);
    let wx=0,wz=0;
    if(ctl.f) { wx-=sin; wz-=cos; }
    if(ctl.b) { wx+=sin; wz+=cos; }
    if(ctl.l) { wx-=cos; wz+=sin; }
    if(ctl.r) { wx+=cos; wz-=sin; }
    const len=Math.hypot(wx,wz); if(len>0){ wx/=len; wz/=len; }
    const moving=ctl.f||ctl.b||ctl.l||ctl.r;
    const sprinting = ctl.sprint && this.hunger>1 && this.stamina>0 && !ctl.crouch;
    let speed = flying ? (ctl.sprint?16:8) : (sprinting ? 7.0 : ctl.crouch?2.0:4.3);
    if(this.inWater) speed*=0.6;
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
      this.vel.y += (-2 - this.vel.y)*Math.min(1,4*dt);   // sink slowly
      if(ctl.jump) this.vel.y = 3.2;                       // swim up
    } else if(this.onLadder){
      this.vel.y = ctl.jump?3: ctl.crouch?-3: (ctl.f||ctl.b?1.6:-0.6);
    } else {
      this.vel.y -= 26*this.gravScale*dt;
      if(ctl.jump && this.onGround){ this.vel.y=8.2; this.onGround=false; }
    }
    this.vel.y=clamp(this.vel.y,-40,40);

    if(noclip){
      this.pos.x+=this.vel.x*dt; this.pos.y+=this.vel.y*dt; this.pos.z+=this.vel.z*dt;
      return { fellHard:0 };
    }

    // integrate with substeps to avoid tunnelling
    const steps=Math.max(1, Math.ceil(Math.max(Math.abs(this.vel.x),Math.abs(this.vel.y),Math.abs(this.vel.z))*dt/0.4));
    const sdt=dt/steps; let fellHard=0;
    for(let s=0;s<steps;s++){
      // X
      let nx=this.pos.x+this.vel.x*sdt;
      if(!this.collides(nx,this.pos.y,this.pos.z)) this.pos.x=nx;
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
      if(!this.collides(this.pos.x,this.pos.y,nz)) this.pos.z=nz;
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
    return { fellHard, sprintNoise };
  }
  _tryStep(axis, target){
    // auto step-up over 1 block when grounded
    if(!this.onGround) return false;
    const up=this.pos.y+0.6;
    if(this.collides(this.pos.x,up,this.pos.z)) return false;
    if(axis==='x' && !this.collides(target,up,this.pos.z)){ this.pos.x=target; this.pos.y=up; return true; }
    if(axis==='z' && !this.collides(this.pos.x,up,target)){ this.pos.z=target; this.pos.y=up; return true; }
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
  brute:{hp:40,speed:1.5,hostile:true,dmg:8,drop:[['iron_raw',2],['crystal',1]],sense:14},
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
};
const FARM_MATURE=new Map([[B.WHEAT3,['wheat',B.WHEAT0]],[B.CARROT3,['carrot',B.CARROT0]],[B.POTATO3,['potato',B.POTATO0]]]);
const FARM_STAGE0=[B.WHEAT0,B.CARROT0,B.POTATO0], FARM_CARRY_MAX=16;
class Mob {
  constructor(kind, x,y,z){
    const d=MOB_DEF[kind];
    this.kind=kind; this.def=d; this.hp=d.hp; this.maxhp=d.hp;
    this.pos=new THREE.Vector3(x,y,z); this.vel=new THREE.Vector3();
    this.state='idle'; this.yaw=Math.random()*6.28; this.timer=0; this.atkCd=0; this.onGround=false;
    this.group=mobModel(kind); this.height=this.group.userData.h||1.0;
    this.anim=0; this.home=null; this.carry={item:null,count:0}; this.fleeT=0; this.lastSeen=null; this.alarmCd=0; this.persistent=!!d.settler||!!d.pet||!!d.guardian;
  }
}

/* =====================================================================
   Game — owns scene, world, player, mobs, drops, particles, and all
   high-level actions (break/place/interact/attack/craft/...).
   ===================================================================== */
// Save format versioning. serialize() stamps the current version; load() runs migrate() to
// upgrade older saves in-place. To change the schema: bump SAVE_VER and add a migration
// `SAVE_MIGRATIONS[OLD] = (save)=>{...}` that transforms an OLD-schema save into the next.
// Unversioned saves (written before R2) are treated as v1, the current schema.
const SAVE_VER = 1;
const SAVE_MIGRATIONS = {
  // (no migrations yet — v1 is the baseline. Add `1: s=>{...}` then set SAVE_VER=2 when the
  // first real schema change lands, e.g. death-grave or persistent mob-state fields.)
};
class Game {
  constructor(container){
    this.container=container;
    this.renderer=new THREE.WebGLRenderer({antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    container.appendChild(this.renderer.domElement);
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.05, 1000);
    this.input=new Input();
    this.renderDist=4; this.sens=1.0; this.gfx='med';
    this.chunkMeshes=new Map();        // ckey -> {opaque,cutout,blend, objects:[]}
    this.loadQueue=[]; this.dirty=new Set();
    this.mobs=[]; this.drops=[]; this.particles=[]; this.leafDecayQueue=[];
    this.time=0.30;                    // 0..1 day fraction (0.30 = morning)
    this.dayLen=600;                   // seconds per full day
    this.day=1; this.paused=false; this.dead=false;
    this.selBlock=null;                // {x,y,z,nx,ny,nz}
    this.breakProg=0; this.breakTarget=null;
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
        .replace('#include <map_fragment>', '#include <map_fragment>\nif(vWater>0.5){\n  float waveA=sin(dot(vWaterPos.xz,vec2(1.7,2.3))+uTime*1.25);\n  float waveB=sin(dot(vWaterPos.xz,vec2(-2.9,1.2))-uTime*0.9);\n  float waveC=sin(dot(vWaterPos.xz,vec2(0.6,-0.7))+uTime*2.1)*0.5;\n  float shimmer=(waveA+waveB+waveC)*0.4;\n  diffuseColor.rgb*=0.88+shimmer*0.16;\n  diffuseColor.rgb+=vec3(0.05,0.11,0.16)*(shimmer*0.5+0.5);\n  float glint=pow(max(0.0,shimmer),6.0);\n  diffuseColor.rgb+=vec3(0.20,0.26,0.30)*glint;\n}');
      this.matBlend.userData.shader=shader;
    };
    this.matBlend.customProgramCacheKey = ()=> 'blendWaterShimmer2';

    this.hemi=new THREE.HemisphereLight(0xbfd8ff, 0x4a4636, 0.8); this.scene.add(this.hemi);
    this.sun=new THREE.DirectionalLight(0xfff2cc, 1.0); this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.ambient=new THREE.AmbientLight(0x33384a, 0.5); this.scene.add(this.ambient);

    // fog only hazes the LAST stretch before the render edge — starting it at
    // ~24 blocks washed half the visible world to pale blue and made solid
    // terrain look ghostly/see-through. Near/far are kept in sync with render
    // distance every frame in updateSky().
    this.scene.fog=new THREE.Fog(0x9fc0e8, this.renderDist*CHUNK_X*0.62, this.renderDist*CHUNK_X*0.98);
    this.scene.background=new THREE.Color(0x9fc0e8);
    this._skyDay=new THREE.Color(0x9fc8f0);
    this._skyNight=new THREE.Color(0x0a1428);
    this._skyDusk=new THREE.Color(0xe8915a);
    this._skyColor=new THREE.Color();
    this._underwaterColor=new THREE.Color(0x164e62);

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
    this.selBox=new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color:0x000000 })); this.selBox.visible=false; this.scene.add(this.selBox);
    // fishing line (string cast to water target)
    const flg=new THREE.BufferGeometry();
    flg.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0], 3));
    this.fishLine=new THREE.Line(flg, new THREE.LineBasicMaterial({ color:0xc8b88a }));
    this.fishLine.visible=false; this.scene.add(this.fishLine);
    // break progress overlay
    this.crackBox=new THREE.Mesh(new THREE.BoxGeometry(1.01,1.01,1.01), new THREE.MeshBasicMaterial({ map:crackTexture(0), color:0xffffff, transparent:true, opacity:0, depthWrite:false })); this.crackBox.visible=false; this.scene.add(this.crackBox);

    // held item viewmodel (sprite attached to camera)
    // held item viewmodel: a real 3D hand/forearm holding the item icon, not
    // a disembodied HUD sprite — gives it depth/parallax as you move
    this.heldGroup=new THREE.Group(); this.heldGroup.position.set(0.42,-0.42,-0.9); this.heldGroup.renderOrder=999; this.camera.add(this.heldGroup); this.scene.add(this.camera);
    // transparent:true (opacity 1) just moves this into the transparent render
    // pass, which always runs AFTER the opaque pass — without it, water's
    // own transparent pass draws over the hand later regardless of
    // renderOrder/depthTest (those only reorder within one pass).
    const handMat=new THREE.MeshLambertMaterial({ color:0xd8b48a, depthTest:false, transparent:true, opacity:1 });
    const sleeveMat=new THREE.MeshLambertMaterial({ color:0xd8b48a, depthTest:false, transparent:true, opacity:1 });
    this.heldHand=new THREE.Group(); this.heldHand.renderOrder=999; this.heldGroup.add(this.heldHand);
    const sleeve=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.14,0.62), sleeveMat); sleeve.position.set(0.02,-0.06,0.06); sleeve.rotation.z=-0.22; sleeve.renderOrder=997; this.heldHand.add(sleeve);
    this.heldSprite=new THREE.Sprite(new THREE.SpriteMaterial({ depthTest:false, transparent:true })); this.heldSprite.scale.set(0.34,0.34,1); this.heldSprite.position.set(0,0.1,-0.05); this.heldSprite.renderOrder=1001; this.heldGroup.add(this.heldSprite);
    this.heldModel=new THREE.Group(); this.heldModel.renderOrder=999; this.heldGroup.add(this.heldModel);
    this.heldModelItem=null;
    this.heldIconCache={};

    // third-person player body (hidden while in first-person view)
    this.playerBody=mobModel('player'); this.playerBody.visible=false; this.scene.add(this.playerBody);

    // space-age module hook: builds the distant planet / sky bodies, sets up
    // dimension + oxygen state. Defined in js/space.js (optional — guarded).
    if(this._initSpace) this._initSpace();
    if(this._initRocket) this._initRocket();   // js/rocket.js — launch + flight sim

    addEventListener('resize',()=>this._resize()); this._resize();
    this._initBloom();
  }
  _resize(){ this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth,innerHeight); if(this._composer){ try{ this._composer.setSize(innerWidth,innerHeight); }catch(e){} } }

  // ---------- world lifecycle ----------
  newWorld(seed, mode, noStartItems){
    this.mode=mode||'survival';
    this.world=new World(seed>>>0);
    this.player=new Player(this.world);
    this._initInventory(noStartItems);
    this._spawnPlayerSafely(0,0);
    this.time=0.30; this.day=1; this.dead=false;
    // reset space-age dimension state so a fresh world always starts on the
    // overworld with full oxygen (js/space.js — guarded).
    if(this._resetSpace) this._resetSpace(seed>>>0);
    if(this._resetRocket) this._resetRocket();   // js/rocket.js — clear any rocket/cockpit/flight flow
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
    for(let r=0;r<140;r++){
      const ang=r*2.39, x=Math.round(wx+Math.cos(ang)*r*0.85), z=Math.round(wz+Math.sin(ang)*r*0.85);
      const y=this.world.surfaceY(x,z);
      if(y<SEA_LEVEL) continue;
      const above=this.world.getBlock(x,y+1,z);
      if(above===B.WATER || this.world.isSolid(x,y+1,z) || this.world.isSolid(x,y+2,z)) continue;
      this.player.setPos(x+0.5, y+1.02, z+0.5);
      if(!this.player.spawn) this.player.spawn={x:x+0.5,y:y+1.02,z:z+0.5};
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
    this.dead=false; this.player.health=this.player.maxHealth; this.player.hunger=this.player.maxHunger;
    this.player.warmth=this.player.maxWarmth; this.player.saturation=5; this._queasyT=0; this._frostLevel=0; this._airT=0; this.fishing=null;

    const s=this.player.spawn;
    if(s){ // clear any overlap by lifting to a safe spot near spawn
      const x=Math.floor(s.x), z=Math.floor(s.z); const y=this.world.surfaceY(x,z);
      this.player.setPos(s.x, Math.max(s.y, y+1.02), s.z);
      if(this.player.collides(this.player.pos.x,this.player.pos.y,this.player.pos.z)) this.player.setPos(x+0.5,y+1.5,z+0.5);
    } else this._spawnPlayerSafely(0,0);
  }

  // ---------- inventory helpers ----------
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
  selItem(){ const s=this.player.inv[this.player.sel]; return s?ITEMS[s.item]:null; }

  // ---------- targeting ----------
  _updateTarget(){
    const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(this.player.pitch,this.player.yaw,0,'YXZ'));
    const origin=new THREE.Vector3(this.player.pos.x,this.player.pos.y+this.player.eye,this.player.pos.z);
    const w=this.world;
    // doors render a full ~2-tall leaf inside ONE voxel cell, so the upper
    // half (eye-level, the most natural place to aim) is open air over the
    // actual solid cell — let the ray also catch that air and redirect down
    const hit=raycastVoxel(origin,dir,6,(x,y,z)=>{ const id=w.getBlock(x,y,z); if(id && id!==B.WATER) return true; return id===B.AIR && isDoorId(w.getBlock(x,y-1,z)); });
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
    if(this.breakTarget!==key){ this.breakTarget=key; this.breakProg=0; }
    // instant-break: trivial blocks (plants/torches) or crystal (tier 5) instantly like Minecraft diamond;
    // iron etc fast on wood but takes a little time. gated by canHarvest()
    if(this.canHarvest(id,it) && (b.hardness<=0.1 || (it && (it.tier||0)>=5) || (b.tool && it && it.tool===b.tool && (it.tier||0)>=(b.tier||0)+5))){
      this._mine(x,y,z,id,it);
      this.breakProg=0; this.breakTarget=null; this.crackBox.visible=false; return;
    }
    const t=this.breakSpeed(id,it)*dt;
    this.breakProg+=t;
    const needed=1.0;
    this.crackBox.visible=true; this.crackBox.position.set(x+0.5,y+0.5,z+0.5);
    const stage=Math.min(7, Math.floor(this.breakProg/needed*8));
    if(this.crackBox.material.map!==crackTexture(stage)){ this.crackBox.material.map=crackTexture(stage); this.crackBox.material.needsUpdate=true; }
    this.crackBox.material.opacity=Math.min(0.95, 0.25+this.breakProg/needed*0.7);
    if(this.breakProg>=needed){
      this._mine(x,y,z,id,it);
      this.breakProg=0; this.breakTarget=null; this.crackBox.visible=false;
    }
  }
  cancelBreak(){ this.breakProg=0; this.breakTarget=null; this._creativeMined=false; if(this.crackBox) this.crackBox.visible=false; }
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
      if(!supported) this.leafDecayQueue.push({x,y,z,t:8+Math.random()*14});
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
        this.leafDecayQueue.splice(i,1);
      }
    }
  }
  _mine(x,y,z,id,it){
    const b=BLOCKS[id];
    // bed: break both halves
    if(id===B.BED || id===B.BED_FOOT){ this._removeBed(x,y,z); Audio.play('break'); this._dropOrGive('bed',1,x,y,z); this.particles && this._spawnParticles(x,y,z,'#c2473f'); return; }
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
    // tool durability (creative tools never wear)
    if(it&&it.tool&&it.tool===b.tool && this.mode!=='creative') this._damageTool();
    this.setBlock(x,y,z,B.AIR);
    if(id===B.LOG) this._scheduleLeafDecay(x,y,z);
    Audio.play('break');
    this._noise(x+0.5, z+0.5, 12);   // mining is the loudest thing you do — carries through walls
    this._spawnParticles(x,y,z, this._blockColor(id));
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
    const R=6;
    for(let dz=-R;dz<=R;dz++) for(let dx=-R;dx<=R;dx++){
      const x=px+dx, z=pz+dz;
      for(let y=py+5; y>=py-3; y--){
        if(W.getBlock(x,y,z)!==B.WATER) continue;
        const below=W.getBlock(x,y-1,z);
        if(below===B.AIR){ this.setBlock(x,y,z,B.AIR); this.setBlock(x,y-1,z,B.WATER); }
        else if(below===B.WATER && [[1,0],[-1,0],[0,1],[0,-1]].every(([ox,oz])=>W.getBlock(x+ox,y,z+oz)===B.AIR)){
          this.setBlock(x,y,z,B.AIR);   // isolated raised lump — drop it into the body below
        }
      }
    }
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
    const W=this.world; let n=0;
    while(W.flowQueue.length && n<4){
      const {x,y,z,level}=W.flowQueue.shift(); n++;
      if(level<1 || W.getBlock(x,y,z)!==B.AIR) continue;
      this.setBlock(x,y,z,B.WATER);
      const belowKey=W.bkey(x,y-1,z);
      if(y>0 && W.getBlock(x,y-1,z)===B.AIR && !W.flowSeen.has(belowKey)){ W.flowSeen.add(belowKey); W.flowQueue.push({x,y:y-1,z,level:7}); }
      else if(level>1){
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,nz=z+dz,nk=W.bkey(nx,y,nz);
          if(W.getBlock(nx,y,nz)===B.AIR && !W.flowSeen.has(nk)){ W.flowSeen.add(nk); W.flowQueue.push({x:nx,y,z:nz,level:level-1}); }
        }
      }
    }
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
  findLookMob(settlerOnly){
    const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(this.player.pitch,this.player.yaw,0,'YXZ'));
    const origin=new THREE.Vector3(this.player.pos.x,this.player.pos.y+this.player.eye,this.player.pos.z);
    let best=null,bd=4;
    for(const m of this.mobs){ if(settlerOnly && !m.def.settler) continue;
      const c=new THREE.Vector3(m.pos.x,m.pos.y+m.height*0.5,m.pos.z).sub(origin);
      const proj=c.dot(dir); if(proj<0||proj>bd) continue;
      const perp=c.clone().addScaledVector(dir,-proj).length();
      if(perp<1.0 && proj<bd){ bd=proj; best=m; }
    }
    return best;
  }
  getTrades(){ return TRADES.map(t=>({ t, can:this.countItem(t.give[0])>=t.give[1] })); }
  doTrade(i){ const t=TRADES[i]; if(!t) return false; if(this.countItem(t.give[0])<t.give[1]) return false; this.takeItem(t.give[0],t.give[1]); this.giveItem(t.get[0],t.get[1]); Audio.play('craft'); return true; }

  // ---------- combat ----------
  // read-only peek: distance to the nearest attackable mob in the crosshair
  // cone, or Infinity if none — lets the caller decide attack vs interact
  // priority when a mob stands right next to furniture
  peekMobDist(){
    const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(this.player.pitch,this.player.yaw,0,'YXZ'));
    const origin=new THREE.Vector3(this.player.pos.x,this.player.pos.y+this.player.eye,this.player.pos.z);
    let bd=Infinity;
    for(const m of this.mobs){
      const c=new THREE.Vector3(m.pos.x,m.pos.y+m.height*0.5,m.pos.z).sub(origin);
      const proj=c.dot(dir); if(proj<0||proj>3.2) continue;
      const perp=c.clone().addScaledVector(dir,-proj).length();
      if(perp<0.9 && proj<bd) bd=proj;
    }
    return bd;
  }
  attack(){
    if(this.mode==='spectator') return false;
    const heldIt=this.selItem();
    if(heldIt && heldIt.shoots) return this._shootBow(heldIt);
    // try mob first
    const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(this.player.pitch,this.player.yaw,0,'YXZ'));
    const origin=new THREE.Vector3(this.player.pos.x,this.player.pos.y+this.player.eye,this.player.pos.z);
    let best=null,bd=3.2;
    for(const m of this.mobs){
      const c=new THREE.Vector3(m.pos.x,m.pos.y+m.height*0.5,m.pos.z).sub(origin);
      const proj=c.dot(dir); if(proj<0||proj>bd) continue;
      const perp=c.clone().addScaledVector(dir,-proj).length();
      if(perp<0.9){ if(proj<bd){ bd=proj; best=m; } }
    }
    this.heldSwing=1;
    if(best){
      const it=this.selItem(); let dmg=(it&&it.dmg?it.dmg:1);
      if(this.player.effects.strength) dmg*=1.5;
      best.hp-=dmg;
      const kb=new THREE.Vector3(best.pos.x-this.player.pos.x,0,best.pos.z-this.player.pos.z).normalize().multiplyScalar(6);
      best.vel.x+=kb.x; best.vel.z+=kb.z; best.vel.y=4; best.hurtT=0.2; if(best.def.hostile) this._pushAlarm(best.pos.x,best.pos.z);
      this._spawnParticles(best.pos.x, best.pos.y+best.height*0.5, best.pos.z, '#ffe9b0');   // hit spark
      this._noise(best.pos.x, best.pos.z, 10);   // combat is loud — draws hostiles that lack LOS
      if(it&&it.dur && this.mode!=='creative') this._damageTool();   // any durable tool wears when used in combat
      Audio.play('mobhurt');
      if(!best.def.hostile && !best.def.settler){ best.state='flee'; best.fleeT=6; }
      if(best.def.settler){ best.state='flee'; best.fleeT=4; this.villageAngerT=30; } // anger->flee, and call the guard
      if(best.hp<=0) this._killMob(best);
      return true;
    }
    return false;
  }
  _shootBow(bowIt){
    if(this.mode!=='creative' && this.countItem('arrow')<1) return false;
    if(this.mode!=='creative'){ this.takeItem('arrow',1); const s=this.player.inv[this.player.sel]; if(s){ s.dur=(s.dur==null?bowIt.dur:s.dur)-1; if(s.dur<=0) this.player.inv[this.player.sel]=null; } }
    this.heldSwing=1;
    const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(this.player.pitch,this.player.yaw,0,'YXZ'));
    const origin=new THREE.Vector3(this.player.pos.x,this.player.pos.y+this.player.eye,this.player.pos.z);
    const proj=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.5,5), new THREE.MeshLambertMaterial({color:0x8a6638}));
    proj.position.copy(origin); proj.lookAt(origin.clone().add(dir)); proj.rotation.x+=Math.PI/2;
    this.scene.add(proj);
    let dmg=bowIt.dmg; if(this.player.effects.strength) dmg*=1.5;
    this.drops.push({ projectile:true, fromPlayer:true, dmg, pos:proj.position, vel:dir.clone().multiplyScalar(24), spr:proj, life:0 });
    Audio.play('place');
    this._noise(origin.x, origin.z, 10);   // bowshot snaps loud — alerts nearby hostiles
    return true;
  }
  _killMob(m){
    if(m.def.drop) for(const [it,ct] of m.def.drop){ if(Math.random()<0.85) this._spawnDrop(it,ct,m.pos.x,m.pos.y+0.4,m.pos.z); }
    this._spawnParticles(Math.floor(m.pos.x),Math.floor(m.pos.y),Math.floor(m.pos.z),'#aa3030');
    this._removeMob(m);
  }
  _removeMob(m){ this.scene.remove(m.group); const i=this.mobs.indexOf(m); if(i>=0) this.mobs.splice(i,1); }

  hurtPlayer(dmg, src){
    if(this.dead || this.mode!=='survival') return;
    const arm=this.player.armor; let def=0;
    for(const k in arm){ const s=arm[k]; if(s) def+=(ITEMS[s.item].def||0); }
    dmg=Math.max(1, dmg*(1-Math.min(0.7,def*0.05)));
    const broke=[];
    for(const k in arm){ const s=arm[k]; if(s){ const it=ITEMS[s.item]; if(it.dur){ s.dur=(s.dur==null?it.dur:s.dur)-1; if(s.dur<=0){ broke.push(it.name||'Armor piece'); arm[k]=null; } } } }
    if(broke.length){ Audio.play('break'); this.onToast&&this.onToast(broke.length===1?(broke[0]+' broke!'):(broke.length+' armor pieces broke!')); }
    this.player.health-=dmg; Audio.play('hurt');
    if(src){ const kb=new THREE.Vector3(this.player.pos.x-src.x,0,this.player.pos.z-src.z).normalize().multiplyScalar(4); this.player.vel.x+=kb.x; this.player.vel.z+=kb.z; this.player.vel.y=3; }
    this.onDamage&&this.onDamage();
    if(this.player.health<=0) this._die('You were slain');
  }
  _die(msg){ this.dead=true; this.deathMsg=msg; this.fishing=null; this.onDeath&&this.onDeath(msg); }

  _tryGrowCrops(){
    const p=this.player.pos; const r=5;
    for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)for(let dy=-1;dy<=2;dy++){
      const x=(p.x+dx)|0, y=(p.y+dy)|0, z=(p.z+dz)|0;
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
  _updateWarmth(dt, moved){
    const p=this.player;
    this._coldT=(this._coldT||0)+dt;
    if(this._coldT>1.5){ this._coldT=0;
      const px=Math.floor(p.pos.x), pz=Math.floor(p.pos.z);
      const t=this.time, isDay=t>0.25 && t<0.75;
      const snow=this.world.biomeAt(px,pz,this.world.heightAt(px,pz))===BIOMES.snow;
      // near a heat source? any light-emitting block (torch/lantern/kiln) within ~6 blocks
      let nearHeat=false;
      for(const k of this.world.lights){ const c=k.split(','); const dx=+c[0]-px, dy=+c[1]-p.pos.y, dz=+c[2]-pz; if(dx*dx+dy*dy+dz*dz<36){ nearHeat=true; break; } }
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
  _freezeHurt(dmg){
    if(this.dead) return;
    this.player.health-=dmg;          // frost vignette + draining warmth pips are the feedback (no red flash)
    if(this.player.health<=0) this._die('You froze to death');
  }

  // ---------- drops & particles ----------
  _spawnDrop(item,count,x,y,z){
    if(!ITEMS[item]) return;
    const spr=this._makeItemObject(item,false);
    spr.position.set(x,y,z); this.scene.add(spr);
    this.drops.push({ item,count, pos:new THREE.Vector3(x,y,z), vel:new THREE.Vector3((Math.random()-0.5)*2,3,(Math.random()-0.5)*2), spr, life:0, bob:Math.random()*6 });
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
  _addBox(parent,w,h,d,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); m.rotation.set(rx,ry,rz); parent.add(m); return m;
  }
  _makeItemObject(itemId, held=false){
    const it=ITEMS[itemId], kind=this._gearKind(it);
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

  _spawnParticles(x,y,z,color,count=6,ground=false){
    for(let i=0;i<count;i++){
      let p=this.particles.find(q=>!q.active);
      if(!p){ if(this.particles.length>60) break; const mesh=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.12,0.12), new THREE.MeshBasicMaterial()); this.scene.add(mesh); p={mesh,active:false}; this.particles.push(p); }
      p.active=true; p.mesh.visible=true; p.mesh.material.color.set(color);
      p.mesh.scale.setScalar(ground?0.65:1);
      p.mesh.position.set(ground?x+(Math.random()-0.5)*0.45:x+0.2+Math.random()*0.6, ground?y+0.04:y+0.2+Math.random()*0.6, ground?z+(Math.random()-0.5)*0.45:z+0.2+Math.random()*0.6);
      p.vel=ground?new THREE.Vector3((Math.random()-0.5)*0.7,Math.random()*0.4+0.15,(Math.random()-0.5)*0.7):new THREE.Vector3((Math.random()-0.5)*3,Math.random()*3+1,(Math.random()-0.5)*3);
      p.life=ground?0.3:0.6;
    }
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
    if(entry){ for(const m of [entry.opaque,entry.cutout,entry.blend]) if(m){ this.scene.remove(m); m.geometry.dispose(); } for(const o of entry.objects) this.scene.remove(o); }
    else entry={objects:[]};
    const geos=meshChunk(cx,cz,(x,y,z)=>this.world.getBlock(x,y,z),(x,z)=>this.world.heightAt(x,z),this.world);
    entry.opaque=geos.opaque?new THREE.Mesh(geos.opaque,this.matOpaque):null;
    entry.cutout=geos.cutout?new THREE.Mesh(geos.cutout,this.matCutout):null;
    entry.blend =geos.blend ?new THREE.Mesh(geos.blend ,this.matBlend ):null;
    for(const m of [entry.opaque,entry.cutout,entry.blend]) if(m) this.scene.add(m);
    // special block objects
    entry.objects=[]; this._spawnChunkObjects(cx,cz,entry);
    this.chunkMeshes.set(k,entry);
  }
  _spawnChunkObjects(cx,cz,entry){
    const ox=cx*CHUNK_X, oz=cz*CHUNK_Z; const c=this.world.getChunk(cx,cz);
    for(let y=0;y<WORLD_H;y++) for(let lz=0;lz<CHUNK_Z;lz++) for(let lx=0;lx<CHUNK_X;lx++){
      const id=c[vIndex(lx,y,lz)]; const b=BLOCKS[id];
      if(!b||b.render!=='model'||!b.model) continue;
      const wx=ox+lx, wz=oz+lz; const meta=this.world.getMeta(wx,y,wz);
      const o=SpecialModels[b.model] && SpecialModels[b.model](meta);
      if(o){ o.position.set(wx+0.5,y,wz+0.5); o.userData.bcoord=[wx,y,wz]; this.scene.add(o); entry.objects.push(o); }
    }
  }
  _refreshObject(x,y,z, oldId){
    // remove existing object at coord, then rebuild that chunk's objects lazily via dirty mark (cheap enough)
    const cx=floorDiv(x,CHUNK_X), cz=floorDiv(z,CHUNK_Z); const k=cx+','+cz;
    const entry=this.chunkMeshes.get(k); if(!entry) return;
    for(let i=entry.objects.length-1;i>=0;i--){ const o=entry.objects[i]; const c=o.userData.bcoord; if(c[0]===x&&c[1]===y&&c[2]===z){ this.scene.remove(o); entry.objects.splice(i,1); } }
    const id=this.world.getBlock(x,y,z); const b=BLOCKS[id];
    if(b&&b.render==='model'&&b.model){ const meta=this.world.getMeta(x,y,z); const o=SpecialModels[b.model](meta); if(o){ o.position.set(x+0.5,y,z+0.5); o.userData.bcoord=[x,y,z]; this.scene.add(o); entry.objects.push(o); } }
  }

  maintainChunks(){
    if(!this.player) return;
    if(this._rocketSuspendChunks) return;   // frozen during the space-flight phase (js/rocket.js)
    const pcx=floorDiv(this.player.pos.x,CHUNK_X), pcz=floorDiv(this.player.pos.z,CHUNK_Z);
    const R=this.renderDist;
    // unload far
    for(const [k,entry] of this.chunkMeshes){
      const p=k.split(',').map(Number);
      if(Math.abs(p[0]-pcx)>R+1 || Math.abs(p[1]-pcz)>R+1){
        for(const m of [entry.opaque,entry.cutout,entry.blend]) if(m){ this.scene.remove(m); m.geometry.dispose(); }
        for(const o of entry.objects) this.scene.remove(o);
        this.chunkMeshes.delete(k);
      }
    }
    // queue near, nearest first
    const want=[];
    for(let dz=-R;dz<=R;dz++) for(let dx=-R;dx<=R;dx++){ const cx=pcx+dx, cz=pcz+dz; const k=cx+','+cz; if(!this.chunkMeshes.has(k)) want.push([dx*dx+dz*dz,cx,cz]); }
    want.sort((a,b)=>a[0]-b[0]);
    this.loadQueue=want;
  }
  processLoad(budget){
    let n=0;
    while(this.loadQueue.length && n<budget){ const [,cx,cz]=this.loadQueue.shift(); if(!this.chunkMeshes.has(cx+','+cz)){ this._buildChunk(cx,cz); n++; } }
    // rebuild dirty — bounded per frame so a large dirty set can't spike a frame (the rest carry to next frames)
    let dn=0; const keep=[];
    for(const k of this.dirty){ const p=k.split(',').map(Number); if(dn<3 && this.chunkMeshes.has(k)){ this._buildChunk(p[0],p[1]); dn++; } else keep.push(k); }
    this.dirty=new Set(keep);
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
  finishSleep(){ this.time=0.27; this.day++; this.player.health=Math.min(this.player.maxHealth,this.player.health+6); }

  // ---------- mobs ----------
  spawnMobs(){
    if(!this.player) return;
    if(this.inSpace) return;   // Aethon is barren — no overworld wildlife/hostiles spawn off-world
    const night = this.time<0.24||this.time>0.78;
    const hostiles=this.mobs.filter(m=>m.def.hostile).length;
    const passives=this.mobs.filter(m=>!m.def.hostile&&!m.def.settler).length;
    const px=this.player.pos.x, pz=this.player.pos.z;
    const tryAt=(kind)=>{
      const ang=Math.random()*6.28, dist=14+Math.random()*16;
      const x=Math.floor(px+Math.cos(ang)*dist), z=Math.floor(pz+Math.sin(ang)*dist);
      const d=MOB_DEF[kind];
      if(d.aquatic){
        const y=SEA_LEVEL-1;
        if(this.world.getBlock(x,y,z)!==B.WATER || this.world.getBlock(x,y+1,z)!==B.WATER) return;
        let extent=0; for(const [ox,oz] of [[6,0],[-6,0],[0,6],[0,-6],[5,5],[-5,-5],[5,-5],[-5,5]]) if(this.world.getBlock(x+ox,y,z+oz)===B.WATER) extent++;
        const localCap=2+extent*2; // ponds stay sparse, oceans/lakes get crowded with fish
        const nearby=this.mobs.filter(mm=>mm.kind==='fish' && Math.hypot(mm.pos.x-x,mm.pos.z-z)<24).length;
        if(nearby>=localCap) return;
        const m=new Mob(kind,x+0.5,y+0.5,z+0.5); this.scene.add(m.group); this.mobs.push(m);
        return;
      }
      const y=this.world.surfaceY(x,z);
      if(this.world.getBlock(x,y+1,z)===B.WATER) return;   // submerged lakebed
      if(this.world.isSolid(x,y+1,z)) return;
      if(d.biome && this.world.biomeAt(x,z,y)!==BIOMES[d.biome]) return;
      // ecology: warm-blooded animals don't live in the cold — keep them out of
      // snow biomes (the cold-adapted frostling has that range to itself)
      if(d.warm && this.world.biomeAt(x,z,y)===BIOMES.snow) return;
      const m=new Mob(kind,x+0.5,y+1,z+0.5); this.scene.add(m.group); this.mobs.push(m);
    };
    if(!night && passives<7 && Math.random()<0.4){ const k=['grazer','clucker','snuffler','hopper'][(Math.random()*4)|0]; tryAt(k); }
    if(!night && passives<7 && Math.random()<0.22) tryAt('frostling');
    if(!night && passives<7 && Math.random()<0.22) tryAt('sandskink');
    if(night && this.day>1 && hostiles<9 && Math.random()<0.55){ const r=Math.random(); const k=r<0.30?'shade':r<0.42?'spitter':r<0.52?'burrower':r<0.62?'brute':r<0.72?'gelcube':r<0.82?'crawler':r<0.92?'wisp':'bomber'; tryAt(k); }
    // underground burrowers regardless of time when player is deep
    if(this.player.pos.y<SEA_LEVEL-6 && hostiles<14 && Math.random()<0.4) tryAt('burrower');
    const fishCount=this.mobs.filter(m=>m.kind==='fish').length;
    if(fishCount<20 && Math.random()<0.45) tryAt('fish');
  }
  // a daytime destination for a villager, derived from the village centre it remembers
  // (farmers favour the farm plot; everyone else mills around the well + nearby spots)
  _villagerGoal(m){
    const h=m.home; if(!h) return null;
    const farm={x:h.x-3, z:h.z+12}, well={x:h.x+2, z:h.z};   // stand BESIDE the well (its centre is water)
    const wander={x:h.x+((Math.random()*18-9)|0), z:h.z+((Math.random()*18-9)|0)};
    const pois = m.role==='farmer' ? [farm, farm, well, wander] : [well, wander, wander, farm];
    return pois[(Math.random()*pois.length)|0];
  }
  _farmerTarget(m){
    const h=m.home; if(!h) return null;
    let harvest=null, plant=null, hd=Infinity, pd=Infinity;
    for(let dx=0;dx<7;dx++) for(let dz=0;dz<7;dz++){
      const x=h.x-3+dx, z=h.z+9+dz, y=this.world.surfaceY(x,z)+1, id=this.world.getBlock(x,y,z);
      const crop=FARM_MATURE.get(id), d=(x+0.5-m.pos.x)**2+(z+0.5-m.pos.z)**2;
      if(crop && (!m.carry.count||m.carry.item===crop[0]) && d<hd){ harvest={x:x+0.5,y,z:z+0.5,kind:'harvest',id,item:crop[0],reset:crop[1]}; hd=d; }
      else if(id===B.AIR && this.world.getBlock(x,y-1,z)===B.DIRT && d<pd){ plant={x:x+0.5,y,z:z+0.5,kind:'plant',reset:FARM_STAGE0[mod(x+z,FARM_STAGE0.length)]}; pd=d; }
    }
    return harvest||plant;
  }
  _nearestVillageChest(m){
    if(!m.home||!m.carry.count) return null;
    let best=null, bd=Infinity; const max=(ITEMS[m.carry.item]&&ITEMS[m.carry.item].max)||99;
    for(const [key,slots] of this.world.chests){
      const p=key.split(',').map(Number), x=p[0],y=p[1],z=p[2];
      if(this.world.getBlock(x,y,z)!==B.CHEST || Math.hypot(x-m.home.x,z-m.home.z)>32) continue;
      if(!slots.some(s=>!s||(s.item===m.carry.item&&s.count<max))) continue;
      const d=(x+0.5-m.pos.x)**2+(z+0.5-m.pos.z)**2;
      if(d<bd){ bd=d; best={x:x+0.5,y,z:z+0.5,key}; }
    }
    return best;
  }
  _depositFarmerCarry(m,chest){
    const slots=this.world.chests.get(chest.key), carry=m.carry; if(!slots||!carry.count) return;
    const max=(ITEMS[carry.item]&&ITEMS[carry.item].max)||99;
    for(const s of slots){ if(s&&s.item===carry.item&&s.count<max){ const n=Math.min(max-s.count,carry.count); s.count+=n; carry.count-=n; if(!carry.count) break; } }
    for(let i=0;i<slots.length&&carry.count;i++) if(!slots[i]){ const n=Math.min(max,carry.count); slots[i]={item:carry.item,count:n}; carry.count-=n; }
    if(!carry.count) carry.item=null;
  }
  _updateFarmerTask(m,night){
    const evening=this.time>0.68, full=m.carry.count>=FARM_CARRY_MAX;
    if(m.carry.count && (full||evening||night||m._farmTask==='deposit')){
      const chest=this._nearestVillageChest(m);
      if(chest){ m._farmTask='deposit'; m.goal=chest; const d=Math.hypot(chest.x-m.pos.x,chest.z-m.pos.z);
        if(d>1.65){ m.state='goGoal'; return true; }
        this._depositFarmerCarry(m,chest); m._farmTask=null; m._farmWork=null; m.goal=null; m.timer=1; m.state='idle'; return true;
      }
      m._farmTask=null; return false;
    }
    if(night) return false;
    if(!m._farmWork||m.timer<=0) m._farmWork=this._farmerTarget(m);
    const work=m._farmWork;
    if(!work){ if(m.carry.count){ m._farmTask='deposit'; return this._updateFarmerTask(m,false); } return false; }
    m._farmTask='farm'; m.goal=work; const d=Math.hypot(work.x-m.pos.x,work.z-m.pos.z);
    if(d>1.35){ m.state='goGoal'; return true; }
    const x=Math.floor(work.x),z=Math.floor(work.z),id=this.world.getBlock(x,work.y,z);
    if(work.kind==='harvest' && id===work.id && (!m.carry.count||m.carry.item===work.item) && m.carry.count<FARM_CARRY_MAX){ m.carry.item=work.item; m.carry.count++; this.setBlock(x,work.y,z,work.reset); }
    else if(work.kind==='plant' && id===B.AIR && this.world.getBlock(x,work.y-1,z)===B.DIRT) this.setBlock(x,work.y,z,work.reset);
    m._farmWork=null; m.goal=null; m.timer=0.7; m.state='idle'; return true;
  }
  updateMobs(dt){
    const p=this.player; const day = this.time>0.25 && this.time<0.75; const night=!day;
    if(this.villageAngerT>0) this.villageAngerT=Math.max(0,this.villageAngerT-dt);
    if(!this.alarms) this.alarms=[]; else if(this.alarms.length) this.alarms=this.alarms.filter(a=>(a.t-=dt)>0);
    for(let i=this.mobs.length-1;i>=0;i--){
      const m=this.mobs[i]; const d=m.def;
      const dist=m.pos.distanceTo(p.pos);
      // despawn far non-persistent; persistent settlers unload but allow respawn
      if(!m.persistent && dist>56){ this._removeMob(m); continue; }
      if(m.persistent && dist>84){ const v=this.world.villages.find(vv=>m.home&&vv.x===m.home.x&&vv.z===m.home.z); if(v) v._spawned=false; this._removeMob(m); continue; }
      // bad mobs can't survive open daylight — any hostile exposed to the sky
      // burns to death after dawn (fresh ones respawn at night). Burrowers etc.
      // underground are spared by the surface check.
      const _inWater = this.world.getBlock(Math.floor(m.pos.x),Math.floor(m.pos.y),Math.floor(m.pos.z))===B.WATER;
      if(d.hostile && !d.aquatic && !_inWater && day && this.world.surfaceY(Math.floor(m.pos.x),Math.floor(m.pos.z))<=Math.floor(m.pos.y)+1){ m.hp-=dt*4; m.burning=true; if(m.hp<=0){ this._spawnParticles(m.pos.x,m.pos.y,m.pos.z,'#ff6a2a'); this._removeMob(m); continue; } }
      // drowning: non-aquatic creatures (animals, villagers, hostiles) suffocate
      // when their head is underwater. Fish/aquatic mobs are immune.
      if(!d.aquatic){
        const headWet=this.world.getBlock(Math.floor(m.pos.x),Math.floor(m.pos.y+Math.min(1.4,(m.height||1)*0.85)),Math.floor(m.pos.z))===B.WATER;
        m._airT = headWet ? (m._airT||0)+dt : 0;
        if(m._airT>9){ m.hp-=dt*2; if(m.hp<=0){ this._spawnParticles(m.pos.x,m.pos.y+0.5,m.pos.z,'#4a90d9'); this._removeMob(m); continue; } }
      }
      m.timer-=dt; m.atkCd-=dt; if(m.hurtT) m.hurtT-=dt; if(m.fleeT>0) m.fleeT-=dt; if(m.alarmCd>0) m.alarmCd-=dt;
      if(m.lastSeen){ m.lastSeen.t-=dt; if(m.lastSeen.t<=0) m.lastSeen=null; }
      // nocturnal stalkers recoil from light — torches/lanterns within ~6 blocks push them back,
      // so a lit base is a safe haven (mirrors the nearHeat scan in updateWarmth)
      if(d.nocturnal && m.fleeT<=0){ for(const k of this.world.lights){ const c=k.split(','); const dx=+c[0]+0.5-m.pos.x, dy=+c[1]+0.6-m.pos.y, dz=+c[2]+0.5-m.pos.z; if(dx*dx+dy*dy+dz*dz<36){ m.fleeT=2.5; break; } } }

      if(d.aquatic){ this._updateFish(m,dt); continue; }

      // bombers self-detonate on approach instead of melee-attacking
      if(d.explode && this.mode==='survival' && dist<2.2){
        this.hurtPlayer(d.dmg, m.pos); this._spawnParticles(Math.floor(m.pos.x),Math.floor(m.pos.y),Math.floor(m.pos.z),'#e8a05a');
        Audio.play('break'); this._removeMob(m); continue;
      }
      // wisps blink toward the player instead of walking when chasing —
      // makes them feel genuinely dangerous since you can't simply outrun one
      if(d.teleport && this.mode==='survival' && dist<d.sense && dist>3 && m.fleeT<=0 && Math.random()<dt*0.6){
        const ang=Math.random()*6.28, nx=p.pos.x+Math.cos(ang)*2.5, nz=p.pos.z+Math.sin(ang)*2.5;
        const ny=this.world.surfaceY(Math.floor(nx),Math.floor(nz))+1;
        m.pos.set(nx,ny,nz); m.group.position.copy(m.pos);
        this._spawnParticles(Math.floor(nx),Math.floor(ny),Math.floor(nz),'#7a3fb0');
      }

      // ---- state selection ----
      if(d.guardian){
        // peaceful until any settler gets hit anywhere (villageAngerT, set in
        // attack()) — then every guard in sense range turns on the player
        if(this.mode==='survival' && this.villageAngerT>0 && dist<d.sense) m.state='chase';
        else if(m.timer<=0){ m.state=Math.random()<0.5?'wander':'idle'; m.timer=2+Math.random()*4; m.yaw=Math.random()*6.28; }
      } else if(d.hostile){
        // fleeing light takes priority; otherwise hostiles stalk harder after dark —
        // nocturnal shade/wisp get a much wider sense radius at night. Aggro is LOS-gated
        // so a wall/closed door blocks it; wisp teleports so it ignores LOS, dist<2 always senses
        if(m.fleeT>0) m.state='flee';
        else if(this.mode==='survival' && dist<d.sense*(night?(d.nocturnal?1.3:1.15):1) && (d.teleport||dist<2||this._mobLOS(m))){ m.state='chase'; m.lastSeen={x:p.pos.x,z:p.pos.z,t:2.5}; if(m.alarmCd<=0){ this._pushAlarm(p.pos.x,p.pos.z); m.alarmCd=1.5; } }
        else if(m.lastSeen && m.lastSeen.t>0) m.state='investigate';
        else if(this._alarmInvestigate(m,dist)) m.state='investigate';
        else if(m.timer<=0){ m.state=Math.random()<0.6?'wander':'idle'; m.timer=2+Math.random()*3; }
      } else if(d.settler){
        // daily life: by day walk to a purposeful spot (farmers→farm, others→well/wander)
        // and pause there; at night walk HOME to their OWN house (m.bed) and turn in
        if(m.role==null) m.role = Math.random()<0.45?'farmer':'villager';
        if(m.fleeT>0) m.state='flee';
        else if(m.role==='farmer' && this._updateFarmerTask(m,night)){}
        else if(night){                                        // go to bed at night
          m.goal = m.bed || m.home;
          const bd=m.goal?Math.hypot(m.goal.x-m.pos.x,m.goal.z-m.pos.z):0;
          m.state = bd>1.3?'goGoal':'idle';
        } else {
          if(!m.goal || m.timer<=0 || m._wasNight){ m.goal=this._villagerGoal(m); m.timer=4+Math.random()*5; }   // fresh goal at dawn
          const gd=m.goal?Math.hypot(m.goal.x-m.pos.x,m.goal.z-m.pos.z):0;
          if(gd>1.7) m.state='goGoal'; else { m.state='idle'; m.yaw+=(Math.random()-0.5)*0.4; }   // arrived → look around
        }
        m._wasNight=night;
        if(m.timer<=0) m.timer=2+Math.random()*3;
      } else {
        if(m.fleeT>0) m.state='flee'; else if(m.timer<=0){ m.state=Math.random()<0.5?'wander':'idle'; m.timer=2+Math.random()*4; m.yaw=Math.random()*6.28; }
      }

      // ---- desired movement ----
      let mvx=0,mvz=0, sp=d.speed;
      if(m.state==='chase'){ const a=Math.atan2(p.pos.x-m.pos.x,p.pos.z-m.pos.z); m.yaw=a; mvx=Math.sin(a); mvz=Math.cos(a); if(night && !d.teleport) sp*=d.nocturnal?1.25:1.12;
        if(d.ranged && dist<10){ mvx=-mvx*0.4; mvz=-mvz*0.4; if(m.atkCd<=0){ this._mobShoot(m); m.atkCd=2.2; } }
        if(dist<1.6 && m.atkCd<=0 && !d.ranged){ this.hurtPlayer(d.dmg, m.pos); m.atkCd=1.0; this._mobAttackAnim(m); }
      } else if(m.state==='flee'){ const a=Math.atan2(m.pos.x-p.pos.x,m.pos.z-p.pos.z); m.yaw=a; mvx=Math.sin(a); mvz=Math.cos(a); sp*=1.4; }
      else if(m.state==='investigate' && m.lastSeen){ const lx=m.lastSeen.x-m.pos.x, lz=m.lastSeen.z-m.pos.z; m.yaw=Math.atan2(lx,lz); mvx=Math.sin(m.yaw); mvz=Math.cos(m.yaw); sp*=0.8; if(lx*lx+lz*lz<1.44) m.lastSeen=null; }
      else if(m.state==='wander'){ mvx=Math.sin(m.yaw); mvz=Math.cos(m.yaw); sp*=0.5; }
      else if(m.state==='home' && m.home){ const a=Math.atan2(m.home.x-m.pos.x,m.home.z-m.pos.z); const hd=Math.hypot(m.home.x-m.pos.x,m.home.z-m.pos.z); if(hd>1.2){ m.yaw=a; mvx=Math.sin(a); mvz=Math.cos(a); sp*=0.7; } }
      else if(m.state==='goGoal' && m.goal){ const a=Math.atan2(m.goal.x-m.pos.x,m.goal.z-m.pos.z); m.yaw=a; mvx=Math.sin(a); mvz=Math.cos(a); sp*=0.6; }

      // ---- physics (simple) ----
      m.vel.y-=26*dt;
      // horizontal with obstacle hop / cliff avoid (resolve target cell first)
      let nx=m.pos.x+mvx*sp*dt, nz=m.pos.z+mvz*sp*dt;
      // settlers/pets/guards may pass through doorways so a closed door never traps
      // them out of (or inside) a house — closed doors aren't an obstacle for them
      const blocked=(bx,by,bz)=>{ if(!this.world.isSolid(bx,by,bz)) return false; return !(m.persistent && isDoorId(this.world.getBlock(bx,by,bz))); };
      const footAhead=blocked(Math.floor(nx),Math.floor(m.pos.y),Math.floor(nz));
      if(footAhead){ if(m.onGround && !blocked(Math.floor(nx),Math.floor(m.pos.y)+1,Math.floor(nz))) m.vel.y=7; else { nx=m.pos.x; nz=m.pos.z; m.yaw+=1.5; } }
      else {
        // cliff avoidance for passive/settler
        if((!d.hostile) && m.state!=='flee'){ const below=this.world.isSolid(Math.floor(nx),Math.floor(m.pos.y)-2,Math.floor(nz)); if(!below){ nx=m.pos.x; nz=m.pos.z; m.yaw+=2.1; } }
      }
      // avoid water
      if(this.world.getBlock(Math.floor(nx),Math.floor(m.pos.y),Math.floor(nz))===B.WATER){ nx=m.pos.x; nz=m.pos.z; m.yaw+=2.0; }
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
      const flash=m.hurtT>0;
      m.group.traverse(o=>{ if(o.material&&o.material.emissive){ if(o.userData.baseEmi===undefined) o.userData.baseEmi=o.material.emissive.getHex(); o.material.emissive.setHex(flash?0x771515:o.userData.baseEmi); } });
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
    const flash=m.hurtT>0;
    m.group.traverse(o=>{ if(o.material&&o.material.emissive){ if(o.userData.baseEmi===undefined) o.userData.baseEmi=o.material.emissive.getHex(); o.material.emissive.setHex(flash?0x771515:o.userData.baseEmi); } });
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
  _mobAttackAnim(m){ m.atkAnim=1; }
  // line-of-sight from mob eye to player eye via the shared voxel DDA — gates hostile
  // aggro so a wall or closed door (world.isSolid treats a closed door as solid) blocks the
  // chase. Pure query; small per-call alloc is fine (per hostile per 0.12s AI tick, not/frame).
  _mobLOS(m){
    const ex=m.pos.x, ey=m.pos.y+(m.height||1)*0.8, ez=m.pos.z;
    const tx=this.player.pos.x, ty=this.player.pos.y+1.5, tz=this.player.pos.z;
    const dx=tx-ex, dy=ty-ey, dz=tz-ez;
    const dist=Math.sqrt(dx*dx+dy*dy+dz*dz);
    if(dist<0.001) return true;
    const inv=1/dist;
    const h=raycastVoxel({x:ex,y:ey,z:ez},{x:dx*inv,y:dy*inv,z:dz*inv},dist,(x,y,z)=>this.world.isSolid(x,y,z));
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
  _mobShoot(m){
    const dir=new THREE.Vector3(this.player.pos.x-m.pos.x, (this.player.pos.y+1)-(m.pos.y+1), this.player.pos.z-m.pos.z).normalize();
    const proj=new THREE.Mesh(new THREE.SphereGeometry(0.18,6,6), new THREE.MeshLambertMaterial({color:0x88cc55,emissive:0x224400}));
    proj.position.set(m.pos.x,m.pos.y+1,m.pos.z); this.scene.add(proj);
    this.drops.push({ projectile:true, dmg:m.def.dmg, pos:proj.position, vel:dir.multiplyScalar(12), spr:proj, life:0 });
  }

  spawnVillageSettlers(){
    // for each loaded village, ensure its settlers exist
    for(const v of this.world.villages){
      if(v._spawned) continue;
      const cx=floorDiv(v.x,CHUNK_X), cz=floorDiv(v.z,CHUNK_Z);
      if(!this.chunkMeshes.has(cx+','+cz)) continue;     // only when nearby/loaded
      v._spawned=true;
      const n=2+((hashRand(v.x,v.z,this.world.seed^7)*3)|0);
      // each settler is tied to one of the village's houses (fixed house spots) so at
      // night they walk to THEIR house, not the communal water well
      const houseSpots=[[-13,-7],[13,8]];   // spots 0 & 3 are always houses (1=market, 2=blacksmith); spot 4 only on a 5-building roll
      for(let i=0;i<n;i++){ const x=v.x+(i*3-3), z=v.z+2; const y=this.world.surfaceY(x,z); const m=new Mob('settler',x+0.5,y+1,z+0.5); m.home={x:v.x,z:v.z}; m.role=i===0?'farmer':'villager'; const hs=houseSpots[i%houseSpots.length]; m.bed={x:v.x+hs[0]+1, z:v.z+hs[1]+1}; this.scene.add(m.group); this.mobs.push(m); }
      const pn=1+((hashRand(v.x+5,v.z+5,this.world.seed^13)*2)|0);
      for(let i=0;i<pn;i++){ const kind=hashRand(v.x+i,v.z-i,this.world.seed^17)<0.5?'dog':'cat'; const x=v.x+(i*2-1), z=v.z-2; const y=this.world.surfaceY(x,z); const m=new Mob(kind,x+0.5,y+1,z+0.5); m.home={x:v.x,z:v.z}; this.scene.add(m.group); this.mobs.push(m); }
      // a lone guard stands watch — harmless until you hit a settler (see attack())
      { const x=v.x-2, z=v.z+5; const y=this.world.surfaceY(x,z); const m=new Mob('guard',x+0.5,y+1,z+0.5); m.home={x:v.x,z:v.z}; this.scene.add(m.group); this.mobs.push(m); }
    }
  }

  // ---------- per-frame updates ----------
  updateDrops(dt){
    for(let i=this.drops.length-1;i>=0;i--){ const d=this.drops[i];
      d.vel.y-=20*dt; d.pos.addScaledVector(d.vel,dt);
      if(d.projectile){
        d.life+=dt; d.spr.position.copy(d.pos);
        if(d.fromPlayer){
          let hit=false;
          for(const m of this.mobs){
            if(d.pos.distanceTo(new THREE.Vector3(m.pos.x,m.pos.y+m.height*0.5,m.pos.z))<0.7){
              m.hp-=d.dmg; m.hurtT=0.2; Audio.play('mobhurt'); if(m.def.hostile) this._pushAlarm(m.pos.x,m.pos.z);
              const kb=new THREE.Vector3(m.pos.x-this.player.pos.x,0,m.pos.z-this.player.pos.z).normalize().multiplyScalar(3);
              m.vel.x+=kb.x; m.vel.z+=kb.z; m.vel.y=3;
              if(!m.def.hostile && !m.def.settler){ m.state='flee'; m.fleeT=6; }
              if(m.hp<=0) this._killMob(m);
              hit=true; break;
            }
          }
          if(hit){ this.scene.remove(d.spr); this.drops.splice(i,1); continue; }
        } else if(d.pos.distanceTo(new THREE.Vector3(this.player.pos.x,this.player.pos.y+1,this.player.pos.z))<0.8){
          this.hurtPlayer(d.dmg,d.pos); this.scene.remove(d.spr); this.drops.splice(i,1); continue;
        }
        if(d.life>4 || this.world.isSolid(Math.floor(d.pos.x),Math.floor(d.pos.y),Math.floor(d.pos.z))){ this.scene.remove(d.spr); this.drops.splice(i,1); }
        continue;
      }
      // ground collision
      if(this.world.isSolid(Math.floor(d.pos.x),Math.floor(d.pos.y-0.2),Math.floor(d.pos.z))){ d.pos.y=Math.floor(d.pos.y)+0.2; d.vel.set(0,0,0); }
      d.life+=dt; d.bob+=dt*3;
      d.spr.position.set(d.pos.x, d.pos.y+0.2+Math.sin(d.bob)*0.08, d.pos.z);
      if(d.spr.isGroup){ d.spr.rotation.y+=dt*1.6; d.spr.rotation.x=0.25+Math.sin(d.bob*0.5)*0.08; }
      // pickup
      if(d.life>0.6 && d.pos.distanceTo(this.player.pos)<1.3){
        const left=this.giveItem(d.item,d.count);
        if(left<d.count){ Audio.play('pickup'); this.scene.remove(d.spr); this.drops.splice(i,1); }
      }
      if(d.life>180){ this.scene.remove(d.spr); this.drops.splice(i,1); }
    }
  }
  updateParticles(dt){
    for(const p of this.particles){ if(!p.active) continue; p.vel.y-=12*dt; p.mesh.position.addScaledVector(p.vel,dt); p.life-=dt; if(p.life<=0){ p.active=false; p.mesh.visible=false; } }
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
  updateSky(dt){
    this.time=(this.time+dt/this.dayLen)%1;
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
    this.sun.color.setHex(dusk>0.4?0xffb070:0xfff2cc);
    this.stars.material.opacity=clamp(1-day*1.6,0,1);
    this.sunSprite.visible=sy>-0.1; this.moonSprite.visible=sy<0.1;
    // fog only fades the chunk-pop edge during the day; at night it's pushed
    // past the render distance so nothing within view ever fades to black —
    // only the sky itself goes dark.
    const fogNear=day>0.5?0.8:2.5, fogFar=day>0.5?1.3:3;
    this.scene.fog.near=this.renderDist*CHUNK_X*fogNear; this.scene.fog.far=this.renderDist*CHUNK_X*fogFar;
    const eyeWet=this.player && this.world.getBlock(Math.floor(camp.x),Math.floor(camp.y+this.player.eye),Math.floor(camp.z))===B.WATER;
    if(eyeWet){
      this.scene.background=this._underwaterColor;
      this.scene.fog.color.copy(this._underwaterColor);
      this.scene.fog.near=1.8; this.scene.fog.far=22;
      this.stars.material.opacity=0; this.sunSprite.visible=false; this.moonSprite.visible=false;
    }
    // torch light pool: assign nearest lights to nearest emitting blocks
    const pe=this.player.pos; const near=[];
    for(const k of this.world.lights){ const c=k.split(',').map(Number); const dx=c[0]+0.5-pe.x, dy=c[1]+0.6-pe.y, dz=c[2]+0.5-pe.z; const d2=dx*dx+dy*dy+dz*dz; if(d2<400) near.push([d2,c]); }
    near.sort((a,b)=>a[0]-b[0]);
    for(let i=0;i<this.lightPool.length;i++){ const L=this.lightPool[i];
      if(i<near.length){ const c=near[i][1]; const id=this.world.getBlock(c[0],c[1],c[2]); const lb=BLOCKS[id]; if(lb&&lb.light>0){ L.visible=true; L.position.set(c[0]+0.5,c[1]+0.6,c[2]+0.5); L.color.setHex(id===B.LANTERN?0xffd47a:0xffb24d); L.intensity=1.05+Math.random()*0.35; L.distance=lb.light; } else L.visible=false; }
      else L.visible=false;
    }
    // ---- flame embers rising from the nearest torch/lantern flames ----
    if(!this._rocketActive){ this._emberPool=this._emberPool||[];
      for(const p of this._emberPool){ if(!p.active) continue; p.life-=dt; p.mesh.position.addScaledVector(p.vel,dt); p.vel.y+=dt*0.4; p.mesh.material.opacity=clamp(p.life/0.5,0,1)*0.85; if(p.life<=0){ p.active=false; p.mesh.visible=false; } }
      for(let i=0;i<Math.min(4,near.length);i++){ if(near[i][0]>120) break; const c=near[i][1]; const id=this.world.getBlock(c[0],c[1],c[2]); const lb=BLOCKS[id]; if(!(lb&&lb.light>0)) continue;
        if(Math.random()<dt*7){ let p=this._emberPool.find(q=>!q.active);
          if(!p && this._emberPool.length<40){ const m=new THREE.Mesh(new THREE.SphereGeometry(0.055,5,4), new THREE.MeshBasicMaterial({color:0xff8a2a,transparent:true,fog:false})); m.frustumCulled=false; this.scene.add(m); p={mesh:m,active:false}; this._emberPool.push(p); }
          if(p){ p.active=true; p.mesh.visible=true; p.life=0.4+Math.random()*0.4; p.mesh.material.color.setHex(id===B.LANTERN?0xffd06a:0xff8a2a);
            p.mesh.position.set(c[0]+0.5+(Math.random()-0.5)*0.3, c[1]+0.7, c[2]+0.5+(Math.random()-0.5)*0.3);
            p.vel=new THREE.Vector3((Math.random()-0.5)*0.3, 0.5+Math.random()*0.4, (Math.random()-0.5)*0.3); } } }
    }
    // ---- occasional shooting stars at night (cheap pool, gated off during rocket flight) ----
    if(!this._rocketActive){
      const nightf=clamp(1-day*1.6,0,1);
      Audio.ambientTick(dt, nightf);   // gentle day/night drone
      Audio.wildlifeTick(dt, nightf);  // day birdsong / night crickets + owls
      this._weatherTick(dt);           // drifting clouds + occasional rain/snow
      this._firefliesTick(dt, nightf); // glowing motes near the ground at night
      this._shootPool=this._shootPool||[];
      for(const s of this._shootPool){ if(!s.active) continue; s.life-=dt; s.mesh.position.addScaledVector(s.vel,dt); s.mesh.material.opacity=clamp(s.life,0,1)*0.9; if(s.life<=0){ s.active=false; s.mesh.visible=false; } }
      if(nightf>0.45 && Math.random()<dt*0.5){
        let s=this._shootPool.find(q=>!q.active);
        if(!s && this._shootPool.length<3){ const m=new THREE.Mesh(new THREE.SphereGeometry(0.5,6,5), new THREE.MeshBasicMaterial({color:0xeaf3ff,transparent:true,fog:false})); m.scale.set(1,1,9); m.frustumCulled=false; this.scene.add(m); s={mesh:m,active:false}; this._shootPool.push(s); }
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
    const on = this.dimension==='overworld' && night>0.4;
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

  // ---------- weather: drifting clouds + occasional rain/snow (overworld only) ----------
  _weatherTick(dt){
    const overworld = this.dimension==='overworld';
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
    for(const m of this._clouds.children){ m.position.x += dt*2.0; if(m.position.x>150) m.position.x-=300; }
    // weather state machine: dry stretches, then a shower
    this._wTmr = (this._wTmr==null) ? 30+Math.random()*40 : this._wTmr-dt;
    if(this._wTmr<=0){ this.raining=!this.raining; this._wTmr = this.raining ? (18+Math.random()*26) : (60+Math.random()*100); }
    if(this.raining){
      const snow = /snow|tundra|ice|frozen|taiga|peak/i.test(this.world.biomeName(Math.floor(cam.x),Math.floor(cam.z))||'');
      this._precip=this._precip||[];
      for(let i=0;i<2;i++){ let p=this._precip.find(q=>!q.active);
        if(!p && this._precip.length<120){ const m=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.09,0.09), new THREE.MeshBasicMaterial({transparent:true, opacity:0.8, fog:false})); m.frustumCulled=false; this.scene.add(m); p={mesh:m,active:false}; this._precip.push(p); }
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
    this.player.pitch -= md.y*0.0022*this.sens;
    this.player.pitch=clamp(this.player.pitch,-1.54,1.54);

    const res=this.player.update(dt,ctl,this.mode);
    if(survival && res.fellHard>18){ this.hurtPlayer(Math.floor((res.fellHard-16)*0.9)); }
    if(res.sprintNoise) this._noise(this.player.pos.x, this.player.pos.z, 7);
    if(!this._gT) this._gT=0; this._gT+=dt; if(this._gT>4){ this._gT=0; this._tryGrowCrops(); }

    const moved=ctl.f||ctl.b||ctl.l||ctl.r;
    if(survival){
      // drowning
      const head=this.world.getBlock(Math.floor(this.player.pos.x),Math.floor(this.player.pos.y+this.player.eye),Math.floor(this.player.pos.z));
      this._airT=(head===B.WATER)?(this._airT||0)+dt:0;
      if(this._airT>8){ this._airT=6; this.hurtPlayer(1); }
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
    } else {
      // non-survival: keep survival meters neutral so the HUD stays clean
      this.player.warmth=this.player.maxWarmth; this._frostLevel=0; this._airT=0; this._queasyT=0; this.player.frozen=false;
    }
    // Pooled, surface-colored footstep dust gives movement weight in both
    // survival and creative without adding any idle-frame work.
    if(moved && this.player.onGround && !spectator){
      this._stepT=(this._stepT||0)+dt;
      if(this._stepT>(ctl.sprint?0.28:0.4)){
        this._stepT=0; Audio.play('step');
        const fx=Math.floor(this.player.pos.x), fy=Math.floor(this.player.pos.y)-1, fz=Math.floor(this.player.pos.z);   // the block BELOW the feet (was checking the air at feet level)
        const footBlock=this.world.getBlock(fx,fy,fz);
        if(footBlock!==B.AIR && footBlock!==B.WATER) this._spawnParticles(this.player.pos.x,this.player.pos.y,this.player.pos.z,this._blockColor(footBlock),3,true);
      }
    } else if(!moved) this._stepT=0;   // only reset when stopped — a momentary airborne frame (auto-step jitter) must not keep zeroing the timer
    // Water entry and surface strokes get short pooled splashes. Suppress the
    // repeating effect while the player's head is underwater.
    if(this.player.inWater && !spectator){
      const wx=Math.floor(this.player.pos.x), wy=Math.floor(this.player.pos.y+0.2), wz=Math.floor(this.player.pos.z);
      const surfaceY=wy+0.82;
      if(!this._wasInWater){ this._spawnParticles(this.player.pos.x,surfaceY,this.player.pos.z,'#bfeaff',10); Audio.play('splash'); }
      const submerged=this.world.getBlock(wx,Math.floor(this.player.pos.y+this.player.eye),wz)===B.WATER;
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
    const eyeY=this.player.pos.y+(ctl.crouch?1.4:this.player.eye);
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
      const back=new THREE.Vector3(0,0,1).applyEuler(new THREE.Euler(this.player.pitch,this.player.yaw,0,'YXZ'));
      let dist=4.2;
      const hit=raycastVoxel(new THREE.Vector3(this.player.pos.x,eyeY,this.player.pos.z), back, dist, (x,y,z)=>this.world.isSolid(x,y,z));
      if(hit.hit) dist=Math.max(0.6, Math.hypot(hit.x+0.5-this.player.pos.x,hit.z+0.5-this.player.pos.z)-0.4);
      this.camera.position.set(this.player.pos.x+back.x*dist, eyeY+back.y*dist, this.player.pos.z+back.z*dist);
      this.camera.rotation.set(this.player.pitch,this.player.yaw,0,'YXZ');
      this.playerBody.visible=true;
      this._updatePlayerBody(moved, ctl, faceCam);
    }

    if(!spectator) this._updateTarget(); else { this.selBlock=null; this.selBox.visible=false; this.crackBox.visible=false; }
    // held item bob/swing
    if(this.heldSwing>0) this.heldSwing-=dt*5;
    const bob=Math.sin((this._bobT=(this._bobT||0)+(moved&&this.player.onGround?dt*10:0)))*0.03;
    this.heldGroup.position.set(0.42, -0.42+bob - Math.max(0,this.heldSwing)*0.15, -0.9);
    this.heldGroup.rotation.x=-Math.max(0,this.heldSwing)*0.9;
    this.heldGroup.visible=this.viewMode==='first'; this._updateHeld();

    this.updateSky(dt);
    this.updateDrops(dt);
    this.updateLeafDecay(dt);
    this.updateParticles(dt);

    // throttled systems
    this._aiT=(this._aiT||0)+dt; if(this._aiT>0.12){ this.updateMobs(this._aiT); this._aiT=0; }
    this._spawnT=(this._spawnT||0)+dt; if(this._spawnT>2){ this._spawnT=0; this.spawnMobs(); this.spawnVillageSettlers(); }
    this._furnT=(this._furnT||0)+dt; if(this._furnT>0.5){ this.updateFurnaces(this._furnT); this._furnT=0; }
    this._waterT=(this._waterT||0)+dt; if(this._waterT>0.3){ this._waterT=0; this.updateWaterFlow(); this._settleNearbyWater(); }
    this._maintT=(this._maintT||0)+dt; if(this._maintT>0.3){ this._maintT=0; this.maintainChunks(); }
    this.processLoad(1); // was 2 — building 2 fresh chunks/frame spiked frames after the world got taller

    // space-age module: distant planet rotation/visibility, oxygen drain,
    // launch FX, low-gravity bookkeeping. Defined in js/space.js (guarded).
    if(this._spaceTick) this._spaceTick(dt, ctl);
    if(this._rocketTick) this._rocketTick(dt, ctl);   // js/rocket.js — countdown/flight
  }
  _updatePlayerBody(moved, ctl, faceCam){
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
    pb.scale.y = (ctl&&ctl.crouch)?0.78:1;
    this._bodyAnim=(this._bodyAnim||0)+(moved&&this.player.onGround?0.16:0.02);
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
        const hp=new THREE.Vector3(); parts.head.getWorldPosition(hp);
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
    const sig=['head','chest','legs','feet'].map(k=>arm[k]&&arm[k].item||'').join('|');
    if(pb.userData.armorSig===sig) return;
    pb.userData.armorSig=sig;
    if(pb.userData.armorMeshes){
      for(const m of pb.userData.armorMeshes){ if(m.parent) m.parent.remove(m); }
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
    if(!s){ this.heldHand.visible=true; this.heldSprite.visible=false; this.heldModel.visible=false; this.heldModelItem=null; return; }
    this.heldHand.visible=true;
    const it=ITEMS[s.item], kind=this._gearKind(it);
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
  }
  render(){ if(this._composer){ try{ this._composer.render(); return; }catch(e){ this._composer=null; } } this.renderer.render(this.scene,this.camera); }
  // optional bloom post-pass; entirely guarded — falls back to plain render if the
  // postprocessing libs aren't present or anything throws
  _initBloom(){
    try{
      if(this.gfx==='low' || typeof THREE.EffectComposer!=='function' || typeof THREE.UnrealBloomPass!=='function' || typeof THREE.RenderPass!=='function') return;
      const comp=new THREE.EffectComposer(this.renderer);
      comp.addPass(new THREE.RenderPass(this.scene,this.camera));
      const bloom=new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight), 0.16, 0.3, 0.9);  // strength, radius, threshold — gentle, so snow/held items don't blow out
      comp.addPass(bloom);
      comp.setSize(innerWidth,innerHeight);
      this._composer=comp; this._bloom=bloom;
    }catch(e){ this._composer=null; }
  }

  // ---------- crafting ----------
  recipesFor(station){
    return RECIPES.filter(r=> !r.station || r.station===station);
  }
  canCraft(r){ for(const [it,ct] of r.need) if(this.countItem(it)<ct) return false; return true; }
  craft(r){ if(!this.canCraft(r)) return false; for(const [it,ct] of r.need) this.takeItem(it,ct); this.giveItem(r.out[0],r.out[1]); Audio.play('craft'); return true; }

  // ---------- fishing ----------
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
      const hp = f.hooked && f.hooked.pos ? f.hooked.pos : (f.target ? {x:f.target.x+0.5, z:f.target.z+0.5} : this.player.pos);
      const dist = Math.hypot(this.player.pos.x - hp.x, this.player.pos.z - (hp.z||hp.z) );
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
      {id:'raw_fish',w:58},{id:'raw_fish',w:14},
      {id:'stick',w:16},{id:'fiber',w:7},
      {id:'crystal',w:3},{id:'cooked_fish',w:2}
    ];
    if(isNight){ opts[0].w+=12; opts[5].w+=1; }
    if(biome===BIOMES.forest||biome===BIOMES.savanna){ opts[0].w+=8; }
    if(biome===BIOMES.snow){ opts[0].w-=8; opts[2].w+=5; }
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
    if(left>0){ this.onToast&&this.onToast('Inventory full'); }
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
        const left = this.giveItem(h.item, h.count || 1);
        if(left <= 0){
          if(h.spr) this.scene.remove(h.spr);
          const i = this.drops.indexOf(h);
          if(i >= 0) this.drops.splice(i,1);
        }
      }
    }
  }

  _updateFishLine(){
    if(!this.fishLine || !this.fishing) return;
    const f=this.fishing;
    const origin=new THREE.Vector3(this.player.pos.x, this.player.pos.y+this.player.eye, this.player.pos.z);
    const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(this.player.pitch,this.player.yaw,0,'YXZ'));
    const start=origin.clone().addScaledVector(dir,0.52);
    const rgt=new THREE.Vector3(1,0,0).applyEuler(new THREE.Euler(this.player.pitch,this.player.yaw,0,'YXZ'));
    start.addScaledVector(rgt,0.22); start.y-=0.08;
    let end;
    if(f.hooked && f.hooked.pos){
      const hp = f.hooked.pos;
      end = new THREE.Vector3(hp.x, hp.y + 0.5, hp.z);
    } else {
      const t=f.target;
      end=new THREE.Vector3(t.x+0.5, t.y+0.92, t.z+0.5);
    }
    // string "goes out" on cast (short lerp at beginning)
    let p=1;
    if(f.state==='waiting' && (f.t||0)<0.4) p=Math.min(1, (f.t||0)/0.32);
    const lineEnd = start.clone().lerp(end, p);
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
  dropSelected(){ const s=this.player.inv[this.player.sel]; if(!s) return; const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(this.player.pitch,this.player.yaw,0,'YXZ'));
    this._spawnDrop(s.item,1, this.player.pos.x+dir.x, this.player.pos.y+1+dir.y, this.player.pos.z+dir.z);
    const d=this.drops[this.drops.length-1]; if(d){ d.vel.set(dir.x*5,dir.y*5+2,dir.z*5); d.life=-0.5; }
    s.count--; if(s.count<=0) this.player.inv[this.player.sel]=null;
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
    return {
      v:SAVE_VER,
      seed:W.seed, time:this.time, day:this.day, mode:this.mode,
      player:{ x:pp.x,y:pp.y,z:pp.z, yaw:this.player.yaw, pitch:this.player.pitch,
        hp:this.player.health, hunger:this.player.hunger, warmth:this.player.warmth, saturation:this.player.saturation, stamina:this.player.stamina, spawn:this.player.spawn, sel:this.player.sel, armor:this.player.armor },
      inv:this.player.inv, deltas, meta, chests, furnaces:furn,
      ...(this._serializeSpace ? this._serializeSpace() : {}),
      ...((this.dimension==='cockpit'||transient) ? {dimension:'overworld'} : {}),   // cockpit/flight are transient — never load into them
    };
  }
  load(save){
    if(!save) return;
    save=this.migrate(save);
    this.newWorld(save.seed);
    this.world.deltas=new Map(Object.entries(save.deltas||{}).map(([k,v])=>[k,+v]));
    this.world.meta=new Map(Object.entries(save.meta||{}));
    this.world.chests=new Map(Object.entries(save.chests||{}));
    this.world.furnaces=new Map(Object.entries(save.furnaces||{}));
    // newWorld() already generated & cached the spawn chunks without these
    // deltas — drop the data cache so chunks regenerate with edits applied.
    this.world.chunks.clear(); this.world.lights.clear(); this.world.villages=[];
    this.player.inv=save.inv||this.player.inv;
    const p=save.player;
    this.player.setPos(p.x,p.y,p.z); this.player.yaw=p.yaw; this.player.pitch=p.pitch;
    this.player.health=p.hp; this.player.hunger=p.hunger; this.player.spawn=p.spawn; this.player.sel=p.sel||0;
    this.player.warmth=p.warmth!=null?p.warmth:this.player.maxWarmth; this.player.saturation=p.saturation!=null?p.saturation:5;
    this.player.armor=p.armor||{head:null,chest:null,legs:null,feet:null};
    this.player.stamina=p.stamina!=null?p.stamina:this.player.maxStamina;
    this.time=save.time; this.day=save.day; this.mode=save.mode||'survival';
    // restore space-age state (dimension, oxygen, planet edits). Guarded.
    if(this._loadSpace) this._loadSpace(save);
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
  // upgrade an older save in-place to SAVE_VER. Unversioned saves become v1 (current schema).
  migrate(save){
    if(!save) return save;
    if(save.v==null) save.v=1;
    while(save.v<SAVE_VER){ const fn=SAVE_MIGRATIONS[save.v]; if(!fn) break; fn(save); save.v++; }
    return save;
  }
}

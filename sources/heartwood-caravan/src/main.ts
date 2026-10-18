import "./styles.css";
import { GEAR } from "./game/content";
import { loadProfile, saveProfile } from "./game/simulation";
import type { ProfileSave, RunState, SpellId } from "./game/types";
import { GameApp } from "./render/GameApp";
import { GameUI } from "./ui";

const gameRoot = document.querySelector<HTMLElement>("#game");
const uiRoot = document.querySelector<HTMLElement>("#ui");
if (!gameRoot || !uiRoot) throw new Error("Game roots are missing");
const gameContainer: HTMLElement = gameRoot;
const uiContainer: HTMLElement = uiRoot;

const ui = new GameUI(uiContainer);
let profile: ProfileSave = loadProfile(localStorage);
let selectedSpell: SpellId = "thorn";
let app: GameApp | null = null;

function persist() {
  saveProfile(localStorage, profile);
}

function showMenu() {
  app?.destroy();
  app = null;
  ui.showMenu(profile, selectedSpell, {
    start: startGame,
    selectSpell: (spell) => {
      selectedSpell = spell;
      showMenu();
    },
    selectGear: (id) => {
      profile.selectedGear = id;
      if (id === "moonstone") selectedSpell = "moonbeam";
      if (id === "wildseed") selectedSpell = "seedburst";
      persist();
      showMenu();
    },
    unlockGear: (id) => {
      const gear = GEAR.find((item) => item.id === id);
      if (!gear || profile.seeds < gear.cost) return;
      profile.seeds -= gear.cost;
      profile.unlockedGear.push(id);
      profile.selectedGear = id;
      persist();
      showMenu();
    },
  });
}

function startGame(spell: SpellId) {
  app?.destroy();
  app = new GameApp(gameContainer, ui, profile, spell, {
    onRunEnd: finishRun,
    onExit: showMenu,
  });
}

function finishRun(state: RunState) {
  profile.runs += 1;
  profile.seeds += state.seedReward;
  if (state.phase === "victory") {
    profile.wins += 1;
    profile.bestTime = profile.bestTime === null ? state.time : Math.min(profile.bestTime, state.time);
  }
  persist();
  ui.showResults(
    state,
    () => startGame(selectedSpell),
    showMenu,
  );
}

showMenu();

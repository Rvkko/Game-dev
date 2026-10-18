import { ENCOUNTERS, GEAR, SPELLS } from "./game/content";
import type { ProfileSave, RunState, SpellId } from "./game/types";

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
};

export class GameUI {
  private readonly root: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly modal: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly playerBar: HTMLElement;
  private readonly seedBar: HTMLElement;
  private readonly xpBar: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly clearing: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  readonly joystick: HTMLElement;
  readonly joystickKnob: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div class="vignette"></div>
      <section class="hud hidden" aria-label="Game status">
        <div class="hud-left">
          <div class="brand-chip"><span class="brand-sigil">✦</span> HEARTWOOD</div>
          <div class="vitals">
            <div class="bar-row"><span>YOU</span><div class="bar"><i id="player-bar"></i></div></div>
            <div class="bar-row seed"><span>SEED</span><div class="bar"><i id="seed-bar"></i></div></div>
            <div class="bar-row xp"><span>GROW</span><div class="bar"><i id="xp-bar"></i></div></div>
          </div>
        </div>
        <div id="objective" class="objective"></div>
        <div class="hud-right">
          <button id="pause" class="icon-button" aria-label="Pause">Ⅱ</button>
          <strong id="timer">0:00</strong>
          <span id="clearing">CLEARING 1 / 3</span>
        </div>
      </section>
      <div id="hint" class="hint hidden"></div>
      <div id="joystick" class="joystick hidden" aria-label="Movement joystick"><i id="joystick-knob"></i></div>
      <div class="portrait-warning">Rotate your device to landscape to guide the Worldseed.</div>
      <main id="modal" class="modal"></main>
    `;
    this.hud = this.query(".hud");
    this.modal = this.query("#modal");
    this.hint = this.query("#hint");
    this.objective = this.query("#objective");
    this.playerBar = this.query("#player-bar");
    this.seedBar = this.query("#seed-bar");
    this.xpBar = this.query("#xp-bar");
    this.timer = this.query("#timer");
    this.clearing = this.query("#clearing");
    this.pauseButton = this.query<HTMLButtonElement>("#pause");
    this.joystick = this.query("#joystick");
    this.joystickKnob = this.query("#joystick-knob");
  }

  showMenu(
    profile: ProfileSave,
    selectedSpell: SpellId,
    actions: {
      start: (spell: SpellId) => void;
      selectGear: (id: string) => void;
      unlockGear: (id: string) => void;
      selectSpell: (spell: SpellId) => void;
    },
  ) {
    this.hud.classList.add("hidden");
    this.joystick.classList.add("hidden");
    this.hint.classList.add("hidden");
    this.modal.className = "modal menu open";
    const gearCards = GEAR.map((gear) => {
      const unlocked = profile.unlockedGear.includes(gear.id);
      const selected = profile.selectedGear === gear.id;
      return `
        <button class="gear-card ${selected ? "selected" : ""}" data-gear="${gear.id}" ${!unlocked && profile.seeds < gear.cost ? "disabled" : ""}>
          <span>${unlocked ? (selected ? "EQUIPPED" : "AVAILABLE") : `${gear.cost} SEEDS`}</span>
          <strong>${gear.name}</strong>
          <small>${gear.description}</small>
        </button>`;
    }).join("");
    const spellCards = SPELLS.map((spell) => `
      <button class="spell-card ${selectedSpell === spell.id ? "selected" : ""}" data-spell="${spell.id}">
        <i style="--spell:#${spell.color.toString(16).padStart(6, "0")}"></i>
        <span><strong>${spell.name}</strong><small>${spell.description}</small></span>
      </button>
    `).join("");
    this.modal.innerHTML = `
      <div class="menu-shell">
        <header class="hero">
          <div class="eyebrow">A 3D SURVIVAL ROGUELITE</div>
          <h1>Heartwood<br><em>Caravan</em></h1>
          <p>Guide the last walking Worldseed through a beautiful forest being swallowed by violet corruption.</p>
          <button id="start-game" class="primary">BEGIN THE JOURNEY <span>→</span></button>
          <div class="controls-copy">WASD / ARROWS TO MOVE · SPELLS AUTO-CAST · ESC TO PAUSE</div>
        </header>
        <aside class="sanctuary">
          <div class="section-title"><span>STARTING SPELL</span><b>CHOOSE ONE</b></div>
          <div class="spell-grid">${spellCards}</div>
          <div class="section-title"><span>SANCTUARY</span><b>${profile.seeds} ✦ SEEDS</b></div>
          <div class="gear-grid">${gearCards}</div>
          <div class="records">Runs ${profile.runs} <i></i> Victories ${profile.wins} <i></i> Best ${profile.bestTime ? formatTime(profile.bestTime) : "—"}</div>
        </aside>
      </div>`;
    this.query<HTMLButtonElement>("#start-game").onclick = () => actions.start(selectedSpell);
    this.modal.querySelectorAll<HTMLButtonElement>("[data-spell]").forEach((button) => {
      button.onclick = () => actions.selectSpell(button.dataset.spell as SpellId);
    });
    this.modal.querySelectorAll<HTMLButtonElement>("[data-gear]").forEach((button) => {
      button.onclick = () => {
        const id = button.dataset.gear!;
        if (profile.unlockedGear.includes(id)) actions.selectGear(id);
        else actions.unlockGear(id);
      };
    });
  }

  beginGame(onPause: () => void) {
    this.modal.className = "modal";
    this.modal.innerHTML = "";
    this.hud.classList.remove("hidden");
    this.joystick.classList.remove("hidden");
    this.pauseButton.onclick = onPause;
    this.showHint("MOVE TO GUIDE THE WORLDSEED", 4200);
  }

  update(state: RunState) {
    this.playerBar.style.width = `${Math.max(0, state.player.health / state.player.maxHealth * 100)}%`;
    this.seedBar.style.width = `${Math.max(0, state.worldseed.health / state.worldseed.maxHealth * 100)}%`;
    this.xpBar.style.width = `${Math.min(100, state.essence / state.essenceToLevel * 100)}%`;
    this.timer.textContent = formatTime(state.time);
    this.clearing.textContent = state.phase === "boss"
      ? "WARDEN"
      : `CLEARING ${Math.min(state.clearingIndex + 1, 3)} / 3`;
    if (state.phase === "defend") {
      this.objective.innerHTML = `<small>PROTECT THE WORLDSEED</small><strong>${ENCOUNTERS[state.clearingIndex].name}</strong><b>${Math.ceil(state.defenseRemaining)}s</b>`;
    } else {
      this.objective.innerHTML = `<small>${state.phase === "boss" ? "FINAL TRIAL" : "CURRENT PATH"}</small><strong>${state.message}</strong>`;
    }
  }

  showUpgrade(state: RunState, choose: (index: number) => void) {
    this.modal.className = "modal open";
    this.modal.innerHTML = `
      <section class="panel upgrade-panel">
        <div class="eyebrow">THE FOREST ANSWERS · LEVEL ${state.level}</div>
        <h2>Choose your growth</h2>
        <div class="upgrade-grid">
          ${state.upgradeChoices.map((upgrade, index) => `
            <button class="upgrade-card" data-upgrade="${index}">
              <span>0${index + 1}</span><i>✦</i>
              <strong>${upgrade.name}</strong>
              <small>${upgrade.description}</small>
            </button>
          `).join("")}
        </div>
      </section>`;
    this.modal.querySelectorAll<HTMLButtonElement>("[data-upgrade]").forEach((button) => {
      button.onclick = () => choose(Number(button.dataset.upgrade));
    });
  }

  hideOverlay() {
    this.modal.className = "modal";
    this.modal.innerHTML = "";
  }

  showPause(resume: () => void, exit: () => void) {
    this.modal.className = "modal open";
    this.modal.innerHTML = `
      <section class="panel pause-panel">
        <div class="eyebrow">THE FOREST WAITS</div>
        <h2>Journey paused</h2>
        <p>Your path will be here when you return.</p>
        <button id="resume" class="primary">RETURN TO THE GROVE</button>
        <button id="exit" class="text-button">Leave this run</button>
      </section>`;
    this.query<HTMLButtonElement>("#resume").onclick = resume;
    this.query<HTMLButtonElement>("#exit").onclick = exit;
  }

  showResults(state: RunState, retry: () => void, sanctuary: () => void) {
    const won = state.phase === "victory";
    this.modal.className = "modal results open";
    this.modal.innerHTML = `
      <section class="panel result-panel ${won ? "won" : ""}">
        <div class="result-sigil">${won ? "✦" : "◆"}</div>
        <div class="eyebrow">${won ? "THE GROVE ENDURES" : "THE FOREST REMEMBERS"}</div>
        <h2>${won ? "Worldseed restored" : state.message}</h2>
        <p>${won ? "Warm light returns to the elder canopy." : "Every fallen leaf feeds tomorrow's courage."}</p>
        <div class="run-stats">
          <span><small>TIME</small><strong>${formatTime(state.time)}</strong></span>
          <span><small>CLEARINGS</small><strong>${state.clearingIndex} / 3</strong></span>
          <span><small>CLEARED</small><strong>${state.kills}</strong></span>
          <span><small>SEEDS</small><strong>+${state.seedReward} ✦</strong></span>
        </div>
        <button id="retry" class="primary">${won ? "GUIDE ANOTHER SEED" : "TRY AGAIN"}</button>
        <button id="sanctuary" class="text-button">Return to sanctuary</button>
      </section>`;
    this.query<HTMLButtonElement>("#retry").onclick = retry;
    this.query<HTMLButtonElement>("#sanctuary").onclick = sanctuary;
  }

  showHint(message: string, duration = 2500) {
    this.hint.textContent = message;
    this.hint.classList.remove("hidden");
    window.setTimeout(() => this.hint.classList.add("hidden"), duration);
  }

  private query<T extends HTMLElement = HTMLElement>(selector: string) {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing UI element: ${selector}`);
    return element;
  }
}

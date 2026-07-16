import Phaser from 'phaser';
import { BUILDINGS } from '../simulation/building';
import type { BuildingKind } from '../simulation/worldState';
import { button, panel } from '../ui/hud';
import { crisp, DISPLAY_FONT, UI_FONT } from '../ui/typography';

const PAGES = [
  {
    title: 'START HERE',
    body: 'YOUR PURPOSE\nKeep the Luma alive while their colony grows. The guided journey at the top of the habitat teaches each major system in a safe order. Click it at any time for contextual help.\n\nLIVING INDIVIDUALS\nEvery Luma has a persistent personality, role, six trainable skills, favorite activity, favorite facility, friendships, and a personal ambition. Practice raises skill levels and makes facility work more effective.\n\nTHE CORE LOOP\n1. Click a Luma to hear its original voice and inspect its life.\n2. Use FEED, WASH, and PLAY for immediate care.\n3. Build facilities so the colony can care for itself.\n4. Assign roles, research discoveries, and upgrade facilities.\n5. Keep needs high to enable division and grow the population.\n6. Earn reputation, habitat levels, regions, and a final Audit decision.\n\nRESOURCES\nGLOW pays for construction. ALLOY unlocks advanced automation. Research Points unlock colony-wide bonuses. Guided steps grant useful supplies and reputation.'
  },
  {
    title: 'LUMA NEEDS',
    body: 'NOURISHMENT / hunger\nLow values send a Luma to a Dew Loom. Critical hunger damages health.\n\nCLARITY / hygiene\nRestored at a Mist Basin. Very low clarity contributes to health loss.\n\nRESONANCE / happiness\nRestored at a Chime Grove. Industry also reduces it while a Luma works.\n\nINTEGRITY / health\nWhen this reaches zero, the Luma becomes silent permanently. Clinics restore it and remove pollution exposure.\n\nCHARGE / energy\nRestored at a Warm Archive. Division also consumes charge.\n\nDIVISION\nA mature Luma divides only when every need is healthy: nourishment 72+, clarity 65+, resonance 72+, integrity 80+, and charge 55+.'
  },
  {
    title: 'BUILDINGS',
    body: (Object.keys(BUILDINGS) as BuildingKind[]).map((kind) => {
      const item = BUILDINGS[kind];
      const risk = item.pollution > 0 ? `  POLLUTION ${item.pollution}/sec` : '  CLEAN';
      return `${item.glyph}  ${item.name.toUpperCase()}  ·  POP ${item.unlockPopulation}\n${item.effect}\nBUILD ${item.cost.glow} GLOW / ${item.cost.alloy} ALLOY${risk}\nQUALITY → ${item.upgrade.name.toUpperCase()}: ${item.upgrade.effect}\nCAPACITY → ${item.capacityUpgrade.name.toUpperCase()}: ${item.capacityUpgrade.effect}\nBEST OPERATOR ${item.operatorRole.toUpperCase()} / ${item.operatorSkill.toUpperCase()} · ASCEND RESEARCH ${item.advancedResearch.toUpperCase()} 2`;
    }).join('\n\n')
  },
  {
    title: 'CONTROLS & SIGNALS',
    body: 'SELECT & LISTEN\nClick or tap a Luma to make it the active care target. It turns toward you, answers with an original mood-based voice, and gives a physical greeting. Happy, curious, hungry, tired, lonely, and unwell Luma all sound and move differently.\n\nACTIVITY LANGUAGE\nWalking leans and steps. Eating nibbles. Bathing splashes. Play dances. Sleep slows breathing and blinking. Work swings tools. Healing glows. Socializing reaches toward a companion. Builders carry crates and repair worn machinery. Celebrations jump while arguments become sharp and restless.\n\nINSPECT\nClick a facility to see exact output, pollution, capacity, operator bonus, live occupants, queue, material delivery, construction work, durability, maintenance, upgrade cost, research requirement, and build-time estimate.\n\nPLACE & PREVIEW\nThe large colored ring shows facility influence. The inner clearance ring turns red over blocked ground, water, stone, or another facility. The placement label explains the exact block and counts nearby path connections before you commit.\n\nMOVE THE HABITAT\nDrag empty ground to pan. Use the mouse wheel or pinch to zoom. Luma route around structures, water, stone, and each other. Facilities reserve separate service stations; extra visitors wait in numbered queues and spread between available facilities.\n\nPRIORITIES\nFood, hygiene, sleep, and medical emergencies interrupt social plans. Blocked plans repath or time out safely.\n\nSTATUS SIGNALS\n! hungry   ≋ dirty   z tired   · unhappy   ☣ sick   ♡ social   + comforting\nSILENT means a Luma has died. If every voice falls silent, Recovery Options let one Luma answer an emergency signal without erasing buildings, research, or history.\n\nBUILD SAFETY\nBuilders visibly carry reserved GLOW and ALLOY to projects. Press U within 30 seconds to undo unfinished new construction and recover 80% of materials.\n\nMAINTENANCE\nAutomatic maintenance funds repairs below 55% durability when resources are available. Switch a facility to MANUAL to control spending, then use FUND REPAIR when ready. Worn facilities lose output and can shut down at zero durability.'
  },
  {
    title: 'ROLES & RESEARCH',
    body: 'ROLES\nForagers specialize in nourishment. Caretakers support happiness, washing, rest, and younger Luma. Healers protect integrity. Builders construct, extract, and maintain facilities. Researchers advance habitat knowledge. Explorers travel, discover rare materials, and recover from blocked routes.\n\nOPERATORS\nEvery facility lists its best role and skill. A matching assigned role gives an additional operator bonus, while skill levels steadily improve real output. This makes training and job assignment matter without requiring permanent manual staffing.\n\nAUTONOMY\nLuma naturally prefer work matching their personality. Open COLONY → LUMA to assign a role or restore autonomy. Unsuitable assigned work causes stress, so assignments are a strategic choice—not free output.\n\nSKILLS\nGathering, Caregiving, Healing, Building, Research, and Exploration gain experience through real activity. Five skill levels provide small efficiency gains. Experienced Luma can teach younger companions.\n\nRESEARCH & UPGRADES\nAny first research discovery unlocks level-2 Quality and Capacity construction. Ascendant level 3 requires the facility’s named research branch at level 2 plus regional rare matter. CARE supports clinics, pools, and nests; NATURE supports food; TECHNOLOGY supports industry; SOCIETY supports gardens.'
  },
  {
    title: 'COLONY COMMAND',
    body: 'OVERVIEW\nShows level, reputation, weather, regions, rare stores, and actionable alerts. SHOW LUMA and SHOW BUILDING explain the problem and take you directly to its source.\n\nMANAGE / POLICIES\nSet colony priorities from OFF to CRITICAL. Emergency First lets critical health and needs interrupt schedules. Repairs Before Building protects existing infrastructure. Protect Reserves prevents automated repair spending below your chosen GLOW and ALLOY floors. Auto Staff lets preferred operators receive first claim on suitable facilities.\n\nMANAGE / ROSTER\nFilter the population by risk or role. Every row shows the current need risk, stress, schedule phase, crew, and task. Balanced, Early, Late, and Flexible schedules determine protected work, free-time, and rest blocks. A shift safety limit prevents healthy Luma from working indefinitely.\n\nMANAGE / JOBS\nShows critical care, construction, repairs, facility queues, and why delayed work is blocked. Capacity forecasts warn about food, beds, and clinic pressure before shortages become emergencies. Facility staffing can prefer a named Luma or return to automatic assignment.\n\nCREWS & ZONES\nGentle Shift rests and wanders around North Grove. Maker Shift uses Central Field. Free Chorus gathers around South Meadow. A crew changes idle territory—not access to urgent care or required facilities—so no Luma is trapped away from food or treatment.\n\nSOCIAL & LUMA\nSocial shows activities, requests, relationships, family lines, and reconciliation history. Luma provides a complete identity card with personality, work stress, the exact reason for the current action, role, schedule, crew, skills, traits, memories, and life history.\n\nHISTORY / SETTINGS / SAVES\nUse the filterable colony timeline, separate audio controls, scalable text, reduced motion, accessibility modes, simulation speeds, three save slots, recovery backups, and portable export/import.\n\nSHORTCUTS\nSPACE pause  ·  1/2/3 speeds  ·  P photo mode  ·  G guide  ·  ESC close.'
  },
  {
    title: 'EXPEDITIONS',
    body: 'REGIONAL PERMITS\nReputation raises habitat level and unlocks Whisper Grove, Mirror Marsh, Old Signal Ridge, and Aurora Basin. Each region has a visible supply cost, travel time, risk, and likely discovery.\n\nTEAMS\nOpen COLONY → EXPLORE. The habitat recommends 2–3 available Luma, favoring trained Explorers. CHANGE TEAM rotates the roster. Expedition members leave the field and cannot use facilities until they return.\n\nSAFE RISK\nDistance and low skill can reduce rewards and drain needs, but expeditions never kill a Luma. Exploration skill, resilience, team size, and Exploration research improve outcomes.\n\nDISCOVERY DECISIONS\nEvery return names the Luma involved and pauses for a choice. PRESERVE protects the site, earning Wild Seed and sustainability. SALVAGE takes a relic, earning Memory Crystal, ALLOY, and ambition.\n\nADVANCED PROGRESSION\nResearch levels 3–5 require regional rare matter. A level-2 facility can consume one matching rare resource to ascend to level 3, gaining +22% output, another service station, and a final visual evolution.'
  }
] as const;

export class GuideScene extends Phaser.Scene {
  private page = 0;
  private titleText!: Phaser.GameObjects.Text;
  private bodyText!: Phaser.GameObjects.Text;
  private tabs: Phaser.GameObjects.Container[] = [];
  private searchResult?: { title: string; body: string };

  constructor() { super('GuideScene'); }

  init(data: { page?: number }) {
    if (Number.isInteger(data.page)) this.page = Phaser.Math.Clamp(data.page ?? 0, 0, PAGES.length - 1);
  }

  create() {
    this.buildLayout();
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  private buildLayout() {
    this.children.removeAll(true);
    this.tabs = [];
    const { width, height } = this.scale;
    const cardWidth = Math.min(760, width - 24);
    const cardHeight = Math.min(680, height - 24);
    const left = width / 2 - cardWidth / 2;
    const top = height / 2 - cardHeight / 2;
    this.add.rectangle(width / 2, height / 2, width, height, 0x020604, 0.86).setInteractive();
    panel(this, width / 2, height / 2, cardWidth, cardHeight, 0.99);
    crisp(this.add.text(left + 26, top + 22, 'HABITAT FIELD GUIDE', { fontFamily: DISPLAY_FONT, fontSize: width < 500 ? '16px' : '19px', color: '#91ffd0', letterSpacing: 1.5 }));
    const close = crisp(this.add.text(left + cardWidth - 22, top + 13, '×', { fontFamily: UI_FONT, fontStyle: 'bold', fontSize: '30px', color: '#a8cdbb' })).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    close.on('pointerup', () => this.scene.stop());
    const search = button(this, left + cardWidth - 118, top + 38, 150, 30, 'SEARCH INDEX', 0x65c7ff);
    search.on('pointerup', () => this.search());
    this.titleText = crisp(this.add.text(left + 26, top + 65, '', { fontFamily: DISPLAY_FONT, fontSize: '14px', color: '#f7bd62', letterSpacing: 1.2 }));
    this.bodyText = crisp(this.add.text(left + 26, top + 94, '', { fontFamily: UI_FONT, fontSize: width < 500 ? '12px' : '13px', color: '#e4f7ed', lineSpacing: width < 500 ? 3 : 5, wordWrap: { width: cardWidth - 52 } }));
    const labels = ['START', 'NEEDS', 'BUILD', 'CONTROL', 'ROLES', 'MANAGE', 'EXPLORE'];
    const gap = 5; const tabWidth = (cardWidth - 52 - gap * (labels.length - 1)) / labels.length;
    labels.forEach((label, index) => {
      const tab = button(this, left + 26 + tabWidth / 2 + index * (tabWidth + gap), top + cardHeight - 30, tabWidth, 38, label, index === 0 ? 0xf7bd62 : 0x7af6bd);
      tab.on('pointerup', () => this.showPage(index)); this.tabs.push(tab);
    });
    this.showPage(this.page);
  }

  private handleResize = () => this.buildLayout();

  private shutdown() { this.scale.off('resize', this.handleResize, this); }

  private showPage(index: number) {
    this.page = index;
    const compact = this.scale.width < 500;
    const densePage = index === 2 || index === 3;
    const page = this.searchResult ?? PAGES[index];
    this.titleText.setText(page.title);
    this.bodyText.setFontSize(compact && densePage ? 10 : compact ? 12 : densePage ? 12 : 13).setLineSpacing(compact && densePage ? 1 : compact ? 3 : 5).setText(page.body);
    this.tabs.forEach((tab, tabIndex) => tab.setAlpha(tabIndex === this.page ? 1 : 0.62));
  }

  private search() {
    const query = window.prompt('Search buildings, needs, roles, saves, controls, or colony systems:')?.trim().toLowerCase();
    if (!query) return;
    const matches = PAGES.filter((page) => `${page.title}\n${page.body}`.toLowerCase().includes(query));
    this.searchResult = { title: `SEARCH / ${query.toUpperCase()}`, body: matches.length ? matches.map((page) => `${page.title}\n${page.body}`).join('\n\n────────\n\n') : `No exact entry found for “${query}”. Try: building, hunger, role, research, voice, save, offline, weather, or controls.` };
    this.showPage(this.page);
    this.searchResult = undefined;
  }
}

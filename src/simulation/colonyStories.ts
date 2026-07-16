import { setBond } from './personality';
import type {
  CreatureState, GroupActivityState, PersonalRequestChoice, PersonalRequestState, StoryChoice, StoryEventState, WorldState
} from './worldState';
import { appendWorldEvent } from './worldState';

function journal(world: WorldState, category: 'event' | 'relationship' | 'milestone', title: string, detail: string, id: string) {
  if (world.livingWorld.journal.some((entry) => entry.id === id)) return;
  world.livingWorld.journal.push({ id, at: world.time, category, title, detail });
  if (world.livingWorld.journal.length > 120) world.livingWorld.journal.splice(0, world.livingWorld.journal.length - 120);
}

function available(world: WorldState) {
  return world.creatures.filter((creature) => creature.alive && !creature.expeditionId);
}

function pairKey(a: string, b: string) { return [a, b].sort().join(':'); }

export function relationshipTone(world: WorldState, first: CreatureState, second: CreatureState) {
  const bond = Math.max(first.bonds[second.id] ?? 0, second.bonds[first.id] ?? 0);
  if (first.parentId === second.id || second.parentId === first.id || first.childrenIds.includes(second.id) || second.childrenIds.includes(first.id)) return 'FAMILY';
  if (bond >= 85) return 'LIFEBOND';
  if (first.mentorId === second.id || second.mentorId === first.id) return 'MENTORSHIP';
  const key = pairKey(first.id, second.id);
  const conflict = [...world.events].reverse().find((event) => ['relationship_conflict', 'relationship_reconciled'].includes(event.type) && event.payload.pair === key);
  if (conflict?.type === 'relationship_conflict') return 'RIVALRY';
  const strongestFirst = Math.max(...Object.values(first.skills));
  const strongestSecond = Math.max(...Object.values(second.skills));
  if (bond >= 35 && Math.abs(strongestFirst - strongestSecond) >= 20) return 'ADMIRATION';
  return bond >= 60 ? 'CLOSE FRIEND' : bond >= 35 ? 'FRIEND' : bond >= 12 ? 'FAMILIAR' : 'STRANGER';
}

export function explainCreatureAction(world: WorldState, creature: CreatureState) {
  if (!creature.alive) return 'This Luma is silent. Their history remains in the colony timeline.';
  if (creature.expeditionId) return 'Away on an expedition; colony needs and facility work are paused until return.';
  if (creature.stuckTimer > 1) return 'The route is blocked or crowded; path recovery is searching for another approach.';
  if (creature.queueIndex > 0 && creature.destinationBuildingId) {
    const building = world.buildings.find((candidate) => candidate.id === creature.destinationBuildingId);
    return `Waiting at ${building?.kind.replaceAll('-', ' ') ?? 'a facility'} because every nearer service station is reserved.`;
  }
  if (creature.task === 'heal') return `Seeking treatment because integrity is ${Math.round(creature.needs.health)}%.`;
  if (creature.task === 'eat') return `Seeking nourishment because the need is ${Math.round(creature.needs.hunger)}%.`;
  if (creature.task === 'bathe') return `Seeking clarity because hygiene is ${Math.round(creature.needs.hygiene)}%.`;
  if (creature.task === 'sleep') return `Seeking rest because charge is ${Math.round(creature.needs.energy)}%.`;
  if (creature.task === 'play') return `Seeking play because resonance is ${Math.round(creature.needs.happiness)}%.`;
  if (creature.task === 'comfort') return 'Empathy detected a distressed Luma nearby.';
  if (creature.task === 'socialize') return 'Personality, proximity, and relationship memory made companionship the best choice.';
  if (creature.task === 'argue') return 'Low compatibility and unresolved history caused a conflict.';
  if (creature.task === 'celebrate') return 'A healthy colony group activity temporarily outranks ordinary work.';
  if (creature.task === 'construct' || creature.task === 'maintain') return 'Diligence, building skill, and colony maintenance needs selected this work.';
  if (creature.task === 'work') return 'Role preference and colony production needs selected this work.';
  return 'No urgent need is active, so personality and familiar routes guide free exploration.';
}

function requestFor(world: WorldState, creature: CreatureState, index: number): PersonalRequestState {
  const living = available(world);
  const target = living.filter((candidate) => candidate.id !== creature.id)
    .sort((a, b) => (b.bonds[creature.id] ?? 0) - (a.bonds[creature.id] ?? 0))[0];
  const kinds = ['companionship', 'favorite-place', 'purpose'] as const;
  const kind = kinds[index % kinds.length];
  const detail = kind === 'companionship'
    ? `${creature.name} wants time with ${target?.name ?? 'another Luma'} before the next quiet cycle.`
    : kind === 'favorite-place'
      ? `${creature.name} hopes to spend an unhurried moment near the ${creature.preferences.favoriteBuilding.replaceAll('-', ' ')}.`
      : `${creature.name} is questioning whether ${creature.assignedRole} work still reflects who they are becoming.`;
  return {
    id: `request-${world.livingWorld.day}-${creature.id}`, creatureId: creature.id, targetCreatureId: target?.id, kind,
    title: kind === 'companionship' ? `${creature.name} asks for company` : kind === 'favorite-place' ? `${creature.name} asks for familiar ground` : `${creature.name} asks about purpose`,
    detail, createdAt: world.time, expiresAt: world.time + 150, status: 'active'
  };
}

function startRequest(world: WorldState) {
  const living = available(world); if (!living.length || world.livingWorld.personalRequests.some((request) => request.status === 'active')) return;
  const creature = living[(world.seed + world.livingWorld.day * 7) % living.length];
  const request = requestFor(world, creature, world.seed + world.livingWorld.day);
  world.livingWorld.personalRequests.push(request);
  if (world.livingWorld.personalRequests.length > 30) world.livingWorld.personalRequests.shift();
  creature.currentConcern = request.detail;
  journal(world, 'event', request.title, `${request.detail} Open COLONY → SOCIAL to respond.`, request.id);
  appendWorldEvent(world, { type: 'personal_request', at: world.time, payload: { id: request.id, creatureId: creature.id, kind: request.kind } });
}

function storyFor(world: WorldState): StoryEventState | undefined {
  const living = available(world); if (living.length < 2) return undefined;
  const conflict = [...world.events].reverse().find((event) => event.type === 'relationship_conflict' && world.time - event.at < 480);
  if (conflict) {
    const ids = [String(conflict.payload.a), String(conflict.payload.b)];
    const names = ids.map((id) => world.creatures.find((creature) => creature.id === id)?.name ?? id);
    return {
      id: `story-reconciliation-${world.livingWorld.day}`, kind: 'reconciliation', title: 'A silence between two voices',
      description: `${names[0]} and ${names[1]} avoid the same paths after their argument. The colony can make room for honesty—or urge them to move forward.`,
      creatureIds: ids, stage: 1, status: 'decision', createdAt: world.time, choices: ['gentle', 'bold']
    };
  }
  const sorted = [...living].sort((a, b) => b.personality.sociability - a.personality.sociability);
  const kind = world.livingWorld.day % 2 ? 'lost-song' : 'shared-home';
  return {
    id: `story-${kind}-${world.livingWorld.day}`, kind,
    title: kind === 'lost-song' ? 'The unfinished chorus' : 'A place beside the light',
    description: kind === 'lost-song'
      ? `${sorted[0].name} remembers a melody no one else can complete. ${sorted[1].name} recognizes its final note but fears changing the memory.`
      : `${sorted[0].name} and ${sorted[1].name} want to make a shared resting place, even though their habits are very different.`,
    creatureIds: sorted.slice(0, 2).map((creature) => creature.id), stage: 1, status: 'decision', createdAt: world.time, choices: ['gentle', 'bold']
  };
}

function startStory(world: WorldState) {
  if (world.livingWorld.storyEvents.some((event) => event.status === 'decision')) return;
  const story = storyFor(world); if (!story) return;
  world.livingWorld.storyEvents.push(story);
  if (world.livingWorld.storyEvents.length > 20) world.livingWorld.storyEvents.shift();
  journal(world, 'event', story.title, `${story.description} Open COLONY → SOCIAL to decide.`, story.id);
  appendWorldEvent(world, { type: 'story_started', at: world.time, payload: { id: story.id, kind: story.kind, creatureIds: story.creatureIds } });
}

function startGroupActivity(world: WorldState) {
  const living = available(world).filter((creature) => Math.min(...Object.values(creature.needs)) >= 38);
  if (living.length < 3 || world.livingWorld.groupActivity || world.time - world.livingWorld.lastGroupActivityAt < 80) return;
  const members = [...living].sort((a, b) => b.needs.happiness - a.needs.happiness).slice(0, Math.min(6, living.length));
  const kinds = ['meal', 'game', 'celebration'] as const;
  const kind = kinds[(world.seed + Math.floor(world.time / 80)) % kinds.length];
  const center = kind === 'game'
    ? world.buildings.find((building) => building.kind === 'resonance-garden' && building.active)
    : kind === 'meal'
      ? world.buildings.find((building) => building.kind === 'nutrient-bed' && building.active)
      : undefined;
  const activity: GroupActivityState = {
    id: `group-${kind}-${Math.floor(world.time)}`, kind, creatureIds: members.map((creature) => creature.id),
    startedAt: world.time, endsAt: world.time + 14, center: center ? { x: center.x, y: center.y + 90 } : { x: 800, y: 520 }
  };
  world.livingWorld.groupActivity = activity; world.livingWorld.lastGroupActivityAt = world.time;
  appendWorldEvent(world, { type: 'group_activity_started', at: world.time, payload: { id: activity.id, kind, creatureIds: activity.creatureIds } });
  journal(world, 'relationship', `${members[0].name} gathers the colony`, `${members.map((creature) => creature.name).join(', ')} begin a shared ${kind}.`, activity.id);
}

function updateGroupActivity(world: WorldState, seconds: number) {
  const activity = world.livingWorld.groupActivity; if (!activity) return;
  const members = activity.creatureIds.map((id) => world.creatures.find((creature) => creature.id === id)).filter((creature): creature is CreatureState => Boolean(creature?.alive));
  members.forEach((creature) => {
    creature.needs.happiness = Math.min(100, creature.needs.happiness + seconds * 1.5);
    if (activity.kind === 'meal') creature.needs.hunger = Math.min(100, creature.needs.hunger + seconds * 0.65);
    creature.currentConcern = `Joining a colony ${activity.kind}`;
  });
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
    const strength = Math.max(members[i].bonds[members[j].id] ?? 0, members[j].bonds[members[i].id] ?? 0);
    const next = Math.min(100, strength + seconds * 0.11);
    setBond(members[i], members[j].id, next); setBond(members[j], members[i].id, next);
  }
  if (world.time < activity.endsAt) return;
  members.forEach((creature) => { creature.currentConcern = 'Remembering a shared colony moment'; });
  appendWorldEvent(world, { type: 'group_activity_complete', at: world.time, payload: { id: activity.id, kind: activity.kind, creatureIds: activity.creatureIds } });
  journal(world, 'relationship', `The shared ${activity.kind} ends`, `${members.map((creature) => creature.name).join(', ')} leave with stronger bonds.`, `${activity.id}-complete`);
  world.livingWorld.groupActivity = undefined;
}

export function updateColonyStories(world: WorldState, seconds: number) {
  updateGroupActivity(world, seconds);
  world.livingWorld.personalRequests.filter((request) => request.status === 'active' && world.time >= request.expiresAt).forEach((request) => {
    request.status = 'expired';
    const creature = world.creatures.find((candidate) => candidate.id === request.creatureId);
    if (creature) { creature.stress = Math.min(100, creature.stress + 8); creature.currentConcern = 'A personal request went unanswered'; }
    journal(world, 'event', `${creature?.name ?? 'A Luma'} stops asking`, 'The request expired. Nothing ended, but the silence became part of colony history.', `${request.id}-expired`);
  });
  if (world.livingWorld.day > world.livingWorld.lastRequestDay && world.livingWorld.day >= 2) {
    world.livingWorld.lastRequestDay = world.livingWorld.day; startRequest(world);
  }
  if (world.livingWorld.day >= 3 && world.livingWorld.day - world.livingWorld.lastStoryDay >= 2) {
    world.livingWorld.lastStoryDay = world.livingWorld.day; startStory(world);
  }
  startGroupActivity(world);
}

export function resolvePersonalRequest(world: WorldState, requestId: string, choice: PersonalRequestChoice) {
  const request = world.livingWorld.personalRequests.find((candidate) => candidate.id === requestId && candidate.status === 'active');
  if (!request) return false;
  const creature = world.creatures.find((candidate) => candidate.id === request.creatureId); if (!creature) return false;
  const target = request.targetCreatureId ? world.creatures.find((candidate) => candidate.id === request.targetCreatureId) : undefined;
  if (choice === 'help') {
    if (world.resources.glow < 8) return false;
    world.resources.glow -= 8; creature.needs.happiness = Math.min(100, creature.needs.happiness + 22); creature.stress = Math.max(0, creature.stress - 12); world.profile.empathy += 1;
    if (target) { const strength = Math.max(creature.bonds[target.id] ?? 0, target.bonds[creature.id] ?? 0) + 12; setBond(creature, target.id, strength); setBond(target, creature.id, strength); }
  } else if (choice === 'encourage') {
    creature.needs.happiness = Math.min(100, creature.needs.happiness + 9); creature.stress = Math.max(0, creature.stress - 4); world.profile.honesty += 0.5;
  } else {
    creature.needs.happiness = Math.max(0, creature.needs.happiness - 7); creature.stress = Math.min(100, creature.stress + 9); world.profile.obedience += 0.3;
  }
  request.status = 'resolved'; request.choice = choice; creature.currentConcern = choice === 'decline' ? 'Learning to carry an unanswered wish' : 'Feeling heard by the colony';
  creature.history.push({ at: world.time, title: `Personal request ${choice === 'decline' ? 'declined' : 'answered'}`, detail: request.detail });
  appendWorldEvent(world, { type: 'personal_request_resolved', at: world.time, payload: { id: request.id, creatureId: creature.id, choice } });
  journal(world, 'event', `${creature.name}'s request: ${choice}`, choice === 'help' ? 'The colony invested care and made the wish real.' : choice === 'encourage' ? 'The colony offered honesty and room to choose.' : 'The colony said no, and the answer became part of their relationship.', `${request.id}-resolved`);
  return true;
}

export function resolveStoryChoice(world: WorldState, storyId: string, choice: StoryChoice) {
  const story = world.livingWorld.storyEvents.find((candidate) => candidate.id === storyId && candidate.status === 'decision');
  if (!story) return false;
  const members = story.creatureIds.map((id) => world.creatures.find((creature) => creature.id === id)).filter((creature): creature is CreatureState => Boolean(creature));
  if (story.stage === 1) {
    story.stage = 2;
    story.description = choice === 'gentle'
      ? 'The colony gives them time and privacy. Now decide whether the moment should remain personal or become a shared tradition.'
      : 'The colony asks for a clear answer today. Now decide whether to celebrate the result publicly or record it quietly.';
    appendWorldEvent(world, { type: 'story_advanced', at: world.time, payload: { id: story.id, choice, stage: 2 } });
    return true;
  }
  story.status = 'resolved';
  const bondBonus = choice === 'gentle' ? 12 : 7;
  if (members.length >= 2) {
    const strength = Math.max(members[0].bonds[members[1].id] ?? 0, members[1].bonds[members[0].id] ?? 0) + bondBonus;
    setBond(members[0], members[1].id, strength); setBond(members[1], members[0].id, strength);
  }
  members.forEach((creature) => {
    creature.needs.happiness = Math.min(100, creature.needs.happiness + (choice === 'gentle' ? 14 : 9));
    creature.history.push({ at: world.time, title: story.title, detail: `${story.description} The colony chose a ${choice} ending.` });
  });
  world.livingWorld.reputation += choice === 'gentle' ? 8 : 5;
  world.livingWorld.researchPoints += choice === 'bold' ? 12 : 5;
  if (story.kind === 'reconciliation' && members.length >= 2) {
    appendWorldEvent(world, { type: 'relationship_reconciled', at: world.time, payload: { a: members[0].id, b: members[1].id, pair: pairKey(members[0].id, members[1].id) } });
  }
  appendWorldEvent(world, { type: 'story_resolved', at: world.time, payload: { id: story.id, kind: story.kind, choice } });
  journal(world, 'milestone', `${story.title}: ${choice} ending`, `${members.map((creature) => creature.name).join(' and ')} carry the consequence forward.`, `${story.id}-resolved`);
  return true;
}

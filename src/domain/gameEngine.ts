import type {
  Book,
  BookNode,
  Choice,
  CombatEnemy,
  CombatRound,
  Effect,
  GameState,
  PotionType,
  Requirement,
  RollDie,
  VersionedSave,
} from './types'

export const SAVE_VERSION = 1

export const rollDie: RollDie = () => Math.floor(Math.random() * 6) + 1

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const uniqueAdd = (items: string[], item: string) => (items.includes(item) ? items : [...items, item])

const removeValue = (items: string[], item: string) => items.filter((current) => current !== item)

const appendLog = (state: GameState, message: string): GameState => ({
  ...state,
  log: [message, ...state.log].slice(0, 80),
})

export function createInitialState(book: Book, die: RollDie = rollDie): GameState {
  const initialSkill = 6 + die()
  const initialStamina = 12 + die() + die()
  const initialLuck = 6 + die()
  const startNodeId = Number(Object.keys(book.nodes).sort((a, b) => Number(a) - Number(b))[0] ?? 1)

  return {
    currentNodeId: startNodeId,
    initialSkill,
    skill: initialSkill,
    initialStamina,
    stamina: initialStamina,
    initialLuck,
    luck: initialLuck,
    gold: 0,
    provisions: 10,
    inventory: ['Kard', 'Bőrpáncél', 'Lámpás'],
    flags: [],
    history: [],
    log: [
      `Kaland indult. Ügyesség ${initialSkill}, Életerő ${initialStamina}, Szerencse ${initialLuck}.`,
    ],
  }
}

export function startGame(book: Book, die: RollDie = rollDie): GameState {
  const initial = createInitialState(book, die)
  return enterNode(book, initial, initial.currentNodeId)
}

export function choosePotion(state: GameState, potion: PotionType): GameState {
  return appendLog({ ...state, potion }, `Választott ital: ${potionLabel(potion)}.`)
}

export function potionLabel(potion: PotionType): string {
  if (potion === 'skill') return 'Ügyesség Itala'
  if (potion === 'stamina') return 'Erő Itala'
  return 'Szerencse Itala'
}

export function getCurrentNode(book: Book, state: GameState): BookNode | undefined {
  return book.nodes[state.currentNodeId]
}

export function isRequirementMet(state: GameState, requirement: Requirement): boolean {
  if (requirement.type === 'item') return state.inventory.includes(requirement.item)
  if (requirement.type === 'flag') return state.flags.includes(requirement.flag)
  if (requirement.type === 'gold') return state.gold >= requirement.amount
  return state.stamina >= requirement.amount
}

export function describeRequirement(requirement: Requirement): string {
  if (requirement.type === 'item') return `Szükséges: ${requirement.item}`
  if (requirement.type === 'flag') {
    if (requirement.flag.startsWith('defeated:')) {
      return `Csak harc után érhető el`
    }
    return `Esemény: ${requirement.flag}`
  }
  if (requirement.type === 'gold') return `Szükséges: ${requirement.amount} arany`
  return `Szükséges: ${requirement.amount} életerő`
}

export function isChoiceAvailable(state: GameState, choice: Choice): boolean {
  return (choice.requires ?? []).every((requirement) => isRequirementMet(state, requirement))
}

export function applyEffects(state: GameState, effects: Effect[]): GameState {
  return effects.reduce((current, effect) => {
    if (effect.type === 'addItem') {
      return appendLog({ ...current, inventory: uniqueAdd(current.inventory, effect.item) }, `Tárgy megszerezve: ${effect.item}.`)
    }
    if (effect.type === 'removeItem') {
      return appendLog({ ...current, inventory: removeValue(current.inventory, effect.item) }, `Tárgy elveszett: ${effect.item}.`)
    }
    if (effect.type === 'addGold' || effect.type === 'changeGold') {
      const gold = Math.max(0, current.gold + effect.amount)
      return appendLog({ ...current, gold }, `Arany változás: ${signed(effect.amount)}.`)
    }
    if (effect.type === 'changeSkill') {
      const skill = clamp(current.skill + effect.amount, 0, current.initialSkill)
      return appendLog({ ...current, skill }, `Ügyesség változás: ${signed(effect.amount)}.`)
    }
    if (effect.type === 'changeStamina') {
      const stamina = clamp(current.stamina + effect.amount, 0, current.initialStamina)
      const terminal = stamina <= 0 ? 'death' : current.terminal
      return appendLog({ ...current, stamina, terminal }, `Életerő változás: ${signed(effect.amount)}.`)
    }
    if (effect.type === 'changeLuck') {
      const luck = clamp(current.luck + effect.amount, 0, current.initialLuck)
      return appendLog({ ...current, luck }, `Szerencse változás: ${signed(effect.amount)}.`)
    }
    if (effect.type === 'addProvision') {
      const provisions = Math.max(0, current.provisions + effect.amount)
      return appendLog({ ...current, provisions }, `Élelem változás: ${signed(effect.amount)}.`)
    }
    if (effect.type === 'setFlag') {
      return { ...current, flags: uniqueAdd(current.flags, effect.flag) }
    }
    return { ...current, flags: removeValue(current.flags, effect.flag) }
  }, state)
}

export function enterNode(book: Book, state: GameState, nodeId: number): GameState {
  const node = book.nodes[nodeId]
  if (!node) {
    return appendLog(state, `Hibás célhivatkozás: ${nodeId}.`)
  }

  const entered: GameState = {
    ...state,
    currentNodeId: nodeId,
    terminal: node.terminal,
    combat:
      node.encounters.length > 0 && !node.encounters.every((enemy) => state.flags.includes(`defeated:${enemy.id}`))
        ? {
            nodeId,
            enemies: node.encounters.map<CombatEnemy>((enemy) => ({
              ...enemy,
              initialStamina: enemy.stamina,
            })),
            activeEnemyIndex: 0,
          }
        : undefined,
  }

  return applyEffects(entered, node.entryEffects)
}

export function resolveChoice(book: Book, state: GameState, choice: Choice): GameState {
  if (state.combat) {
    return appendLog(state, 'Harc közben nem választhatsz másik utat.')
  }
  if (!isChoiceAvailable(state, choice)) {
    return appendLog(state, 'A választás feltételei nem teljesülnek.')
  }

  const withEffects = applyEffects(state, choice.effects)
  const moved = {
    ...withEffects,
    history: [...withEffects.history, withEffects.currentNodeId],
  }
  return enterNode(book, moved, choice.target)
}

export function performCombatRound(state: GameState, die: RollDie = rollDie): GameState {
  if (!state.combat) return appendLog(state, 'Nincs aktív harc.')

  const enemy = state.combat.enemies[state.combat.activeEnemyIndex]
  if (!enemy) return { ...state, combat: undefined }

  const heroRoll = die() + die()
  const enemyRoll = die() + die()
  const heroAttack = state.skill + heroRoll
  const enemyAttack = enemy.skill + enemyRoll

  if (heroAttack > enemyAttack) {
    const damagedEnemy = { ...enemy, stamina: Math.max(0, enemy.stamina - 2) }
    const enemies = state.combat.enemies.map((candidate, index) =>
      index === state.combat?.activeEnemyIndex ? damagedEnemy : candidate,
    )
    const defeated = damagedEnemy.stamina <= 0
    const flags = defeated ? uniqueAdd(state.flags, `defeated:${enemy.id}`) : state.flags
    const nextEnemyIndex =
      defeated && state.combat.activeEnemyIndex < enemies.length - 1
        ? state.combat.activeEnemyIndex + 1
        : state.combat.activeEnemyIndex
    const allDefeated = enemies.every((candidate) => candidate.stamina <= 0)
    const round: CombatRound = {
      heroRoll,
      enemyRoll,
      heroAttack,
      enemyAttack,
      outcome: 'heroHit',
      luckUsed: false,
    }
    const combat =
      defeated && allDefeated
        ? undefined
        : { ...state.combat, enemies, activeEnemyIndex: nextEnemyIndex, lastRound: round }
    return appendLog(
      { ...state, flags, combat },
      defeated
        ? `${enemy.name} legyőzve. Támadóerő: ${heroAttack} / ${enemyAttack}.`
        : `${enemy.name} sebződött (2). Támadóerő: ${heroAttack} / ${enemyAttack}.`,
    )
  }

  if (enemyAttack > heroAttack) {
    const stamina = Math.max(0, state.stamina - 2)
    const terminal = stamina <= 0 ? 'death' : state.terminal
    const round: CombatRound = {
      heroRoll,
      enemyRoll,
      heroAttack,
      enemyAttack,
      outcome: 'enemyHit',
      luckUsed: false,
    }
    return appendLog(
      { ...state, stamina, terminal, combat: { ...state.combat, lastRound: round } },
      `${enemy.name} megsebez (2). Támadóerő: ${heroAttack} / ${enemyAttack}.`,
    )
  }

  const round: CombatRound = {
    heroRoll,
    enemyRoll,
    heroAttack,
    enemyAttack,
    outcome: 'parry',
    luckUsed: false,
  }
  return appendLog(
    { ...state, combat: { ...state.combat, lastRound: round } },
    `A csapások lepattannak. Támadóerő: ${heroAttack} / ${enemyAttack}.`,
  )
}

export function applyCombatLuck(
  state: GameState,
  intent: 'boost' | 'mitigate',
  die: RollDie = rollDie,
): GameState {
  if (!state.combat || !state.combat.lastRound || state.combat.lastRound.luckUsed) {
    return appendLog(state, 'Most nem használhatsz Szerencsét a harchoz.')
  }
  if (state.luck <= 0) {
    return appendLog(state, 'Elfogyott a Szerencséd.')
  }

  const roll = die() + die()
  const lucky = roll <= state.luck
  const luck = Math.max(0, state.luck - 1)
  const round = state.combat.lastRound
  const enemy = state.combat.enemies[state.combat.activeEnemyIndex]
  if (!enemy) return state

  let nextState: GameState = {
    ...state,
    luck,
    combat: { ...state.combat, lastRound: { ...round, luckUsed: true } },
  }

  if (intent === 'boost' && round.outcome === 'heroHit') {
    const delta = lucky ? -2 : +1
    const newEnemyStamina = clamp(enemy.stamina + delta, 0, enemy.initialStamina)
    const enemies = state.combat.enemies.map((candidate, index) =>
      index === state.combat?.activeEnemyIndex ? { ...enemy, stamina: newEnemyStamina } : candidate,
    )
    const defeated = newEnemyStamina <= 0
    const flags = defeated ? uniqueAdd(state.flags, `defeated:${enemy.id}`) : state.flags
    const allDefeated = enemies.every((candidate) => candidate.stamina <= 0)
    const nextEnemyIndex =
      defeated && state.combat.activeEnemyIndex < enemies.length - 1
        ? state.combat.activeEnemyIndex + 1
        : state.combat.activeEnemyIndex
    nextState = {
      ...nextState,
      flags,
      combat:
        defeated && allDefeated
          ? undefined
          : { ...state.combat, enemies, activeEnemyIndex: nextEnemyIndex, lastRound: { ...round, luckUsed: true } },
    }
    return appendLog(
      nextState,
      lucky
        ? `Szerencsés csapás! Az ellenfél +2 sebzést kap (${roll}).`
        : `Szerencsétlen csapás (${roll}). Csak 1 sebzés ment át.`,
    )
  }

  if (intent === 'mitigate' && round.outcome === 'enemyHit') {
    const delta = lucky ? +1 : -1
    const stamina = clamp(state.stamina + delta, 0, state.initialStamina)
    const terminal = stamina <= 0 ? 'death' : state.terminal
    return appendLog(
      { ...nextState, stamina, terminal },
      lucky
        ? `Szerencsésen elhajoltál a csapás elől (${roll}). +1 életerő.`
        : `Szerencsétlen elhajlás (${roll}). −1 további életerő.`,
    )
  }

  return appendLog(nextState, 'A Szerencse most nem hozott változást.')
}

export function fleeCombat(state: GameState): GameState {
  if (!state.combat) return state
  const stamina = Math.max(0, state.stamina - 2)
  const terminal = stamina <= 0 ? 'death' : state.terminal
  return appendLog(
    { ...state, stamina, terminal, combat: undefined },
    `Elmenekülsz a harcból (−2 életerő).`,
  )
}

export function testLuck(
  state: GameState,
  die: RollDie = rollDie,
  effects: { onLucky?: Effect[]; onUnlucky?: Effect[] } = {},
): { state: GameState; wasLucky: boolean; roll: number } {
  const roll = die() + die()
  const wasLucky = roll <= state.luck
  const luckSpent = { ...state, luck: Math.max(0, state.luck - 1) }
  const withEffects = applyEffects(luckSpent, wasLucky ? (effects.onLucky ?? []) : (effects.onUnlucky ?? []))
  return {
    state: appendLog(withEffects, wasLucky ? `Szerencsepróba sikerült (${roll}).` : `Szerencsepróba sikertelen (${roll}).`),
    wasLucky,
    roll,
  }
}

export function resolveLuckCheck(book: Book, state: GameState, die: RollDie = rollDie): GameState {
  const node = book.nodes[state.currentNodeId]
  if (!node?.luckCheck) {
    return appendLog(state, 'Itt nincs Szerencsepróba.')
  }
  const { state: rolled, wasLucky } = testLuck(state, die)
  const target = wasLucky ? node.luckCheck.onLucky : node.luckCheck.onUnlucky
  const moved = { ...rolled, history: [...rolled.history, rolled.currentNodeId] }
  return enterNode(book, moved, target)
}

export function resolveSkillCheck(book: Book, state: GameState, die: RollDie = rollDie): GameState {
  const node = book.nodes[state.currentNodeId]
  if (!node?.skillCheck) {
    return appendLog(state, 'Itt nincs Ügyességpróba.')
  }
  const roll = die() + die()
  const succeeded = roll <= state.skill
  const target = succeeded ? node.skillCheck.onSuccess : node.skillCheck.onFail
  const next = appendLog(
    { ...state, history: [...state.history, state.currentNodeId] },
    succeeded ? `Ügyességpróba sikerült (${roll}).` : `Ügyességpróba sikertelen (${roll}).`,
  )
  return enterNode(book, next, target)
}

export function useMeal(state: GameState): GameState {
  if (state.provisions <= 0) return appendLog(state, 'Nincs több élelmed.')
  const stamina = clamp(state.stamina + 4, 0, state.initialStamina)
  return appendLog({ ...state, stamina, provisions: state.provisions - 1 }, 'Ettél egy adag élelmet.')
}

export function usePotion(state: GameState): GameState {
  if (!state.potion) return appendLog(state, 'Nincs felhasználható italod.')
  if (state.potion === 'skill') {
    return appendLog({ ...state, skill: state.initialSkill, potion: undefined }, 'Az Ügyesség Itala hatott.')
  }
  if (state.potion === 'stamina') {
    return appendLog({ ...state, stamina: state.initialStamina, potion: undefined }, 'Az Erő Itala hatott.')
  }
  return appendLog(
    { ...state, luck: state.initialLuck + 1, initialLuck: state.initialLuck + 1, potion: undefined },
    'A Szerencse Itala hatott.',
  )
}

export function goBack(book: Book, state: GameState): GameState {
  const previous = state.history.at(-1)
  if (previous === undefined) return appendLog(state, 'Nincs korábbi bekezdés.')
  return enterNode(book, { ...state, history: state.history.slice(0, -1), combat: undefined }, previous)
}

export function serializeGame(state: GameState): VersionedSave {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state,
  }
}

export function deserializeGame(value: unknown): GameState | undefined {
  if (!isRecord(value)) return undefined
  if (value.version !== SAVE_VERSION) return undefined
  const state = value.state
  if (!isRecord(state) || typeof state.currentNodeId !== 'number') return undefined
  return state as GameState
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value)
}

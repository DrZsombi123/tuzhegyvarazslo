export type TerminalState = 'death' | 'victory'

export type PotionType = 'skill' | 'stamina' | 'luck'

export type Effect =
  | { type: 'addItem'; item: string }
  | { type: 'removeItem'; item: string }
  | { type: 'addGold'; amount: number }
  | { type: 'changeGold'; amount: number }
  | { type: 'changeSkill'; amount: number }
  | { type: 'changeStamina'; amount: number }
  | { type: 'changeLuck'; amount: number }
  | { type: 'addProvision'; amount: number }
  | { type: 'setFlag'; flag: string }
  | { type: 'clearFlag'; flag: string }

export type Requirement =
  | { type: 'item'; item: string }
  | { type: 'flag'; flag: string }
  | { type: 'gold'; amount: number }
  | { type: 'stamina'; amount: number }

export type Choice = {
  label: string
  target: number
  requires?: Requirement[]
  effects: Effect[]
}

export type Encounter = {
  id: string
  name: string
  skill: number
  stamina: number
}

export type LuckCheck = {
  onLucky: number
  onUnlucky: number
}

export type SkillCheck = {
  onSuccess: number
  onFail: number
}

export type BookNode = {
  id: number
  text: string
  choices: Choice[]
  encounters: Encounter[]
  entryEffects: Effect[]
  terminal?: TerminalState
  autoContinue?: boolean
  luckCheck?: LuckCheck
  skillCheck?: SkillCheck
}

export type BookMeta = {
  title: string
  source: string
  generatedAt: string
  nodeCount: number
}

export type Book = {
  meta: BookMeta
  nodes: Record<number, BookNode>
}

export type CombatEnemy = Encounter & {
  initialStamina: number
}

export type CombatLuckOutcome = 'pending' | 'used'

export type CombatState = {
  nodeId: number
  enemies: CombatEnemy[]
  activeEnemyIndex: number
  lastRound?: CombatRound
}

export type CombatRound = {
  heroRoll: number
  enemyRoll: number
  heroAttack: number
  enemyAttack: number
  outcome: 'heroHit' | 'enemyHit' | 'parry'
  luckUsed: boolean
}

export type GameState = {
  currentNodeId: number
  initialSkill: number
  skill: number
  initialStamina: number
  stamina: number
  initialLuck: number
  luck: number
  gold: number
  provisions: number
  inventory: string[]
  flags: string[]
  history: number[]
  log: string[]
  potion?: PotionType
  combat?: CombatState
  terminal?: TerminalState
}

export type VersionedSave = {
  version: 1
  savedAt: string
  state: GameState
}

export type RollDie = () => number

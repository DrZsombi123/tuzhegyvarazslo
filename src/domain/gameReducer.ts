import type { Book, Choice, GameState, PotionType, RollDie } from './types'
import {
  applyCombatLuck,
  choosePotion,
  deserializeGame,
  fleeCombat,
  goBack,
  performCombatRound,
  resolveChoice,
  resolveLuckCheck,
  resolveSkillCheck,
  startGame,
  testLuck,
  useMeal,
  usePotion,
} from './gameEngine'

export type GameAction =
  | { type: 'newGame' }
  | { type: 'choosePotion'; potion: PotionType }
  | { type: 'choose'; choice: Choice }
  | { type: 'combatRound' }
  | { type: 'combatLuck'; intent: 'boost' | 'mitigate' }
  | { type: 'fleeCombat' }
  | { type: 'testLuck' }
  | { type: 'resolveLuckCheck' }
  | { type: 'resolveSkillCheck' }
  | { type: 'eat' }
  | { type: 'drinkPotion' }
  | { type: 'back' }
  | { type: 'load'; value: unknown }

export function createGameReducer(book: Book, die?: RollDie) {
  return (state: GameState, action: GameAction): GameState => {
    if (action.type === 'newGame') return startGame(book, die)
    if (action.type === 'choosePotion') return choosePotion(state, action.potion)
    if (action.type === 'choose') return resolveChoice(book, state, action.choice)
    if (action.type === 'combatRound') return performCombatRound(state, die)
    if (action.type === 'combatLuck') return applyCombatLuck(state, action.intent, die)
    if (action.type === 'fleeCombat') return fleeCombat(state)
    if (action.type === 'testLuck') return testLuck(state, die).state
    if (action.type === 'resolveLuckCheck') return resolveLuckCheck(book, state, die)
    if (action.type === 'resolveSkillCheck') return resolveSkillCheck(book, state, die)
    if (action.type === 'eat') return useMeal(state)
    if (action.type === 'drinkPotion') return usePotion(state)
    if (action.type === 'back') return goBack(book, state)
    const loaded = deserializeGame(action.value)
    return loaded && book.nodes[loaded.currentNodeId] ? loaded : state
  }
}

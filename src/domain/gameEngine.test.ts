import { describe, expect, it } from 'vitest'
import type { Book, BookNode, Choice, GameState } from './types'
import {
  applyCombatLuck,
  choosePotion,
  createInitialState,
  fleeCombat,
  performCombatRound,
  resolveChoice,
  resolveLuckCheck,
  resolveSkillCheck,
  serializeGame,
  testLuck,
  useMeal,
  usePotion,
} from './gameEngine'

const node = (id: number, choices: Choice[] = []): BookNode => ({
  id,
  text: `Teszt bekezdés ${id}`,
  choices,
  encounters: [],
  entryEffects: [],
})

const book: Book = {
  meta: {
    title: 'Teszt KJK',
    source: 'unit-test',
    generatedAt: '2026-05-23T00:00:00.000Z',
    nodeCount: 6,
  },
  nodes: {
    1: node(1, [{ label: 'Menj tovább', target: 2, effects: [{ type: 'addGold', amount: 2 }] }]),
    2: {
      ...node(2),
      encounters: [{ id: 'goblin', name: 'Goblin', skill: 1, stamina: 2 }],
    },
    3: node(3),
    4: { ...node(4), terminal: 'victory' },
    5: { ...node(5), luckCheck: { onLucky: 3, onUnlucky: 1 } },
    6: { ...node(6), skillCheck: { onSuccess: 4, onFail: 1 } },
  },
}

const fixedRolls = (...values: number[]) => {
  let index = 0
  return () => {
    const value = values[index]
    index += 1
    if (value === undefined) {
      throw new Error('Elfogytak a tesztdobások')
    }
    return value
  }
}

describe('game engine', () => {
  it('generates a legal KJK character with starting equipment', () => {
    const state = createInitialState(book, fixedRolls(6, 2, 2, 5))

    expect(state.initialSkill).toBe(12)
    expect(state.initialStamina).toBe(16)
    expect(state.initialLuck).toBe(11)
    expect(state.inventory).toContain('Kard')
    expect(state.provisions).toBe(10)
    expect(state.currentNodeId).toBe(1)
  })

  it('applies choice effects and records history', () => {
    const state = createInitialState(book, fixedRolls(1, 1, 1, 1))
    const next = resolveChoice(book, state, book.nodes[1].choices[0])

    expect(next.currentNodeId).toBe(2)
    expect(next.gold).toBe(2)
    expect(next.history).toEqual([1])
  })

  it('runs combat rounds using attack strength rolls and records last round', () => {
    const state = {
      ...createInitialState(book, fixedRolls(1, 1, 1, 1)),
      currentNodeId: 2,
      skill: 7,
      stamina: 20,
      initialStamina: 20,
      combat: {
        nodeId: 2,
        enemies: [{ id: 'goblin', name: 'Goblin', skill: 5, stamina: 2, initialStamina: 2 }],
        activeEnemyIndex: 0,
      },
      log: [],
    } satisfies GameState

    const next = performCombatRound(state, fixedRolls(6, 6, 1, 1))

    expect(next.combat).toBeUndefined()
    expect(next.flags).toContain('defeated:goblin')
    expect(next.stamina).toBe(20)
  })

  it('records lastRound metadata when the enemy survives', () => {
    const state = {
      ...createInitialState(book, fixedRolls(1, 1, 1, 1)),
      skill: 7,
      stamina: 20,
      initialStamina: 20,
      combat: {
        nodeId: 2,
        enemies: [{ id: 'goblin', name: 'Goblin', skill: 5, stamina: 6, initialStamina: 6 }],
        activeEnemyIndex: 0,
      },
      log: [],
    } satisfies GameState

    const next = performCombatRound(state, fixedRolls(6, 6, 1, 1))

    expect(next.combat?.lastRound?.outcome).toBe('heroHit')
    expect(next.combat?.lastRound?.luckUsed).toBe(false)
    expect(next.combat?.enemies[0].stamina).toBe(4)
  })

  it('applies combat Szerencse to boost a hero hit', () => {
    const state = {
      ...createInitialState(book, fixedRolls(1, 1, 1, 1)),
      luck: 10,
      skill: 7,
      stamina: 20,
      initialStamina: 20,
      combat: {
        nodeId: 2,
        enemies: [{ id: 'goblin', name: 'Goblin', skill: 5, stamina: 6, initialStamina: 6 }],
        activeEnemyIndex: 0,
        lastRound: {
          heroRoll: 12,
          enemyRoll: 4,
          heroAttack: 19,
          enemyAttack: 9,
          outcome: 'heroHit' as const,
          luckUsed: false,
        },
      },
      log: [],
    } satisfies GameState

    const next = applyCombatLuck(state, 'boost', fixedRolls(2, 1))

    expect(next.luck).toBe(9)
    expect(next.combat?.lastRound?.luckUsed).toBe(true)
    expect(next.combat?.enemies[0].stamina).toBe(4)
  })

  it('tests luck, decrements luck, and applies damage mitigation', () => {
    const state = {
      ...createInitialState(book, fixedRolls(1, 1, 1, 1)),
      luck: 8,
      stamina: 10,
      log: [],
    }

    const lucky = testLuck(state, fixedRolls(3, 4), { onLucky: [{ type: 'changeStamina', amount: 1 }] })
    const unlucky = testLuck(lucky.state, fixedRolls(6, 6), {
      onUnlucky: [{ type: 'changeStamina', amount: -2 }],
    })

    expect(lucky.wasLucky).toBe(true)
    expect(unlucky.wasLucky).toBe(false)
    expect(unlucky.state.luck).toBe(6)
    expect(unlucky.state.stamina).toBe(9)
  })

  it('resolves a node level Szerencse-próba into the correct target', () => {
    const state: GameState = {
      ...createInitialState(book, fixedRolls(1, 1, 1, 1)),
      currentNodeId: 5,
      luck: 12,
      log: [],
    }
    const next = resolveLuckCheck(book, state, fixedRolls(3, 4))

    expect(next.currentNodeId).toBe(3)
    expect(next.luck).toBe(11)
    expect(next.history).toContain(5)
  })

  it('resolves a node level Ügyesség-próba into the correct target', () => {
    const state: GameState = {
      ...createInitialState(book, fixedRolls(1, 1, 1, 1)),
      currentNodeId: 6,
      skill: 10,
      log: [],
    }
    const next = resolveSkillCheck(book, state, fixedRolls(2, 3))

    expect(next.currentNodeId).toBe(4)
    expect(next.history).toContain(6)
  })

  it('flees combat with the stamina cost', () => {
    const state: GameState = {
      ...createInitialState(book, fixedRolls(1, 1, 1, 1)),
      stamina: 10,
      combat: {
        nodeId: 2,
        enemies: [{ id: 'goblin', name: 'Goblin', skill: 5, stamina: 2, initialStamina: 2 }],
        activeEnemyIndex: 0,
      },
    }
    const next = fleeCombat(state)

    expect(next.combat).toBeUndefined()
    expect(next.stamina).toBe(8)
  })

  it('uses meals and potions without exceeding initial values', () => {
    const state = {
      ...choosePotion(createInitialState(book, fixedRolls(1, 1, 1, 1)), 'luck'),
      stamina: 5,
      luck: 4,
      provisions: 1,
    }

    const fed = useMeal(state)
    const restored = usePotion(fed)

    expect(fed.stamina).toBe(9)
    expect(fed.provisions).toBe(0)
    expect(restored.initialLuck).toBe(state.initialLuck + 1)
    expect(restored.luck).toBe(restored.initialLuck)
    expect(restored.potion).toBeUndefined()
  })

  it('serializes versioned saves and rejects wrong versions', () => {
    const state = createInitialState(book, fixedRolls(1, 1, 1, 1))
    const saved = serializeGame(state)

    expect(saved.version).toBe(1)
    expect(saved.state.currentNodeId).toBe(1)
  })
})

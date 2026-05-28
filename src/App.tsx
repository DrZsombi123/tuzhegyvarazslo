import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import {
  Backpack,
  Coins,
  Dice5,
  FlaskConical,
  Footprints,
  HeartPulse,
  Lock,
  RotateCcw,
  Save,
  ScrollText,
  Sparkles,
  Sword,
  Swords,
  Undo2,
  Upload,
  Utensils,
} from 'lucide-react'
import './App.css'
import { loadBook, type LoadedBook } from './data/bookLoader'
import {
  describeRequirement,
  getCurrentNode,
  isChoiceAvailable,
  serializeGame,
  startGame,
} from './domain/gameEngine'
import { createGameReducer } from './domain/gameReducer'
import type { Choice, GameState, PotionType, Requirement, TerminalState } from './domain/types'

const SAVE_KEY = 'tuzhegyvarazslo.save.v1'

type Toast = { id: number; message: string; tone?: 'success' | 'info' }

function App() {
  const [loadedBook, setLoadedBook] = useState<LoadedBook>()
  const [loadError, setLoadError] = useState<string>()

  useEffect(() => {
    let alive = true
    loadBook()
      .then((result) => {
        if (alive) setLoadedBook(result)
      })
      .catch((error: unknown) => {
        if (alive) setLoadError(error instanceof Error ? error.message : 'Ismeretlen betöltési hiba.')
      })
    return () => {
      alive = false
    }
  }, [])

  if (loadError) {
    return <ShellMessage title="Nem sikerült betölteni a könyvet" body={loadError} />
  }

  if (!loadedBook) {
    return (
      <ShellMessage
        title="Könyvadat betöltése"
        body="A helyi vagy demo JSON adat előkészítése folyamatban van."
      />
    )
  }

  return <GameApp loadedBook={loadedBook} />
}

function GameApp({ loadedBook }: { loadedBook: LoadedBook }) {
  const reducer = useMemo(() => createGameReducer(loadedBook.book), [loadedBook.book])
  const initialState = useMemo(() => startGame(loadedBook.book), [loadedBook.book])
  const [state, dispatch] = useReducer(reducer, initialState)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [savedFlash, setSavedFlash] = useState(false)
  const [diceTick, setDiceTick] = useState(0)
  const node = getCurrentNode(loadedBook.book, state)

  const showToast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message, tone }])
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 2600)
  }, [])

  const saveGame = useCallback(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializeGame(state)))
    showToast('Mentés kész.', 'success')
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1600)
  }, [state, showToast])

  const loadGame = useCallback(() => {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) {
      showToast('Nincs mentett állás.')
      return
    }
    try {
      const parsed = JSON.parse(raw)
      dispatch({ type: 'load', value: parsed })
      showToast('Mentés betöltve.', 'success')
    } catch {
      showToast('A mentett fájl sérült.')
    }
  }, [dispatch, showToast])

  const choose = useCallback(
    (choice: Choice) => {
      dispatch({ type: 'choose', choice })
    },
    [dispatch],
  )

  const handleCombatRound = useCallback(() => {
    setDiceTick((tick) => tick + 1)
    dispatch({ type: 'combatRound' })
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.altKey || event.ctrlKey || event.metaKey) return

      const key = event.key.toLowerCase()
      if (key === 'e') {
        event.preventDefault()
        dispatch({ type: 'eat' })
      } else if (key === 'i') {
        event.preventDefault()
        dispatch({ type: 'drinkPotion' })
      } else if (key === 'l') {
        event.preventDefault()
        dispatch({ type: 'testLuck' })
      } else if (key === 'h') {
        event.preventDefault()
        if (state.combat) handleCombatRound()
      } else if (key === 'escape') {
        event.preventDefault()
        dispatch({ type: 'back' })
      } else if (/^[1-9]$/.test(event.key) && node) {
        const choiceIndex = Number(event.key) - 1
        const target = node.choices[choiceIndex]
        if (target && isChoiceAvailable(state, target) && !state.combat && !state.terminal) {
          event.preventDefault()
          choose(target)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choose, dispatch, handleCombatRound, node, state])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-title">
          <p className="eyebrow">Kaland-Játék-Kockázat</p>
          <h1>A Tűzhegy Varázslója</h1>
        </div>
        <div className="topbar-actions" aria-label="Játékműveletek">
          <IconButton label="Új játék" onClick={() => dispatch({ type: 'newGame' })}>
            <RotateCcw size={18} />
          </IconButton>
          <IconButton label="Vissza" onClick={() => dispatch({ type: 'back' })}>
            <Undo2 size={18} />
          </IconButton>
          <IconButton label="Mentés" onClick={saveGame} flash={savedFlash}>
            <Save size={18} />
          </IconButton>
          <IconButton label="Betöltés" onClick={loadGame}>
            <Upload size={18} />
          </IconButton>
        </div>
      </header>

      <section className="source-strip" aria-label="Könyv-metaadatok">
        <span className="pill">
          <ScrollText size={14} />
          {loadedBook.book.meta.nodeCount} bekezdés
        </span>
        <span className="pill">{loadedBook.isGenerated ? 'Teljes PDF-kivonat' : 'Demo adat'}</span>
        <span className="source-path" title={loadedBook.sourcePath}>{loadedBook.sourcePath}</span>
        <span className="kbd-hint">
          <kbd>1</kbd>–<kbd>9</kbd> választás · <kbd>E</kbd> étkezés · <kbd>I</kbd> ital · <kbd>L</kbd> Szerencse · <kbd>H</kbd> harc · <kbd>Esc</kbd> vissza
        </span>
      </section>

      <div className="game-layout">
        <article className="reader-panel">
          {node ? (
            <>
              <div className="node-header">
                <span className="node-number">
                  <ScrollText className="scroll-icon" />#{node.id}
                </span>
                {node.terminal ? (
                  <span className={`terminal terminal-${node.terminal}`}>{terminalLabel(node.terminal)}</span>
                ) : null}
              </div>

              <PotionChooser state={state} onChoose={(potion) => dispatch({ type: 'choosePotion', potion })} />

              <p className="story-text">{node.text}</p>

              {state.combat ? (
                <CombatPanel
                  state={state}
                  diceTick={diceTick}
                  onRound={handleCombatRound}
                  onFlee={() => dispatch({ type: 'fleeCombat' })}
                  onLuck={(intent) => dispatch({ type: 'combatLuck', intent })}
                />
              ) : null}

              {!state.combat && node.luckCheck ? (
                <LuckCheckPanel onResolve={() => dispatch({ type: 'resolveLuckCheck' })} />
              ) : null}

              {!state.combat && node.skillCheck ? (
                <SkillCheckPanel onResolve={() => dispatch({ type: 'resolveSkillCheck' })} />
              ) : null}

              <ChoicesSection state={state} node={node} onChoose={choose} />
            </>
          ) : (
            <ShellMessage title="Hibás állapot" body={`Nem létezik ez a bekezdés: ${state.currentNodeId}`} />
          )}
        </article>

        <aside className="side-panel">
          <CharacterSheet state={state} />
          <ActionPanel
            state={state}
            onEat={() => dispatch({ type: 'eat' })}
            onPotion={() => dispatch({ type: 'drinkPotion' })}
            onLuck={() => dispatch({ type: 'testLuck' })}
          />
          <LogPanel state={state} />
        </aside>
      </div>

      <div className="toast-region" aria-live="polite" role="status">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone ?? 'info'}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </main>
  )
}

function ChoicesSection({
  state,
  node,
  onChoose,
}: {
  state: GameState
  node: ReturnType<typeof getCurrentNode> & {}
  onChoose: (choice: Choice) => void
}) {
  if (node.choices.length === 0) {
    return (
      <p className="empty-state">
        {node.terminal
          ? 'Ez a kaland aktuális végállapota. Új játékkal vagy mentett állás betöltésével folytathatod.'
          : 'Ehhez a bekezdéshez nincs felismert továbblépési hivatkozás. (A demo annotációkkal pótolható.)'}
      </p>
    )
  }

  if (node.autoContinue && node.choices.length === 1) {
    const choice = node.choices[0]
    const available = isChoiceAvailable(state, choice) && !state.combat && !state.terminal
    return (
      <section className="choices" aria-label="Folytatás">
        <button className="choice-button primary" type="button" disabled={!available} onClick={() => onChoose(choice)}>
          <span className="choice-marker">→</span>
          <span>{choice.label === 'Tovább' ? 'Tovább a kalandban' : choice.label}</span>
          <Footprints size={18} className="choice-arrow" />
        </button>
      </section>
    )
  }

  return (
    <section className="choices" aria-label="Választások">
      <div className="choices-title">Válaszd ki az utad</div>
      {node.choices.map((choice, index) => {
        const requirementsMet = isChoiceAvailable(state, choice)
        const available = requirementsMet && !state.combat && !state.terminal
        const missingReqs = (choice.requires ?? []).filter((req) => !isRequirementMetSimple(state, req))
        return (
          <button
            className="choice-button"
            type="button"
            key={`${choice.target}-${index}`}
            disabled={!available}
            onClick={() => onChoose(choice)}
            aria-keyshortcuts={index < 9 ? `${index + 1}` : undefined}
          >
            <span className="choice-marker">{index + 1}</span>
            <span>
              {choice.label}
              {missingReqs.length > 0 ? (
                <span className="lock-indicator">
                  <Lock size={11} />
                  {missingReqs.map((req) => describeRequirement(req)).join(' · ')}
                </span>
              ) : null}
            </span>
            <Footprints size={18} className="choice-arrow" />
          </button>
        )
      })}
    </section>
  )
}

function isRequirementMetSimple(state: GameState, requirement: Requirement): boolean {
  if (requirement.type === 'item') return state.inventory.includes(requirement.item)
  if (requirement.type === 'flag') return state.flags.includes(requirement.flag)
  if (requirement.type === 'gold') return state.gold >= requirement.amount
  return state.stamina >= requirement.amount
}

function PotionChooser({ state, onChoose }: { state: GameState; onChoose: (potion: PotionType) => void }) {
  if (state.potion) return null
  return (
    <section className="potion-chooser" aria-label="Indulóital">
      <div className="lead">
        <strong>Válassz indulóitalt</strong>
        A kalandod megkezdése előtt egy adag varázsital jár. Melyiket viszed magaddal?
      </div>
      <button type="button" onClick={() => onChoose('skill')}>
        Ügyesség
      </button>
      <button type="button" onClick={() => onChoose('stamina')}>
        Erő
      </button>
      <button type="button" onClick={() => onChoose('luck')}>
        Szerencse
      </button>
    </section>
  )
}

function CombatPanel({
  state,
  diceTick,
  onRound,
  onFlee,
  onLuck,
}: {
  state: GameState
  diceTick: number
  onRound: () => void
  onFlee: () => void
  onLuck: (intent: 'boost' | 'mitigate') => void
}) {
  const combat = state.combat
  if (!combat) return null
  const enemy = combat.enemies[combat.activeEnemyIndex]
  if (!enemy) return null
  const round = combat.lastRound
  const luckAvailable = round && !round.luckUsed && state.luck > 0
  const luckIntent: 'boost' | 'mitigate' | null = round?.outcome === 'heroHit' ? 'boost' : round?.outcome === 'enemyHit' ? 'mitigate' : null
  const enemyHpPct = Math.max(0, Math.min(100, (enemy.stamina / Math.max(1, enemy.initialStamina)) * 100))

  return (
    <section className="combat-panel" aria-label="Harc" role="region">
      <div className="combat-head">
        <div>
          <p className="eyebrow">Harc</p>
          <h2>{enemy.name}</h2>
        </div>
        <div className="enemy-stats">
          <div className="badge">
            <span className="label">Ügyesség</span>
            <span className="value">{enemy.skill}</span>
          </div>
          <div className="badge">
            <span className="label">Életerő</span>
            <span className="value">{enemy.stamina} / {enemy.initialStamina}</span>
          </div>
        </div>
      </div>

      <div className="enemy-bar" aria-hidden>
        <span style={{ width: `${enemyHpPct}%` }} />
      </div>

      <div className="dice-row" aria-hidden>
        <span key={`hero-${diceTick}`} className={diceTick > 0 ? 'die rolling' : 'die'}>
          {round?.heroRoll ?? '?'}
        </span>
        <span key={`enemy-${diceTick}`} className={diceTick > 0 ? 'die rolling' : 'die'}>
          {round?.enemyRoll ?? '?'}
        </span>
      </div>

      {round ? (
        <div
          className={`combat-round-summary ${round.outcome === 'heroHit' ? 'hero-win' : round.outcome === 'enemyHit' ? 'enemy-win' : ''}`}
          role="status"
          aria-live="polite"
        >
          <div className="actor">
            <span className="label">Te</span>
            <span className="value">{round.heroAttack}</span>
          </div>
          <div className="actor">
            <span className="label">{enemy.name}</span>
            <span className="value">{round.enemyAttack}</span>
          </div>
        </div>
      ) : (
        <p className="empty-state">A harc kezdődik. Üsd meg a Harci kör gombot.</p>
      )}

      <div className={`combat-actions ${state.luck > 0 ? '' : 'solo'}`}>
        <button className="primary-command" type="button" onClick={onRound}>
          <Swords size={18} />
          Harci kör
        </button>
        <button className="primary-command secondary" type="button" onClick={onFlee}>
          <Footprints size={18} />
          Menekülés (−2 életerő)
        </button>
      </div>

      {luckAvailable && luckIntent ? (
        <div className="luck-choice-panel">
          <header>
            <Sparkles size={16} color="var(--gold)" />
            <span className="label">Szerencsét kérsz?</span>
          </header>
          <p>
            {luckIntent === 'boost'
              ? 'Próbára teheted a Szerencséd, hogy keményebbet üss. Siker esetén +2 sebzés ellenfélen, kudarc esetén csak 1 sebzés.'
              : 'Próbára teheted a Szerencséd, hogy csillapítsd a sebződést. Siker esetén +1 életerő, kudarc esetén további −1.'}
          </p>
          <button className="luck-button" type="button" onClick={() => onLuck(luckIntent)}>
            Szerencsepróba (1 luck)
          </button>
        </div>
      ) : null}
    </section>
  )
}

function LuckCheckPanel({ onResolve }: { onResolve: () => void }) {
  return (
    <div className="luck-choice-panel">
      <header>
        <Sparkles size={16} color="var(--gold)" />
        <span className="label">Tedd próbára Szerencsédet</span>
      </header>
      <p>A bekezdés sorsod a Szerencsétől függ. A próba 1 pontot fogyaszt belőle.</p>
      <button className="luck-button" type="button" onClick={onResolve}>
        Szerencsepróba
      </button>
    </div>
  )
}

function SkillCheckPanel({ onResolve }: { onResolve: () => void }) {
  return (
    <div className="luck-choice-panel">
      <header>
        <Sword size={16} color="var(--gold)" />
        <span className="label">Tedd próbára Ügyességedet</span>
      </header>
      <p>A folytatás az Ügyességeden múlik. Két kockával az aktuális Ügyesség alatt kell maradnod.</p>
      <button className="luck-button" type="button" onClick={onResolve}>
        Ügyességpróba
      </button>
    </div>
  )
}

function CharacterSheet({ state }: { state: GameState }) {
  return (
    <section className="sheet" aria-label="Karakterlap">
      <h2>Karakterlap</h2>
      <div className="stat-grid">
        <StatBar
          icon={<Sword size={18} />}
          label="Ügyesség"
          value={`${state.skill} / ${state.initialSkill}`}
          ratio={state.skill / Math.max(1, state.initialSkill)}
          variant="default"
        />
        <StatBar
          icon={<HeartPulse size={18} />}
          label="Életerő"
          value={`${state.stamina} / ${state.initialStamina}`}
          ratio={state.stamina / Math.max(1, state.initialStamina)}
          variant="stamina"
        />
        <StatBar
          icon={<Sparkles size={18} />}
          label="Szerencse"
          value={`${state.luck} / ${state.initialLuck}`}
          ratio={state.luck / Math.max(1, state.initialLuck)}
          variant="luck"
        />
        <Stat icon={<Coins size={18} />} label="Arany" value={state.gold} />
        <Stat icon={<Utensils size={18} />} label="Élelem" value={state.provisions} />
        <Stat icon={<FlaskConical size={18} />} label="Ital" value={state.potion ? potionName(state.potion) : 'nincs'} />
      </div>
      <div className="inventory">
        <div className="section-title">
          <Backpack size={14} />
          <span>Felszerelés</span>
        </div>
        <ul>
          {state.inventory.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function StatBar({
  icon,
  label,
  value,
  ratio,
  variant,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  ratio: number
  variant: 'default' | 'stamina' | 'luck'
}) {
  const pct = Math.max(0, Math.min(100, ratio * 100))
  const barClass = variant === 'stamina' ? 'bar-stamina' : variant === 'luck' ? 'bar-luck' : ''
  return (
    <div className="stat">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
      <div className={`stat-bar ${barClass}`} aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ActionPanel({
  state,
  onEat,
  onPotion,
  onLuck,
}: {
  state: GameState
  onEat: () => void
  onPotion: () => void
  onLuck: () => void
}) {
  return (
    <section className="actions-panel" aria-label="Gyors műveletek">
      <button type="button" onClick={onEat} disabled={state.provisions <= 0 || Boolean(state.terminal)}>
        <Utensils size={18} />
        Étkezés
      </button>
      <button type="button" onClick={onPotion} disabled={!state.potion || Boolean(state.terminal)}>
        <FlaskConical size={18} />
        Ital
      </button>
      <button type="button" onClick={onLuck} disabled={state.luck <= 0 || Boolean(state.terminal)}>
        <Dice5 size={18} />
        Szerencse
      </button>
    </section>
  )
}

function LogPanel({ state }: { state: GameState }) {
  return (
    <section className="log-panel" aria-label="Dobás- és eseménynapló">
      <h2>Dobásnapló</h2>
      <ol aria-live="polite">
        {state.log.slice(0, 8).map((entry, index) => (
          <li key={`${entry}-${index}`}>{entry}</li>
        ))}
      </ol>
    </section>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="stat">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function IconButton({
  children,
  label,
  onClick,
  flash,
}: {
  children: ReactNode
  label: string
  onClick: () => void
  flash?: boolean
}) {
  return (
    <button
      type="button"
      className={`icon-button ${flash ? 'flash' : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

function ShellMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="app-shell shell-message">
      <section>
        <p className="eyebrow">Kaland-Játék-Kockázat</p>
        <h1>{title}</h1>
        <p>{body}</p>
      </section>
    </main>
  )
}

function terminalLabel(terminal: TerminalState) {
  return terminal === 'victory' ? 'Győzelem' : 'Kalandod itt véget ért'
}

function potionName(potion: PotionType) {
  if (potion === 'skill') return 'Ügyesség'
  if (potion === 'stamina') return 'Erő'
  return 'Szerencse'
}

export default App

import type {
  Book,
  BookNode,
  Choice,
  Effect,
  Encounter,
  LuckCheck,
  Requirement,
  SkillCheck,
  TerminalState,
} from '../domain/types'

const BOOK_CANDIDATES = ['/data/book.generated.json', '/data/book.sample.json']

export type LoadedBook = {
  book: Book
  sourcePath: string
  isGenerated: boolean
}

export async function loadBook(): Promise<LoadedBook> {
  const errors: string[] = []
  for (const path of BOOK_CANDIDATES) {
    try {
      const response = await fetch(path, { cache: 'no-cache' })
      if (!response.ok) {
        errors.push(`${path}: HTTP ${response.status}`)
        continue
      }
      const raw = await response.json()
      const book = normalizeBook(raw)
      if (book.meta.nodeCount === 0 || Object.keys(book.nodes).length === 0) {
        errors.push(`${path}: üres könyvadat`)
        continue
      }
      return {
        book,
        sourcePath: path,
        isGenerated: path.includes('generated'),
      }
    } catch (error) {
      errors.push(`${path}: ${error instanceof Error ? error.message : 'ismeretlen hiba'}`)
    }
  }
  throw new Error(`Nem található betölthető könyvadat. Részletek: ${errors.join(' | ')}`)
}

const LAPOZZ_LABEL_RE = /\blapozz\b/i

function looksLikeBadLabel(label: string): boolean {
  const trimmed = label.trim()
  if (trimmed.length < 3) return true
  if (LAPOZZ_LABEL_RE.test(trimmed)) return true
  if (/^[.,;:!?\s]/.test(trimmed)) return true
  return false
}

function deriveFallbackLabelFromText(text: string, target: number): string | undefined {
  const escaped = String(target).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?:^|[^\\d])(?:Ha|ha)\\s+([^.!?,\\n]{3,120}?),\\s*lapozz\\s+(?:a|az)\\s+${escaped}\\b`, 'i')
  const match = text.match(re)
  if (!match) return undefined
  return cleanLabel(`Ha ${match[1]}`)
}

function cleanLabel(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').replace(/^[\s,;:.\-—]+|[\s,;:.\-—]+$/g, '')
  if (!cleaned) return 'Folytatás'
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

export function normalizeBook(value: unknown): Book {
  if (!isRecord(value) || !isRecord(value.meta) || !isRecord(value.nodes)) {
    throw new Error('Hibás könyvadat formátum.')
  }

  const nodes: Record<number, BookNode> = {}
  for (const [key, nodeValue] of Object.entries(value.nodes)) {
    const node = normalizeNode(Number(key), nodeValue)
    nodes[node.id] = repairChoiceLabels(node)
  }

  return {
    meta: {
      title: String(value.meta.title ?? 'KJK kaland'),
      source: String(value.meta.source ?? 'unknown'),
      generatedAt: String(value.meta.generatedAt ?? ''),
      nodeCount: Number(value.meta.nodeCount ?? Object.keys(nodes).length),
    },
    nodes,
  }
}

function repairChoiceLabels(node: BookNode): BookNode {
  const choices = node.choices.map((choice) => {
    if (!looksLikeBadLabel(choice.label)) return choice
    const fallback = deriveFallbackLabelFromText(node.text, choice.target)
    return { ...choice, label: fallback ?? 'Folytatás' }
  })
  return { ...node, choices }
}

function normalizeNode(idFromKey: number, value: unknown): BookNode {
  if (!isRecord(value)) throw new Error(`Hibás bekezdés: ${idFromKey}`)
  const node: BookNode = {
    id: Number(value.id ?? idFromKey),
    text: String(value.text ?? ''),
    choices: Array.isArray(value.choices) ? value.choices.map(normalizeChoice) : [],
    encounters: Array.isArray(value.encounters) ? value.encounters.map(normalizeEncounter) : [],
    entryEffects: Array.isArray(value.entryEffects) ? value.entryEffects.map(normalizeEffect).filter(isEffect) : [],
    terminal: normalizeTerminal(value.terminal),
  }
  if (value.autoContinue === true) node.autoContinue = true
  const luckCheck = normalizeLuckCheck(value.luckCheck)
  if (luckCheck) node.luckCheck = luckCheck
  const skillCheck = normalizeSkillCheck(value.skillCheck)
  if (skillCheck) node.skillCheck = skillCheck
  return node
}

function normalizeChoice(value: unknown): Choice {
  if (!isRecord(value)) throw new Error('Hibás választás.')
  return {
    label: String(value.label ?? 'Tovább'),
    target: Number(value.target),
    requires: Array.isArray(value.requires) ? value.requires.map(normalizeRequirement).filter(isRequirement) : undefined,
    effects: Array.isArray(value.effects) ? value.effects.map(normalizeEffect).filter(isEffect) : [],
  }
}

function normalizeEncounter(value: unknown): Encounter {
  if (!isRecord(value)) throw new Error('Hibás ellenfél.')
  return {
    id: String(value.id ?? value.name ?? 'ellenfel'),
    name: String(value.name ?? 'Ellenfél'),
    skill: Number(value.skill ?? 6),
    stamina: Number(value.stamina ?? 6),
  }
}

function normalizeRequirement(value: unknown): Requirement | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined
  if (value.type === 'item') return { type: 'item', item: String(value.item ?? '') }
  if (value.type === 'flag') return { type: 'flag', flag: String(value.flag ?? '') }
  if (value.type === 'gold') return { type: 'gold', amount: Number(value.amount ?? 0) }
  if (value.type === 'stamina') return { type: 'stamina', amount: Number(value.amount ?? 0) }
  return undefined
}

function normalizeEffect(value: unknown): Effect | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined
  if (value.type === 'addItem') return { type: 'addItem', item: String(value.item ?? '') }
  if (value.type === 'removeItem') return { type: 'removeItem', item: String(value.item ?? '') }
  if (value.type === 'addGold') return { type: 'addGold', amount: Number(value.amount ?? 0) }
  if (value.type === 'changeGold') return { type: 'changeGold', amount: Number(value.amount ?? 0) }
  if (value.type === 'changeSkill') return { type: 'changeSkill', amount: Number(value.amount ?? 0) }
  if (value.type === 'changeStamina') return { type: 'changeStamina', amount: Number(value.amount ?? 0) }
  if (value.type === 'changeLuck') return { type: 'changeLuck', amount: Number(value.amount ?? 0) }
  if (value.type === 'addProvision') return { type: 'addProvision', amount: Number(value.amount ?? 0) }
  if (value.type === 'setFlag') return { type: 'setFlag', flag: String(value.flag ?? '') }
  if (value.type === 'clearFlag') return { type: 'clearFlag', flag: String(value.flag ?? '') }
  return undefined
}

function normalizeTerminal(value: unknown): TerminalState | undefined {
  if (value === 'death' || value === 'victory') return value
  return undefined
}

function normalizeLuckCheck(value: unknown): LuckCheck | undefined {
  if (!isRecord(value)) return undefined
  const onLucky = Number(value.onLucky)
  const onUnlucky = Number(value.onUnlucky)
  if (!Number.isFinite(onLucky) || !Number.isFinite(onUnlucky)) return undefined
  return { onLucky, onUnlucky }
}

function normalizeSkillCheck(value: unknown): SkillCheck | undefined {
  if (!isRecord(value)) return undefined
  const onSuccess = Number(value.onSuccess)
  const onFail = Number(value.onFail)
  if (!Number.isFinite(onSuccess) || !Number.isFinite(onFail)) return undefined
  return { onSuccess, onFail }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isEffect(value: Effect | undefined): value is Effect {
  return value !== undefined
}

function isRequirement(value: Requirement | undefined): value is Requirement {
  return value !== undefined
}

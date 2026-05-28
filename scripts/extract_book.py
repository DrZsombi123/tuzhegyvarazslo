from __future__ import annotations

import argparse
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


HU_ACCENTED_LOWER = "őüóáéíúöű"
HU_VOWEL_ALL = "aáeéiíoóöőuúüűAÁEÉIÍOÓÖŐUÚÜŰ"
HU_CONSONANT = "bcdfghjklmnprstvzwxBCDFGHJKLMNPRSTVZWX"

# Hungarian full words that should not be joined to a preceding consonant-ending word
# (these are common standalone words that look like soft-wrap tails).
STANDALONE_SHORT_WORDS = {
    "ő", "ők", "őt", "őket", "ön", "önök", "öt", "öv", "ős", "ősök", "öröm", "ősz",
    "öreg", "öl", "ölbe", "öböl",
    "év", "évek", "él", "élet", "élete", "élve", "én", "ér", "érte", "érez", "érzed",
    "ír", "íz", "így", "íme", "ír",
    "óv", "ól", "óra", "óta", "óvni", "óriás", "óriása", "óriásai", "óvatos", "óvatosan", "ósdi",
    "új", "újra", "úr", "úszik", "út", "útra", "úton", "útnak", "útját", "úszni",
    "és", "át", "ám", "úgy",
    "észak", "északi", "északra", "északnak", "észre", "észrevesz", "észrevett",
    "óvatosan",
}

SECTION_RE = re.compile(r"(?m)^\s*(\d{1,3})\.\s*$")

LAPOZZ_RE = re.compile(
    r"(?i)\blapozz\s+(?:a|az)\s+(\d{1,3})(?:\s*[- ]?(?:ra|re|hoz|hez|h[oöő]z))?\b"
)

LUCK_CHECK_RE = re.compile(r"(?i)tedd\s+pr[óo]b[áa]ra\s+szerencs[éeé]d")
SKILL_CHECK_RE = re.compile(r"(?i)tedd\s+pr[óo]b[áa]ra\s+[üu]gyess[éeé]g")

DEFEAT_PHRASE_RE = re.compile(
    r"(?i)\b[Hh]a\s+(?:legy[őo]z[öo]d|legy[őo]zted|le[üu]t[öo]d|elpuszt[íi]tod|meg[öo]l[öo]d)\b"
)

ENCOUNTER_RE = re.compile(
    r"(?im)^([^\n]{1,50}?)\s+[ÜU]GYESS[ÉE]G\s+(\d{1,2})\s+[ÉE]LETER[ŐO]\s+(\d{1,2})"
)

PUBLISHER_MARKERS = ("FELELOS KIADO",)
ENDING_MARKERS = (
    "Kincskeresesed vegetert",
    "Kincskeresesed veget ert",
    "kincskeresesed vegetert",
    "kincskeresesed veget ert",
    "Kincskeresesed sikerrel veget ert",
)


@dataclass(frozen=True)
class ExtractionReport:
    node_count: int
    missing_nodes: list[int]
    invalid_targets: list[dict[str, int]]
    suspicious_nodes: list[int]


def ascii_fold(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(char for char in decomposed if not unicodedata.combining(char))


_SOFT_WRAP_RE = re.compile(
    rf"(?<![a-záéíóöőúüű])(\w+[{HU_CONSONANT}]) +([{HU_ACCENTED_LOWER}][a-záéíóöőúüű]+)\b"
)


def _join_soft_wrap(match: "re.Match[str]") -> str:
    word, frag = match.group(1), match.group(2)
    if frag.lower() in STANDALONE_SHORT_WORDS:
        return match.group(0)
    return word + frag


def normalize_text(value: str) -> str:
    """Clean up PDF-extracted text: strip CR, NBSP, hyphenated wraps, and Hungarian soft wraps."""
    normalized = value.replace("\r", "")
    normalized = normalized.replace(" ", " ")
    normalized = normalized.replace(" \n", "\n")
    normalized = re.sub(r"(\w)-\n(\w)", r"\1\2", normalized)
    normalized = _SOFT_WRAP_RE.sub(_join_soft_wrap, normalized)
    normalized = re.sub(r"[ \t]+", " ", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def strip_publisher_tail(value: str) -> str:
    folded = ascii_fold(value).upper()
    cut_points = [folded.find(marker) for marker in PUBLISHER_MARKERS if folded.find(marker) >= 0]
    if not cut_points:
        return value.strip()
    return value[: min(cut_points)].strip()


def split_missing_ending(sections: dict[int, str]) -> dict[int, str]:
    if 400 in sections or 399 not in sections:
        return sections

    text = sections[399]
    folded = ascii_fold(text)
    marker_index = -1
    marker_length = 0
    for marker in ENDING_MARKERS:
        candidate = ascii_fold(marker)
        marker_index = folded.find(candidate)
        marker_length = len(candidate)
        if marker_index >= 0:
            break

    if marker_index < 0:
        return sections

    before = text[:marker_index].strip()
    after = text[marker_index : marker_index + marker_length] + text[marker_index + marker_length :]
    repaired = dict(sections)
    repaired[399] = normalize_text(before)
    repaired[400] = normalize_text(strip_publisher_tail(after))
    return repaired


def split_numbered_sections(full_text: str) -> dict[int, str]:
    text = normalize_text(full_text)
    matches = list(SECTION_RE.finditer(text))
    sections: dict[int, str] = {}

    for index, match in enumerate(matches):
        section_id = int(match.group(1))
        if not 1 <= section_id <= 400:
            continue
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = strip_publisher_tail(text[match.end() : end])
        sections[section_id] = normalize_text(body)

    return split_missing_ending(sections)


def split_sentences(text: str) -> list[str]:
    """Split text into sentences. Treats newlines as whitespace."""
    flattened = re.sub(r"\s+", " ", text)
    parts = re.split(r"(?<=[.!?])\s+", flattened)
    return [p.strip() for p in parts if p.strip()]


def clean_label(raw: str) -> str:
    """Tidy a label fragment: strip punctuation, collapse spaces, capitalize first letter."""
    cleaned = re.sub(r"\s+", " ", raw).strip(" ,;:-—.\t\n")
    if not cleaned:
        return "Tovább"
    if len(cleaned) > 120:
        cleaned = cleaned[:117].rstrip() + "…"
    return cleaned[:1].upper() + cleaned[1:]


_HA_CLAUSE_RE = re.compile(r"(?i)\bHa\b")


def derive_label(prefix: str, suffix: str = "") -> tuple[str, bool]:
    """Find the best label for a 'lapozz' match. Returns (label, has_condition)."""
    if prefix.strip():
        matches = list(_HA_CLAUSE_RE.finditer(prefix))
        if matches:
            last = matches[-1]
            condition = prefix[last.start():].split(",")[0]
            return clean_label(condition), True

    if suffix.strip():
        match = _HA_CLAUSE_RE.search(suffix)
        if match:
            condition = suffix[match.start():].split(".")[0].split(",")[0]
            return clean_label(condition), True

    if prefix.strip():
        clauses = [c.strip() for c in prefix.split(",") if c.strip()]
        if clauses:
            return clean_label(clauses[-1]), False

    return "Tovább", False


def extract_choices(text: str) -> list[dict[str, Any]]:
    """Backward-compatible API: returns just the choices list."""
    choices, _meta = extract_choices_with_meta(text)
    return choices


def extract_choices_with_meta(text: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Extract choices with optional metadata (e.g. autoContinue)."""
    sentences = split_sentences(text)
    raw: list[tuple[str, int, bool]] = []

    for sentence in sentences:
        matches = list(LAPOZZ_RE.finditer(sentence))
        for i, match in enumerate(matches):
            target = int(match.group(1))
            if not 1 <= target <= 400:
                continue
            prev_end = matches[i - 1].end() if i > 0 else 0
            next_start = matches[i + 1].start() if i + 1 < len(matches) else len(sentence)
            prefix = sentence[prev_end : match.start()]
            suffix = sentence[match.end() : next_start]
            label, has_cond = derive_label(prefix, suffix)
            raw.append((label, target, has_cond))

    seen: set[tuple[int, str]] = set()
    choices: list[dict[str, Any]] = []
    has_any_condition = False
    for label, target, has_cond in raw:
        if has_cond:
            has_any_condition = True
        key = (target, label.lower()[:60])
        if key in seen:
            continue
        seen.add(key)
        choices.append({"label": label, "target": target, "effects": []})

    meta: dict[str, Any] = {}
    if len(choices) == 1 and not has_any_condition:
        choices[0]["label"] = "Tovább"
        meta["autoContinue"] = True
    return choices, meta


def extract_encounters(text: str) -> list[dict[str, Any]]:
    """Find Hungarian KJK enemy stat lines like 'Barbar UGYESSEG 7 ELETERO 6'."""
    encounters: list[dict[str, Any]] = []
    for index, match in enumerate(ENCOUNTER_RE.finditer(text), start=1):
        raw_name = match.group(1).strip(" :-,;.")
        name = re.sub(r"\s+", " ", raw_name)
        if len(name) < 2:
            continue
        encounters.append(
            {
                "id": f"{ascii_fold(name).lower().replace(' ', '-')}-{index}",
                "name": name,
                "skill": int(match.group(2)),
                "stamina": int(match.group(3)),
            }
        )
    return encounters


def apply_combat_gates(
    choices: list[dict[str, Any]], encounters: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Attach `requires: defeated:<id>` flags to choices that gate behind combat victory."""
    if not encounters:
        return choices
    result = []
    for choice in choices:
        label = choice["label"]
        if DEFEAT_PHRASE_RE.search(label):
            label_folded = ascii_fold(label.lower())
            target_id = None
            for enc in encounters:
                first_word = next(
                    (w for w in ascii_fold(enc["name"].lower()).split() if len(w) > 2), ""
                )
                if first_word and first_word[:5] in label_folded:
                    target_id = enc["id"]
                    break
            if not target_id and len(encounters) == 1:
                target_id = encounters[0]["id"]
            if target_id:
                choice = {
                    **choice,
                    "requires": [{"type": "flag", "flag": f"defeated:{target_id}"}],
                }
        result.append(choice)
    return result


def infer_checks(text: str, choices: list[dict[str, Any]]) -> dict[str, Any]:
    """Detect Szerencse- and Ugyesseg-proba nodes and link their lucky/unlucky targets."""
    result: dict[str, Any] = {}

    if LUCK_CHECK_RE.search(text):
        on_lucky = None
        on_unlucky = None
        for choice in choices:
            label_folded = ascii_fold(choice["label"].lower())
            if re.search(r"nincs\s+szerencs|szerencs[ée]tlen|sikertelen|peched", label_folded):
                on_unlucky = choice["target"]
            elif re.search(r"szerencs[ée]s|sikerul|sikert\s+arat", label_folded):
                on_lucky = choice["target"]
        if on_lucky is not None and on_unlucky is not None:
            result["luckCheck"] = {"onLucky": on_lucky, "onUnlucky": on_unlucky}

    if SKILL_CHECK_RE.search(text):
        on_success = None
        on_fail = None
        for choice in choices:
            label_folded = ascii_fold(choice["label"].lower())
            if re.search(r"[üu]gyetlen|nem\s+siker|sikertelen", label_folded):
                on_fail = choice["target"]
            elif re.search(r"[üu]gyes(?!s)|sikerul|sikert\s+arat", label_folded):
                on_success = choice["target"]
        if on_success is not None and on_fail is not None:
            result["skillCheck"] = {"onSuccess": on_success, "onFail": on_fail}

    return result


def infer_terminal(section_id: int, text: str) -> str | None:
    folded = ascii_fold(text).lower()
    if section_id == 400:
        return "victory"
    if "kalandod itt veget ert" in folded or "kalandod veget ert" in folded:
        return "death"
    return None


def load_annotations(path: Path | None) -> dict[str, Any]:
    if path is None or not path.exists():
        return {"nodes": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def merge_node_annotations(node: dict[str, Any], annotations: dict[str, Any]) -> dict[str, Any]:
    node_annotations = annotations.get("nodes", {}).get(str(node["id"]), {})
    merged = dict(node)
    for key in ("terminal", "entryEffects", "encounters", "choices", "luckCheck", "skillCheck", "autoContinue"):
        if key in node_annotations:
            merged[key] = node_annotations[key]
    return merged


def build_book(
    sections: dict[int, str], annotations: dict[str, Any], source: str
) -> tuple[dict[str, Any], ExtractionReport]:
    nodes: dict[str, Any] = {}
    invalid_targets: list[dict[str, int]] = []
    suspicious_nodes: list[int] = []

    for section_id in sorted(sections):
        text = sections[section_id]
        encounters = extract_encounters(text)
        choices, choice_meta = extract_choices_with_meta(text)
        choices = apply_combat_gates(choices, encounters)
        checks = infer_checks(text, choices)
        terminal = infer_terminal(section_id, text)

        for choice in choices:
            if choice["target"] not in sections:
                invalid_targets.append({"node": section_id, "target": choice["target"]})

        node: dict[str, Any] = {
            "id": section_id,
            "text": text,
            "choices": choices,
            "encounters": encounters,
            "entryEffects": [],
        }
        if terminal:
            node["terminal"] = terminal
        if choice_meta.get("autoContinue"):
            node["autoContinue"] = True
        if "luckCheck" in checks:
            node["luckCheck"] = checks["luckCheck"]
        if "skillCheck" in checks:
            node["skillCheck"] = checks["skillCheck"]

        if not choices and not terminal:
            suspicious_nodes.append(section_id)
        nodes[str(section_id)] = merge_node_annotations(node, annotations)

    missing_nodes = [node_id for node_id in range(1, 401) if node_id not in sections]
    report = ExtractionReport(
        node_count=len(nodes),
        missing_nodes=missing_nodes,
        invalid_targets=invalid_targets,
        suspicious_nodes=suspicious_nodes,
    )
    book = {
        "meta": {
            "title": "A Tűzhegy Varázslója",
            "source": source,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "nodeCount": len(nodes),
        },
        "nodes": nodes,
    }
    return book, report


def read_pdf_text(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise SystemExit(
            "Hiányzó Python csomag: pypdf. Telepítés: python -m pip install pypdf"
        ) from exc

    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def default_pdf_path() -> Path:
    downloads = Path.home() / "Downloads"
    candidates = sorted(
        downloads.glob("A T*zhegy Var*zsl*ja.pdf"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    if candidates:
        return candidates[0]
    return downloads / "A Tuzhegy Varazsloja.pdf"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="KJK PDF feldolgozasa helyi JSON adatfajlla.")
    parser.add_argument("--pdf", type=Path, default=default_pdf_path())
    parser.add_argument("--out", type=Path, default=Path("public/data/book.generated.json"))
    parser.add_argument("--report", type=Path, default=Path("public/data/extraction-report.json"))
    parser.add_argument("--annotations", type=Path, default=Path("data/rules.annotations.json"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.pdf.exists():
        raise SystemExit(f"Nem talalhato a PDF: {args.pdf}")

    annotations = load_annotations(args.annotations)
    sections = split_numbered_sections(read_pdf_text(args.pdf))
    book, report = build_book(sections, annotations, str(args.pdf))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(book, ensure_ascii=False, indent=2), encoding="utf-8")
    args.report.write_text(json.dumps(report.__dict__, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Kesz: {args.out} ({report.node_count} bekezdes)")
    if report.missing_nodes:
        print(f"Hianyzo bekezdesek: {report.missing_nodes}")
    if report.invalid_targets:
        print(f"Ervenytelen celhivatkozasok: {len(report.invalid_targets)}")


if __name__ == "__main__":
    main()

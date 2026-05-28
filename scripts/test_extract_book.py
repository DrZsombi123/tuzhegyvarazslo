import unittest

from extract_book import (
    apply_combat_gates,
    derive_label,
    extract_choices,
    extract_choices_with_meta,
    extract_encounters,
    infer_checks,
    normalize_text,
    split_numbered_sections,
)


class SplitSectionTests(unittest.TestCase):
    def test_split_sections_repairs_missing_400_heading(self):
        text = """
1.
Kezdet. Ha tovabbmesz, lapozz a 2-re.
2.
Folyoso. Lapozz a 399-re.
399.
A viz elsodor. Lapozz a 218-ra.
Kincskeresesed veget ert.
A varazslo kincse a tied.
FELELOS KIADO
"""

        sections = split_numbered_sections(text)

        self.assertEqual(sorted(sections), [1, 2, 399, 400])
        self.assertEqual(sections[399], "A viz elsodor. Lapozz a 218-ra.")
        self.assertIn("A varazslo kincse", sections[400])
        self.assertNotIn("FELELOS KIADO", sections[400])


class ExtractChoicesTests(unittest.TestCase):
    def test_extract_choices_finds_hungarian_page_references(self):
        text = (
            "Ha eszaknak indulsz, lapozz a 46-ra. "
            "Ha del fele mesz, lapozz az 55-re. "
            "Ha varsz, lapozz a 7-re."
        )

        choices = extract_choices(text)

        self.assertEqual([choice["target"] for choice in choices], [46, 55, 7])
        self.assertIn("eszaknak", choices[0]["label"])
        self.assertTrue(choices[0]["label"].startswith("Ha "))

    def test_double_conditional_in_one_sentence_gets_separate_labels(self):
        text = (
            "Néhány méter után egy elágazáshoz érsz. "
            "Ha nyugat felé indulsz, lapozz a 71-re, ha kelet felé, lapozz a 278-ra."
        )

        choices, meta = extract_choices_with_meta(text)

        self.assertEqual([c["target"] for c in choices], [71, 278])
        self.assertEqual(choices[0]["label"], "Ha nyugat felé indulsz")
        self.assertEqual(choices[1]["label"], "Ha kelet felé")
        self.assertNotIn("autoContinue", meta)

    def test_single_nav_marks_node_as_auto_continue(self):
        text = "Egy sebesen áramló folyó északi partján vagy, egy hatalmas föld alatti barlangban. Lapozz a 214-re."

        choices, meta = extract_choices_with_meta(text)

        self.assertEqual(len(choices), 1)
        self.assertEqual(choices[0]["label"], "Tovább")
        self.assertEqual(choices[0]["target"], 214)
        self.assertTrue(meta.get("autoContinue"))

    def test_combat_aftermath_choice_gets_defeat_flag(self):
        text = (
            "Egy őrült Barbárral állsz szemben. "
            "Barbár ÜGYESSÉG 7 ÉLETERŐ 6 "
            "Ha legyőzöd a Barbárt, lapozz a 273-ra."
        )

        encounters = extract_encounters(text)
        choices, _ = extract_choices_with_meta(text)
        gated = apply_combat_gates(choices, encounters)

        defeat_choice = next(c for c in gated if c["target"] == 273)
        self.assertIn("requires", defeat_choice)
        self.assertEqual(defeat_choice["requires"][0]["type"], "flag")
        self.assertTrue(defeat_choice["requires"][0]["flag"].startswith("defeated:"))

    def test_luck_check_links_lucky_and_unlucky_targets(self):
        text = (
            "Tedd próbára Szerencsédet! "
            "Ha szerencsés vagy, lapozz a 16-ra. "
            "Ha nincs szerencséd, lapozz a 269-re."
        )

        choices, _ = extract_choices_with_meta(text)
        checks = infer_checks(text, choices)

        self.assertIn("luckCheck", checks)
        self.assertEqual(checks["luckCheck"]["onLucky"], 16)
        self.assertEqual(checks["luckCheck"]["onUnlucky"], 269)


class DeriveLabelTests(unittest.TestCase):
    def test_prefix_with_ha_clause_returns_condition(self):
        label, has_cond = derive_label("Ha északnak indulsz, ahonnan kelet felé kanyarodik az út,")
        self.assertEqual(label, "Ha északnak indulsz")
        self.assertTrue(has_cond)

    def test_suffix_with_ha_clause_used_when_prefix_lacks(self):
        label, has_cond = derive_label("Lapozz a 200-ra", ", ha balra mész.")
        self.assertEqual(label, "Ha balra mész")
        self.assertTrue(has_cond)

    def test_empty_prefix_falls_back_to_tovabb(self):
        label, has_cond = derive_label("")
        self.assertEqual(label, "Tovább")
        self.assertFalse(has_cond)


class NormalizeTextTests(unittest.TestCase):
    def test_joins_hyphenated_line_breaks(self):
        text = "varázs-\nló"
        self.assertEqual(normalize_text(text), "varázsló")

    def test_joins_hungarian_soft_wrap_with_accented_continuation(self):
        text = "Kihúzod hüvelyéb ől a kardodat."
        self.assertEqual(normalize_text(text), "Kihúzod hüvelyéből a kardodat.")

    def test_joins_short_prefix_with_accented_suffix(self):
        text = "Mereven el őtted áll a kapu."
        self.assertEqual(normalize_text(text), "Mereven előtted áll a kapu.")

    def test_does_not_join_standalone_ok_pronoun(self):
        text = "Tudják ők eljöttek a kapuhoz."
        self.assertEqual(normalize_text(text), "Tudják ők eljöttek a kapuhoz.")


class ExtractEncountersTests(unittest.TestCase):
    def test_reads_enemy_stat_lines_ascii(self):
        text = "Ork UGYesseg 6 Eletero 5\nMas szoveg\nORIAS PATKANY UGYesseg 5 Eletero 4"

        encounters = extract_encounters(text)

        self.assertEqual([encounter["name"] for encounter in encounters], ["Ork", "ORIAS PATKANY"])
        self.assertEqual(encounters[0]["skill"], 6)
        self.assertEqual(encounters[1]["stamina"], 4)

    def test_reads_enemy_stat_lines_accented(self):
        text = "Barbár ÜGYESSÉG 7 ÉLETERŐ 6"

        encounters = extract_encounters(text)

        self.assertEqual(len(encounters), 1)
        self.assertEqual(encounters[0]["name"], "Barbár")
        self.assertEqual(encounters[0]["id"], "barbar-1")
        self.assertEqual(encounters[0]["skill"], 7)
        self.assertEqual(encounters[0]["stamina"], 6)


if __name__ == "__main__":
    unittest.main()

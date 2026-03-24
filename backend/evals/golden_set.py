"""Golden test set for evaluating substantiveness classification accuracy.

Hand-labeled comments for measuring classifier performance.
Run: python -m evals.golden_set
"""

from analysis.classifier import classify_comment

GOLDEN_SET = [
    {
        "comment_id": "eval-001",
        "text": "I oppose this regulation. It's bad for America.",
        "expected_label": "non_substantive",
        "expected_confidence_min": 0.8,
    },
    {
        "comment_id": "eval-002",
        "text": (
            "The proposed rule at 40 CFR 52.245(b)(2) exceeds EPA's statutory authority "
            "under Section 111(a) of the Clean Air Act, 42 U.S.C. 7411(a)(1). The Supreme "
            "Court held in West Virginia v. EPA (2022) that EPA cannot claim 'transformative' "
            "authority without clear congressional authorization under the major questions doctrine."
        ),
        "expected_label": "legal",
        "expected_confidence_min": 0.7,
    },
    {
        "comment_id": "eval-003",
        "text": (
            "Our industry survey of 200 manufacturing facilities shows average compliance costs "
            "of $2.4 million per facility, totaling $480 million industry-wide. The EPA's RIA "
            "estimates costs at only $150 million, understating the true burden by 3x. We attach "
            "our methodology and raw data."
        ),
        "expected_label": "economic",
        "expected_confidence_min": 0.7,
    },
    {
        "comment_id": "eval-004",
        "text": (
            "As a farmer in Iowa for 30 years, this regulation will devastate my operation. "
            "I already spent $50,000 on equipment to comply with the last round of rules. "
            "My neighbors are selling their farms. This is destroying rural communities."
        ),
        "expected_label": "anecdotal",
        "expected_confidence_min": 0.5,
    },
    {
        "comment_id": "eval-005",
        "text": (
            "The agency should consider a phased implementation approach, similar to what "
            "California adopted in 2019 with a 5-year rollout period. This would allow "
            "small businesses time to adapt while still achieving the environmental goals. "
            "The current all-at-once approach will disproportionately impact rural communities."
        ),
        "expected_label": "policy",
        "expected_confidence_min": 0.6,
    },
    {
        "comment_id": "eval-006",
        "text": (
            "The ozone precursor model in the Technical Support Document uses outdated "
            "photolysis rate constants from Atkinson et al. (1992). The IUPAC 2021 update "
            "revises these rates by 15-20%. Correcting this would change the predicted "
            "ozone formation by approximately 8 ppb at 40N latitude."
        ),
        "expected_label": "technical",
        "expected_confidence_min": 0.7,
    },
]


def run_eval(rule_title: str = "the proposed environmental regulation"):
    """Run golden set evaluation and report accuracy."""
    print(f"\n{'='*60}")
    print("GOLDEN SET EVALUATION")
    print(f"{'='*60}\n")

    correct = 0
    total = len(GOLDEN_SET)

    results = []
    for item in GOLDEN_SET:
        print(f"Evaluating {item['comment_id']}...")
        result = classify_comment(item["comment_id"], item["text"], rule_title)
        predicted_label = result.get("primary_label", "unknown")
        predicted_conf = result.get("primary_confidence", 0)

        label_match = predicted_label == item["expected_label"]
        conf_ok = predicted_conf >= item["expected_confidence_min"]

        if label_match:
            correct += 1

        status = "PASS" if label_match else "FAIL"
        print(f"  Expected: {item['expected_label']} | Got: {predicted_label} "
              f"(conf={predicted_conf:.2f}) [{status}]")

        results.append({
            "comment_id": item["comment_id"],
            "expected": item["expected_label"],
            "predicted": predicted_label,
            "confidence": predicted_conf,
            "label_match": label_match,
            "conf_ok": conf_ok,
        })

    accuracy = correct / total if total > 0 else 0
    print(f"\n{'='*60}")
    print(f"ACCURACY: {correct}/{total} = {accuracy:.1%}")
    print(f"{'='*60}\n")

    return {"accuracy": accuracy, "results": results}


if __name__ == "__main__":
    run_eval()

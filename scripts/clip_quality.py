import json
import math
from pathlib import Path

RUBRIC = json.loads((Path(__file__).resolve().parent.parent / 'shared' / 'clip-rubric.json').read_text())
SCORE_KEYS = tuple(RUBRIC['weights'])
ANCHOR_KEYS = ('hook', 'peak', 'payoff', 'contrast')


def object_schema(fields):
    return {'type': 'object', 'properties': fields, 'required': list(fields), 'additionalProperties': False}


REVIEW_SCHEMA = object_schema({
    'first': {'type': 'integer'}, 'last': {'type': 'integer'},
    **{k: {'type': 'boolean'} for k in ('context', 'ending', 'appeal', 'clarity')},
    'reason': {'type': 'string'}, 'weakness': {'type': 'string'},
    'assessment': object_schema({
        'scores': object_schema({k: {'type': 'integer', 'enum': [0, 1, 2, 3, 4]} for k in SCORE_KEYS}),
        'anchors': object_schema({k: {'type': 'integer'} for k in ANCHOR_KEYS}),
    }),
})


def normalized_scores(assessment, first, last, segments):
    scores, anchors = assessment.get('scores', {}), assessment.get('anchors', {})
    if any(type(scores.get(k)) is not int or not 0 <= scores[k] <= 4 for k in SCORE_KEYS):
        return None
    if any(type(anchors.get(k)) is not int or (anchors[k] != -1 and not first <= anchors[k] <= last) for k in ANCHOR_KEYS):
        return None
    scores = dict(scores)
    if anchors['hook'] == -1:
        scores['hook'] = 0
    elif segments[anchors['hook']]['start'] - segments[first]['start'] > 5:
        scores['hook'] = min(scores['hook'], 1)
    if anchors['payoff'] == -1:
        scores['payoff'] = 0
    elif segments[last]['end'] - segments[anchors['payoff']]['end'] > 5:
        scores['payoff'] = min(scores['payoff'], 2)
    if anchors['peak'] == -1:
        scores.update(novelty=0, emotion=0, value=0)
    if anchors['contrast'] == -1 or anchors['contrast'] >= anchors['peak']:
        scores['emotion'] = 0
    return scores


def quality(candidate, segments):
    assessment = candidate.get('assessment')
    scores = normalized_scores(assessment, candidate['first'], candidate['last'], segments) if assessment else None
    if scores is None:
        return candidate.get('strength', 1) * 20
    total = math.floor(sum(scores[k] * RUBRIC['weights'][k] / 4 for k in SCORE_KEYS) + .5)
    return min(49 if any(scores[k] < 2 for k in ('hook', 'payoff', 'clarity')) else 100, total)


def review_context(candidate, segments, token_count, budget):
    first, last = candidate['first'], candidate['last']

    def text(a, b):
        return '\n'.join(f"[{i}] {segments[i]['start']:.2f}-{segments[i]['end']:.2f}: {segments[i]['text']}" for i in range(a, b + 1))

    for _ in range(2):
        if first > 0 and token_count(text(first - 1, last)) <= budget:
            first -= 1
        if last + 1 < len(segments) and token_count(text(first, last + 1)) <= budget:
            last += 1
    return first, last, text(first, last)

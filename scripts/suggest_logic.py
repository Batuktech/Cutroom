import re


def normalize(text):
    return ' '.join(text.lower().split())


def bounds(maximum, minimum=5):
    return minimum, maximum


def rejection(candidate, segments, maximum, minimum=5, max_pause=15):
    first, last = candidate.get('first'), candidate.get('last')
    if type(first) is not int or type(last) is not int or not 0 <= first <= last < len(segments):
        return 'Invalid source range'
    passage = segments[first:last + 1]
    duration = passage[-1]['end'] - passage[0]['start']
    text = ' '.join(s['text'] for s in passage)
    quote = candidate.get('quote', '')
    if not minimum <= duration <= maximum:
        return 'Outside duration limits'
    if len(text.split()) < 4:
        return 'Too little speech'
    if len(quote.strip()) < 8 or normalize(quote) not in normalize(text):
        return 'Quote did not match source'
    if any(b['start'] - a['end'] > max_pause for a, b in zip(passage, passage[1:])):
        return 'Pause exceeds your limit'
    return None


def valid(candidate, segments, maximum, minimum=5, max_pause=15):
    return rejection(candidate, segments, maximum, minimum, max_pause) is None


def ground(candidate, segments, start, end, maximum):
    first, last = candidate['first'], candidate['last']
    if not start <= first <= last < end:
        return None
    trimmed = False
    while last > first and segments[last]['end'] - segments[first]['start'] > maximum:
        last -= 1
        trimmed = True
    candidate = {**candidate, 'last': last}
    text = ' '.join(s['text'] for s in segments[first:last+1])
    # Evidence is copied from the selected source, so model paraphrasing cannot invalidate a useful range.
    candidate['quote'] = text[:240].rsplit(' ', 1)[0] if len(text) > 240 else text
    candidate['title'] = candidate['title'].strip()[:120] or 'Passage to review'
    candidate['reason'] = candidate['reason'].strip()[:500] or 'Selected for a manual preview.'
    candidate['weakness'] = (('Trimmed to your maximum length; check the ending. ' if trimmed else '') + candidate['weakness'])[:500]
    candidate['verdict'] = 'suggested'
    return candidate


def overlap(a, b, segments):
    a_start, a_end = segments[a['first']]['start'], segments[a['last']]['end']
    b_start, b_end = segments[b['first']]['start'], segments[b['last']]['end']
    return max(0, min(a_end, b_end) - max(a_start, b_start)) >= min(a_end-a_start, b_end-b_start) * .25


def shortlist(candidates, segments, target, limit=10):
    chosen = []
    candidates = sorted(candidates, key=lambda c: (-c['strength'], segments[c['first']]['start']))
    for candidate in candidates:
        words = set(re.findall(r'\w+', candidate['quote'].lower()))
        duplicate = False
        for previous in chosen:
            other = set(re.findall(r'\w+', previous['quote'].lower()))
            if overlap(candidate, previous, segments) or (words and len(words & other) / len(words | other) > .7):
                duplicate = True
                break
        if not duplicate:
            chosen.append(candidate)
        if len(chosen) >= limit:
            break
    return chosen


def windows(segments, token_count, budget=1050):
    result = []
    start = 0
    while start < len(segments):
        end = start
        lines = []
        while end < len(segments):
            segment = segments[end]
            line = f"[{end}] {segment['start']:.2f}-{segment['end']:.2f}: {segment['text']}"
            if token_count('\n'.join(lines + [line])) > budget:
                if not lines:
                    raise ValueError('A transcript passage is too long for local analysis. Split long subtitle paragraphs and try again.')
                break
            lines.append(line)
            end += 1
        result.append((start, end, '\n'.join(lines)))
        if end == len(segments):
            break
        # A quarter-section overlap keeps context near boundaries without re-reading half the transcript.
        start = max(start + 1, start + (end-start)*3//4)
    return result

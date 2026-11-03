"""Offline timing extraction and explicit SHA256 inventory check. No devices."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re


def timing_values(path):
    text = Path(path).read_text(encoding='utf-8-sig', errors='replace')
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if 'WNS(ns)' not in line or 'WHS(ns)' not in line:
            continue
        for row in lines[i + 1:i + 7]:
            fields = row.split()
            if len(fields) < 8:
                continue
            try:
                wns, whs = float(fields[0]), float(fields[4])
            except ValueError:
                continue
            if not math.isfinite(wns) or not math.isfinite(whs):
                raise ValueError('Nonfinite slack')
            return {'wnsNs': wns, 'whsNs': whs,
                    'nonnegativeSetupHold': wns >= 0 and whs >= 0,
                    'constraintCoverageChecked': False}
    raise ValueError('Vivado WNS/WHS summary not found; inspect report format')


def verify_manifest(manifest, root):
    root = Path(root).resolve()
    files = json.loads(Path(manifest).read_text(encoding='utf-8-sig')).get('files')
    if not isinstance(files, dict) or not files:
        raise ValueError('Expected nonempty files mapping')
    result = []
    for rel, expected in files.items():
        if not isinstance(expected, str) or not re.fullmatch('[0-9a-fA-F]{64}', expected):
            raise ValueError(f'Invalid SHA256: {rel}')
        path = (root / rel).resolve()
        if not path.is_relative_to(root):
            raise ValueError(f'Path escapes root: {rel}')
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected.lower():
            raise ValueError(f'SHA256 mismatch: {rel}')
        result.append({'file': rel, 'sha256': actual})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--timing')
    parser.add_argument('--manifest')
    parser.add_argument('--root', default='.')
    args = parser.parse_args()
    if not args.timing and not args.manifest:
        parser.error('Provide --timing and/or --manifest')
    try:
        result = {'hardwareAccess': False, 'hardwareStabilityProven': False}
        if args.timing:
            result['timing'] = timing_values(args.timing)
        if args.manifest:
            result['files'] = verify_manifest(args.manifest, args.root)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2 if args.timing and not result['timing']['nonnegativeSetupHold'] else 0
    except (OSError, ValueError, TypeError) as exc:
        parser.exit(1, str(exc) + '\n')


if __name__ == '__main__':
    raise SystemExit(main())

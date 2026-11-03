"""Portable offline behavioural checks; no FPGA, serial, internet or API calls."""
from pathlib import Path
import hashlib
import importlib.util
import json
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
results = []


def run(relative, *args, success=True):
    p = subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / relative), *map(str, args)],
                       capture_output=True, encoding='utf-8')
    assert (p.returncode == 0) == success, (relative, p.stdout, p.stderr)
    return p


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    for folder in sorted(ROOT.iterdir()):
        if not folder.is_dir() or not (folder / 'SKILL.md').exists():
            continue
        text = (folder / 'SKILL.md').read_text(encoding='utf-8')
        assert text.startswith('---\n') and re.search(r'^name: ' + re.escape(folder.name) + r'$', text, re.M)
        assert re.search(r'^description: .+', text, re.M)
        assert (folder / 'README.md').exists()
        for file in folder.rglob('*.md'):
            for link in re.findall(r'\]\(([^)]+)\)', file.read_text(encoding='utf-8')):
                if '://' not in link and not link.startswith('#'):
                    assert (file.parent / link.split('#')[0]).exists(), (file, link)
        results.append({'check': folder.name + ': structure and references', 'passed': True})

    uart = 'embroidery-protocol-check/scripts/check_uart.py'
    evidence = load('evidence', 'runtime-evidence/scripts/evidence_check.py')
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        stream = root / 'uart.txt'
        for color in ['black', 'red', 'yellow', 'blue', 'layer']:
            stream.write_text(f'COLOR {color} 3\nJ,0,0\nS,1600,0\nS,0,-1600\n', encoding='ascii')
            out = json.loads(run(uart, stream).stdout)
            assert out['stitches'] == 2 and out['widthMm'] == 0 and out['heightMm'] == 1
        results.append({'check': 'five headers and cumulative S geometry', 'passed': True})
        for bad in ['COLOR layer 1\nS,32768,0\n', 'COLOR black 2\nS,1,0\n',
                    'COLOR black 0\n', 'COLOR layer 1\nS,1,0', 'COLOR layer 1\nQ,0,0\n']:
            stream.write_text(bad, encoding='ascii')
            run(uart, stream, success=False)
        results.append({'check': 'overflow/count/empty/LF/action rejection (5)', 'passed': True})
        stream.write_text('COLOR layer 1\nS,1600,0\n', encoding='ascii')
        data = {'frame': {'width': 100, 'height': 100}, 'metadata': {'thread': {'hex': '#e68aaf'}},
                'paths': {'black': {'segments': [{'points': [{'x':51, 'y':50, 'action':'stitch'}]}]}}}
        std = root / 'standard.json'
        std.write_text(json.dumps(data), encoding='utf-8')
        run(uart, stream, '--standard-json', std)
        data['paths']['black']['segments'][0]['points'][0]['x'] = 52
        std.write_text(json.dumps(data), encoding='utf-8')
        run(uart, stream, '--standard-json', std, success=False)
        results.append({'check': 'layer standard JSON match and wrong target rejection', 'passed': True})
        converted = json.loads(run('motion-calibration/scripts/counts_mm.py', '--x-hex', 'FFFFFE0C', '--y-hex', '000003E8').stdout)
        assert converted['deltaXmm'] == -1 and converted['deltaYmm'] == 2
        results.append({'check': 'signed encoder negative/positive conversion', 'passed': True})
        payload = root / 'design.bit'
        payload.write_bytes(b'offline-test-fixture-not-a-bitstream')
        manifest = root / 'sha256.json'
        manifest.write_text(json.dumps({'files': {'design.bit':hashlib.sha256(payload.read_bytes()).hexdigest()}}), encoding='utf-8')
        evidence.verify_manifest(manifest, root)
        payload.write_bytes(b'tampered')
        try:
            evidence.verify_manifest(manifest, root)
            raise AssertionError('Failed to reject altered artifact')
        except ValueError:
            pass
        manifest.write_text(json.dumps({'files': {'../escape':'0'*64}}), encoding='utf-8')
        try:
            evidence.verify_manifest(manifest, root)
            raise AssertionError('Failed to reject traversal')
        except ValueError:
            pass
        results.append({'check': 'hash inventory, tamper and path escape rejection', 'passed': True})
        report = root / 'timing.rpt'
        for wns in ['0.747', '-0.1']:
            report.write_text('WNS(ns) TNS(ns) TNSFail TNSTotal WHS(ns) THS(ns) THSFail THSTotal\n-------\n'+wns+' 0 0 100 0.100 0 0 100\n', encoding='utf-8')
            run('runtime-evidence/scripts/evidence_check.py', '--timing', report, success=not wns.startswith('-'))
        report.write_text('missing timing summary', encoding='utf-8')
        run('runtime-evidence/scripts/evidence_check.py', '--timing', report, success=False)
        results.append({'check': 'timing parser positive/negative/missing summary', 'passed': True})

    output = {'hardwareAccess':False, 'cases':results, 'allPassed':True,
              'scope':'Offline fixtures only; not FPGA simulation, bit generation or hardware long-run validation.'}
    (ROOT / 'validation.json').write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

"""Update an existing AI Studio no-build Cloud Run service; never persist its secrets.

Uses the currently authenticated gcloud account. Keeps the previous revision serving
traffic until the staged revision passes health and a real Gemini generation.
"""
import argparse
import copy
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for argument in ['project', 'region', 'service', 'archive', 'revision']:
        parser.add_argument('--' + argument, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{7,40}', args.revision):
        raise ValueError('A revisão deve ser um commit Git.')
    archive = Path(args.archive).resolve(strict=True)
    if not archive.name.endswith('.tar.gz') or archive.stat().st_size > 250 * 1024 * 1024:
        raise ValueError('Pacote tar.gz inválido ou maior que 250 MiB.')
    gcloud = shutil.which('gcloud.cmd' if os.name == 'nt' else 'gcloud')
    if not gcloud:
        raise RuntimeError('gcloud não encontrado.')
    token = subprocess.run([gcloud, 'auth', 'print-access-token'], capture_output=True, text=True, check=True).stdout.strip()
    base = 'https://run.googleapis.com/v2/'
    resource = f'projects/{args.project}/locations/{args.region}/services/{args.service}'
    secrets = [token]

    def api(resource_path, method='GET', body=None, query=''):
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(base + resource_path + query, data=data, method=method,
                                         headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            message = error.read().decode(errors='replace')
            for secret in secrets:
                if secret:
                    message = message.replace(secret, '[redacted]')
            raise RuntimeError(f'Cloud Run HTTP {error.code}: {message[:1200]}') from None

    def wait(operation):
        deadline = time.monotonic() + 480
        while not operation.get('done'):
            if time.monotonic() > deadline:
                raise RuntimeError('Publicação ainda em andamento. Consulte a operação ' + operation['name'])
            time.sleep(3)
            operation = api(operation['name'])
        if operation.get('error'):
            raise RuntimeError('Publicação recusada: ' + json.dumps(operation['error']))

    service = api(resource)
    containers = copy.deepcopy(service['template']['containers'])
    if len(containers) != 1 or containers[0].get('image') != 'scratch' or not containers[0].get('sourceCode'):
        raise RuntimeError('O serviço não usa a modalidade prebuilt source esperada. Nenhuma alteração realizada.')
    for item in containers[0].get('env', []):
        if re.search(r'KEY|TOKEN|SECRET|PASS', item['name'], re.I) and item.get('value'):
            secrets.append(item['value'])
    old_revision = service['latestReadyRevision'].rsplit('/', 1)[-1]
    new_revision = args.service + '-ai-' + args.revision[:12]
    source = containers[0]['sourceCode']['cloudStorageSource']
    bucket = source['bucket']
    object_name = f'services/{args.service}/releases/{args.revision}/app.tar.gz'
    destination = f'gs://{bucket}/{object_name}'
    print(json.dumps({'stage': 'upload', 'previousRevision': old_revision, 'newRevision': new_revision, 'source': destination}), flush=True)
    subprocess.run([gcloud, 'storage', 'cp', str(archive), destination, '--project=' + args.project, '--quiet'], check=True)
    containers[0]['sourceCode'] = {'cloudStorageSource': {'bucket': bucket, 'object': object_name}}
    stage_body = {'name': service['name'], 'etag': service['etag'],
                  'template': {'revision': new_revision, 'containers': containers},
                  'traffic': [{'type': 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', 'revision': old_revision, 'percent': 100},
                              {'type': 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', 'revision': new_revision, 'percent': 0, 'tag': 'ai-v210'}]}
    wait(api(resource, 'PATCH', stage_body, '?updateMask=template.containers,template.revision,traffic'))
    staged = api(resource)
    uri = next((target.get('uri') for target in staged.get('trafficStatuses', []) if target.get('tag') == 'ai-v210'), None)
    if not uri:
        raise RuntimeError('A revisão anterior continua em produção; não foi possível obter a URL de teste.')
    with urllib.request.urlopen(uri + '/api/health', timeout=40) as response:
        health = json.load(response)
    if health.get('revision') != args.revision or health.get('version') != '2.1.0' or not health.get('ai', {}).get('configured'):
        raise RuntimeError('A revisão de teste não corresponde ao pacote ou não possui a configuração de IA.')
    smoke = urllib.request.Request(uri + '/api/ai/generate-assembly',
                                  data=json.dumps({'prompt': 'Crie uma caixa aberta de 140 x 100 x 85 mm, MDF 3 mm, sem aberturas.'}).encode(),
                                  headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(smoke, timeout=65) as response:
        result = json.load(response)
    params = result.get('plan', {}).get('params', {})
    if result.get('source') != 'ai' or not result.get('success') or params.get('model') != 'box' or params.get('lid') is not False or [params.get(k) for k in ['width', 'depth', 'height']] != [140, 100, 85]:
        raise RuntimeError('O teste real de geração não passou. A revisão anterior continua em produção.')
    print(json.dumps({'stage': 'verified', 'health': health, 'realAiModel': result['modelUsed']}), flush=True)
    current = api(resource)
    if current['latestReadyRevision'].rsplit('/', 1)[-1] != new_revision:
        raise RuntimeError('Outra publicação alterou o serviço; promoção cancelada.')
    promotion = {'name': current['name'], 'etag': current['etag'],
                 'traffic': [{'type': 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST', 'percent': 100}]}
    wait(api(resource, 'PATCH', promotion, '?updateMask=traffic'))
    final = api(resource)
    print(json.dumps({'stage': 'published', 'revision': new_revision, 'rollbackRevision': old_revision,
                      'url': final['uri'], 'traffic': final.get('trafficStatuses', [])}), flush=True)


if __name__ == '__main__':
    main()

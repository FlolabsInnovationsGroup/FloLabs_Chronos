import csv
import json
import os
from pathlib import Path
from urllib import request

CSV_PATH = Path(r'C:\Users\olire\Documents\workspace_python\FloLabs_Hermes\all-contacts.csv')
DATABASE_ID = '340a157695518043a641eb72cc21cbb7'
NOTION_API_KEY = os.environ.get('NOTION_API_KEY')
NOTION_VERSION = '2022-06-28'

if not NOTION_API_KEY:
    raise SystemExit('NOTION_API_KEY is required')


def notion_request(url, payload=None, method='POST'):
    data = None if payload is None else json.dumps(payload).encode('utf-8')
    req = request.Request(url, data=data, method=method)
    req.add_header('Authorization', f'Bearer {NOTION_API_KEY}')
    req.add_header('Notion-Version', NOTION_VERSION)
    req.add_header('Content-Type', 'application/json')
    with request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode('utf-8'))


def unique_sources():
    vals = set()
    with CSV_PATH.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            for key in ('Source', 'Original Traffic Source', 'Record source'):
                value = (row.get(key) or '').strip()
                if value:
                    vals.add(value)
    return sorted(vals)


def find_title_property(schema):
    for name, prop in schema['properties'].items():
        if prop.get('type') == 'title':
            return name
    raise RuntimeError('No title property found')


def existing_titles(title_prop):
    titles = set()
    cursor = None
    while True:
        payload = {'page_size': 100}
        if cursor:
            payload['start_cursor'] = cursor
        data = notion_request(f'https://api.notion.com/v1/databases/{DATABASE_ID}/query', payload)
        for row in data.get('results', []):
            parts = row['properties'][title_prop]['title']
            title = ''.join(part.get('plain_text', '') for part in parts).strip()
            if title:
                titles.add(title)
        if not data.get('has_more'):
            break
        cursor = data.get('next_cursor')
    return titles


def main():
    schema = notion_request(f'https://api.notion.com/v1/databases/{DATABASE_ID}', None, method='GET')
    title_prop = find_title_property(schema)
    existing = existing_titles(title_prop)
    created = 0
    for source in unique_sources():
        if source in existing:
            continue
        notion_request('https://api.notion.com/v1/pages', {
            'parent': {'database_id': DATABASE_ID},
            'properties': {
                title_prop: {
                    'title': [
                        {'text': {'content': source}}
                    ]
                }
            }
        })
        created += 1
        print(f'Created: {source}')
    print(f'Done. Created {created} new source rows.')


if __name__ == '__main__':
    main()

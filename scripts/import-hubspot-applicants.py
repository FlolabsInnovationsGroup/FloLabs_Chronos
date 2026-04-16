import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib import request

SOURCE = Path(r'C:\Users\olire\Documents\workspace_python\FloLabs_Hermes\all-contacts.csv')
API_URL = os.environ.get('CHRONOS_IMPORT_API_URL', 'http://localhost:3000/api/applicants')
TOKEN = os.environ.get('CHRONOS_SYNC_TOKEN', '')

STAGE_MAP = {
    'lead': 'new',
    'new': 'new',
    'contacted': 'contacted',
    'interested': 'interested_review',
    'reminder 1st if interested': 'interested_review',
    'reminder after contacted': 'contacted',
    'second reminder contacted': 'contacted',
    'before meeting': 'before_meeting',
    '2nd reminder before meeting': 'before_meeting',
    'reminder before meeting': 'before_meeting',
    'saturday meeting': 'saturday_meeting',
    'attended': 'attended',
    'briefly attended': 'attended',
    'second meeting': 'second_meeting',
    'agreement sent': 'agreement_sent',
    'signed non paid': 'agreement_signed',
    'signed paid': 'agreement_signed',
    'paused internship': 'paused',
    'not interested': 'closed_lost',
    'rejected by us': 'closed_lost',
    'no answer': 'stalled',
    'robocollective.ai': 'special_track',
}


def clean(value):
    if value is None:
        return None
    text = str(value).replace('\x00', '').strip()
    return text or None


def parse_date(value):
    value = clean(value)
    if not value:
        return None
    for fmt in (
        '%Y-%m-%d %H:%M:%S %z',
        '%Y-%m-%d %H:%M:%S',
        '%m/%d/%Y',
        '%Y-%m-%d',
        '%d/%m/%Y',
    ):
        try:
            dt = datetime.strptime(value, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            pass
    return None


def stage_from_row(row):
    raw = clean(row.get('Status Flomad')) or clean(row.get('Lead Status')) or clean(row.get('Lifecycle Stage')) or clean(row.get('Status')) or ''
    return STAGE_MAP.get(raw.lower(), 'new'), raw or None


def status_from_row(row):
    email = (clean(row.get('Email')) or '').lower()
    hubspot_status = (clean(row.get('Status Flomad')) or clean(row.get('Lead Status')) or '').lower()
    if email.endswith('@flolabsrd.com') or email.endswith('@flolabsinnovations.com'):
        return 'joined'
    if 'signed' in hubspot_status or 'attended' in hubspot_status:
        return 'active'
    if any(x in hubspot_status for x in ['rejected', 'not interested']):
        return 'closed'
    return 'active'


def row_to_payload(row):
    email = clean(row.get('Email'))
    if not email:
        return None

    first_name = clean(row.get('First Name')) or ''
    last_name = clean(row.get('Last Name')) or ''
    full_name = clean(row.get('First and Last Name')) or f'{first_name} {last_name}'.strip()
    stage, hubspot_status = stage_from_row(row)

    return {
        'externalApplicantId': clean(row.get('Record ID')),
        'hubspotRecordId': clean(row.get('Record ID')),
        'email': email.lower(),
        'name': full_name or email,
        'phone': clean(row.get('Phone Number')) or clean(row.get('Mobile Phone Number')) or clean(row.get('WhatsApp Phone Number')),
        'country': clean(row.get('Country/Region')) or clean(row.get('IP Country')),
        'stateRegion': clean(row.get('State/Region')) or clean(row.get('IP State/Region')),
        'city': clean(row.get('City')) or clean(row.get('IP City')),
        'dateOfBirth': clean(row.get('Date of birth')),
        'gender': clean(row.get('Gender')),
        'linkedinUrl': clean(row.get('LinkedIn URL')) or clean(row.get('Linkedin account')),
        'education': clean(row.get('Education')) or clean(row.get('Degree')),
        'fieldOfStudy': clean(row.get('Field of study')),
        'currentRole': clean(row.get('Current role')) or clean(row.get('Employment Role')),
        'companyName': clean(row.get('Company Name')),
        'roleAppliedFor': clean(row.get('Job Title')) or clean(row.get('Based on the meeting, which team or area would you be most interested in joining?')),
        'stage': stage,
        'status': status_from_row(row),
        'joinedAt': parse_date(row.get('Create Date')) or parse_date(row.get('Date of application')),
        'lastWebsiteVisit': parse_date(row.get('Last Activity Date')) or parse_date(row.get('Last Modified Date')),
        'source': clean(row.get('Source')) or clean(row.get('Original Traffic Source')) or clean(row.get('Record source')),
        'hubspotStatus': hubspot_status,
        'hubspotOwner': clean(row.get('Contact owner')),
        'hubspotLifecycleStage': clean(row.get('Lifecycle Stage')),
        'hubspotLeadStatus': clean(row.get('Lead Status')),
        'hubspotLastModifiedAt': parse_date(row.get('Last Modified Date')),
        'hubspotRawData': {k: v for k, v in row.items()},
        'syncedToTeamMembers': False,
    }


def post_payload(payload):
    data = json.dumps(payload).encode('utf-8')
    req = request.Request(API_URL, data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    if TOKEN:
        req.add_header('Authorization', f'Bearer {TOKEN}')
    with request.urlopen(req, timeout=60) as resp:
        return resp.status, json.loads(resp.read().decode('utf-8'))


def main():
    created = 0
    with SOURCE.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader, start=1):
            payload = row_to_payload(row)
            if not payload:
                continue
            status, _ = post_payload(payload)
            if status < 300:
                created += 1
            if idx % 250 == 0:
                print(f'Processed {idx} rows, successful upserts: {created}')
    print(f'Finished. Successful upserts: {created}')


if __name__ == '__main__':
    main()

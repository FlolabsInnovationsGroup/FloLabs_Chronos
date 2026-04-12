import csv
import json
from datetime import datetime, timezone
from pathlib import Path

SOURCE = Path(r'C:\Users\olire\Documents\workspace_python\FloLabs_Hermes\all-contacts.csv')
OUT = Path(r'C:\Users\olire\Documents\workspace_python\FloLabs_Chronos\scripts\hubspot-import-data.jsonl')

STAGE_MAP = {
    'lead': 'new', 'new': 'new', 'contacted': 'contacted', 'interested': 'interested_review',
    'reminder 1st if interested': 'interested_review', 'reminder after contacted': 'contacted',
    'second reminder contacted': 'contacted', 'before meeting': 'before_meeting',
    '2nd reminder before meeting': 'before_meeting', 'reminder before meeting': 'before_meeting',
    'saturday meeting': 'saturday_meeting', 'attended': 'attended', 'briefly attended': 'attended',
    'second meeting': 'second_meeting', 'agreement sent': 'agreement_sent',
    'signed non paid': 'agreement_signed', 'signed paid': 'agreement_signed', 'paused internship': 'paused',
    'not interested': 'closed_lost', 'rejected by us': 'closed_lost', 'no answer': 'stalled',
    'robocollective.ai': 'special_track',
}

def clean(value):
    if value is None:
        return None
    value = str(value).replace('\x00', '').strip()
    return value or None

def parse_date(value):
    value = clean(value)
    if not value:
        return None
    for fmt in ('%Y-%m-%d %H:%M:%S %z','%Y-%m-%d %H:%M:%S','%m/%d/%Y','%Y-%m-%d','%d/%m/%Y'):
        try:
            dt = datetime.strptime(value, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            pass
    return None

count = 0
with SOURCE.open('r', encoding='utf-8-sig', newline='') as f, OUT.open('w', encoding='utf-8') as out:
    reader = csv.DictReader(f)
    for row in reader:
        email = clean(row.get('Email'))
        if not email:
            continue
        status_fl = clean(row.get('Status Flomad')) or clean(row.get('Lead Status')) or clean(row.get('Lifecycle Stage')) or clean(row.get('Status'))
        stage = STAGE_MAP.get((status_fl or '').lower(), 'new')
        first = clean(row.get('First Name')) or ''
        last = clean(row.get('Last Name')) or ''
        name = clean(row.get('First and Last Name')) or f'{first} {last}'.strip() or email
        payload = {
            'externalApplicantId': clean(row.get('Record ID')),
            'hubspotRecordId': clean(row.get('Record ID')),
            'email': email.lower(),
            'name': name,
            'phone': clean(row.get('Phone Number')) or clean(row.get('Mobile Phone Number')) or clean(row.get('WhatsApp Phone Number')),
            'country': clean(row.get('Country/Region')) or clean(row.get('IP Country')),
            'stateRegion': clean(row.get('State/Region')) or clean(row.get('IP State/Region')),
            'city': clean(row.get('City')) or clean(row.get('IP City')),
            'dateOfBirth': clean(row.get('Date of birth')),
            'gender': clean(row.get('Gender')),
            'linkedinUrl': clean(row.get('LinkedIn URL')) or clean(row.get('Linkedin account')),
            'education': clean(row.get('Education')) or clean(row.get('Degree')),
            'fieldOfStudy': clean(row.get('Field of study')),
            'currentJobTitle': clean(row.get('Current role')) or clean(row.get('Employment Role')),
            'companyName': clean(row.get('Company Name')),
            'roleAppliedFor': clean(row.get('Job Title')) or clean(row.get('Based on the meeting, which team or area would you be most interested in joining?')),
            'stage': stage,
            'status': 'joined' if email.lower().endswith('@flolabsrd.com') or email.lower().endswith('@flolabsinnovations.com') else ('closed' if any(x in (status_fl or '').lower() for x in ['rejected', 'not interested']) else 'active'),
            'joinedAt': parse_date(row.get('Create Date')) or parse_date(row.get('Date of application')),
            'lastWebsiteVisit': parse_date(row.get('Last Activity Date')) or parse_date(row.get('Last Modified Date')),
            'source': clean(row.get('Source')) or clean(row.get('Original Traffic Source')) or clean(row.get('Record source')),
            'hubspotStatus': status_fl,
            'hubspotOwner': clean(row.get('Contact owner')),
            'hubspotLifecycleStage': clean(row.get('Lifecycle Stage')),
            'hubspotLeadStatus': clean(row.get('Lead Status')),
            'hubspotLastModifiedAt': parse_date(row.get('Last Modified Date')),
            'hubspotRawData': {k: v for k, v in row.items() if clean(v) is not None},
            'syncedToTeamMembers': False,
        }
        out.write(json.dumps(payload, ensure_ascii=False) + '\n')
        count += 1

print(f'Prepared {count} rows at {OUT}')

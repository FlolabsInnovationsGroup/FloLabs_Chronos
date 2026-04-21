import os, re
root = r'C:\Users\olire\Documents\workspace_python\FloLabs_Chronos'
patterns = [
    re.compile(r'\busers\.[A-Za-z_]+'),
    re.compile(r'\bchronosUserId\b'),
    re.compile(r'\bfindUserByAnyEmail\b'),
    re.compile(r'\buserEmailAliases\b'),
    re.compile(r'references\(\(\) => users'),
]
for sub in ['src','scripts']:
    base = os.path.join(root, sub)
    for dp, dn, fn in os.walk(base):
        for f in fn:
            if not f.endswith(('.ts','.tsx','.js','.mjs','.md')):
                continue
            p = os.path.join(dp, f)
            try:
                text = open(p, 'r', encoding='utf-8').read()
            except Exception:
                continue
            hits = []
            for pat in patterns:
                if pat.search(text):
                    hits.append(pat.pattern)
            if hits:
                print(os.path.relpath(p, root) + ' :: ' + ', '.join(hits))

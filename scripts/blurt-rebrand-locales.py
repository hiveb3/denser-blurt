"""Rebrand locale JSON values Hive -> Blurt (keys untouched, {{placeholders}} untouched)."""
import json, re, sys, glob
KEEP = ['Hive Keychain','HiveAuth','HiveSigner','Hive Bridge','HiveBuzz','Hivebuzz','HivePosh','OpenHive','Hive-Engine','Hive Engine','PeakVault']
RULES = [
  (r'\bHIVE POWER\b','BLURT POWER'),(r'\bHive Power\b','Blurt Power'),(r'\bHive power\b','Blurt power'),
  (r'\bHP\b','BP'),(r'\bHIVE\b','BLURT'),(r'\bHive\b','Blurt'),
  (r'\bhive\.blog\b','blurt.blog'),(r'\bwallet\.hive\.blog\b','wallet.blurt.blog'),
]
def fix(s):
    holds={}
    def hold(m):
        k=f'\x00{len(holds)}\x00'; holds[k]=m.group(0); return k
    s=re.sub(r'\{\{[^}]*\}\}|https?://\S+|'+'|'.join(map(re.escape,KEEP)),hold,s)
    for a,b in RULES: s=re.sub(a,b,s)
    for k,v in holds.items(): s=s.replace(k,v)
    return s
def walk(o):
    if isinstance(o,dict): return {k:walk(v) for k,v in o.items()}
    if isinstance(o,list): return [walk(v) for v in o]
    if isinstance(o,str): return fix(o)
    return o
n=0
for p in sys.argv[1:]:
    raw=open(p,encoding='utf-8').read(); d=json.loads(raw); nd=walk(d)
    if nd!=d:
        ind = 2 if '\n  "' in raw else 4 if '\n    "' in raw else 2
        open(p,'w',encoding='utf-8').write(json.dumps(nd,ensure_ascii=False,indent=ind)+('\n' if raw.endswith('\n') else '')); n+=1
print('changed',n)

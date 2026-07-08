import xml.etree.ElementTree as ET
import math, json, numpy as np, os

def analyze_gpx(path, min_dist_m=1200, min_deniv_m=100):
    tree = ET.parse(path); root = tree.getroot()
    ns = {'g': 'http://www.topografix.com/GPX/1/1'}
    tp = root.findall('.//g:trkpt', ns)
    if not tp:
        tp = root.findall('.//trkpt')
    pts = []
    for t in tp:
        lat = float(t.get('lat')); lon = float(t.get('lon')); ele = None
        for c in t:
            if c.tag.split('}')[-1] == 'ele':
                ele = float(c.text); break
        if ele is None:
            continue
        pts.append((lat, lon, ele))
    if len(pts) < 2:
        raise ValueError("GPX sans points valides")

    def dist(a, b):
        R = 6371000.0
        dlat = math.radians(b[0]-a[0]); dlon = math.radians(b[1]-a[1])
        la1 = math.radians(a[0]); la2 = math.radians(b[0])
        h = math.sin(dlat/2)**2 + math.cos(la1)*math.cos(la2)*math.sin(dlon/2)**2
        return 2*R*math.asin(min(1, math.sqrt(h)))

    xs = [0.0]
    for i in range(1, len(pts)):
        xs.append(xs[-1] + dist(pts[i-1], pts[i]))

    win = 40
    ele_sm = []
    for i in range(len(pts)):
        lo = xs[i]-win; hi = xs[i]+win
        v = [pts[j][2] for j in range(len(pts)) if lo <= xs[j] <= hi]
        ele_sm.append(sum(v)/len(v))

    def slope_at(i, win_m=60):
        lo = xs[i]-win_m; hi = xs[i]+win_m
        xw = []; yw = []
        for j in range(len(pts)):
            if lo <= xs[j] <= hi:
                xw.append(xs[j]); yw.append(ele_sm[j])
        if len(xw) < 3:
            return 0.0
        xw = np.array(xw); yw = np.array(yw)
        A = np.vstack([xw, np.ones_like(xw)]).T
        s, _ = np.linalg.lstsq(A, yw, rcond=None)[0]
        return s * 100

    slopes = [slope_at(i) for i in range(len(pts))]

    steps = []
    for i in range(1, len(pts)):
        d = xs[i]-xs[i-1]
        dh = ele_sm[i]-ele_sm[i-1]
        steps.append({'d': d, 'dh': dh, 'km': xs[i], 'i0': i-1, 'i1': i, 'slope': (slopes[i-1]+slopes[i])/2})

    up_thr = 2.0; down_thr = -2.0; last_dir = None
    for s in steps:
        if s['dh'] > up_thr:
            s['dir'] = 'up'; last_dir = 'up'
        elif s['dh'] < down_thr:
            s['dir'] = 'down'; last_dir = 'down'
        else:
            s['dir'] = last_dir if last_dir else 'flat'

    segs = []; cur = None
    for s in steps:
        if s['d'] == 0:
            continue
        if cur is None:
            cur = {'dir': s['dir'], 'steps': [s], 'start_km': s['km']-s['d'], 'end_km': s['km']}
        elif s['dir'] == cur['dir']:
            cur['steps'].append(s); cur['end_km'] = s['km']
        else:
            segs.append(cur)
            cur = {'dir': s['dir'], 'steps': [s], 'start_km': s['km']-s['d'], 'end_km': s['km']}
    if cur is not None:
        segs.append(cur)

    segs = [s for s in segs if sum(x['d'] for x in s['steps']) > min_dist_m
            and abs(sum(x['dh'] for x in s['steps'])) > min_deniv_m]

    name = os.path.splitext(os.path.basename(path))[0]
    course = {
        'km': [round(x/1000, 4) for x in xs],
        'ele': [round(e, 1) for e in ele_sm],
        'slope': [round(s, 2) for s in slopes],
        'lat': [round(p[0], 6) for p in pts],
        'lon': [round(p[1], 6) for p in pts],
        'name': name,
        'path': os.path.abspath(path),
        'total_km': round(xs[-1]/1000, 2),
    }
    sections = []
    for n, seg in enumerate(segs, 1):
        idxs = sorted(set([st['i0'] for st in seg['steps']] + [st['i1'] for st in seg['steps']]))
        dist_seg = sum(st['d'] for st in seg['steps'])
        deniv = sum(st['dh'] for st in seg['steps'])
        avg = (deniv/dist_seg)*100
        sections.append({
            'n': n, 'dir': seg['dir'],
            'start_km': round(xs[idxs[0]]/1000, 3),
            'end_km': round(xs[idxs[-1]]/1000, 3),
            'dist_km': round(dist_seg/1000, 3),
            'deniv': round(deniv, 1),
            'avg': round(avg, 1),
            'idx_start': idxs[0], 'idx_end': idxs[-1],
        })
    return {'course': course, 'sections': sections}

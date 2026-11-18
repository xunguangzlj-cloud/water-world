"""沿骨盆和双腿制作一件闭合的连体泳裤，两个裤管共用裆缝。"""
import math
from collections import Counter

import numpy as np


def swim_shorts(names):
    points, joints, weights, faces = [], [], [], []
    shared = {}
    n = 24

    def vertex(x, y, z, bones, blend):
        key = tuple(round(v, 7) for v in (x, y, z))
        if key not in shared:
            shared[key] = len(points)
            points.append(key)
            joints.append([names.index(b) for b in bones] + [0]*(4-len(bones)))
            weights.append(list(blend) + [0]*(4-len(blend)))
        return shared[key]

    def stitch(a, b, side, closed=True):
        for i in range(len(a) if closed else len(a)-1):
            j = (i+1) % len(a)
            for tri in [(a[i], b[i], a[j]), (a[j], b[i], b[j])]:
                faces.append(tri if side==1 else tri[::-1])

    for side, tag in [(-1, 'L_'), (1, 'R_')]:
        rings = []
        for y, rx, rz, calf in [(.119,.045,.046,.96), (.150,.048,.049,.55), (.184,.048,.050,.06)]:
            ring = []
            for i in range(n):
                a = 2*math.pi*i/n
                ring.append(vertex(.060+rx*math.cos(a), y, .002+side*(.057+rz*math.sin(a)),
                                   [tag+'Thigh', tag+'Calf'], [1-calf,calf]))
            rings.append(ring)
        seam = []
        for i in range(n):
            a = 2*math.pi*i/n
            c, s = math.cos(a), math.sin(a)
            pelvis = 1-.40*max(0,s)
            seam.append(vertex(.055+.065*c, .256-.052*max(0,-s), .002+side*.109*max(0,s),
                               ['Pelvis',tag+'Thigh'], [pelvis,1-pelvis]))
        rings.append(seam)
        for a,b in zip(rings,rings[1:]):
            stitch(a,b,side)
        lower = vertex(.060,.119,.002+side*.057,[tag+'Calf',tag+'Thigh'],[.96,.04])
        for i in range(n):
            tri = (lower,rings[0][i],rings[0][(i+1)%n])
            faces.append(tri if side==1 else tri[::-1])
        top = []
        for i in range(n//2+1):
            a = 2*math.pi*i/n
            top.append(vertex(.055+.060*math.cos(a),.310,.002+side*.091*math.sin(a),
                              ['Pelvis','Waist'],[.8,.2]))
        stitch(seam[:n//2+1],top,side,False)
        lid = vertex(.055,.310,.002,['Pelvis','Waist'],[.8,.2])
        for i in range(len(top)-1):
            tri = (lid,top[i+1],top[i])
            faces.append(tri if side==1 else tri[::-1])

    edges=Counter(tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1]))
    assert all(count==2 for count in edges.values())
    pos=np.array(points); tri=np.array(faces,dtype='<u4')
    normal=np.zeros_like(pos)
    cross=np.cross(pos[tri[:,1]]-pos[tri[:,0]],pos[tri[:,2]]-pos[tri[:,0]])
    for i in range(3):
        np.add.at(normal,tri[:,i],cross)
    normal/=np.linalg.norm(normal,axis=1,keepdims=True)
    v=np.zeros((len(pos),24),'u1')
    v[:,:6]=np.rint(pos*32767).astype('<i2').view('u1').reshape(-1,6)
    v[:,8:11]=np.rint(normal*127).astype('i1').view('u1')
    v[:,11]=127
    v[:,16:20]=joints
    v[:,20:24]=np.rint(np.array(weights)*255).astype('u1')
    return v,tri.ravel()

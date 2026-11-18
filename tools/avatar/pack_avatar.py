"""保留原版角色网格、蒙皮和贴图，打包重新编排的水下动作。"""
from pathlib import Path
import argparse, gzip, io, json, struct
import numpy as np
from PIL import Image
from swim_poses import DURATIONS, bake
from swim_shorts import swim_shorts
from hair_seam import inner_hair

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('atlas', type=Path, help='带有原角色骨骼、网格和图集的 atlas.glb')
raw = parser.parse_args().atlas.read_bytes()
size = struct.unpack_from('<I', raw, 12)[0]
g = json.loads(raw[20:20+size])
data = memoryview(raw)[28+size:]

def accessor(i):
    a = g['accessors'][i]
    b = g['bufferViews'][a['bufferView']]
    dtype = np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']])
    cols = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    offset = b.get('byteOffset',0) + a.get('byteOffset',0)
    return np.ndarray((a['count'],cols),dtype,buffer=data,offset=offset,strides=(b.get('byteStride',cols*dtype.itemsize),dtype.itemsize))

joints = g['skins'][0]['joints']
names=[g['nodes'][i]['name'] for i in joints]
skirt_indices=[i for i,name in enumerate(names) if name.startswith('Skirt_')]
hair_indices=[i for i,name in enumerate(names) if name.startswith(('Hair_','FaceHair_'))]
verts, indices, count = [], [], 0
for mesh in g['meshes']:
    for p in mesh['primitives']:
        a = {k:accessor(v) for k,v in p['attributes'].items()}
        n = len(a['POSITION'])
        v = np.zeros((n,24),'u1')
        v[:,:6] = np.rint(a['POSITION']*32767).astype('<i2').view('u1').reshape(n,6)
        v[:,8:11] = np.rint(a['NORMAL']*127).astype('i1').view('u1')
        primary=a['JOINTS_0'][np.arange(n),a['WEIGHTS_0'].argmax(axis=1)]
        v[np.isin(primary,skirt_indices),11]=32
        v[np.isin(primary,hair_indices),11]=64
        if mesh['name'].startswith('character_Q_Internal_'):
            v[:,11]=127
        v[:,12:16] = np.rint(np.clip(a['TEXCOORD_0'],0,1)*65535).astype('<u2').view('u1').reshape(n,4)
        v[:,16:20] = a['JOINTS_0']
        v[:,20:24] = np.rint(a['WEIGHTS_0']*255).astype('u1')
        verts.append(v)
        indices.append(accessor(p['indices']).reshape(-1).astype('<u4')+count)
        count += n

bind = accessor(g['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
nodes = g['nodes']
parents = {child:i for i,node in enumerate(nodes) for child in node.get('children',[])}
hair_by_name = {mesh['name']: vertices for mesh, vertices in zip(g['meshes'], verts)}
lining, lining_indices = inner_hair(hair_by_name['character_meshes[23]'], hair_by_name['character_meshes[34]'])
verts.append(lining)
indices.append(lining_indices + count)
count += len(lining)
shorts,short_indices=swim_shorts(names)
verts.append(shorts)
indices.append(short_indices+count)
count+=len(shorts)
joint_parents=[joints.index(parents[i]) if parents.get(i) in joints else -1 for i in joints]
assert all(p<i for i,p in enumerate(joint_parents))
rest=np.linalg.inv(bind)
clips={}; frames=[]
for name in DURATIONS:
    duration,poses=bake(name,names,joint_parents,rest)
    clips[name]=[sum(len(f) for f in frames),len(poses),duration]
    frames.append(poses)
view=g['bufferViews'][g['images'][0]['bufferView']]
im=Image.open(io.BytesIO(data[view['byteOffset']:view['byteOffset']+view['byteLength']]))
im.thumbnail((2048,2048),Image.Resampling.LANCZOS)
tex=io.BytesIO(); im.save(tex,'WEBP',quality=91,method=5)
# 按三角面首次使用的顺序排列顶点。只有所有 24 个字节都相同的顶点才可共用。
vertices = np.concatenate(verts).view('V24').ravel()
unique, inverse = np.unique(vertices, return_inverse=True)
original_indices = np.concatenate(indices)
used, first, triangles = np.unique(inverse.ravel()[original_indices], return_index=True, return_inverse=True)
order = first.argsort()
vertices = unique[used[order]].view('u1').reshape(-1, 24)
triangles = order.argsort()[triangles].astype('<u4').view('u1').reshape(-1, 4)

def delta_planes(rows):
    return np.diff(rows, axis=0, prepend=np.zeros_like(rows[:1])).T.tobytes()

parts=[delta_planes(vertices),delta_planes(triangles),np.concatenate(frames).tobytes(),tex.getvalue()]
# 水流只驱动原网格实际使用的发束、刘海和裙片关节。
strands=[]
for i,bone in enumerate(names):
    if not bone.startswith(('Hair_','FaceHair_','Skirt_')):
        continue
    kind, strand, segment=bone.split('_')
    strand={'L':1,'R':2}.get(strand,strand)
    depth=4 if segment=='Tip' else int(segment)
    strands.append([i,joint_parents[i],*rest[i,:3,3].round(6).tolist(),
                    {'Hair':0,'FaceHair':1,'Skirt':2}[kind],int(strand),depth])
guard_names=['Pelvis','Spine02','L_Thigh','L_Calf','L_Foot','R_Thigh','R_Calf','R_Foot',
             'L_Upperarm','L_Forearm','R_Upperarm','R_Forearm']
guards=[[names.index(n),*rest[names.index(n),:3,3].tolist()] for n in guard_names]
meta=json.dumps(dict(meshEncoding=2,clips=clips,bones=len(joints),strands=strands,guards=guards,lengths=list(map(len,parts))),separators=(',',':')).encode()
meta+=b' '*(-len(meta)%4)
blob=gzip.compress(struct.pack('<I',len(meta))+meta+b''.join(parts),compresslevel=6,mtime=0)
(Path(__file__).resolve().parents[2]/'source/assets/player.bin').write_bytes(blob)
print(len(vertices),'顶点',len(joints),'骨骼',len(blob),'压缩字节',list(clips))

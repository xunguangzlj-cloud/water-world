"""以角色静置骨架为基准，在身体坐标系内编排水下动作。"""
import math
import numpy as np


DURATIONS = {
    'hover': 3.2, 'breaststroke': 2.35, 'flutter': 1.06, 'glide': 2.4,
    'surface': 1.7, 'dive': 1.8, 'feed': 1.4, 'bell': 1.15,
    'dial': 1.65, 'ripple': 1.55,
}


def rotation(x=0, y=0, z=0):
    sx, sy, sz = np.sin(np.deg2rad([x,y,z]))
    cx, cy, cz = np.cos(np.deg2rad([x,y,z]))
    return np.array([[cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx],
                     [sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx],
                     [-sy,cy*sx,cy*cx]])


def align(start, end):
    a=start/np.linalg.norm(start)
    b=end/np.linalg.norm(end)
    x,y,z=np.cross(a,b)
    cross=np.array([[0,-z,y],[z,0,-x],[-y,x,0]])
    return np.eye(3)+cross+(cross@cross)/(1+np.dot(a,b))


# 每行依次为上臂和前臂的方向、髋屈、屈膝、张腿与脚踝角度。
# 蹬夹之后保留伸展段；划水和收腿的峰值错开。
BREAST = np.array([
    [.20,.94,.27, .12,.96,.15,  2,-5,4,-56],
    [.24,.90,.38, .17,.92,.30,  2,-5,4,-56],
    [.32,.53,.85, .40,.61,.78,  5,-10,6,-53],
    [.43,-.12,.96, .85,.20,.31, 15,-39,14,-39],
    [.36,-.35,.78, .68,.62,-.36, 34,-83,28,-10],
    [.31,.35,.48, .48,.84,-.18, 24,-65,35,-16],
    [.22,.86,.31, .19,.95,.14,  6,-19,17,-46],
    [.20,.94,.27, .12,.96,.15,  2,-5,4,-56],
])
CRAWL = np.array([
    [.14,.94,.29, .20,.95,.17], [.24,.83,.40, .77,.48,.24],
    [.54,.30,.68, .95,-.12,.13], [.54,-.49,.61, .66,-.64,.04],
    [.27,-.87,.48, .18,-.91,.25], [-.19,-.46,.89, .33,-.82,.17],
    [-.28,.33,.87, .32,.31,.78], [.02,.82,.48, .24,.85,.40],
])


def stroke_sample(keys, t):
    u=(t%1)*len(keys)
    i=math.floor(u); f=u-i
    a,b,c,d=(keys[(i+j)%len(keys)] for j in (-1,0,1,2))
    return b+.5*f*((c-a)+f*((2*a-5*b+4*c-d)+f*(3*b-3*c+d-a)))


def bake(name, bones, parent, rest):
    duration=DURATIONS[name]
    positions=rest[:,:3,3]
    lookup={bone:i for i,bone in enumerate(bones)}
    frames=[]
    for t in np.linspace(0,1,round(duration*30)+1):
        phase=2*math.pi*t
        wave, sweep = math.sin(phase), math.cos(phase)
        fast=name=='flutter'
        moving=name in ('breaststroke','flutter','glide','surface','dive')
        offsets={'Hip':rotation(x=(6 if fast else 2)*wave),
                 'Spine02':rotation(y=(6 if fast else 2)*wave),
                 'Head':rotation(z=(22 if moving else 4)+2*sweep,y=2*wave)}
        if name=='breaststroke':
            offsets['Spine01']=rotation(z=3.2*math.sin(phase-1.1))
            offsets['Head']=rotation(z=19-5*math.cos(phase-.3))
        elif fast:
            offsets['Hip']=rotation(y=-5*sweep,z=2*wave)
            offsets['Spine02']=rotation(y=18*sweep,z=2*math.sin(phase-.6))
            offsets['Head']=rotation(z=20,y=-10*sweep)
        directions={}
        for side,tag in [(-1,'L_'),(1,'R_')]:
            w=side*wave
            # 掌心在胸侧画扁椭圆，悬浮时手腕与脚踝的节奏错开。
            upper=(.42+.25*wave,-.46+.16*sweep,side*.85)
            fore=(.68+.22*sweep,.04+.24*wave,side*.62)
            thigh=10+6*w; knee=-22-10*w; spread=10; point=-29
            if name=='breaststroke':
                ux,uy,uz,fx,fy,fz,thigh,knee,spread,point=stroke_sample(BREAST,t)
                upper=(ux,uy,side*uz); fore=(fx,fy,side*fz)
                offsets[tag+'Hand']=rotation(y=side*15*wave)
            elif fast:
                ux,uy,uz,fx,fy,fz=stroke_sample(CRAWL,t+(.5 if side==-1 else 0))
                upper=(ux,uy,side*uz); fore=(fx,fy,side*fz)
                kick=2*phase
                thigh=15*side*math.sin(kick)
                knee=-14+12*side*math.sin(kick-.85)
                spread=5; point=-54+7*side*math.sin(kick-1.5)
            elif name=='glide':
                upper=(.49,.39+.03*wave,side*.76)
                fore=(.53,.72+.05*wave,side*.33)
                thigh=3*w; knee=-6-3*w; spread=4; point=-55
            elif name=='surface':
                upper=(.34,-.28+.62*sweep,side*(.73+.22*wave))
                fore=(.42,-.38+.65*sweep,side*.72)
                thigh=16+18*w; knee=-36-23*side*math.sin(phase-.75); spread=14; point=-37
            elif name=='dive':
                upper=(.39,.32+.24*sweep,side*.73)
                fore=(.52,.60+.22*sweep,side*.39)
                thigh=12*w; knee=-10-12*max(0,-w); spread=7; point=-57
            elif name in ('feed','bell','dial','ripple'):
                # 一手保持平衡，另一手依次完成撒开、敲击、推转或横向拨水。
                reach=math.sin(math.pi*t)**2
                if side==1:
                    if name=='feed':
                        upper=(.5+.48*reach,-.48+.48*reach,.72)
                        fore=(.64+.5*reach,.05+.46*math.sin(phase)*reach,.62-.40*reach)
                    elif name=='bell':
                        strike=math.exp(-((t-.44)/.13)**2)
                        upper=(.46+.64*strike,-.4+.72*reach,.72-.4*strike)
                        fore=(.68+.7*strike,.12+.78*reach-1.1*strike,.56-.30*strike)
                    elif name=='dial':
                        upper=(.46+.44*reach,-.46+.64*reach,.80)
                        fore=(.61+.36*reach,.08+.75*sweep*reach,.58+.80*wave*reach)
                    else:
                        upper=(.48+.45*reach,-.46+.50*reach,.80)
                        fore=(.6+.4*reach,.08+.18*reach,.60+1.35*wave*reach)
                    offsets[tag+'Hand']=rotation(y=(35 if name=='feed' else 18)*reach)
            directions[tag+'Upperarm']=(tag+'Forearm',upper)
            directions[tag+'Forearm']=(tag+'Hand',fore)
            offsets[tag+'Thigh']=rotation(x=-side*spread,z=thigh)
            offsets[tag+'Calf']=rotation(z=knee)
            offsets[tag+'Foot']=rotation(z=point)
        skin=np.tile(np.eye(4),(len(bones),1,1))
        for i,bone in enumerate(bones):
            inherited=skin[parent[i]] if parent[i]>=0 else np.eye(4)
            rot=offsets.get(bone)
            if bone in directions:
                child,target=directions[bone]
                rot=align(positions[lookup[child]]-positions[i], inherited[:3,:3].T@np.array(target))
            elif bone.startswith('Tail_') and 'Tip' not in bone:
                depth=int(bone[-2:]) if bone[-2:].isdigit() else 2
                lag=math.sin(phase-.65*depth)
                rot=rotation(y=(7 if moving else 4)*lag,x=4*lag)
            if rot is None:
                skin[i]=inherited
            else:
                delta=np.eye(4); delta[:3,:3]=rot
                delta[:3,3]=positions[i]-rot@positions[i]
                skin[i]=inherited@delta
            if bone=='Root':
                skin[i,1,3]+=(.010 if moving else .022)*wave
        frames.append(skin.transpose(0,2,1).astype('<f4'))
    result=np.stack(frames)
    assert np.isfinite(result).all() and np.allclose(result[0],result[-1],atol=1e-4)
    return duration,result
